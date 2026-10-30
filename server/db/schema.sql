-- ════════════════════════════════════════════════════════════════
-- Skaditienda · Esquema MySQL 8.0.16+ / MariaDB 10.5+
--
-- Convenciones de dinero:
--   · products.price / final_price  → pesos colombianos (COP, entero)
--   · orders.amount_in_cents        → centavos, el formato que usa Wompi
--
-- Fechas: DATETIME en UTC (la conexión fija time_zone = '+00:00').
-- El script es idempotente: puede ejecutarse varias veces sin perder datos.
-- ════════════════════════════════════════════════════════════════

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Catálogo ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL UNIQUE,
  slug        VARCHAR(80)  NOT NULL UNIQUE,
  sort_order  SMALLINT     NOT NULL DEFAULT 0
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category_id       INT UNSIGNED NOT NULL,
  name              VARCHAR(120) NOT NULL,
  slug              VARCHAR(120) NOT NULL UNIQUE,
  description       TEXT         NOT NULL,
  price             INT          NOT NULL CHECK (price > 0),
  discount_active   BOOLEAN      NOT NULL DEFAULT FALSE,
  discount_percent  SMALLINT     NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
  -- Precio de venta calculado por la base de datos: única fuente de verdad
  -- para el catálogo, los filtros por precio y el cobro en el checkout.
  final_price       INT GENERATED ALWAYS AS (
                      CASE WHEN discount_active AND discount_percent > 0
                           THEN ROUND(price * (100 - discount_percent) / 100)
                           ELSE price
                      END
                    ) STORED,
  is_featured       BOOLEAN      NOT NULL DEFAULT FALSE,  -- aparece en el banner
  featured_order    SMALLINT,                             -- orden dentro del banner
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,   -- visible en la tienda
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT,
  INDEX idx_products_active_category (is_active, category_id),
  INDEX idx_products_featured (is_featured, featured_order)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_images (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id  INT UNSIGNED NOT NULL,
  url         VARCHAR(255) NOT NULL,
  sort_order  SMALLINT     NOT NULL DEFAULT 0,
  CONSTRAINT fk_images_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Cada combinación talla + color es una variante con su propio stock.
-- Es lo que permite filtrar, p. ej., "zapatos talla 40 en color negro".
CREATE TABLE IF NOT EXISTS product_variants (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id  INT UNSIGNED NOT NULL,
  size        VARCHAR(20)  NOT NULL,
  color       VARCHAR(30)  NOT NULL,
  stock       INT          NOT NULL DEFAULT 0 CHECK (stock >= 0),
  UNIQUE KEY uq_variant (product_id, size, color),
  INDEX idx_variants_size (size, stock),
  INDEX idx_variants_color (color, stock),
  CONSTRAINT fk_variants_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ── Órdenes ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id                    CHAR(36)     NOT NULL PRIMARY KEY,   -- UUID generado en el servidor
  reference             VARCHAR(40)  NOT NULL UNIQUE,        -- referencia enviada a Wompi
  customer_name         VARCHAR(120) NOT NULL,
  customer_email        VARCHAR(160) NOT NULL,
  phone_primary         VARCHAR(20)  NOT NULL,
  phone_secondary       VARCHAR(20),
  address               VARCHAR(250) NOT NULL,
  city                  VARCHAR(80)  NOT NULL,
  amount_in_cents       BIGINT       NOT NULL CHECK (amount_in_cents > 0),
  currency              CHAR(3)      NOT NULL DEFAULT 'COP',
  status                ENUM('PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR') NOT NULL DEFAULT 'PENDING',
  status_detail         VARCHAR(255),
  wompi_transaction_id  VARCHAR(64),
  payment_method_type   VARCHAR(40),
  paid_at               DATETIME,
  dispatched            BOOLEAN      NOT NULL DEFAULT FALSE,
  dispatched_at         DATETIME,
  created_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT dispatch_requires_payment CHECK (NOT dispatched OR status = 'APPROVED'),
  INDEX idx_orders_status_created (status, created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Las líneas guardan una "foto" del producto: si luego se edita o borra,
-- la orden conserva el nombre, la talla, el color y el precio cobrados.
CREATE TABLE IF NOT EXISTS order_items (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id      CHAR(36)     NOT NULL,
  product_id    INT UNSIGNED,
  variant_id    INT UNSIGNED,
  product_name  VARCHAR(120) NOT NULL,
  size          VARCHAR(20)  NOT NULL,
  color         VARCHAR(30)  NOT NULL,
  unit_price    INT          NOT NULL CHECK (unit_price > 0),
  quantity      SMALLINT     NOT NULL CHECK (quantity > 0),
  CONSTRAINT fk_items_order   FOREIGN KEY (order_id)   REFERENCES orders (id)           ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products (id)         ON DELETE SET NULL,
  CONSTRAINT fk_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Bitácora de webhooks de Wompi (auditoría y deduplicación).
CREATE TABLE IF NOT EXISTS webhook_events (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  checksum        VARCHAR(128) NOT NULL UNIQUE,
  event_type      VARCHAR(60)  NOT NULL,
  transaction_id  VARCHAR(64),
  status          VARCHAR(20),
  payload         JSON         NOT NULL,
  received_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ── Administración ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admins (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  -- Collation binaria: el CHECK de minúsculas sí distingue mayúsculas.
  email          VARCHAR(160) COLLATE utf8mb4_bin NOT NULL UNIQUE CHECK (email = LOWER(email)),
  password_hash  VARCHAR(100) NOT NULL,
  last_login_at  DATETIME,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
