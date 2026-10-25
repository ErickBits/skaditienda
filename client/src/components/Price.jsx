import { formatCOP } from '../lib/format';

/** Precio con indicador visual de descuento (precio anterior tachado). */
export default function Price({ price, finalPrice, size }) {
  const onSale = finalPrice < price;
  return (
    <div className={`price ${size === 'lg' ? 'price--lg' : ''}`}>
      <span className={`price__final ${onSale ? 'price__final--sale' : ''}`}>{formatCOP(finalPrice)}</span>
      {onSale && (
        <s className="price__original" aria-label={`Antes ${formatCOP(price)}`}>
          {formatCOP(price)}
        </s>
      )}
    </div>
  );
}
