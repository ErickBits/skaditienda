/**
 * Marco del panel: verifica la sesión (cookie httpOnly) con /admin/auth/me.
 * La protección real está en el servidor; esto solo evita mostrar pantallas vacías.
 */
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { api } from '../lib/api';
import './admin.css';

export default function AdminLayout() {
  const [admin, setAdmin] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/admin/auth/me').then(setAdmin).catch(() => navigate('/admin/login', { replace: true }));
  }, [navigate]);

  /** Cierra la sesión en el servidor (borra la cookie) y vuelve al login. */
  const logout = async () => {
    await api.post('/admin/auth/logout').catch(() => {});
    navigate('/admin/login', { replace: true });
  };

  if (!admin) return <div className="admin-loading">Cargando panel…</div>;

  return (
    <div className="admin">
      <aside className="admin__nav">
        <span className="brand">Skadi<span>tienda</span></span>
        <nav>
          <NavLink to="/admin/productos">Productos</NavLink>
          <NavLink to="/admin/banner">Banner</NavLink>
          <NavLink to="/admin/ordenes">Órdenes</NavLink>
        </nav>
        <div className="admin__user">
          <small>{admin.email}</small>
          <button className="btn btn--ghost btn--sm" onClick={logout}>Cerrar sesión</button>
        </div>
      </aside>
      <section className="admin__content">
        <Outlet />
      </section>
    </div>
  );
}
