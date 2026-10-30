/**
 * CRUD de productos (admin).
 *
 * Crear/editar usan multipart/form-data:
 *   · campo "data"   → JSON con los datos del producto (validado con Zod)
 *   · campo "images" → 0..8 archivos de imagen nuevos
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../config/db.js';
import { validate } from '../../middleware/validate.js';
import { removeFiles, uploadImages, uploadUrlToPath, verifyImageSignatures } from '../../middleware/upload.js';
import { HttpError, escapeLike, slugify } from '../../utils/http.js';

const router = Router();

const idParams = z.object({ id: z.coerce.number().int().positive() });

const variantSchema = z.object({
  size: z.string().trim().min(1).max(20),
  color: z.string().trim().min(1).max(30),
  stock: z.number().int().min(0).max(100_000),
});

const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(3000).default(''),
  price: z.number().int().positive().max(100_000_000),
  categoryId: z.number().int().positive(),
  discountActive: z.boolean().default(false),
  discountPercent: z.number().int().min(0).max(90).default(0),
  isActive: z.boolean().default(true),
  variants: z
    .array(variantSchema)
    .max(200)
    .default([])
    .refine((list) => new Set(list.map((v) => `${v.size}|${v.color}`)).size === list.length, 'Hay variantes (talla + color) repetidas'),
  removeImageIds: z.array(z.number().int().positive()).max(50).default([]),
});

/**
 * Lee y valida el campo "data" del multipart (no se puede usar `validate` porque llega como texto).
 * @param {import('express').Request} req
 * @returns {z.infer<typeof productSchema>} Datos limpios del producto.
 * @throws {HttpError} 400 si no es JSON o no cumple el esquema.
 */
function parseProductData(req) {
  let raw;
  try {
    raw = JSON.parse(req.body?.data ?? '{}');
  } catch {
    throw new HttpError(400, 'El campo "data" debe ser JSON válido');
  }
  const result = productSchema.safeParse(raw);
  if (!result.success) {
    throw new HttpError(400, 'Datos inválidos', result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return result.data;
}

/**
 * Envuelve un handler que recibe archivos: si algo falla después de subirlos,
 * se borran del disco para no dejar huérfanos, y el error sigue su curso.
 * @param {(req: import('express').Request, res: import('express').Response) => Promise<void>} handler
 */
const withUploadCleanup = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    await removeFiles((req.files ?? []).map((f) => f.path));
    throw err;
  }
};

/**
 * Agrega imágenes nuevas al final de la galería (después del sort_order más alto).
 * @param {{ query: Function }} db Conexión de la transacción (de withTransaction).
 * @param {number} productId
 * @param {Express.Multer.File[]} files Archivos ya guardados por multer.
 */
async function insertImages(db, productId, files) {
  if (!files.length) return;
  const { rows: [{ max }] } = await db.query('SELECT COALESCE(MAX(sort_order), -1) AS max FROM product_images WHERE product_id = ?', [productId]);
  await db.query(
    'INSERT INTO product_images (product_id, url, sort_order) VALUES ?',
    [files.map((f, i) => [productId, `/uploads/${f.filename}`, max + 1 + i])],
  );
}

/**
 * Sincroniza variantes: actualiza/crea las enviadas y elimina las que ya no están.
 * Una variante se identifica por (talla, color); el stock se sobrescribe.
 * @param {{ query: Function }} db Conexión de la transacción (de withTransaction).
 * @param {number} productId
 * @param {Array<{ size: string, color: string, stock: number }>} variants Lista completa deseada.
 */
async function syncVariants(db, productId, variants) {
  if (!variants.length) {
    await db.query('DELETE FROM product_variants WHERE product_id = ?', [productId]);
    return;
  }
  // Un arreglo de pares se expande como (('S', 'Negro'), ('M', 'Blanco')).
  await db.query(
    'DELETE FROM product_variants WHERE product_id = ? AND (size, color) NOT IN (?)',
    [productId, variants.map((v) => [v.size, v.color])],
  );
  await db.query(
    `INSERT INTO product_variants (product_id, size, color, stock) VALUES ?
     ON DUPLICATE KEY UPDATE stock = VALUES(stock)`,
    [variants.map((v) => [productId, v.size, v.color, v.stock])],
  );
}

/**
 * Producto completo (con imágenes y variantes) tal como lo usa el formulario del admin.
 * @param {number} id
 * @returns {Promise<object>}
 * @throws {HttpError} 404 si no existe.
 */
async function getProduct(id) {
  const [{ rows: [product] }, { rows: images }, { rows: variants }] = await Promise.all([
    query('SELECT * FROM products WHERE id = ?', [id]),
    query('SELECT id, url FROM product_images WHERE product_id = ? ORDER BY sort_order, id', [id]),
    query('SELECT id, size, color, stock FROM product_variants WHERE product_id = ? ORDER BY color, id', [id]),
  ]);
  if (!product) throw new HttpError(404, 'Producto no encontrado');
  return { ...product, images, variants };
}

// ── Listado ───────────────────────────────────────────────────

/** GET / — Listado paginado (incluye ocultos) con miniatura, stock total y búsqueda por nombre. */
router.get(
  '/',
  validate({
    query: z.object({
      q: z.string().trim().max(80).optional(),
      categoryId: z.coerce.number().int().positive().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(30),
    }),
  }),
  async (req, res) => {
    const { q, categoryId, page, limit } = req.valid.query;
    const search = q ? escapeLike(q) : null;
    const { rows } = await query(
      `SELECT p.id, p.name, p.slug, p.price, p.final_price, p.discount_active, p.discount_percent,
              p.is_active, p.is_featured, c.name AS category_name,
              (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY sort_order, id LIMIT 1) AS thumbnail,
              (SELECT COALESCE(SUM(stock), 0) FROM product_variants v WHERE v.product_id = p.id) AS total_stock,
              COUNT(*) OVER() AS total_count
         FROM products p JOIN categories c ON c.id = p.category_id
        WHERE (? IS NULL OR p.name LIKE CONCAT('%', ?, '%'))
          AND (? IS NULL OR p.category_id = ?)
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ? OFFSET ?`,
      [search, search, categoryId ?? null, categoryId ?? null, limit, (page - 1) * limit],
    );
    const total = rows[0]?.total_count ?? 0;
    res.json({ items: rows.map(({ total_count: _t, ...r }) => r), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  },
);

/** GET /:id — Producto completo para editarlo. */
router.get('/:id', validate({ params: idParams }), async (req, res) => {
  res.json(await getProduct(req.valid.params.id));
});

// ── Crear ─────────────────────────────────────────────────────

/** POST / — Crea el producto con variantes e imágenes. El slug lleva un sufijo aleatorio para ser único. */
router.post(
  '/',
  uploadImages,
  verifyImageSignatures,
  withUploadCleanup(async (req, res) => {
    const data = parseProductData(req);
    const slug = `${slugify(data.name) || 'producto'}-${crypto.randomBytes(3).toString('hex')}`;

    const id = await withTransaction(async (db) => {
      const { insertId } = await db.query(
        `INSERT INTO products (category_id, name, slug, description, price, discount_active, discount_percent, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.categoryId, data.name, slug, data.description, data.price, data.discountActive, data.discountPercent, data.isActive],
      );
      await syncVariants(db, insertId, data.variants);
      await insertImages(db, insertId, req.files ?? []);
      return insertId;
    });

    res.status(201).json(await getProduct(id));
  }),
);

// ── Editar ────────────────────────────────────────────────────

/** PUT /:id — Actualiza datos, sincroniza variantes, borra las imágenes marcadas y agrega las nuevas. */
router.put(
  '/:id',
  validate({ params: idParams }),
  uploadImages,
  verifyImageSignatures,
  withUploadCleanup(async (req, res) => {
    const { id } = req.valid.params;
    const data = parseProductData(req);

    const removedUrls = await withTransaction(async (db) => {
      const { rowCount } = await db.query(
        `UPDATE products
            SET category_id = ?, name = ?, description = ?, price = ?,
                discount_active = ?, discount_percent = ?, is_active = ?
          WHERE id = ?`,
        [data.categoryId, data.name, data.description, data.price, data.discountActive, data.discountPercent, data.isActive, id],
      );
      if (!rowCount) throw new HttpError(404, 'Producto no encontrado');

      await syncVariants(db, id, data.variants);
      // Sin RETURNING en MySQL: se leen las URLs y luego se borran (dentro de la misma transacción).
      let removed = [];
      if (data.removeImageIds.length) {
        ({ rows: removed } = await db.query(
          'SELECT url FROM product_images WHERE product_id = ? AND id IN (?) FOR UPDATE',
          [id, data.removeImageIds],
        ));
        await db.query('DELETE FROM product_images WHERE product_id = ? AND id IN (?)', [id, data.removeImageIds]);
      }
      await insertImages(db, id, req.files ?? []);
      return removed.map((r) => r.url);
    });

    // Los archivos se borran solo después del COMMIT.
    await removeFiles(removedUrls.map(uploadUrlToPath));
    res.json(await getProduct(id));
  }),
);

// ── Descuento rápido (toggle desde el listado) ────────────────

/** PATCH /:id/discount — Activa/desactiva el descuento; si no llega porcentaje se conserva el actual. */
router.patch(
  '/:id/discount',
  validate({
    params: idParams,
    body: z.object({ discountActive: z.boolean(), discountPercent: z.number().int().min(0).max(90).optional() }),
  }),
  async (req, res) => {
    const { discountActive, discountPercent } = req.valid.body;
    const { id } = req.valid.params;
    const { rowCount } = await query(
      'UPDATE products SET discount_active = ?, discount_percent = COALESCE(?, discount_percent) WHERE id = ?',
      [discountActive, discountPercent ?? null, id],
    );
    if (!rowCount) throw new HttpError(404, 'Producto no encontrado');
    const { rows: [row] } = await query(
      'SELECT id, price, final_price, discount_active, discount_percent FROM products WHERE id = ?',
      [id],
    );
    res.json(row);
  },
);

// ── Eliminar ──────────────────────────────────────────────────

/** DELETE /:id — Elimina el producto y, después del COMMIT, sus imágenes del disco. */
router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  const urls = await withTransaction(async (db) => {
    const { rows: images } = await db.query('SELECT url FROM product_images WHERE product_id = ?', [req.valid.params.id]);
    const { rowCount } = await db.query('DELETE FROM products WHERE id = ?', [req.valid.params.id]);
    if (!rowCount) throw new HttpError(404, 'Producto no encontrado');
    return images.map((i) => i.url);
  });
  await removeFiles(urls.map(uploadUrlToPath));
  res.status(204).end();
});

export default router;
