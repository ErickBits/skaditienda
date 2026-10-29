/**
 * Checkout sin registro: crea la orden y devuelve la URL firmada de Wompi.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../../config/db.js';
import { validate } from '../../middleware/validate.js';
import { createOrder, applyTransaction } from '../../services/order.service.js';
import { buildCheckoutUrl, getTransaction } from '../../services/wompi.service.js';
import { HttpError } from '../../utils/http.js';

const router = Router();

// Evita que un bot llene la base de datos de órdenes pendientes.
const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de compra. Espera unos minutos.' },
});

// Teléfono: dígitos, espacios, guiones y + opcional (7 a 20 caracteres).
const phone = z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/, 'Teléfono inválido');

const checkoutSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(3, 'Escribe tu nombre completo').max(120),
    email: z.string().trim().toLowerCase().pipe(z.email('Correo inválido').max(160)),
    address: z.string().trim().min(5, 'Escribe una dirección válida').max(250),
    city: z.string().trim().min(2, 'Escribe tu ciudad').max(80),
    phonePrimary: phone,
    phoneSecondary: z.union([phone, z.literal('')]).optional().transform((v) => v || null),
  }),
  items: z
    .array(z.object({ variantId: z.number().int().positive(), quantity: z.number().int().min(1).max(20) }))
    .min(1, 'El carrito está vacío')
    .max(50),
});

/**
 * POST / — Valida los datos del cliente, crea la orden PENDING (con precios de la BD)
 * y devuelve la URL firmada del Web Checkout de Wompi a la que debe ir el navegador.
 */
router.post('/', checkoutLimiter, validate({ body: checkoutSchema }), async (req, res) => {
  const { customer } = req.valid.body;
  const order = await createOrder(req.valid.body);

  res.status(201).json({
    reference: order.reference,
    amountInCents: order.amount_in_cents,
    checkoutUrl: buildCheckoutUrl({
      reference: order.reference,
      amountInCents: order.amount_in_cents,
      currency: order.currency,
      customer,
    }),
  });
});

/**
 * GET /transaction/:id — Estado del pago para la página de resultado.
 * Wompi redirige a /pago/resultado?id=<transactionId>.
 * Ese `id` viene del navegador, por eso NO se confía en él: se consulta la
 * transacción en la API de Wompi y se aplica (idempotente) por si el webhook
 * todavía no llegó. Solo se devuelven datos no sensibles.
 */
router.get(
  '/transaction/:id',
  validate({ params: z.object({ id: z.string().regex(/^[\w-]{5,64}$/) }) }),
  async (req, res) => {
    const tx = await getTransaction(req.valid.params.id);
    if (!tx) throw new HttpError(404, 'Transacción no encontrada');

    await applyTransaction(tx);
    const { rows: [order] } = await query('SELECT reference, status FROM orders WHERE reference = $1', [tx.reference]);
    if (!order) throw new HttpError(404, 'Orden no encontrada');

    res.json({ reference: order.reference, status: order.status, amountInCents: tx.amount_in_cents });
  },
);

export default router;
