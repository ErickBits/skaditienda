/** Gestión de órdenes: listado filtrable, detalle y marcado de despacho. */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../config/db.js';
import { validate } from '../../middleware/validate.js';
import { HttpError, escapeLike } from '../../utils/http.js';

const router = Router();

const listQuery = z.object({
  // Por defecto: compras exitosas.
  status: z.enum(['APPROVED', 'PENDING', 'DECLINED', 'VOIDED', 'ERROR', 'ALL']).default('APPROVED'),
  dispatched: z.enum(['true', 'false', 'all']).default('all'),
  q: z.string().trim().max(120).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * GET / — Listado paginado con filtros de estado, despacho, rango de fechas
 * y búsqueda por referencia, nombre o correo.
 */
router.get('/', validate({ query: listQuery }), async (req, res) => {
  const f = req.valid.query;
  const where = [];
  const params = [];
  // Agrega un valor a `params` y devuelve su marcador `?`: el SQL nunca lleva valores del usuario.
  const param = (value) => (params.push(value), '?');

  if (f.status !== 'ALL') where.push(`o.status = ${param(f.status)}`);
  if (f.dispatched !== 'all') where.push(`o.dispatched = ${param(f.dispatched === 'true')}`);
  if (f.from) where.push(`o.created_at >= ${param(f.from)}`);
  if (f.to) where.push(`o.created_at < DATE_ADD(${param(f.to)}, INTERVAL 1 DAY)`);
  if (f.q) {
    // Con `?` cada marcador consume un valor: el patrón se agrega tres veces.
    const like = `%${escapeLike(f.q)}%`;
    where.push(`(o.reference LIKE ${param(like)} OR o.customer_name LIKE ${param(like)} OR o.customer_email LIKE ${param(like)})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  // `COUNT(*) OVER()` trae el total sin paginar en la misma consulta.
  // LIMIT/OFFSET se interpolan porque Zod ya garantizó que son enteros.
  const { rows } = await query(
    `SELECT o.id, o.reference, o.customer_name, o.customer_email, o.city, o.amount_in_cents, o.status,
            o.dispatched, o.dispatched_at, o.paid_at, o.created_at,
            (SELECT COALESCE(SUM(quantity), 0) FROM order_items oi WHERE oi.order_id = o.id) AS units,
            COUNT(*) OVER() AS total_count
       FROM orders o
       ${whereSql}
      ORDER BY o.created_at DESC
      LIMIT ${f.limit} OFFSET ${(f.page - 1) * f.limit}`,
    params,
  );

  const total = rows[0]?.total_count ?? 0;
  res.json({ items: rows.map(({ total_count: _t, ...r }) => r), total, page: f.page, pages: Math.max(1, Math.ceil(total / f.limit)) });
});

const idParams = z.object({ id: z.uuid() });

/** GET /:id — Detalle de una orden con sus ítems (foto del producto al momento de la compra). */
router.get('/:id', validate({ params: idParams }), async (req, res) => {
  const { rows: [order] } = await query('SELECT * FROM orders WHERE id = ?', [req.valid.params.id]);
  if (!order) throw new HttpError(404, 'Orden no encontrada');
  const { rows: items } = await query(
    'SELECT product_name, size, color, unit_price, quantity FROM order_items WHERE order_id = ? ORDER BY id',
    [order.id],
  );
  res.json({ ...order, items });
});

/** PATCH /:id/dispatch — Marca o desmarca una orden como despachada. Solo aplica a órdenes APPROVED. */
router.patch(
  '/:id/dispatch',
  validate({ params: idParams, body: z.object({ dispatched: z.boolean() }) }),
  async (req, res) => {
    const { dispatched } = req.valid.body;
    const { id } = req.valid.params;
    const { rowCount } = await query(
      `UPDATE orders
          SET dispatched = ?, dispatched_at = CASE WHEN ? THEN NOW() ELSE NULL END
        WHERE id = ? AND status = 'APPROVED'`,
      [dispatched, dispatched, id],
    );
    if (!rowCount) throw new HttpError(409, 'Solo se pueden despachar órdenes pagadas (APPROVED)');
    const { rows: [order] } = await query('SELECT id, dispatched, dispatched_at FROM orders WHERE id = ?', [id]);
    res.json(order);
  },
);

export default router;
