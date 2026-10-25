/**
 * Lógica de órdenes: creación desde el carrito y aplicación de pagos de Wompi.
 */
import crypto from 'node:crypto';
import { withTransaction } from '../config/db.js';
import { HttpError } from '../utils/http.js';

const generateReference = () =>
  `SKD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

/**
 * Crea una orden PENDING a partir de variantes y cantidades.
 * El precio SIEMPRE se toma de la base de datos (final_price), nunca del cliente.
 */
export async function createOrder({ customer, items }) {
  // Agrupa cantidades por variante (por si el carrito trae la misma variante repetida).
  const qtyByVariant = new Map();
  for (const { variantId, quantity } of items) {
    qtyByVariant.set(variantId, (qtyByVariant.get(variantId) ?? 0) + quantity);
  }
  const variantIds = [...qtyByVariant.keys()];

  return withTransaction(async (db) => {
    const { rows } = await db.query(
      `SELECT v.id AS variant_id, v.size, v.color, v.stock,
              p.id AS product_id, p.name, p.final_price
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
        WHERE v.id = ANY($1::int[]) AND p.is_active`,
      [variantIds],
    );

    if (rows.length !== variantIds.length) {
      throw new HttpError(409, 'Algunos productos del carrito ya no están disponibles');
    }

    let total = 0;
    const lines = rows.map((row) => {
      const quantity = qtyByVariant.get(row.variant_id);
      if (quantity > row.stock) {
        throw new HttpError(409, `Stock insuficiente para ${row.name} (${row.size} / ${row.color}). Disponibles: ${row.stock}`);
      }
      total += row.final_price * quantity;
      return { ...row, quantity };
    });

    const { rows: [order] } = await db.query(
      `INSERT INTO orders (reference, customer_name, customer_email, phone_primary, phone_secondary, address, city, amount_in_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, reference, amount_in_cents, currency`,
      [generateReference(), customer.name, customer.email, customer.phonePrimary, customer.phoneSecondary,
        customer.address, customer.city, total * 100],
    );

    await db.query(
      `INSERT INTO order_items (order_id, product_id, variant_id, product_name, size, color, unit_price, quantity)
       SELECT $1::uuid, * FROM unnest($2::int[], $3::int[], $4::text[], $5::text[], $6::text[], $7::int[], $8::smallint[])`,
      [order.id,
        lines.map((l) => l.product_id), lines.map((l) => l.variant_id), lines.map((l) => l.name),
        lines.map((l) => l.size), lines.map((l) => l.color), lines.map((l) => l.final_price), lines.map((l) => l.quantity)],
    );

    return order;
  });
}

const STOCK_DELTA_SQL = (operator) => `
  UPDATE product_variants v
     SET stock = GREATEST(v.stock ${operator} oi.quantity, 0)
    FROM order_items oi
   WHERE oi.order_id = $1 AND oi.variant_id = v.id`;

/**
 * Aplica a la orden el estado de una transacción de Wompi. Es IDEMPOTENTE:
 * Wompi reintenta webhooks y el usuario puede recargar la página de resultado,
 * así que aplicar la misma transacción N veces produce el mismo resultado.
 *
 * `tx` debe venir de la API de Wompi (getTransaction), no del navegador.
 */
export async function applyTransaction(tx) {
  return withTransaction(async (db) => {
    // FOR UPDATE: bloquea la fila para que dos notificaciones simultáneas no se pisen.
    const { rows: [order] } = await db.query(
      'SELECT id, status, amount_in_cents, currency, wompi_transaction_id FROM orders WHERE reference = $1 FOR UPDATE',
      [tx.reference],
    );
    if (!order) return { applied: false, reason: 'orden no encontrada' };

    // El monto cobrado debe coincidir EXACTAMENTE con el de la orden.
    if (tx.amount_in_cents !== order.amount_in_cents || tx.currency !== order.currency) {
      console.error(`[wompi] ⚠️ monto/moneda no coinciden en ${tx.reference}: tx=${tx.amount_in_cents} ${tx.currency}, orden=${order.amount_in_cents} ${order.currency}`);
      await db.query(
        `UPDATE orders SET status = 'ERROR', status_detail = 'Monto de la transacción no coincide', wompi_transaction_id = $2 WHERE id = $1`,
        [order.id, tx.id],
      );
      return { applied: false, reason: 'monto no coincide' };
    }

    const sameState = order.status === tx.status && order.wompi_transaction_id === tx.id;
    // Una orden aprobada solo puede pasar a anulada (VOIDED); nunca "des-aprobarse" por otro evento.
    const blocked = order.status === 'APPROVED' && tx.status !== 'VOIDED';
    if (sameState || blocked) return { applied: false, reason: 'sin cambios' };

    await db.query(
      `UPDATE orders
          SET status = $2::order_status, status_detail = $3, wompi_transaction_id = $4, payment_method_type = $5,
              paid_at = CASE WHEN $2::order_status = 'APPROVED' THEN COALESCE(paid_at, now()) ELSE paid_at END
        WHERE id = $1`,
      [order.id, tx.status, tx.status_message ?? null, tx.id, tx.payment_method_type ?? null],
    );

    // Inventario: se descuenta al aprobar y se devuelve si una venta aprobada se anula.
    if (tx.status === 'APPROVED') await db.query(STOCK_DELTA_SQL('-'), [order.id]);
    if (order.status === 'APPROVED' && tx.status === 'VOIDED') await db.query(STOCK_DELTA_SQL('+'), [order.id]);

    return { applied: true, from: order.status, to: tx.status };
  });
}
