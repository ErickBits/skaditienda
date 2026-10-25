import multer from 'multer';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

export function apiNotFound(_req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

/** Manejador central: toda respuesta de error sale de aquí con el mismo formato. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let error = err;

  if (err instanceof multer.MulterError) {
    const messages = { LIMIT_FILE_SIZE: 'Cada imagen debe pesar máximo 5 MB', LIMIT_FILE_COUNT: 'Máximo 8 imágenes por envío' };
    error = new HttpError(400, messages[err.code] ?? 'Error al subir archivos');
  } else if (err.type === 'entity.parse.failed') {
    error = new HttpError(400, 'JSON inválido');
  } else if (err.type === 'entity.too.large') {
    error = new HttpError(413, 'La solicitud es demasiado grande');
  } else if (err.code === '23505') {
    error = new HttpError(409, 'Ya existe un registro con esos datos');
  } else if (err.code === '23503') {
    error = new HttpError(409, 'El registro está relacionado con otros datos');
  }

  const status = error.status ?? 500;
  if (status >= 500) console.error('[error]', err);

  res.status(status).json({
    error: status >= 500 && env.isProd ? 'Error interno del servidor' : error.message,
    ...(error.details && { details: error.details }),
  });
}
