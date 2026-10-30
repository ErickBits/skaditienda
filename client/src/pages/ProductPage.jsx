import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useParams } from 'react-router';
import Price from '../components/Price';
import { useCart } from '../context/CartContext';
import { api } from '../lib/api';

/** Detalle de producto: galería, selección de color → talla (según stock) y agregar al carrito. */
export default function ProductPage() {
  const { slug } = useParams();
  const { addItem } = useCart();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [imageIndex, setImageIndex] = useState(0);
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setProduct(null);
    setError('');
    api
      .get(`/products/${encodeURIComponent(slug)}`)
      .then((p) => {
        setProduct(p);
        setImageIndex(0);
        // Preselecciona el primer color con stock; la talla la elige el usuario.
        const firstAvailable = p.variants.find((v) => v.stock > 0);
        setColor(firstAvailable?.color ?? '');
        setSize('');
      })
      .catch((e) => setError(e.status === 404 ? 'Este producto ya no está disponible.' : e.message));
  }, [slug]);

  // Colores únicos, tallas del color elegido y la variante (talla + color) seleccionada.
  const colors = useMemo(() => [...new Set(product?.variants.map((v) => v.color) ?? [])], [product]);
  const sizesForColor = useMemo(() => product?.variants.filter((v) => v.color === color) ?? [], [product, color]);
  const variant = sizesForColor.find((v) => v.size === size);

  if (error) return <div className="container empty"><h3>Ups</h3><p>{error}</p><Link className="btn btn--dark" to="/">Volver a la tienda</Link></div>;
  if (!product) return <div className="container section"><div className="skeleton" style={{ height: 560 }} /></div>;

  const onSale = product.final_price < product.price;
  const images = product.images;

  /** Agrega la variante elegida al carrito y muestra la confirmación durante 2,5 s. */
  const add = () => {
    if (!variant) return;
    addItem(
      {
        variantId: variant.id,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        image: images[0] ?? null,
        size: variant.size,
        color: variant.color,
        unitPrice: product.final_price,
        maxStock: variant.stock,
      },
      quantity,
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  };

  return (
    <div className="container section product-detail">
      <div className="product-detail__gallery">
        <div className="product-detail__main">
          <AnimatePresence mode="wait">
            {images.length ? (
              <motion.img
                key={images[imageIndex]}
                src={images[imageIndex]}
                alt={product.name}
                initial={{ opacity: 0, scale: 1.03 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
              />
            ) : (
              <div className="product-card__placeholder">{product.name.charAt(0)}</div>
            )}
          </AnimatePresence>
          {onSale && <span className="badge-discount product-card__badge">−{product.discount_percent}%</span>}
        </div>
        {images.length > 1 && (
          <div className="product-detail__thumbs">
            {images.map((src, i) => (
              <button key={src} type="button" aria-label={`Imagen ${i + 1}`} aria-pressed={i === imageIndex} onClick={() => setImageIndex(i)}>
                <img src={src} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="product-detail__info">
        <Link to={`/categoria/${product.category_slug}`} className="eyebrow">{product.category_name}</Link>
        <h1>{product.name}</h1>
        <Price price={product.price} finalPrice={product.final_price} size="lg" />
        {product.description && <p className="product-detail__desc">{product.description}</p>}

        {colors.length > 0 && (
          <fieldset className="filters__group">
            <legend>Color: <strong>{color}</strong></legend>
            <div className="filters__chips">
              {colors.map((c) => (
                <button key={c} type="button" className="chip" aria-pressed={c === color} onClick={() => { setColor(c); setSize(''); }}>{c}</button>
              ))}
            </div>
          </fieldset>
        )}

        {sizesForColor.length > 0 && (
          <fieldset className="filters__group">
            <legend>Talla</legend>
            <div className="filters__chips">
              {sizesForColor.map((v) => (
                <button key={v.id} type="button" className="chip" aria-pressed={v.size === size} disabled={v.stock === 0} onClick={() => setSize(v.size)}>{v.size}</button>
              ))}
            </div>
            {variant && variant.stock <= 3 && <small style={{ color: 'var(--warning)' }}>¡Solo quedan {variant.stock}!</small>}
          </fieldset>
        )}

        <div className="product-detail__buy">
          <div className="qty" aria-label="Cantidad">
            <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Restar">−</button>
            <span>{quantity}</span>
            <button type="button" onClick={() => setQuantity((q) => Math.min(variant?.stock ?? 1, q + 1, 20))} aria-label="Sumar">+</button>
          </div>
          <button className="btn btn--dark" style={{ flex: 1 }} disabled={!variant} onClick={add}>
            {variant ? 'Agregar al carrito' : product.variants.length ? 'Elige una talla' : 'Agotado'}
          </button>
        </div>

        <AnimatePresence>
          {added && (
            <motion.div className="alert alert--success" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              Agregado al carrito · <Link to="/carrito" style={{ textDecoration: 'underline' }}>Ver carrito</Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
