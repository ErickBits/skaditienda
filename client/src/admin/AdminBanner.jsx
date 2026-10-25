/** Selección y orden de los productos destacados del banner principal. */
import { useEffect, useState } from 'react';
import { Reorder } from 'framer-motion';
import { api, toQuery } from '../lib/api';

const MAX = 10;

export default function AdminBanner() {
  const [featured, setFeatured] = useState([]);
  const [results, setResults] = useState([]);
  const [q, setQ] = useState('');
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/admin/banner').then(setFeatured).catch((e) => setMessage({ type: 'error', text: e.message }));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/admin/products${toQuery({ q, limit: 20 })}`).then((r) => setResults(r.items)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const add = (p) => {
    if (featured.length >= MAX || featured.some((f) => f.id === p.id)) return;
    setFeatured([...featured, { id: p.id, name: p.name, thumbnail: p.thumbnail, is_active: p.is_active }]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/admin/banner', { productIds: featured.map((f) => f.id) });
      setMessage({ type: 'success', text: 'Banner actualizado.' });
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="admin__head">
        <h1>Banner destacado</h1>
        <button className="btn btn--dark btn--sm" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
      </header>
      {message && <div className={`alert alert--${message.type}`}>{message.text}</div>}

      <div className="grid-2">
        <div className="card">
          <h2>En el banner ({featured.length}/{MAX})</h2>
          <p className="muted">Arrastra para cambiar el orden.</p>
          <Reorder.Group axis="y" values={featured} onReorder={setFeatured} className="banner-list">
            {featured.map((p) => (
              <Reorder.Item key={p.id} value={p} className="banner-list__item">
                <span className="drag" aria-hidden="true">⋮⋮</span>
                {p.thumbnail ? <img className="thumb" src={p.thumbnail} alt="" /> : <span className="thumb thumb--empty" />}
                <span>{p.name}{!p.is_active && <span className="tag">Oculto</span>}</span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFeatured(featured.filter((f) => f.id !== p.id))}>Quitar</button>
              </Reorder.Item>
            ))}
          </Reorder.Group>
          {!featured.length && <p className="muted">Sin productos: el banner no se mostrará.</p>}
        </div>

        <div className="card">
          <h2>Agregar productos</h2>
          <input className="admin__search" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="banner-list">
            {results.map((p) => {
              const inBanner = featured.some((f) => f.id === p.id);
              return (
                <li key={p.id} className="banner-list__item banner-list__item--plain">
                  {p.thumbnail ? <img className="thumb" src={p.thumbnail} alt="" /> : <span className="thumb thumb--empty" />}
                  <span>{p.name}</span>
                  <button type="button" className="btn btn--ghost btn--sm" disabled={inBanner || featured.length >= MAX} onClick={() => add(p)}>
                    {inBanner ? 'Agregado' : 'Agregar'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}
