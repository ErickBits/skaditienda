-- Categorías base de Skaditienda (idempotente)
INSERT INTO categories (name, slug, sort_order) VALUES
  ('Pantalones', 'pantalones', 1),
  ('Camisas',    'camisas',    2),
  ('Zapatos',    'zapatos',    3),
  ('Busos',      'busos',      4),
  ('Gorras',     'gorras',     5)
ON CONFLICT (slug) DO NOTHING;
