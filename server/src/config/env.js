/**
 * Carga y valida las variables de entorno UNA sola vez al arrancar.
 * Si falta algo o es inválido, el proceso se detiene con un mensaje claro
 * (mejor fallar al arrancar que cobrar con la llave equivocada).
 *
 * Orden de carga: .env.<NODE_ENV>  →  .env  (las variables ya definidas
 * en el sistema, p. ej. en el panel de Hostinger, nunca se sobrescriben).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const nodeEnv = process.env.NODE_ENV ?? 'development';

dotenv.config({
  path: [path.join(ROOT_DIR, `.env.${nodeEnv}`), path.join(ROOT_DIR, '.env')],
  quiet: true,
});

// Prefijo esperado de cada llave de Wompi según el ambiente.
const WOMPI_PREFIXES = {
  sandbox: { WOMPI_PUBLIC_KEY: 'pub_test_', WOMPI_INTEGRITY_SECRET: 'test_integrity_', WOMPI_EVENTS_SECRET: 'test_events_' },
  production: { WOMPI_PUBLIC_KEY: 'pub_prod_', WOMPI_INTEGRITY_SECRET: 'prod_integrity_', WOMPI_EVENTS_SECRET: 'prod_events_' },
};

// Esquema de todas las variables. `superRefine` comprueba además que cada llave de
// Wompi tenga el prefijo del ambiente elegido (evita mezclar sandbox y producción).
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    APP_URL: z.url().transform((url) => url.replace(/\/+$/, '')),
    DATABASE_URL: z.string().min(1),
    DATABASE_SSL: z.enum(['false', 'true', 'no-verify']).default('false'),
    JWT_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
    WOMPI_ENV: z.enum(['sandbox', 'production']),
    WOMPI_PUBLIC_KEY: z.string().min(1),
    WOMPI_INTEGRITY_SECRET: z.string().min(1),
    WOMPI_EVENTS_SECRET: z.string().min(1),
    UPLOAD_DIR: z.string().default('server/uploads'),
  })
  .superRefine((e, ctx) => {
    for (const [key, prefix] of Object.entries(WOMPI_PREFIXES[e.WOMPI_ENV])) {
      if (!e[key].startsWith(prefix)) {
        ctx.addIssue({ code: 'custom', path: [key], message: `debe empezar por "${prefix}" cuando WOMPI_ENV=${e.WOMPI_ENV}` });
      }
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:');
  for (const issue of parsed.error.issues) console.error(`   · ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && parsed.data.WOMPI_ENV !== 'production') {
  console.warn('⚠️  NODE_ENV=production pero WOMPI_ENV=sandbox: los pagos NO serán reales.');
}

// Configuración final e inmutable. Agrega valores derivados:
// isProd, ROOT_DIR (raíz del monorepo) y UPLOAD_PATH (ruta absoluta de las imágenes).
export const env = Object.freeze({
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  ROOT_DIR,
  UPLOAD_PATH: path.resolve(ROOT_DIR, parsed.data.UPLOAD_DIR),
});
