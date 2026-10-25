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

router.get('/', validate({ query: listQuery }), async (req, res) => {
  const f = req.valid.query;
  const where = [];
  const params = [];
  const param = (value) => `$${params.push(value)}`;

  if (f.status !== 'ALL') where.push(`o.status = ${param(f.status)}`);
  if (f.dispatched !== 'all') where.push(`o.dispatched = ${param(f.dispatched === 'true')}`);
  if (f.from) where.push(`o.created_at >= ${param(f.from)}::date`);
  if (f.to) where.push(`o.created_at < ${param(f.to)}::date + 1`);
  if (f.q) {
    const like = param(`%${escapeLike(f.q)}%`);
    where.push(`(o.reference ILIKE ${like} OR o.customer_name ILIKE ${like} OR o.customer_email ILIKE ${like})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT o.id, o.reference, o.customer_name, o.customer_email, o.city, o.amount_in_cents, o.status,
            o.dispatched, o.dispatched_at, o.paid_at, o.created_at,
            (SELECT COALESCE(sum(quantity), 0)::int FROM order_items oi WHERE oi.order_id = o.id) AS units,
            count(*) OVER()::int AS total_count
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

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  const { rows: [order] } = await query('SELECT * FROM orders WHERE id = $1', [req.valid.params.id]);
  if (!order) throw new HttpError(404, 'Orden no encontrada');
  const { rows: items } = await query(
    'SELECT product_name, size, color, unit_price, quantity FROM order_items WHERE order_id = $1 ORDER BY id',
    [order.id],
  );
  res.json({ ...order, items });
});

router.patch(
  '/:id/dispatch',
  validate({ params: idParams, body: z.object({ dispatched: z.boolean() }) }),
  async (req, res) => {
    const { dispatched } = req.valid.body;
    const { rows: [order] } = await query(
      `UPDATE orders
          SET dispatched = $2, dispatched_at = CASE WHEN $2 THEN now() ELSE NULL END
        WHERE id = $1 AND status = 'APPROVED'
        RETURNING id, dispatched, dispatched_at`,
      [req.valid.params.id, dispatched],
    );
    if (!order) throw new HttpError(409, 'Solo se pueden despachar órdenes pagadas (APPROVED)');
    res.json(order);
  },
);

export default router;
