/**
 * Banner de productos destacados (los elige el admin en "Banner").
 *
 * · Carrusel con transición de "telón": el texto entra escalonado y la foto con
 *   un leve zoom-out + desplazamiento (AnimatePresence mode="wait").
 * · Avance automático cada 6,5 s; se pausa con el mouse encima o con foco
 *   dentro, y se desactiva si el usuario prefiere movimiento reducido.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router';
import Price from './Price';
import { excerpt } from '../lib/format';
import './FeaturedBanner.css';

const ease = [0.22, 1, 0.36, 1];
const AUTOPLAY_MS = 6500;

const text = (delay) => ({
  enter: { opacity: 0, y: 22 },
  center: { opacity: 1, y: 0, transition: { duration: 0.8, ease, delay } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.3 } },
});

const media = {
  enter: { opacity: 0, scale: 1.08, x: 40 },
  center: { opacity: 1, scale: 1, x: 0, transition: { duration: 1.1, ease } },
  exit: { opacity: 0, x: -30, transition: { duration: 0.4 } },
};

export default function FeaturedBanner({ products }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const count = products.length;

  useEffect(() => {
    if (count < 2 || paused || reduceMotion) return undefined;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [index, count, paused, reduceMotion]);

  if (!count) return null;
  const product = products[index % count];
  const onSale = product.final_price < product.price;

  return (
    <section
      className="hero"
      aria-roledescription="carrusel"
      aria-label="Productos destacados"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="hero__glow" aria-hidden="true" />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={product.id} className="hero__slide" initial="enter" animate="center" exit="exit">
          <div className="hero__copy">
            <motion.span className="hero__eyebrow" variants={text(0)}>
              Selección exclusiva · {product.category_name}
            </motion.span>
            <motion.h1 className="hero__title" variants={text(0.08)}>{product.name}</motion.h1>
            {product.description && (
              <motion.p className="hero__desc" variants={text(0.16)}>{excerpt(product.description)}</motion.p>
            )}
            <motion.div className="hero__price" variants={text(0.24)}>
              <Price price={product.price} finalPrice={product.final_price} size="lg" />
              {onSale && <span className="badge-discount hero__badge">−{product.discount_percent}%</span>}
            </motion.div>
            <motion.div variants={text(0.32)}>
              <Link to={`/producto/${product.slug}`} className="btn btn--gold">Descubrir pieza</Link>
            </motion.div>
          </div>

          <motion.div className="hero__media" variants={media}>
            {product.images?.[0] ? (
              <img src={product.images[0]} alt={product.name} />
            ) : (
              <div className="hero__placeholder" aria-hidden="true">{product.name.charAt(0)}</div>
            )}
            <span className="hero__frame" aria-hidden="true" />
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {count > 1 && (
        <div className="hero__dots" role="tablist" aria-label="Elegir producto destacado">
          {products.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Ver ${p.name}`}
              className="hero__dot"
              onClick={() => setIndex(i)}
            >
              {i === index && <motion.span layoutId="hero-dot" className="hero__dot-active" transition={{ duration: 0.5, ease }} />}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
