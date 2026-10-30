import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import './admin.css';

/** Formulario de ingreso al panel. La sesión queda en una cookie httpOnly que pone el servidor. */
export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  /** Envía las credenciales y, si son válidas, entra al listado de productos. */
  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/admin/auth/login', { email, password });
      navigate('/admin/productos', { replace: true });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="admin-login">
      <form className="admin-login__card" onSubmit={onSubmit}>
        <span className="brand">Skadi<span>tienda</span></span>
        <p className="eyebrow">Panel administrativo</p>
        <div className="field">
          <label htmlFor="email">Correo</label>
          <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <div className="alert alert--error">{error}</div>}
        <button className="btn btn--dark btn--block" disabled={loading}>{loading ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </div>
  );
}
