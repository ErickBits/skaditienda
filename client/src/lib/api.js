/**
 * Cliente HTTP mínimo para la API. Mismo origen siempre (proxy de Vite en desarrollo),
 * así las cookies de sesión del admin viajan solas y nunca hay que tocar tokens en JS.
 */

/**
 * Hace una petición a `/api<path>` y devuelve el JSON de respuesta.
 * @param {string} path Ruta relativa a /api (p. ej. "/products").
 * @param {object} [options]
 * @param {string} [options.method='GET']
 * @param {unknown} [options.body] Se envía como JSON.
 * @param {FormData} [options.form] Se envía como multipart (el navegador pone el Content-Type).
 * @returns {Promise<any>} Datos de la respuesta, o null si es 204.
 * @throws {Error} Con `status` y `details` si la API responde con error.
 */
async function request(path, { method = 'GET', body, form } = {}) {
  const options = { method, credentials: 'same-origin', headers: {} };
  if (form) {
    options.body = form;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`/api${path}`, options);
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error ?? 'No pudimos conectar con el servidor');
    error.status = res.status;
    error.details = data.details;
    throw error;
  }
  return data;
}

/** Atajos por método HTTP. `upload` envía FormData (imágenes de productos). */
export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  upload: (path, form, method = 'POST') => request(path, { method, form }),
};

/** { a: 1, b: ['x','y'], c: '' } → "?a=1&b=x,y" (omite vacíos) */
export function toQuery(params) {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)]);
  const qs = new URLSearchParams(entries).toString();
  return qs ? `?${qs}` : '';
}

/** Convierte los `details` de un 400 en { "customer.email": "Correo inválido" }. */
export const fieldErrors = (error) =>
  Object.fromEntries((error?.details ?? []).map((d) => [d.path, d.message]));
