/**
 * Subida de imágenes de producto al disco local.
 *
 * · Solo JPG, PNG y WEBP, máximo 5 MB y 8 archivos por envío.
 * · El nombre del archivo lo genera el servidor (UUID): el nombre original
 *   del usuario nunca toca el sistema de archivos (evita path traversal).
 * · El MIME que envía el navegador se puede falsificar, así que además
 *   se verifican los "magic bytes" reales del archivo.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

const EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.UPLOAD_PATH),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${EXTENSIONS[file.mimetype]}`),
});

export const uploadImages = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 8, fields: 10 },
  fileFilter: (_req, file, cb) =>
    EXTENSIONS[file.mimetype] ? cb(null, true) : cb(new HttpError(400, 'Solo se permiten imágenes JPG, PNG o WEBP')),
}).array('images', 8);

export async function removeFiles(filePaths) {
  await Promise.all(filePaths.map((p) => fs.unlink(p).catch(() => {})));
}

/** Convierte "/uploads/abc.jpg" en su ruta absoluta en disco (solo dentro de UPLOAD_PATH). */
export const uploadUrlToPath = (url) => path.join(env.UPLOAD_PATH, path.basename(url));

/** Rechaza (y borra) los archivos cuyo contenido no sea realmente una imagen. */
export async function verifyImageSignatures(req, _res, next) {
  const files = req.files ?? [];
  try {
    for (const file of files) {
      const handle = await fs.open(file.path, 'r');
      const { buffer } = await handle.read(Buffer.alloc(12), 0, 12, 0);
      await handle.close();
      if (!SIGNATURES[file.mimetype](buffer)) {
        throw new HttpError(400, `"${file.originalname}" no es una imagen válida`);
      }
    }
    next();
  } catch (err) {
    await removeFiles(files.map((f) => f.path));
    next(err);
  }
}
