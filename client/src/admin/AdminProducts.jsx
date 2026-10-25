import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, toQuery } from '../lib/api';
import { formatCOP } from '../lib/format';

export default function AdminProducts() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get(`/admin/products${toQuery({ q, page })}`).then(setData).catch((e) => setError(e.message));
  }, [q, page]);

  useEffect(() => {
    const t = setTimeout(load, 250); // pequeño debounce del buscador
    return () => clearTimeout(t);
  }, [load]);

  const toggleDiscount = async (p) => {
    try {
      const updated = await api.patch(`/admin/products/${p.id}/discount`, {
        discountActive: !p.discount_active,
        // Si nunca se definió un porcentaje, se propone 10 % (editable en el formulario).
        ...(!p.discount_active && p.discount_percent === 0 && { discountPercent: 10 }),
      });
      setData((d) => ({ ...d, items: d.items.map((i) => (i.id === p.id ? { ...i, ...updated } : i)) }));
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (p) => {
    if (!window.confirm(`¿Eliminar "${p.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.del(`/admin/products/${p.id}`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <header className="admin__head">
        <h1>Productos</h1>
        <Link to="/admin/productos/nuevo" className="btn btn--dark btn--sm">+ Nuevo producto</Link>
      </header>

      <div className="admin__toolbar">
        <input className="admin__search" placeholder="Buscar por nombre…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      {error && <div className="alert alert--error">{error}</div>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th></th><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Descuento</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {data?.items.map((p) => (
              <tr key={p.id}>
                <td>{p.thumbnail ? <img className="thumb" src={p.thumbnail} alt="" /> : <span className="thumb thumb--empty" />}</td>
                <td><strong>{p.name}</strong>{p.is_featured && <span className="tag tag--gold">Banner</span>}</td>
                <td>{p.category_name}</td>
                <td>
                  {formatCOP(p.final_price)}
                  {p.final_price < p.price && <small className="muted"> <s>{formatCOP(p.price)}</s></small>}
                </td>
                <td>{p.total_stock}</td>
                <td>
                  <label className="switch" title="Activar/desactivar descuento">
                    <input type="checkbox" checked={p.discount_active} onChange={() => toggleDiscount(p)} />
                    <span />
                    <small>{p.discount_percent}%</small>
                  </label>
                </td>
                <td><span className={`tag ${p.is_active ? 'tag--ok' : ''}`}>{p.is_active ? 'Visible' : 'Oculto'}</span></td>
                <td className="table__actions">
                  <Link className="btn btn--ghost btn--sm" to={`/admin/productos/${p.id}`}>Editar</Link>
                  <button className="btn btn--ghost btn--sm" onClick={() => remove(p)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.items.length && <p className="empty">No hay productos todavía.</p>}
      </div>

      {data?.pages > 1 && (
        <nav className="pager">
          <button className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
          <span>{page} / {data.pages}</span>
          <button className="btn btn--ghost btn--sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Siguiente</button>
        </nav>
      )}
    </>
  );
}
