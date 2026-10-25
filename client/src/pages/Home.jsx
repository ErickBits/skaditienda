import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import FeaturedBanner from '../components/FeaturedBanner';
import ProductCard from '../components/ProductCard';
import { api } from '../lib/api';

export default function Home() {
  const [featured, setFeatured] = useState(null);
  const [latest, setLatest] = useState(null);
  const [onSale, setOnSale] = useState([]);

  useEffect(() => {
    api.get('/products/featured').then(setFeatured).catch(() => setFeatured([]));
    api.get('/products?limit=8').then((r) => setLatest(r.items)).catch(() => setLatest([]));
    api.get('/products?discount=true&limit=4').then((r) => setOnSale(r.items)).catch(() => {});
  }, []);

  return (
    <>
      <div className="container" style={{ paddingTop: 24 }}>
        {featured === null ? <div className="skeleton" style={{ height: 560 }} /> : <FeaturedBanner products={featured} />}
      </div>

      {onSale.length > 0 && (
        <section className="section container">
          <div className="section__head">
            <div>
              <span className="eyebrow">Precios especiales</span>
              <h2>En descuento</h2>
            </div>
            <Link to="/buscar?discount=true" className="btn btn--ghost btn--sm">Ver todo</Link>
          </div>
          <div className="grid-products">
            {onSale.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        </section>
      )}

      <section className="section container">
        <div className="section__head">
          <div>
            <span className="eyebrow">Recién llegado</span>
            <h2>Novedades</h2>
          </div>
        </div>
        {latest === null ? (
          <div className="grid-products">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton" style={{ aspectRatio: '4/6' }} />)}</div>
        ) : latest.length ? (
          <div className="grid-products">{latest.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}</div>
        ) : (
          <div className="empty"><h3>Muy pronto</h3><p>Estamos preparando la nueva colección.</p></div>
        )}
      </section>
    </>
  );
}
