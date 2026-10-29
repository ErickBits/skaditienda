/**
 * Filtros avanzados del catálogo: talla, color, solo descuentos y orden.
 * Es un componente controlado: el estado vive en la URL (?size=40,41&color=Negro…)
 * para que los filtros se puedan compartir y sobrevivan a recargar la página.
 */
// Opciones de orden: [valor que entiende la API, etiqueta].
const SORTS = [
  ['recent', 'Novedades'],
  ['price_asc', 'Precio: menor a mayor'],
  ['price_desc', 'Precio: mayor a menor'],
  ['name', 'Nombre A–Z'],
];

/**
 * Grupo de chips de selección múltiple (no se muestra si no hay opciones).
 * @param {{ label: string, options: string[], selected: string[], onToggle: (option: string) => void }} props
 */
function ChipGroup({ label, options, selected, onToggle }) {
  if (!options.length) return null;
  return (
    <fieldset className="filters__group">
      <legend>{label}</legend>
      <div className="filters__chips">
        {options.map((opt) => (
          <button key={opt} type="button" className="chip" aria-pressed={selected.includes(opt)} onClick={() => onToggle(opt)}>
            {opt}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * @param {object} props
 * @param {{ sizes: string[], colors: string[] }} props.available Opciones con stock (de /api/filters).
 * @param {{ size: string[], color: string[], discount: boolean, sort: string }} props.value Filtros actuales.
 * @param {(patch: object) => void} props.onChange Recibe solo los campos que cambiaron.
 */
export default function FilterPanel({ available, value, onChange }) {
  // Agrega o quita una opción de la lista `key` ('size' | 'color').
  const toggle = (key, option) => {
    const current = value[key];
    onChange({ [key]: current.includes(option) ? current.filter((o) => o !== option) : [...current, option] });
  };
  const activeCount = value.size.length + value.color.length + (value.discount ? 1 : 0);

  return (
    <details className="filters" open>
      <summary>
        Filtros {activeCount > 0 && <span className="filters__count">{activeCount}</span>}
      </summary>

      <div className="filters__body">
        <div className="field">
          <label htmlFor="sort">Ordenar por</label>
          <select id="sort" value={value.sort} onChange={(e) => onChange({ sort: e.target.value })}>
            {SORTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </div>

        <ChipGroup label="Talla" options={available.sizes} selected={value.size} onToggle={(o) => toggle('size', o)} />
        <ChipGroup label="Color" options={available.colors} selected={value.color} onToggle={(o) => toggle('color', o)} />

        <label className="filters__switch">
          <input type="checkbox" checked={value.discount} onChange={(e) => onChange({ discount: e.target.checked })} />
          <span>Solo con descuento</span>
        </label>

        {activeCount > 0 && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange({ size: [], color: [], discount: false })}>
            Limpiar filtros
          </button>
        )}
      </div>
    </details>
  );
}
