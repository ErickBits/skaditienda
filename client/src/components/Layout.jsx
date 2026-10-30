import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useCart } from '../context/CartContext';
import { api } from '../lib/api';
import './Layout.css';

/** Ícono de bolsa de compras (decorativo: el texto accesible está en el enlace). */
function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M6 7h12l-1 13H7L6 7Z" strokeLinejoin="round" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </svg>
  );
}

/**
 * Estructura común de la tienda: cabecera (marca, buscador, carrito y categorías),
 * el contenido de la ruta actual (<Outlet />) y el pie de página.
 */
export default function Layout() {
  const { count } = useCart();
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    api.get('/categories').then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    // Al cambiar de página vuelve arriba (el router no lo hace solo).
    window.scrollTo(0, 0);
  }, [pathname]);

  /** Envía la búsqueda a /buscar?q=… (ignora textos vacíos). */
  const onSearch = (e) => {
    e.preventDefault();
    const q = search.trim();
    if (q) navigate(`/buscar?q=${encodeURIComponent(q)}`);
  };

  return (
    <>
      <header className="site-header">
        <div className="container site-header__bar">
          <Link to="/" className="brand" aria-label="Skaditienda, inicio">
            Skadi<span>tienda</span>
          </Link>

          <form className="search" role="search" onSubmit={onSearch}>
            <input
              type="search"
              placeholder="Buscar prendas…"
              aria-label="Buscar productos por nombre"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={80}
            />
          </form>

          <Link to="/carrito" className="cart-link" aria-label={`Carrito, ${count} productos`}>
            <CartIcon />
            {count > 0 && <span className="cart-link__count">{count}</span>}
          </Link>
        </div>

        <nav className="container site-nav" aria-label="Categorías">
          {categories.map((c) => (
            <NavLink key={c.id} to={`/categoria/${c.slug}`}>{c.name}</NavLink>
          ))}
        </nav>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container site-footer__inner">
          <span className="brand">Skadi<span>tienda</span></span>
          <p>Pagos seguros con Wompi · Envíos a toda Colombia</p>
          <p>© {new Date().getFullYear()} Skaditienda</p>
        </div>
      </footer>
    </>
  );
}
