/**
 * Catálogo por categoría (/categoria/:slug) y buscador (/buscar?q=).
 * Todos los filtros viven en la URL.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import FilterPanel from '../components/FilterPanel';
import ProductCard from '../components/ProductCard';
import { api, toQuery } from '../lib/api';

/** Lista separada por comas de la URL: "40,41" → ["40", "41"]. */
const list = (v) => (v ? v.split(',').filter(Boolean) : []);

export default function Catalog() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [available, setAvailable] = useState({ sizes: [], colors: [] });
  const [categoryName, setCategoryName] = useState('');
  const [error, setError] = useState('');

  // Filtros actuales leídos de la URL (la URL es la fuente de verdad).
  const filters = useMemo(
    () => ({
      q: params.get('q') ?? '',
      size: list(params.get('size')),
      color: list(params.get('color')),
      discount: params.get('discount') === 'true',
      sort: params.get('sort') ?? 'recent',
      page: Number(params.get('page')) || 1,
    }),
    [params],
  );

  /**
   * Aplica cambios a los filtros escribiéndolos en la URL. Cualquier cambio que no sea
   * de página vuelve a la 1; los valores por defecto se omiten para que la URL quede limpia.
   */
  const updateFilters = (patch) => {
    const next = { ...filters, ...patch, page: patch.page ?? 1 };
    setParams(new URLSearchParams(toQuery({ ...next, discount: next.discount || undefined, sort: next.sort === 'recent' ? undefined : next.sort, page: next.page > 1 ? next.page : undefined }).slice(1)));
  };

  useEffect(() => {
    // Opciones de filtro y nombre de la categoría: solo cambian con la categoría.
    api.get(`/filters${toQuery({ category: slug })}`).then(setAvailable).catch(() => {});
    if (slug) {
      api.get('/categories').then((cats) => setCategoryName(cats.find((c) => c.slug === slug)?.name ?? '')).catch(() => {});
    }
  }, [slug]);

  useEffect(() => {
    // Productos: se recargan con cada cambio de categoría o de filtros.
    setError('');
    api
      .get(`/products${toQuery({ category: slug, ...filters, discount: filters.discount ? 'true' : undefined })}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [slug, filters]);

  const title = slug ? categoryName : filters.q ? `Resultados para “${filters.q}”` : filters.discount ? 'En descuento' : 'Toda la colección';

  return (
    <div className="container section">
      <div className="section__head">
        <div>
          <span className="eyebrow">{slug ? 'Categoría' : 'Catálogo'}</span>
          <h2>{title}</h2>
        </div>
        {data && <span style={{ color: 'var(--muted)' }}>{data.total} {data.total === 1 ? 'pieza' : 'piezas'}</span>}
      </div>

      <div className="catalog">
        <aside className="catalog__aside">
          <FilterPanel available={available} value={filters} onChange={updateFilters} />
        </aside>

        <div>
          {error && <div className="alert alert--error">{error}</div>}
          {!data ? (
            <div className="grid-products">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" style={{ aspectRatio: '4/6' }} />)}</div>
          ) : data.items.length === 0 ? (
            <div className="empty">
              <h3>Sin resultados</h3>
              <p>Prueba quitando algún filtro o buscando otro nombre.</p>
            </div>
          ) : (
            <>
              <div className="grid-products">
                {data.items.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
              </div>
              {data.pages > 1 && (
                <nav className="pager" aria-label="Paginación">
                  <button className="btn btn--ghost btn--sm" disabled={filters.page <= 1} onClick={() => updateFilters({ page: filters.page - 1 })}>Anterior</button>
                  <span>{filters.page} / {data.pages}</span>
                  <button className="btn btn--ghost btn--sm" disabled={filters.page >= data.pages} onClick={() => updateFilters({ page: filters.page + 1 })}>Siguiente</button>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
