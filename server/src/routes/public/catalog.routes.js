/**
 * Catálogo público (sin registro): categorías, listado con filtros, destacados y detalle.
 */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../config/db.js';
import { validate } from '../../middleware/validate.js';
import { HttpError, escapeLike } from '../../utils/http.js';

const router = Router();

/**
 * SELECT común para tarjetas de producto (incluye imágenes ordenadas).
 * @param {string} [extraColumns] Columnas adicionales, terminadas en coma (p. ej. "p.description,").
 * @returns {string} SQL sin WHERE: quien lo usa agrega filtros y orden.
 */
const cardSelect = (extraColumns = '') => `
  SELECT ${extraColumns} p.id, p.name, p.slug, p.price, p.final_price, p.discount_active, p.discount_percent,
         c.name AS category_name, c.slug AS category_slug,
         COALESCE((SELECT json_agg(i.url ORDER BY i.sort_order, i.id)
                     FROM product_images i WHERE i.product_id = p.id), '[]') AS images
    FROM products p
    JOIN categories c ON c.id = p.category_id`;

// Valor de ?sort= → ORDER BY. Solo se interpolan estos textos fijos, nunca lo que envía el usuario.
const SORTS = {
  recent: 'p.created_at DESC, p.id DESC',
  price_asc: 'p.final_price ASC, p.id',
  price_desc: 'p.final_price DESC, p.id',
  name: 'p.name ASC',
};

/** Lista separada por comas de la URL, sin vacíos ni duplicados (máx. 20): "40,41" → ["40","41"] */
const csvList = z
  .string()
  .max(300)
  .optional()
  .transform((v) => (v ? [...new Set(v.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 20) : []));

const listQuery = z.object({
  category: z.string().max(60).optional(),
  q: z.string().trim().max(80).optional(),
  size: csvList,
  color: csvList,
  discount: z.enum(['true']).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  sort: z.enum(Object.keys(SORTS)).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(24),
});

// Orden natural de tallas de ropa; las numéricas (calzado, pantalón) van por valor.
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
/**
 * Comparador para ordenar tallas: numéricas por valor, de ropa según SIZE_ORDER y el resto alfabético.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareSizes(a, b) {
  const [na, nb] = [Number(a), Number(b)];
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  const [ia, ib] = [SIZE_ORDER.indexOf(a.toUpperCase()), SIZE_ORDER.indexOf(b.toUpperCase())];
  if (ia !== -1 && ib !== -1) return ia - ib;
  return a.localeCompare(b, 'es');
}

/** GET /categories — Categorías del menú, en el orden definido por sort_order. */
router.get('/categories', async (_req, res) => {
  const { rows } = await query('SELECT id, name, slug FROM categories ORDER BY sort_order, name');
  res.json(rows);
});

/**
 * GET /products — Listado público paginado (solo productos activos) con filtros de
 * categoría, búsqueda, talla, color, descuento y rango de precio, y orden configurable.
 */
router.get('/products', validate({ query: listQuery }), async (req, res) => {
  const f = req.valid.query;
  const where = ['p.is_active'];
  const params = [];
  // Agrega un valor a `params` y devuelve su marcador ($1, $2…).
  const param = (value) => `$${params.push(value)}`;

  if (f.category) where.push(`c.slug = ${param(f.category)}`);
  if (f.q) where.push(`p.name ILIKE ${param(`%${escapeLike(f.q)}%`)}`);
  if (f.discount) where.push('p.final_price < p.price');
  if (f.minPrice !== undefined) where.push(`p.final_price >= ${param(f.minPrice)}`);
  if (f.maxPrice !== undefined) where.push(`p.final_price <= ${param(f.maxPrice)}`);

  // Talla y color se evalúan sobre la MISMA variante con stock:
  // "talla 40 + negro" solo muestra productos que tengan un 40 negro disponible.
  if (f.size.length || f.color.length) {
    const conditions = ['v.product_id = p.id', 'v.stock > 0'];
    if (f.size.length) conditions.push(`v.size = ANY(${param(f.size)}::text[])`);
    if (f.color.length) conditions.push(`v.color = ANY(${param(f.color)}::text[])`);
    where.push(`EXISTS (SELECT 1 FROM product_variants v WHERE ${conditions.join(' AND ')})`);
  }

  const whereSql = where.join(' AND ');
  const offset = (f.page - 1) * f.limit;

  // Página y total en paralelo; comparten el mismo WHERE y parámetros.
  // ORDER BY/LIMIT/OFFSET se interpolan: vienen de SORTS o de enteros ya validados.
  const [{ rows: items }, { rows: [{ total }] }] = await Promise.all([
    query(`${cardSelect()} WHERE ${whereSql} ORDER BY ${SORTS[f.sort]} LIMIT ${f.limit} OFFSET ${offset}`, params),
    query(`SELECT count(*)::int AS total FROM products p JOIN categories c ON c.id = p.category_id WHERE ${whereSql}`, params),
  ]);

  res.json({ items, total, page: f.page, pages: Math.max(1, Math.ceil(total / f.limit)) });
});

/** GET /filters — Tallas y colores disponibles (con stock) para construir los filtros, opcionalmente por categoría. */
router.get('/filters', validate({ query: z.object({ category: z.string().max(60).optional() }) }), async (req, res) => {
  const { category } = req.valid.query;
  const { rows } = await query(
    `SELECT array_agg(DISTINCT v.size) AS sizes, array_agg(DISTINCT v.color) AS colors
       FROM product_variants v
       JOIN products p ON p.id = v.product_id AND p.is_active
       JOIN categories c ON c.id = p.category_id
      WHERE v.stock > 0 AND ($1::text IS NULL OR c.slug = $1)`,
    [category ?? null],
  );
  res.json({
    sizes: (rows[0].sizes ?? []).sort(compareSizes),
    colors: (rows[0].colors ?? []).sort((a, b) => a.localeCompare(b, 'es')),
  });
});

/**
 * GET /products/featured — Hasta 10 productos activos del banner, en su orden.
 * Debe declararse antes de /products/:slug para que "featured" no se tome como slug.
 */
router.get('/products/featured', async (_req, res) => {
  const { rows } = await query(
    `${cardSelect('p.description,')}
      WHERE p.is_active AND p.is_featured
      ORDER BY p.featured_order NULLS LAST, p.id
      LIMIT 10`,
  );
  res.json(rows);
});

/** GET /products/:slug — Detalle de un producto activo con sus variantes ordenadas por color y talla. */
router.get('/products/:slug', validate({ params: z.object({ slug: z.string().max(120) }) }), async (req, res) => {
  const { rows: [product] } = await query(
    `${cardSelect('p.description,')}
      WHERE p.slug = $1 AND p.is_active`,
    [req.valid.params.slug],
  );
  if (!product) throw new HttpError(404, 'Producto no encontrado');

  const { rows: variants } = await query(
    'SELECT id, size, color, stock FROM product_variants WHERE product_id = $1 ORDER BY color, id',
    [product.id],
  );
  variants.sort((a, b) => a.color.localeCompare(b.color, 'es') || compareSizes(a.size, b.size));

  res.json({ ...product, variants });
});

export default router;
