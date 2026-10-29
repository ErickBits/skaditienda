/**
 * Error con código HTTP que el manejador central convierte en respuesta JSON.
 * Lánzalo desde cualquier ruta o servicio: `throw new HttpError(404, 'No encontrado')`.
 */
export class HttpError extends Error {
/**
 * @param {number} status Código HTTP (400, 404, 409…).
 * @param {string} message Mensaje para el usuario.
 * @param {Array<{ path: string, message: string }>} [details] Errores por campo.
 */
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Convierte un texto en slug para URL (sin tildes, minúsculas, guiones, máx. 80).
 * "Camisa de Lino Ñandú" → "camisa-de-lino-nandu"
 * @param {string} text
 * @returns {string} Puede quedar vacío si el texto no tiene letras ni números.
 */
export function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Escapa los comodines de LIKE/ILIKE para buscar el texto literal del usuario.
 * "50%_off" → "50\%\_off"
 * @param {string} text
 * @returns {string}
 */
export const escapeLike = (text) => text.replace(/[\\%_]/g, '\\$&');
