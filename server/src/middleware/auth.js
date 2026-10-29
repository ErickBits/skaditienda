/**
 * Autenticación del panel administrativo.
 *
 * · La sesión es un JWT firmado (HS256) guardado en una cookie httpOnly:
 *   JavaScript del navegador no puede leerla (mitiga robo por XSS).
 * · SameSite=Strict + verificación de Origin bloquean CSRF.
 * · En producción la cookie solo viaja por HTTPS (Secure).
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { HttpError } from '../utils/http.js';

/** Nombre de la cookie que guarda el JWT de sesión. */
export const ADMIN_COOKIE = 'skadi_admin';
const SESSION_HOURS = 8;
const JWT_OPTIONS = { algorithm: 'HS256', issuer: 'skaditienda', audience: 'admin' };

/** Opciones de la cookie de sesión; el logout reutiliza las mismas (sin maxAge) para borrarla. */
export const adminCookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'strict',
  path: '/api/admin',
  maxAge: SESSION_HOURS * 60 * 60 * 1000,
};

/**
 * Firma el JWT de sesión de un administrador.
 * @param {{ id: number, email: string }} admin
 * @returns {string} Token con `sub` = id del admin, válido por SESSION_HOURS horas.
 */
export function signAdminToken(admin) {
  return jwt.sign({ sub: String(admin.id), email: admin.email }, env.JWT_SECRET, {
    ...JWT_OPTIONS,
    expiresIn: `${SESSION_HOURS}h`,
  });
}

/**
 * Middleware: exige una sesión de administrador válida y vigente.
 * Si es válida deja `{ id, email }` en `req.admin`; si no, responde 401.
 */
export async function requireAdmin(req, _res, next) {
  const token = req.cookies?.[ADMIN_COOKIE];
  if (!token) return next(new HttpError(401, 'No autenticado'));

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { ...JWT_OPTIONS, algorithms: [JWT_OPTIONS.algorithm] });
  } catch {
    return next(new HttpError(401, 'Sesión inválida o expirada'));
  }

  // Si el admin fue eliminado, su token deja de servir de inmediato.
  const { rows } = await query('SELECT id, email FROM admins WHERE id = $1', [Number(payload.sub)]);
  if (!rows[0]) return next(new HttpError(401, 'Sesión inválida'));

  req.admin = rows[0];
  next();
}

/**
 * Las peticiones que modifican datos deben venir de nuestro propio dominio.
 * Segunda capa contra CSRF además de SameSite=Strict.
 */
export function requireSameOrigin(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('origin') !== new URL(env.APP_URL).origin) {
    return next(new HttpError(403, 'Origen no permitido'));
  }
  next();
}
