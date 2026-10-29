/**
 * Crear / editar producto. Envía multipart: "data" (JSON) + "images" (archivos nuevos).
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, fieldErrors } from '../lib/api';
import { formatCOP } from '../lib/format';

/** Estado inicial del formulario para un producto nuevo. */
const EMPTY = {
  name: '', description: '', price: '', categoryId: '', discountActive: false, discountPercent: 0, isActive: true,
  variants: [{ size: '', color: '', stock: 0 }], images: [],
};

export default function ProductForm() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [removeImageIds, setRemoveImageIds] = useState([]);
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Carga las categorías y, si es edición, el producto a editar.
    api.get('/categories').then(setCategories).catch(() => {});
    if (isNew) return;
    api
      .get(`/admin/products/${id}`)
      .then((p) =>
        setForm({
          name: p.name, description: p.description, price: p.price, categoryId: p.category_id,
          discountActive: p.discount_active, discountPercent: p.discount_percent, isActive: p.is_active,
          variants: p.variants.map(({ size, color, stock }) => ({ size, color, stock })), images: p.images,
        }),
      )
      .catch((e) => setError(e.message));
  }, [id, isNew]);

  // Vistas previas locales de las imágenes nuevas (se liberan al cambiar).
  const [previews, setPreviews] = useState([]);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);

  /** Cambia un campo del formulario. */
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  /** Cambia un campo de la variante en la posición `i`. */
  const setVariant = (i, key, value) => set('variants', form.variants.map((v, idx) => (idx === i ? { ...v, [key]: value } : v)));

  // Solo vista previa: el precio real lo calcula la BD (columna final_price).
  const finalPrice = form.discountActive && form.discountPercent > 0
    ? Math.round((Number(form.price) * (100 - form.discountPercent)) / 100)
    : Number(form.price);

  /**
   * Arma el multipart ("data" en JSON + "images") y crea o actualiza el producto.
   * Las filas de variantes sin talla ni color se descartan.
   */
  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setError('');

    const data = {
      name: form.name,
      description: form.description,
      price: Number(form.price),
      categoryId: Number(form.categoryId),
      discountActive: form.discountActive,
      discountPercent: Number(form.discountPercent),
      isActive: form.isActive,
      variants: form.variants.filter((v) => v.size || v.color).map((v) => ({ ...v, stock: Number(v.stock) })),
      removeImageIds,
    };
    const body = new FormData();
    body.append('data', JSON.stringify(data));
    files.forEach((f) => body.append('images', f));

    try {
      await api.upload(isNew ? '/admin/products' : `/admin/products/${id}`, body, isNew ? 'POST' : 'PUT');
      navigate('/admin/productos');
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err.message);
      setSaving(false);
    }
  };

  // Imágenes actuales menos las marcadas para borrar (se eliminan al guardar).
  const visibleImages = form.images.filter((img) => !removeImageIds.includes(img.id));

  return (
    <form onSubmit={onSubmit} className="admin-form">
      <header className="admin__head">
        <h1>{isNew ? 'Nuevo producto' : 'Editar producto'}</h1>
        <Link to="/admin/productos" className="btn btn--ghost btn--sm">Volver</Link>
      </header>

      <div className="card grid-2">
        <div className="field field--wide">
          <label htmlFor="name">Nombre</label>
          <input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} required maxLength={120} />
          {errors.name && <span className="field__error">{errors.name}</span>}
        </div>
        <div className="field field--wide">
          <label htmlFor="description">Descripción</label>
          <textarea id="description" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={3000} />
        </div>
        <div className="field">
          <label htmlFor="category">Categoría</label>
          <select id="category" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} required>
            <option value="">Selecciona…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="price">Precio (COP)</label>
          <input id="price" type="number" min="1" step="1" value={form.price} onChange={(e) => set('price', e.target.value)} required />
          {errors.price && <span className="field__error">{errors.price}</span>}
        </div>

        <label className="switch">
          <input type="checkbox" checked={form.discountActive} onChange={(e) => set('discountActive', e.target.checked)} />
          <span />
          Descuento activo
        </label>
        <div className="field">
          <label htmlFor="discount">Porcentaje de descuento</label>
          <input id="discount" type="number" min="0" max="90" value={form.discountPercent} onChange={(e) => set('discountPercent', e.target.value)} />
        </div>
        {form.price > 0 && <p className="muted field--wide">Precio de venta: <strong>{formatCOP(finalPrice)}</strong></p>}

        <label className="switch field--wide">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
          <span />
          Visible en la tienda
        </label>
      </div>

      <div className="card">
        <h2>Variantes (talla · color · stock)</h2>
        {errors.variants && <span className="field__error">{errors.variants}</span>}
        <div className="variants">
          {form.variants.map((v, i) => (
            <div key={i} className="variants__row">
              <input placeholder="Talla (ej. 40, M, Única)" value={v.size} onChange={(e) => setVariant(i, 'size', e.target.value)} maxLength={20} />
              <input placeholder="Color" value={v.color} onChange={(e) => setVariant(i, 'color', e.target.value)} maxLength={30} />
              <input type="number" min="0" placeholder="Stock" value={v.stock} onChange={(e) => setVariant(i, 'stock', e.target.value)} />
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('variants', form.variants.filter((_, idx) => idx !== i))}>Quitar</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('variants', [...form.variants, { size: '', color: '', stock: 0 }])}>+ Agregar variante</button>
      </div>

      <div className="card">
        <h2>Imágenes</h2>
        <div className="images">
          {visibleImages.map((img) => (
            <figure key={img.id}>
              <img src={img.url} alt="" />
              <button type="button" onClick={() => setRemoveImageIds((ids) => [...ids, img.id])} aria-label="Quitar imagen">×</button>
            </figure>
          ))}
          {previews.map((src, i) => (
            <figure key={src} className="images__new">
              <img src={src} alt="" />
              <button type="button" onClick={() => setFiles((f) => f.filter((_, idx) => idx !== i))} aria-label="Quitar imagen">×</button>
            </figure>
          ))}
        </div>
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setFiles((f) => [...f, ...e.target.files].slice(0, 8))} />
        <small className="muted">JPG, PNG o WEBP · máx. 5 MB c/u · la primera imagen es la portada.</small>
      </div>

      {error && <div className="alert alert--error">{error}</div>}
      <button className="btn btn--dark" disabled={saving}>{saving ? 'Guardando…' : 'Guardar producto'}</button>
    </form>
  );
}
