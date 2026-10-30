/**
 * Crea/actualiza el esquema y carga las categorías base.
 *
 *   npm run db:init              → esquema + categorías
 *   npm run db:init -- --demo    → además, productos de demostración (no usar en producción)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';
import { SSL_MODES } from '../src/config/db.js';

const dbDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../db');
const files = ['schema.sql', 'seed.sql'];

if (process.argv.includes('--demo')) {
  if (env.isProd) {
    console.error('❌ Los datos demo no se cargan en producción.');
    process.exit(1);
  }
  files.push('seed-demo.sql');
}

// Conexión propia con multipleStatements: cada archivo .sql trae varias sentencias.
// (El pool de la app no lo activa: así una inyección SQL no podría encadenar sentencias.)
const conn = await mysql.createConnection({
  uri: env.DATABASE_URL,
  ssl: SSL_MODES[env.DATABASE_SSL],
  multipleStatements: true,
  charset: 'utf8mb4_unicode_ci',
});

try {
  for (const file of files) {
    await conn.query(await fs.readFile(path.join(dbDir, file), 'utf8'));
    console.log(`✔ ${file}`);
  }
  console.log('Base de datos lista.');
} catch (err) {
  console.error('❌ Error inicializando la base de datos:', err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
