/** Sesión del panel: login, logout y consulta de la sesión actual. */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../../config/db.js';
import { ADMIN_COOKIE, adminCookieOptions, requireAdmin, signAdminToken } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { HttpError } from '../../utils/http.js';

const router = Router();

// 5 intentos fallidos por IP cada 15 minutos (los exitosos no cuentan).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
});

// Hash "señuelo": si el correo no existe igual se ejecuta bcrypt, para que el tiempo
// de respuesta no revele qué correos son de administradores.
const DECOY_HASH = bcrypt.hashSync('skaditienda-decoy-password', 12);

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(160)),
  password: z.string().min(1).max(200),
});

/**
 * POST /login — Verifica credenciales y deja la cookie de sesión.
 * Responde el mismo 401 si falla el correo o la contraseña (no revela cuál).
 */
router.post('/login', loginLimiter, validate({ body: loginSchema }), async (req, res) => {
  const { email, password } = req.valid.body;
  const { rows: [admin] } = await query('SELECT id, email, password_hash FROM admins WHERE email = ?', [email]);

  const valid = await bcrypt.compare(password, admin?.password_hash ?? DECOY_HASH);
  if (!admin || !valid) throw new HttpError(401, 'Credenciales inválidas');

  await query('UPDATE admins SET last_login_at = NOW() WHERE id = ?', [admin.id]);
  res.cookie(ADMIN_COOKIE, signAdminToken(admin), adminCookieOptions);
  res.json({ email: admin.email });
});

/** POST /logout — Borra la cookie (clearCookie exige las mismas opciones con que se creó, sin maxAge). */
router.post('/logout', (_req, res) => {
  const { maxAge: _maxAge, ...options } = adminCookieOptions;
  res.clearCookie(ADMIN_COOKIE, options);
  res.status(204).end();
});

/** GET /me — Admin de la sesión actual; el panel lo usa para saber si sigue autenticado. */
router.get('/me', requireAdmin, (req, res) => res.json({ email: req.admin.email }));

export default router;
