/** Mapa de rutas de la API. */
import { Router } from 'express';
import { requireAdmin, requireSameOrigin } from '../middleware/auth.js';
import catalogRoutes from './public/catalog.routes.js';
import checkoutRoutes from './public/checkout.routes.js';
import webhookRoutes from './webhooks.routes.js';
import adminAuthRoutes from './admin/auth.routes.js';
import adminProductRoutes from './admin/products.routes.js';
import adminBannerRoutes from './admin/banner.routes.js';
import adminOrderRoutes from './admin/orders.routes.js';
import { query } from '../config/db.js';

const api = Router();

// Comprueba que la API y la base de datos respondan (para el monitoreo del hosting).
api.get('/health', async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
});

// Público
api.use('/', catalogRoutes);
api.use('/checkout', checkoutRoutes);
api.use('/webhooks', webhookRoutes);

// Administración: todo lo que no sea /auth exige sesión.
const admin = Router();
admin.use(requireSameOrigin);
admin.use('/auth', adminAuthRoutes);
admin.use(requireAdmin);
admin.use('/products', adminProductRoutes);
admin.use('/banner', adminBannerRoutes);
admin.use('/orders', adminOrderRoutes);
api.use('/admin', admin);

export default api;
