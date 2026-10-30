/** Punto de entrada del cliente: monta React con el router, la configuración de animaciones y el carrito. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { MotionConfig } from 'framer-motion';
// Los estilos globales van primero para que el CSS de cada componente pueda sobrescribirlos.
import './styles/global.css';
import './styles/pages.css';
import App from './App';
import { CartProvider } from './context/CartContext';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      {/* reducedMotion="user": si el sistema pide menos movimiento, Framer Motion lo respeta */}
      <MotionConfig reducedMotion="user">
        <CartProvider>
          <App />
        </CartProvider>
      </MotionConfig>
    </BrowserRouter>
  </StrictMode>,
);
