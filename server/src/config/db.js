/**
 * Pool de conexiones a PostgreSQL y utilidades de consulta/transacción.
 */
import pg from 'pg';
import { env } from './env.js';

// BIGINT (OID 20) llega como string por defecto; nuestros montos caben de sobra en Number.
pg.types.setTypeParser(20, (value) => Number(value));

const SSL_MODES = {
  false: false,
  true: { rejectUnauthorized: true },
  'no-verify': { rejectUnauthorized: false },
};

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: SSL_MODES[env.DATABASE_SSL],
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => console.error('[db] error en un cliente inactivo:', err.message));

/** Consulta simple con parámetros ($1, $2...). Nunca concatenes valores en el SQL. */
export const query = (text, params) => pool.query(text, params);

/**
 * Ejecuta `fn(client)` dentro de una transacción.
 * Hace COMMIT si termina bien y ROLLBACK si lanza un error.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
