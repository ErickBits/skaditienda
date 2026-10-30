/**
 * Pool de conexiones a MySQL/MariaDB y utilidades de consulta/transacción.
 */
import mysql from 'mysql2/promise';
import { env } from './env.js';

// Valor de DATABASE_SSL → opción `ssl` de mysql2. 'no-verify' cifra pero no valida el
// certificado (algunos proveedores gestionados lo requieren).
export const SSL_MODES = {
  false: undefined,
  true: { rejectUnauthorized: true },
  'no-verify': { rejectUnauthorized: false },
};

/**
 * MySQL no tiene tipo booleano: BOOLEAN es TINYINT(1) y llegaría como 0/1.
 * Lo convertimos a true/false para que la API responda igual que antes
 * (y el panel pueda reenviar esos valores a los esquemas Zod con z.boolean()).
 */
function typeCast(field, next) {
  if (field.type === 'TINY' && field.length === 1) {
    const value = field.string();
    return value === null ? null : value === '1';
  }
  return next();
}

export const pool = mysql.createPool({
  uri: env.DATABASE_URL,
  ssl: SSL_MODES[env.DATABASE_SSL],
  connectionLimit: 10,
  connectTimeout: 10_000,
  idleTimeout: 30_000,
  charset: 'utf8mb4_unicode_ci',
  timezone: 'Z',          // DATETIME se lee y escribe como UTC…
  decimalNumbers: true,   // SUM() devuelve DECIMAL: que llegue como Number, no como string
  typeCast,
});

// …y NOW()/CURRENT_TIMESTAMP también trabajan en UTC.
pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

/**
 * Normaliza el resultado de mysql2 a la forma `{ rows, rowCount, insertId }`:
 * · SELECT → `rows` con las filas y `rowCount` = número de filas.
 * · INSERT/UPDATE/DELETE → `rows` vacío, `rowCount` = filas afectadas (en UPDATE,
 *   las que cumplieron el WHERE aunque no cambiaran) e `insertId` del AUTO_INCREMENT.
 */
function normalize([result]) {
  if (Array.isArray(result)) return { rows: result, rowCount: result.length };
  return { rows: [], rowCount: result.affectedRows, insertId: result.insertId };
}

/**
 * Consulta simple con parámetros `?`. Nunca concatenes valores en el SQL.
 * Un arreglo se expande como lista: `IN (?)` con [1, 2] → `IN (1, 2)`
 * (¡no pases arreglos vacíos: `IN ()` es un error de sintaxis!).
 * @param {string} sql SQL con marcadores `?`.
 * @param {unknown[]} [params] Valores para los marcadores, en orden.
 * @returns {Promise<{ rows: any[], rowCount: number, insertId?: number }>}
 */
export const query = async (sql, params) => normalize(await pool.query(sql, params));

/**
 * Ejecuta `fn(db)` dentro de una transacción.
 * Hace COMMIT si termina bien y ROLLBACK si lanza un error.
 * Dentro de `fn` usa siempre `db.query` (no `query`), o la consulta quedará fuera de la transacción.
 * @template T
 * @param {(db: { query: typeof query }) => Promise<T>} fn Trabajo a ejecutar.
 * @returns {Promise<T>} Lo que devuelva `fn`.
 */
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn({ query: async (sql, params) => normalize(await conn.query(sql, params)) });
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}
