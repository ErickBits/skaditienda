/**
 * Crea un administrador o cambia su contraseña. No existe registro público de admins.
 *
 *   npm run admin:create -- admin@skaditienda.com
 *
 * La contraseña se pide por consola sin mostrarse (o se lee de ADMIN_PASSWORD
 * para despliegues automatizados). Mínimo 12 caracteres.
 */
import readline from 'node:readline';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../src/config/db.js';

/**
 * Pide un texto por consola sin hacer eco de lo que se escribe (para contraseñas).
 * @param {string} question Texto que se muestra al usuario.
 * @returns {Promise<string>} Lo que el usuario escribió.
 */
function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.includes(question)) rl.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const email = z.email().safeParse(process.argv[2]?.trim().toLowerCase());
if (!email.success) {
  console.error('Uso: npm run admin:create -- <correo>');
  process.exit(1);
}

const password = process.env.ADMIN_PASSWORD ?? (await promptHidden('Contraseña (mín. 12 caracteres): '));
if (password.length < 12) {
  console.error('❌ La contraseña debe tener al menos 12 caracteres.');
  process.exit(1);
}
if (!process.env.ADMIN_PASSWORD && (await promptHidden('Confirma la contraseña: ')) !== password) {
  console.error('❌ Las contraseñas no coinciden.');
  process.exit(1);
}

try {
  // Upsert: crea el admin o, si el correo ya existe, solo cambia la contraseña.
  // `xmax = 0` solo es cierto en filas recién insertadas → distingue "creado" de "actualizado".
  const hash = await bcrypt.hash(password, 12);
  const { rows: [admin] } = await pool.query(
    `INSERT INTO admins (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id, email, (xmax = 0) AS created`,
    [email.data, hash],
  );
  console.log(admin.created ? `✔ Administrador creado: ${admin.email}` : `✔ Contraseña actualizada: ${admin.email}`);
} catch (err) {
  console.error('❌', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
