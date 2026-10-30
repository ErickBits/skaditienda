/**
 * Tarjeta de producto "lujo".
 *
 * Animaciones (Framer Motion, con variantes compartidas padre → hijos):
 *  · hidden → visible : entra con fundido + subida al aparecer en pantalla (escalonado por índice).
 *  · hover            : la tarjeta se eleva, la foto hace un zoom lento, aparece la segunda
 *                       foto (si existe) y el llamado "Ver detalle".
 * Al terminar el hover todo regresa a "visible". Respeta prefers-reduced-motion vía <MotionConfig>.
 */
import { motion } from 'framer-motion';
import { Link } from 'react-router';
import Price from './Price';
import './ProductCard.css';

const ease = [0.22, 1, 0.36, 1];

// Variantes de animación: la tarjeta propaga el estado (hidden/visible/hover) a sus hijos.
const card = {
  hidden: { opacity: 0, y: 28 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { duration: 0.7, ease, delay: (i % 4) * 0.08 } }),
  hover: { y: -8, transition: { duration: 0.5, ease } },
};
const photo = { visible: { scale: 1 }, hover: { scale: 1.07, transition: { duration: 1.1, ease } } };
const altPhoto = { hidden: { opacity: 0 }, visible: { opacity: 0 }, hover: { opacity: 1, transition: { duration: 0.6 } } };
const cta = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 0, y: 12 }, hover: { opacity: 1, y: 0, transition: { duration: 0.45, ease } } };

/**
 * @param {object} props
 * @param {object} props.product Producto con forma de tarjeta (images, price, final_price, slug…).
 * @param {number} [props.index=0] Posición en la grilla; escalona la animación de entrada.
 */
export default function ProductCard({ product, index = 0 }) {
  const [primary, secondary] = product.images ?? [];
  const onSale = product.final_price < product.price;

  return (
    <motion.article
      className="product-card"
      custom={index}
      variants={card}
      initial="hidden"
      whileInView="visible"
      whileHover="hover"
      viewport={{ once: true, margin: '-60px' }}
    >
      <Link to={`/producto/${product.slug}`} className="product-card__link">
        <div className="product-card__media">
          {primary ? (
            <>
              <motion.img src={primary} alt={product.name} loading="lazy" variants={photo} />
              {secondary && <motion.img className="product-card__alt" src={secondary} alt="" aria-hidden="true" loading="lazy" variants={altPhoto} />}
            </>
          ) : (
            <motion.div className="product-card__placeholder" variants={photo} aria-hidden="true">
              {product.name.charAt(0)}
            </motion.div>
          )}

          {onSale && <span className="badge-discount product-card__badge">−{product.discount_percent}%</span>}
          <motion.span className="product-card__cta" variants={cta}>Ver detalle</motion.span>
        </div>

        <div className="product-card__body">
          <span className="eyebrow">{product.category_name}</span>
          <h3 className="product-card__name">{product.name}</h3>
          <Price price={product.price} finalPrice={product.final_price} />
        </div>
      </Link>
    </motion.article>
  );
}
