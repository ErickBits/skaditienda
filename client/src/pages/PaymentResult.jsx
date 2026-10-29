/**
 * Wompi redirige aquí con ?id=<transactionId>. El estado se pide al backend,
 * que lo verifica directamente con Wompi (nunca se confía en la URL).
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useCart } from '../context/CartContext';
import { api } from '../lib/api';
import { formatCOP } from '../lib/format';

/** [título, texto] que se muestra según el estado de la orden. */
const MESSAGES = {
  APPROVED: ['¡Gracias por tu compra!', 'Tu pago fue aprobado. Te contactaremos para coordinar el envío.'],
  PENDING: ['Pago en proceso', 'Estamos esperando la confirmación de tu banco. Esta página se actualizará sola.'],
  DECLINED: ['Pago rechazado', 'Tu banco rechazó la transacción. Puedes intentarlo de nuevo con otro medio de pago.'],
  VOIDED: ['Pago anulado', 'La transacción fue anulada.'],
  ERROR: ['Hubo un problema', 'No pudimos completar el pago. Si se realizó algún cobro, contáctanos con tu referencia.'],
};

export default function PaymentResult() {
  const [params] = useSearchParams();
  const transactionId = params.get('id');
  const { clear } = useCart();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!transactionId) return undefined;
    let attempts = 0;
    let timer;
    // Consulta el estado; mientras siga PENDING reintenta cada 4 s (máx. 15 veces ≈ 1 min).
    const check = async () => {
      try {
        const data = await api.get(`/checkout/transaction/${encodeURIComponent(transactionId)}`);
        setResult(data);
        if (data.status === 'APPROVED') clear();
        if (data.status === 'PENDING' && attempts++ < 15) timer = setTimeout(check, 4000);
      } catch (e) {
        setError(e.message);
      }
    };
    check();
    return () => clearTimeout(timer);
  }, [transactionId, clear]);

  if (!transactionId) return <div className="container empty"><h3>Sin información de pago</h3><Link to="/" className="btn btn--dark">Ir a la tienda</Link></div>;
  if (error) return <div className="container empty"><h3>No pudimos verificar el pago</h3><p>{error}</p></div>;
  if (!result) return <div className="container empty"><h3>Verificando tu pago…</h3></div>;

  const [title, text] = MESSAGES[result.status] ?? MESSAGES.ERROR;
  return (
    <div className="container empty payment-result" data-status={result.status}>
      <span className="eyebrow">Referencia {result.reference}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      <p><strong>{formatCOP(result.amountInCents / 100)}</strong></p>
      <Link to="/" className="btn btn--dark">{result.status === 'APPROVED' ? 'Seguir comprando' : 'Volver a la tienda'}</Link>
    </div>
  );
}
