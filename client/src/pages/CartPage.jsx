import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router';
import { useCart } from '../context/CartContext';
import { formatCOP } from '../lib/format';

/** Carrito: editar cantidades, quitar productos y continuar al checkout. */
export default function CartPage() {
  const { items, subtotal, updateQuantity, removeItem } = useCart();

  if (!items.length) {
    return (
      <div className="container empty">
        <h3>Tu carrito está vacío</h3>
        <p>Descubre nuestras piezas seleccionadas.</p>
        <Link to="/" className="btn btn--dark">Explorar la tienda</Link>
      </div>
    );
  }

  return (
    <div className="container section">
      <div className="section__head"><h2>Tu carrito</h2></div>
      <div className="checkout">
        <ul className="cart-list">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.li key={item.variantId} className="cart-item" layout exit={{ opacity: 0, x: -30 }}>
                <Link to={`/producto/${item.slug}`} className="cart-item__img">
                  {item.image ? <img src={item.image} alt={item.name} /> : <div className="product-card__placeholder" style={{ fontSize: 32 }}>{item.name.charAt(0)}</div>}
                </Link>
                <div className="cart-item__info">
                  <strong>{item.name}</strong>
                  <span>Talla {item.size} · {item.color}</span>
                  <span>{formatCOP(item.unitPrice)}</span>
                </div>
                <div className="qty">
                  <button type="button" onClick={() => updateQuantity(item.variantId, item.quantity - 1)} aria-label="Restar">−</button>
                  <span>{item.quantity}</span>
                  <button type="button" onClick={() => updateQuantity(item.variantId, item.quantity + 1)} aria-label="Sumar">+</button>
                </div>
                <button type="button" className="cart-item__remove" onClick={() => removeItem(item.variantId)} aria-label={`Quitar ${item.name}`}>×</button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        <aside className="summary">
          <div className="summary__row"><span>Subtotal</span><strong>{formatCOP(subtotal)}</strong></div>
          <p className="summary__note">El total final se confirma en el siguiente paso.</p>
          <Link to="/checkout" className="btn btn--gold btn--block">Continuar al pago</Link>
        </aside>
      </div>
    </div>
  );
}
