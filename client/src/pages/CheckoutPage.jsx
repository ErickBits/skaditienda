/**
 * Checkout sin registro. Envía solo variantId + cantidad: el servidor calcula
 * el total, crea la orden y devuelve la URL firmada del Web Checkout de Wompi.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { useCart } from '../context/CartContext';
import { api, fieldErrors } from '../lib/api';
import { formatCOP } from '../lib/format';

const FIELDS = [
  { name: 'name', label: 'Nombre completo', autoComplete: 'name', required: true },
  { name: 'email', label: 'Correo electrónico', type: 'email', autoComplete: 'email', required: true },
  { name: 'address', label: 'Dirección de entrega', autoComplete: 'street-address', required: true, wide: true },
  { name: 'city', label: 'Ciudad', autoComplete: 'address-level2', required: true },
  { name: 'phonePrimary', label: 'Teléfono principal', type: 'tel', autoComplete: 'tel', required: true },
  { name: 'phoneSecondary', label: 'Teléfono adicional (opcional)', type: 'tel' },
];

export default function CheckoutPage() {
  const { items, subtotal } = useCart();
  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map((f) => [f.name, ''])));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!items.length) {
    return <div className="container empty"><h3>No hay productos para pagar</h3><Link to="/" className="btn btn--dark">Volver a la tienda</Link></div>;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    setError('');
    try {
      const { checkoutUrl } = await api.post('/checkout', {
        customer: form,
        items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      });
      window.location.assign(checkoutUrl); // → Web Checkout de Wompi
    } catch (err) {
      const byField = Object.fromEntries(Object.entries(fieldErrors(err)).map(([k, v]) => [k.replace('customer.', ''), v]));
      setErrors(byField);
      setError(Object.keys(byField).length ? 'Revisa los datos marcados.' : err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="container section">
      <div className="section__head"><h2>Datos de envío</h2></div>
      <form className="checkout" onSubmit={onSubmit} noValidate>
        <div className="checkout__form">
          {FIELDS.map((f) => (
            <div key={f.name} className={`field ${f.wide ? 'field--wide' : ''}`}>
              <label htmlFor={f.name}>{f.label}</label>
              <input
                id={f.name}
                name={f.name}
                type={f.type ?? 'text'}
                autoComplete={f.autoComplete}
                required={f.required}
                value={form[f.name]}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.name]: e.target.value }))}
                aria-invalid={Boolean(errors[f.name])}
              />
              {errors[f.name] && <span className="field__error">{errors[f.name]}</span>}
            </div>
          ))}
          {error && <div className="alert alert--error field--wide">{error}</div>}
        </div>

        <aside className="summary">
          {items.map((i) => (
            <div key={i.variantId} className="summary__row summary__row--item">
              <span>{i.quantity} × {i.name} <small>({i.size} · {i.color})</small></span>
              <span>{formatCOP(i.unitPrice * i.quantity)}</span>
            </div>
          ))}
          <div className="summary__row summary__row--total"><span>Total</span><strong>{formatCOP(subtotal)}</strong></div>
          <button className="btn btn--gold btn--block" disabled={submitting}>
            {submitting ? 'Conectando con Wompi…' : 'Pagar con Wompi'}
          </button>
          <p className="summary__note">Serás redirigido a la pasarela segura de Wompi (tarjeta, PSE, Nequi, Bancolombia).</p>
        </aside>
      </form>
    </div>
  );
}
