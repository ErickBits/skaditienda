-- Productos de demostración (solo desarrollo): npm run db:init -- --demo
-- Sin imágenes: la tienda muestra un marcador elegante hasta que subas fotos desde el panel.
WITH c AS (SELECT id, slug FROM categories)
INSERT INTO products (category_id, name, slug, description, price, discount_active, discount_percent, is_featured, featured_order)
VALUES
  ((SELECT id FROM c WHERE slug = 'zapatos'),    'Mocasín Aurelio',     'mocasin-aurelio',     'Cuero napa curtido a mano, suela cosida tipo Blake y forro de piel de cordero.', 389000, true, 20, true, 1),
  ((SELECT id FROM c WHERE slug = 'camisas'),    'Camisa Lino Riviera', 'camisa-lino-riviera', 'Lino europeo de caída ligera, cuello italiano y botones de nácar.',              189000, false, 0, true, 2),
  ((SELECT id FROM c WHERE slug = 'pantalones'), 'Pantalón Sastre Noir','pantalon-sastre-noir','Lana fría con pinzas, tiro medio y bota recta. Confeccionado en Bogotá.',       259000, true, 15, true, 3),
  ((SELECT id FROM c WHERE slug = 'busos'),      'Buso Cachemira Alba', 'buso-cachemira-alba', 'Mezcla de cachemira y merino, punto fino y acabado sin costuras.',               299000, false, 0, false, NULL),
  ((SELECT id FROM c WHERE slug = 'gorras'),     'Gorra Monograma',     'gorra-monograma',     'Algodón cepillado con monograma bordado en hilo dorado.',                        99000, true, 10, false, NULL)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO product_variants (product_id, size, color, stock)
SELECT p.id, v.size, v.color, v.stock
FROM products p
JOIN (VALUES
  ('mocasin-aurelio', '39', 'Negro', 4), ('mocasin-aurelio', '40', 'Negro', 6), ('mocasin-aurelio', '41', 'Café', 3), ('mocasin-aurelio', '42', 'Café', 2),
  ('camisa-lino-riviera', 'S', 'Blanco', 8), ('camisa-lino-riviera', 'M', 'Blanco', 10), ('camisa-lino-riviera', 'L', 'Arena', 5),
  ('pantalon-sastre-noir', '30', 'Negro', 5), ('pantalon-sastre-noir', '32', 'Negro', 7), ('pantalon-sastre-noir', '34', 'Gris', 4),
  ('buso-cachemira-alba', 'M', 'Crema', 6), ('buso-cachemira-alba', 'L', 'Gris', 3),
  ('gorra-monograma', 'Única', 'Negro', 12), ('gorra-monograma', 'Única', 'Beige', 9)
) AS v(slug, size, color, stock) ON v.slug = p.slug
ON CONFLICT (product_id, size, color) DO NOTHING;
