/** Punto de entrada: valida entorno, verifica la BD y levanta el servidor. */
import fs from 'node:fs/promises';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { createApp } from './app.js';

await fs.mkdir(env.UPLOAD_PATH, { recursive: true });

try {
  await pool.query('SELECT 1');
} catch (err) {
  console.error('❌ No se pudo conectar a PostgreSQL:', err.message);
  process.exit(1);
}

const server = createApp().listen(env.PORT, () => {
  console.log(`✨ Skaditienda API · ${env.NODE_ENV} · Wompi ${env.WOMPI_ENV} · http://localhost:${env.PORT}`);
});

// Cierre ordenado: termina las peticiones en curso y libera la BD.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
