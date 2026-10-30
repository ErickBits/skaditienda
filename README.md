# Skaditienda

E-commerce monolítico: **React + Vite** (tienda y panel) · **Express 5** (API) · **MySQL / MariaDB** · **Wompi** (pagos).
En producción un solo proceso Node sirve la API y el build de React.

## Arquitectura

```
skaditienda/
├── package.json              # workspaces + scripts globales (dev, build, start, db:init…)
├── .env.example              # plantilla → .env.development / .env.production
├── server/
│   ├── db/
│   │   ├── schema.sql        # esquema idempotente (MySQL 8.0.16+ / MariaDB 10.5+)
│   │   ├── seed.sql          # categorías base
│   │   └── seed-demo.sql     # productos demo (solo desarrollo)
│   ├── scripts/
│   │   ├── db-init.js        # aplica esquema + seeds
│   │   └── create-admin.js   # crea admin / cambia contraseña
│   ├── uploads/              # imágenes subidas desde el panel
│   └── src/
│       ├── index.js          # arranque + cierre ordenado
│       ├── app.js            # Express: helmet, rate limit, API, estáticos, SPA
│       ├── config/           # env.js (validación Zod) · db.js (pool + transacciones)
│       ├── middleware/       # auth (JWT en cookie) · validate (Zod) · upload (multer) · error
│       ├── services/         # wompi.service.js · order.service.js
│       └── routes/
│           ├── public/       # catálogo, filtros, checkout
│           ├── admin/        # auth, productos, banner, órdenes
│           └── webhooks.routes.js
└── client/
    └── src/
        ├── components/       # ProductCard, FeaturedBanner, FilterPanel, Layout, Price
        ├── pages/            # Home, Catalog, ProductPage, Cart, Checkout, PaymentResult
        ├── admin/            # panel (se carga aparte con lazy())
        ├── context/          # carrito (localStorage)
        ├── lib/              # cliente API, formato COP
        └── styles/
```

## Puesta en marcha (desarrollo)

```bash
# MariaDB local en Docker (la primera vez; luego basta `docker start skadi-mysql`)
docker run -d --name skadi-mysql -p 3306:3306 -v skadi-mysqldata:/var/lib/mysql \
  -e MARIADB_ROOT_PASSWORD=root -e MARIADB_DATABASE=skaditienda -e MARIADB_USER=skadi -e MARIADB_PASSWORD=skadi mariadb:11.4

npm install
cp .env.example .env.development      # completa DATABASE_URL, JWT_SECRET y llaves sandbox de Wompi
npm run db:init -- --demo             # esquema + categorías + productos demo
npm run admin:create -- tu@correo.com # pide la contraseña (mín. 12 caracteres)
npm run dev                           # API :3000 + Vite :5173 → abre http://localhost:5173
```

Panel: `http://localhost:5173/admin`

Para recibir webhooks de Wompi en local, expón el puerto 3000 con un túnel (p. ej. `cloudflared tunnel --url http://localhost:3000`)
y registra `https://<túnel>/api/webhooks/wompi` en el panel sandbox de Wompi. Sin túnel, la página de resultado igual
sincroniza el estado consultando la API de Wompi.

## Producción (Hostinger)

```bash
npm install && npm run build   # genera client/dist
npm start                      # NODE_ENV=production, sirve API + tienda en PORT
```

- **App Node.js** (planes Business/Cloud): comando de build `npm install && npm run build`, archivo de inicio `server/src/index.js`
  (o `npm start`), y define las variables de entorno en el panel con `NODE_ENV=production`.
- **Base de datos:** crea una base MySQL en hPanel (*Bases de datos → Administración*) y pon sus datos en
  `DATABASE_URL=mysql://usuario:contraseña@localhost:3306/nombre_bd` (si la contraseña tiene símbolos, codifícala en la URL).
  Luego ejecuta una vez `npm run db:init` y `npm run admin:create -- tu@correo.com` (por SSH o desde la terminal de la app).
- `APP_URL` = tu dominio con https. En Wompi (producción) configura la URL de eventos `https://tu-dominio/api/webhooks/wompi`.
- `server/uploads/` debe ser persistente entre despliegues (respáldalo junto con la base de datos).

## API

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/categories` · `/api/products` · `/api/products/featured` · `/api/products/:slug` · `/api/filters` | público |
| POST | `/api/checkout` → `{ reference, checkoutUrl }` | público (rate limit) |
| GET | `/api/checkout/transaction/:id` | público (verifica contra Wompi) |
| POST | `/api/webhooks/wompi` | firma Wompi |
| POST | `/api/admin/auth/login` · `/logout`, GET `/me` | — |
| CRUD | `/api/admin/products` (+ `PATCH /:id/discount`) | admin |
| GET/PUT | `/api/admin/banner` | admin |
| GET | `/api/admin/orders` · `/:id`, PATCH `/:id/dispatch` | admin |

Filtros del catálogo: `?category=zapatos&size=40,41&color=Negro&discount=true&q=mocasin&sort=price_asc&page=2`.
Talla y color se evalúan sobre **la misma variante con stock** (un "40 negro" real, no un 40 de un color y un negro de otro).

## Seguridad

### Pagos con Wompi
1. **El precio nunca viene del cliente.** El checkout recibe solo `variantId` + `quantity`; el total sale de `products.final_price`
   (columna generada en la BD) y se valida el stock.
2. **Firma de integridad** `SHA256(referencia + monto_centavos + moneda + secreto_integridad)` calculada en el servidor:
   nadie puede cambiar el monto en el Web Checkout.
3. **Webhook verificado:** `SHA256(valores de signature.properties + timestamp + secreto_eventos)` comparado en tiempo constante;
   también se valida `environment` (test/prod). Firma inválida → 401.
4. **Defensa en profundidad:** tras validar la firma, la transacción se vuelve a consultar en la API de Wompi y se exige que
   **monto y moneda coincidan** con la orden; si no, la orden queda en `ERROR` y se registra en el log.
5. **Idempotente:** fila bloqueada con `SELECT … FOR UPDATE`, una orden `APPROVED` solo puede pasar a `VOIDED`, el stock se
   descuenta una sola vez (y se devuelve si se anula). Errores temporales → 5xx para que Wompi reintente.
6. **La redirección no es prueba de pago:** `/pago/resultado?id=` solo dispara una consulta al servidor, que pregunta a Wompi.
7. Los secretos de integridad/eventos solo existen en el servidor; `env.js` impide arrancar con llaves de un ambiente
   distinto a `WOMPI_ENV`.

### Panel administrativo
- Sin registro público: los admins se crean por consola (`admin:create`), contraseñas con **bcrypt (12 rondas)**.
- Sesión = JWT HS256 (8 h) en cookie **httpOnly + SameSite=Strict + Secure** (en producción), limitada a `/api/admin`.
  Se revalida en cada petición que el admin siga existiendo.
- **CSRF:** SameSite=Strict + verificación de `Origin` contra `APP_URL` en toda petición que modifique datos.
- **Fuerza bruta:** 5 intentos fallidos / 15 min por IP; hash señuelo para no revelar qué correos existen.
- **Entradas:** todo body/query/params pasa por Zod; SQL 100 % parametrizado; comodines de `LIKE` escapados.
- **Imágenes:** solo JPG/PNG/WEBP ≤ 5 MB, nombre UUID generado por el servidor y verificación de *magic bytes*
  (un HTML renombrado a `.png` se rechaza y se borra).
- **Cabeceras:** Helmet (CSP, HSTS, nosniff, frame-ancestors) y rate limit general en `/api`.

### Recomendaciones operativas
- Usa un `JWT_SECRET` aleatorio de 64+ caracteres distinto por ambiente; rotarlo cierra todas las sesiones.
- Fuerza HTTPS en el dominio (Hostinger lo ofrece con SSL gratuito).
- Respalda la base de datos y `server/uploads/` a diario.
- Revisa periódicamente las órdenes en `PENDING` antiguas (pagos abandonados) y `ERROR` (posibles manipulaciones).
# skaditienda
