/** Órdenes: por defecto muestra compras exitosas (APPROVED), con filtros y despacho. */
import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, toQuery } from '../lib/api';
import { formatCOP, formatDate } from '../lib/format';

const STATUS_LABELS = { APPROVED: 'Pagada', PENDING: 'Pendiente', DECLINED: 'Rechazada', VOIDED: 'Anulada', ERROR: 'Error', ALL: 'Todas' };

export default function AdminOrders() {
  const [filters, setFilters] = useState({ status: 'APPROVED', dispatched: 'all', q: '', from: '', to: '', page: 1 });
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState({}); // id → detalle
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get(`/admin/orders${toQuery(filters)}`).then(setData).catch((e) => setError(e.message));
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value, page: 1 }));

  const toggleDetail = async (id) => {
    if (expanded[id]) return setExpanded(({ [id]: _, ...rest }) => rest);
    try {
      const detail = await api.get(`/admin/orders/${id}`);
      setExpanded((e) => ({ ...e, [id]: detail }));
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleDispatch = async (order) => {
    try {
      const updated = await api.patch(`/admin/orders/${order.id}/dispatch`, { dispatched: !order.dispatched });
      setData((d) => ({ ...d, items: d.items.map((o) => (o.id === order.id ? { ...o, ...updated } : o)) }));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <header className="admin__head"><h1>Órdenes</h1>{data && <span className="muted">{data.total} resultados</span>}</header>

      <div className="admin__toolbar">
        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filters.dispatched} onChange={(e) => setFilter('dispatched', e.target.value)}>
          <option value="all">Despacho: todos</option>
          <option value="false">Por despachar</option>
          <option value="true">Despachadas</option>
        </select>
        <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} aria-label="Desde" />
        <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} aria-label="Hasta" />
        <input className="admin__search" placeholder="Referencia, nombre o correo…" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} />
      </div>
      {error && <div className="alert alert--error">{error}</div>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Fecha</th><th>Referencia</th><th>Cliente</th><th>Ciudad</th><th>Uds.</th><th>Total</th><th>Estado</th><th>Despacho</th></tr>
          </thead>
          <tbody>
            {data?.items.map((o) => (
              <Fragment key={o.id}>
                <tr className="table__row--clickable" onClick={() => toggleDetail(o.id)}>
                  <td>{formatDate(o.created_at)}</td>
                  <td><code>{o.reference}</code></td>
                  <td>{o.customer_name}<br /><small className="muted">{o.customer_email}</small></td>
                  <td>{o.city}</td>
                  <td>{o.units}</td>
                  <td>{formatCOP(o.amount_in_cents / 100)}</td>
                  <td><span className={`tag tag--${o.status.toLowerCase()}`}>{STATUS_LABELS[o.status]}</span></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {o.status === 'APPROVED' ? (
                      <button className={`btn btn--sm ${o.dispatched ? 'btn--ghost' : 'btn--dark'}`} onClick={() => toggleDispatch(o)}>
                        {o.dispatched ? '✓ Despachado' : 'Marcar despachado'}
                      </button>
                    ) : '—'}
                  </td>
                </tr>
                {expanded[o.id] && (
                  <tr className="table__detail">
                    <td colSpan={8}>
                      <div className="order-detail">
                        <div>
                          <strong>Envío</strong>
                          <p>{expanded[o.id].address}, {expanded[o.id].city}</p>
                          <p>Tel: {expanded[o.id].phone_primary}{expanded[o.id].phone_secondary && ` · ${expanded[o.id].phone_secondary}`}</p>
                          {expanded[o.id].payment_method_type && <p className="muted">Pago: {expanded[o.id].payment_method_type} · Wompi {expanded[o.id].wompi_transaction_id}</p>}
                        </div>
                        <ul>
                          {expanded[o.id].items.map((it, i) => (
                            <li key={i}>{it.quantity} × {it.product_name} ({it.size} · {it.color}) — {formatCOP(it.unit_price * it.quantity)}</li>
                          ))}
                        </ul>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {data && !data.items.length && <p className="empty">No hay órdenes con estos filtros.</p>}
      </div>

      {data?.pages > 1 && (
        <nav className="pager">
          <button className="btn btn--ghost btn--sm" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>Anterior</button>
          <span>{filters.page} / {data.pages}</span>
          <button className="btn btn--ghost btn--sm" disabled={filters.page >= data.pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Siguiente</button>
        </nav>
      )}
    </>
  );
}
