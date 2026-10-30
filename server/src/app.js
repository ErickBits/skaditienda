/**
 * Aplicación Express (monolito): sirve la API y, en producción, el build de React.
 */
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import apiRoutes from './routes/index.js';
import { apiNotFound, errorHandler } from './middleware/error.js';

/**
 * Construye la aplicación Express: seguridad (helmet, rate limit), API, imágenes
 * subidas y, en producción, los archivos estáticos de la SPA.
 * Está separada de index.js para poder crearla sin abrir un puerto (p. ej. en pruebas).
 * @returns {import('express').Express}
 */
export function createApp() {
  const app = express();

  // Hostinger (y casi cualquier hosting) pone un proxy delante: necesario para IP real y cookies Secure.
  if (env.isProd) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:'],
          'form-action': ["'self'", 'https://checkout.wompi.co'],
        },
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Límite general anti-abuso para toda la API.
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.use('/api', apiRoutes);
  app.use('/api', apiNotFound);

  // Imágenes subidas desde el panel (nombres UUID → se pueden cachear para siempre).
  app.use('/uploads', express.static(env.UPLOAD_PATH, { maxAge: '365d', immutable: true, index: false, fallthrough: false }));

  if (env.isProd) {
    const dist = path.join(env.ROOT_DIR, 'client', 'dist');
    app.use('/assets', express.static(path.join(dist, 'assets'), { maxAge: '365d', immutable: true }));
    app.use(express.static(dist, { index: false }));
    // SPA: cualquier otra ruta GET devuelve index.html (React Router decide qué mostrar).
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.set('Cache-Control', 'no-cache').sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
