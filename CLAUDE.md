# Skaditienda — contexto del proyecto

E-commerce monolítico de moda masculina (Colombia, precios en COP). Despliegue objetivo: **Hostinger**.
Idioma del proyecto y de la comunicación con el usuario: **español**. Código, comentarios y textos de UI en español.

## Stack
- `server/`: Node + **Express 5** (ESM), `mysql2`, Zod 4, helmet, express-rate-limit, multer, bcryptjs, jsonwebtoken.
- `client/`: **React 19 + Vite 8**, `react-router` v8 (importar desde `react-router`, no `react-router-dom`), `framer-motion`, CSS plano con variables (sin Tailwind).
- **MySQL 8.0.16+ / MariaDB 10.5+** (driver `mysql2`) · pagos con **Wompi** (Web Checkout por redirección + webhook).
- npm workspaces; en producción un solo proceso Express sirve la API y `client/dist`.

## Comandos
```bash
docker start skadi-mysql                 # MariaDB local (contenedor mariadb:11.4, user/pass/db: skadi/skadi/skaditienda, puerto 3306, volumen skadi-mysqldata; root/root)
npm run dev                              # API :3000 + Vite :5173 → http://localhost:5173 (admin en /admin)
npm run build                            # build del cliente
npm start                                # producción (NODE_ENV=production)
npm run db:init -- --demo                # esquema + categorías + productos demo (el -- es necesario)
npm run admin:create -- correo@x.com     # crea admin / cambia contraseña (ADMIN_PASSWORD para no interactivo)
```
- Entornos: `.env.development` / `.env.production` en la raíz (plantilla `.env.example`). `server/src/config/env.js` valida todo con Zod y **no arranca** si las llaves de Wompi no coinciden con `WOMPI_ENV` (`pub_test_`/`test_integrity_`/`test_events_` vs `pub_prod_`/…).
- Vite escucha solo en `[::1]`: usar `localhost:5173`, no `127.0.0.1`.

## Decisiones de diseño (no cambiar sin hablarlo)
- **Precios:** `products.final_price` es columna GENERATED en la BD (precio con descuento). Es la única fuente de verdad; el checkout recibe solo `variantId + quantity` y recalcula en el servidor.
- **Variantes:** cada talla+color es una fila en `product_variants` con su stock. Los filtros de talla y color se evalúan sobre la **misma** variante con stock > 0.
- **Órdenes:** `orders.amount_in_cents` (formato Wompi). Las `order_items` guardan una foto (nombre, talla, color, precio) del producto.
- **Wompi** (`server/src/services/wompi.service.js`, `order.service.js`):
  - Firma de integridad SHA256(ref+monto+moneda+secreto) generada en el servidor.
  - Webhook `/api/webhooks/wompi`: valida checksum (comparación en tiempo constante, case-insensitive) + `environment`, y luego **re-consulta la transacción en la API de Wompi**.
  - `applyTransaction` es idempotente: usa `FOR UPDATE`, una orden APPROVED solo pasa a VOIDED, el stock se descuenta al aprobar y se devuelve al anular, y si el monto no coincide la orden queda en ERROR.
  - `/pago/resultado?id=` no se considera prueba de pago: el backend consulta a Wompi.
- **Admin:** sin registro público. JWT HS256 en cookie httpOnly + SameSite=Strict (Secure en prod), path `/api/admin`, 8 h. `requireSameOrigin` compara `Origin` con `APP_URL` en métodos que mutan datos. Login limitado a 5 intentos fallidos cada 15 min.
- **Uploads:** disco local `server/uploads/`, nombres UUID, verificación de magic bytes. Se sirven en `/uploads`.
- **Estilo visual "lujo silencioso":** marfil `--bg #f7f3ec`, carbón `--noir #14120f`, dorado `--gold #b08d57`. Tipografías Cormorant Garamond (títulos) y Manrope (texto). Bordes muy redondeados y animaciones suaves con ease `[0.22,1,0.36,1]`. `<MotionConfig reducedMotion="user">`.
- El panel admin se carga con `lazy()` para que no entre en el bundle de la tienda.

## Base de datos (MySQL/MariaDB)
- Migrado desde PostgreSQL el 2026-10-30 para poder usar el hosting compartido/cloud de Hostinger. El SQL debe funcionar en **ambos** MySQL 8 y MariaDB (Hostinger puede usar cualquiera); se probó en MariaDB 11.4 y MySQL 8.4.
- `config/db.js` expone `query(sql, params)` y `withTransaction(fn)` que devuelven `{ rows, rowCount, insertId }`. Marcadores `?` (no `$1`); un arreglo se expande en `IN (?)` y `VALUES ?` acepta arreglo de filas.
- Sin `RETURNING`: hacer UPDATE y luego SELECT. Los UUID de `orders.id` se generan en Node (`crypto.randomUUID()`).
- Fechas `DATETIME` en UTC: la conexión fija `time_zone = '+00:00'` y mysql2 usa `timezone: 'Z'`.
- `typeCast` convierte `TINYINT(1)` en booleano (el panel reenvía esos valores a Zod `z.boolean()`); `decimalNumbers` hace que `SUM()` llegue como Number.
- Collation `utf8mb4_unicode_ci`: `LIKE` no distingue mayúsculas **ni tildes**, y los UNIQUE tampoco (talla "M"/"m" es la misma variante).

## Trampas ya encontradas
- **No usar** en SQL: `ORDER BY` dentro de `JSON_ARRAYAGG` (no existe en MySQL 8), `VALUES … AS alias` en upserts (no existe en MariaDB; usar `VALUES(col)`), `CREATE INDEX IF NOT EXISTS` (no existe en MySQL; índices dentro del `CREATE TABLE`), `NULLS LAST` (usar `col IS NULL, col`).
- Nunca pasar un arreglo vacío a `IN (?)`: genera `IN ()` y es error de sintaxis.
- `useEffect(() => fn())` sin llaves devuelve un valor como cleanup → pantalla en blanco (`destroy is not a function`). Usar siempre llaves.
- Importar `global.css` **antes** que los componentes en `main.jsx` para que el CSS de cada componente pueda sobrescribirlo.
- Express 5: `req.query` es de solo lectura. Los datos validados van en `req.valid.{body,query,params}` (middleware `validate`).
- `pkill -f` con un patrón que aparece en tu propio comando mata la shell. Usar PID.

## Estado (2026-10-30)
- Hecho y probado (e2e de la API contra MariaDB 11.4 y MySQL 8.4 en Docker):
  - Catálogo, filtros, checkout, flujo de webhook (con API de Wompi simulada).
  - Auth admin, CRUD de productos con imágenes, banner, órdenes y despacho.
  - Modo producción sirviendo la SPA (probado con Postgres; no cambió con la migración).
- **No probado:** el sandbox real de Wompi (faltan llaves reales del usuario) y la UI del panel admin en el navegador.
- Hostinger: el hosting Web/Cloud solo ofrece MySQL/MariaDB (Postgres solo en VPS), por eso se migró. Falta confirmar que el plan permite apps Node.js. `server/uploads/` debe persistir entre despliegues.
- Repositorio git: rama de trabajo `dev`, principal `main`.
- Pendientes posibles: llaves sandbox de Wompi, fotos reales de productos, emails de confirmación, git + despliegue.
