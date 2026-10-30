-- Productos de demostración (solo desarrollo): npm run db:init -- --demo
-- Sin imágenes: la tienda muestra un marcador elegante hasta que subas fotos desde el panel.
-- INSERT IGNORE: si el slug o la variante ya existen, la fila se omite.
INSERT IGNORE INTO products (category_id, name, slug, description, price, discount_active, discount_percent, is_featured, featured_order)
VALUES
  ((SELECT id FROM categories WHERE slug = 'zapatos'),    'Mocasín Aurelio',     'mocasin-aurelio',     'Cuero napa curtido a mano, suela cosida tipo Blake y forro de piel de cordero.', 389000, TRUE, 20, TRUE, 1),
  ((SELECT id FROM categories WHERE slug = 'camisas'),    'Camisa Lino Riviera', 'camisa-lino-riviera', 'Lino europeo de caída ligera, cuello italiano y botones de nácar.',              189000, FALSE, 0, TRUE, 2),
  ((SELECT id FROM categories WHERE slug = 'pantalones'), 'Pantalón Sastre Noir','pantalon-sastre-noir','Lana fría con pinzas, tiro medio y bota recta. Confeccionado en Bogotá.',       259000, TRUE, 15, TRUE, 3),
  ((SELECT id FROM categories WHERE slug = 'busos'),      'Buso Cachemira Alba', 'buso-cachemira-alba', 'Mezcla de cachemira y merino, punto fino y acabado sin costuras.',               299000, FALSE, 0, FALSE, NULL),
  ((SELECT id FROM categories WHERE slug = 'gorras'),     'Gorra Monograma',     'gorra-monograma',     'Algodón cepillado con monograma bordado en hilo dorado.',                        99000, TRUE, 10, FALSE, NULL);

INSERT IGNORE INTO product_variants (product_id, size, color, stock)
SELECT p.id, v.size, v.color, v.stock
FROM products p
JOIN (
            SELECT 'mocasin-aurelio' AS slug, '39' AS size, 'Negro' AS color, 4 AS stock
  UNION ALL SELECT 'mocasin-aurelio', '40', 'Negro', 6
  UNION ALL SELECT 'mocasin-aurelio', '41', 'Café', 3
  UNION ALL SELECT 'mocasin-aurelio', '42', 'Café', 2
  UNION ALL SELECT 'camisa-lino-riviera', 'S', 'Blanco', 8
  UNION ALL SELECT 'camisa-lino-riviera', 'M', 'Blanco', 10
  UNION ALL SELECT 'camisa-lino-riviera', 'L', 'Arena', 5
  UNION ALL SELECT 'pantalon-sastre-noir', '30', 'Negro', 5
  UNION ALL SELECT 'pantalon-sastre-noir', '32', 'Negro', 7
  UNION ALL SELECT 'pantalon-sastre-noir', '34', 'Gris', 4
  UNION ALL SELECT 'buso-cachemira-alba', 'M', 'Crema', 6
  UNION ALL SELECT 'buso-cachemira-alba', 'L', 'Gris', 3
  UNION ALL SELECT 'gorra-monograma', 'Única', 'Negro', 12
  UNION ALL SELECT 'gorra-monograma', 'Única', 'Beige', 9
) AS v ON v.slug = p.slug COLLATE utf8mb4_unicode_ci;
