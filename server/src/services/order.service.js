/**
 * Lógica de órdenes: creación desde el carrito y aplicación de pagos de Wompi.
 */
import crypto from 'node:crypto';
import { withTransaction } from '../config/db.js';
import { HttpError } from '../utils/http.js';

/** Referencia única y legible para Wompi: SKD-<timestamp en base 36>-<8 hex aleatorios>. */
const generateReference = () =>
  `SKD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

/**
 * Crea una orden PENDING a partir de variantes y cantidades.
 * El precio SIEMPRE se toma de la base de datos (final_price), nunca del cliente.
 * El stock se valida aquí pero NO se descuenta: eso ocurre al aprobarse el pago.
 *
 * @param {object} input
 * @param {{ name: string, email: string, address: string, city: string, phonePrimary: string, phoneSecondary: string | null }} input.customer
 * @param {Array<{ variantId: number, quantity: number }>} input.items
 * @returns {Promise<{ id: string, reference: string, amount_in_cents: number, currency: string }>}
 * @throws {HttpError} 409 si una variante no existe, el producto está oculto o no hay stock suficiente.
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
        WHERE v.id IN (?) AND p.is_active`,
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

    // MySQL no tiene RETURNING: el UUID se genera aquí y la orden se arma con los mismos valores.
    const order = { id: crypto.randomUUID(), reference: generateReference(), amount_in_cents: total * 100, currency: 'COP' };
    await db.query(
      `INSERT INTO orders (id, reference, customer_name, customer_email, phone_primary, phone_secondary, address, city, amount_in_cents, currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [order.id, order.reference, customer.name, customer.email, customer.phonePrimary, customer.phoneSecondary,
        customer.address, customer.city, order.amount_in_cents, order.currency],
    );

    // `VALUES ?` con un arreglo de filas → inserción múltiple en una sola sentencia.
    await db.query(
      'INSERT INTO order_items (order_id, product_id, variant_id, product_name, size, color, unit_price, quantity) VALUES ?',
      [lines.map((l) => [order.id, l.product_id, l.variant_id, l.name, l.size, l.color, l.final_price, l.quantity])],
    );

    return order;
  });
}

/**
 * SQL que suma o resta al stock las cantidades de una orden (? = id de la orden).
 * GREATEST(…, 0) evita stock negativo si se vendió más de lo disponible mientras el pago estaba pendiente.
 * @param {'+' | '-'} operator
 */
const STOCK_DELTA_SQL = (operator) => `
  UPDATE product_variants v
    JOIN order_items oi ON oi.variant_id = v.id
     SET v.stock = GREATEST(v.stock ${operator} oi.quantity, 0)
   WHERE oi.order_id = ?`;

/**
 * Aplica a la orden el estado de una transacción de Wompi. Es IDEMPOTENTE:
 * Wompi reintenta webhooks y el usuario puede recargar la página de resultado,
 * así que aplicar la misma transacción N veces produce el mismo resultado.
 *
 * `tx` debe venir de la API de Wompi (getTransaction), no del navegador.
 *
 * @param {{ id: string, reference: string, status: string, amount_in_cents: number, currency: string,
 *           status_message?: string, payment_method_type?: string }} tx Transacción de Wompi.
 * @returns {Promise<{ applied: boolean, reason?: string, from?: string, to?: string }>} Qué se hizo (para el log).
 */
export async function applyTransaction(tx) {
  return withTransaction(async (db) => {
    // FOR UPDATE: bloquea la fila para que dos notificaciones simultáneas no se pisen.
    const { rows: [order] } = await db.query(
      'SELECT id, status, amount_in_cents, currency, wompi_transaction_id FROM orders WHERE reference = ? FOR UPDATE',
      [tx.reference],
    );
    if (!order) return { applied: false, reason: 'orden no encontrada' };

    // El monto cobrado debe coincidir EXACTAMENTE con el de la orden.
    if (tx.amount_in_cents !== order.amount_in_cents || tx.currency !== order.currency) {
      console.error(`[wompi] ⚠️ monto/moneda no coinciden en ${tx.reference}: tx=${tx.amount_in_cents} ${tx.currency}, orden=${order.amount_in_cents} ${order.currency}`);
      await db.query(
        `UPDATE orders SET status = 'ERROR', status_detail = 'Monto de la transacción no coincide', wompi_transaction_id = ? WHERE id = ?`,
        [tx.id, order.id],
      );
      return { applied: false, reason: 'monto no coincide' };
    }

    const sameState = order.status === tx.status && order.wompi_transaction_id === tx.id;
    // Una orden aprobada solo puede pasar a anulada (VOIDED); nunca "des-aprobarse" por otro evento.
    const blocked = order.status === 'APPROVED' && tx.status !== 'VOIDED';
    if (sameState || blocked) return { applied: false, reason: 'sin cambios' };

    await db.query(
      `UPDATE orders
          SET status = ?, status_detail = ?, wompi_transaction_id = ?, payment_method_type = ?,
              paid_at = CASE WHEN ? = 'APPROVED' THEN COALESCE(paid_at, NOW()) ELSE paid_at END
        WHERE id = ?`,
      [tx.status, tx.status_message ?? null, tx.id, tx.payment_method_type ?? null, tx.status, order.id],
    );

    // Inventario: se descuenta al aprobar y se devuelve si una venta aprobada se anula.
    if (tx.status === 'APPROVED') await db.query(STOCK_DELTA_SQL('-'), [order.id]);
    if (order.status === 'APPROVED' && tx.status === 'VOIDED') await db.query(STOCK_DELTA_SQL('+'), [order.id]);

    return { applied: true, from: order.status, to: tx.status };
  });
}
