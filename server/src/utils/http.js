/** Error con código HTTP que el manejador central convierte en respuesta JSON. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** "Camisa de Lino Ñandú" → "camisa-de-lino-nandu" */
export function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Escapa los comodines de LIKE/ILIKE para buscar el texto literal del usuario. */
export const escapeLike = (text) => text.replace(/[\\%_]/g, '\\$&');
