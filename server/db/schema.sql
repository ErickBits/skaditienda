-- ════════════════════════════════════════════════════════════════
-- Skaditienda · Esquema PostgreSQL (13+)
--
-- Convenciones de dinero:
--   · products.price / final_price  → pesos colombianos (COP, entero)
--   · orders.amount_in_cents        → centavos, el formato que usa Wompi
--
-- El script es idempotente: puede ejecutarse varias veces sin perder datos.
-- ════════════════════════════════════════════════════════════════

BEGIN;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Catálogo ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
  id          serial PRIMARY KEY,
  name        text     NOT NULL UNIQUE,
  slug        text     NOT NULL UNIQUE,
  sort_order  smallint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id                serial PRIMARY KEY,
  category_id       integer  NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name              text     NOT NULL,
  slug              text     NOT NULL UNIQUE,
  description       text     NOT NULL DEFAULT '',
  price             integer  NOT NULL CHECK (price > 0),
  discount_active   boolean  NOT NULL DEFAULT false,
  discount_percent  smallint NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
  -- Precio de venta calculado por la base de datos: única fuente de verdad
  -- para el catálogo, los filtros por precio y el cobro en el checkout.
  final_price       integer GENERATED ALWAYS AS (
                      CASE WHEN discount_active AND discount_percent > 0
                           THEN round(price * (100 - discount_percent) / 100.0)::integer
                           ELSE price
                      END
                    ) STORED,
  is_featured       boolean  NOT NULL DEFAULT false,   -- aparece en el banner
  featured_order    smallint,                           -- orden dentro del banner
  is_active         boolean  NOT NULL DEFAULT true,    -- visible en la tienda
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_products_featured ON products (featured_order) WHERE is_featured;

CREATE TABLE IF NOT EXISTS product_images (
  id          serial PRIMARY KEY,
  product_id  integer  NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         text     NOT NULL,
  sort_order  smallint NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images (product_id);

-- Cada combinación talla + color es una variante con su propio stock.
-- Es lo que permite filtrar, p. ej., "zapatos talla 40 en color negro".
CREATE TABLE IF NOT EXISTS product_variants (
  id          serial PRIMARY KEY,
  product_id  integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size        text    NOT NULL,
  color       text    NOT NULL,
  stock       integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  UNIQUE (product_id, size, color)
);

CREATE INDEX IF NOT EXISTS idx_variants_size  ON product_variants (size)  WHERE stock > 0;
CREATE INDEX IF NOT EXISTS idx_variants_color ON product_variants (color) WHERE stock > 0;

-- ── Órdenes ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             text NOT NULL UNIQUE,          -- referencia enviada a Wompi
  customer_name         text NOT NULL,
  customer_email        text NOT NULL,
  phone_primary         text NOT NULL,
  phone_secondary       text,
  address               text NOT NULL,
  city                  text NOT NULL,
  amount_in_cents       bigint NOT NULL CHECK (amount_in_cents > 0),
  currency              char(3) NOT NULL DEFAULT 'COP',
  status                order_status NOT NULL DEFAULT 'PENDING',
  status_detail         text,
  wompi_transaction_id  text,
  payment_method_type   text,
  paid_at               timestamptz,
  dispatched            boolean NOT NULL DEFAULT false,
  dispatched_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatch_requires_payment CHECK (NOT dispatched OR status = 'APPROVED')
);

CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders (status, created_at DESC);

-- Las líneas guardan una "foto" del producto: si luego se edita o borra,
-- la orden conserva el nombre, la talla, el color y el precio cobrados.
CREATE TABLE IF NOT EXISTS order_items (
  id            serial PRIMARY KEY,
  order_id      uuid     NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    integer  REFERENCES products(id) ON DELETE SET NULL,
  variant_id    integer  REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name  text     NOT NULL,
  size          text     NOT NULL,
  color         text     NOT NULL,
  unit_price    integer  NOT NULL CHECK (unit_price > 0),
  quantity      smallint NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);

-- Bitácora de webhooks de Wompi (auditoría y deduplicación).
CREATE TABLE IF NOT EXISTS webhook_events (
  id              bigserial PRIMARY KEY,
  checksum        text NOT NULL UNIQUE,
  event_type      text NOT NULL,
  transaction_id  text,
  status          text,
  payload         jsonb NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Administración ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admins (
  id             serial PRIMARY KEY,
  email          text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash  text NOT NULL,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Triggers ───────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated ON orders;
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
