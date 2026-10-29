/** Gestión del banner de destacados: qué productos aparecen y en qué orden. */
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../config/db.js';
import { validate } from '../../middleware/validate.js';
import { HttpError } from '../../utils/http.js';

const router = Router();
// Debe coincidir con MAX en client/src/admin/AdminBanner.jsx.
const MAX_FEATURED = 10;

/** GET / — Productos destacados en el orden del banner (incluye ocultos, para que el admin los vea). */
router.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT p.id, p.name, p.is_active,
            (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY sort_order, id LIMIT 1) AS thumbnail
       FROM products p
      WHERE p.is_featured
      ORDER BY p.featured_order NULLS LAST, p.id`,
  );
  res.json(rows);
});

/**
 * PUT / — Reemplaza la lista completa; el orden del arreglo es el orden del banner.
 * Todo ocurre en una transacción: o se aplica la lista entera o no cambia nada.
 */
router.put(
  '/',
  validate({
    body: z.object({
      productIds: z
        .array(z.number().int().positive())
        .max(MAX_FEATURED, `Máximo ${MAX_FEATURED} productos destacados`)
        .refine((ids) => new Set(ids).size === ids.length, 'Hay productos repetidos'),
    }),
  }),
  async (req, res) => {
    const { productIds } = req.valid.body;

    await withTransaction(async (db) => {
      await db.query('UPDATE products SET is_featured = false, featured_order = NULL WHERE is_featured');
      if (!productIds.length) return;

      const { rowCount } = await db.query(
        `UPDATE products p
            SET is_featured = true, featured_order = t.ord
           FROM unnest($1::int[]) WITH ORDINALITY AS t(id, ord)
          WHERE p.id = t.id`,
        [productIds],
      );
      if (rowCount !== productIds.length) throw new HttpError(400, 'Algún producto no existe');
    });

    res.json({ ok: true, productIds });
  },
);

export default router;
