import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import Layout from './components/Layout';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import PaymentResult from './pages/PaymentResult';

// El panel se carga aparte: los clientes de la tienda nunca descargan su código.
const AdminLayout = lazy(() => import('./admin/AdminLayout'));
const AdminLogin = lazy(() => import('./admin/AdminLogin'));
const AdminProducts = lazy(() => import('./admin/AdminProducts'));
const ProductForm = lazy(() => import('./admin/ProductForm'));
const AdminBanner = lazy(() => import('./admin/AdminBanner'));
const AdminOrders = lazy(() => import('./admin/AdminOrders'));

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="categoria/:slug" element={<Catalog />} />
          <Route path="buscar" element={<Catalog />} />
          <Route path="producto/:slug" element={<ProductPage />} />
          <Route path="carrito" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="pago/resultado" element={<PaymentResult />} />
          <Route path="*" element={<div className="container empty"><h3>Página no encontrada</h3></div>} />
        </Route>

        <Route path="admin/login" element={<AdminLogin />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="productos" replace />} />
          <Route path="productos" element={<AdminProducts />} />
          <Route path="productos/nuevo" element={<ProductForm />} />
          <Route path="productos/:id" element={<ProductForm />} />
          <Route path="banner" element={<AdminBanner />} />
          <Route path="ordenes" element={<AdminOrders />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
