// Formateadores creados una sola vez: construirlos en cada llamada es costoso.
const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** 389000 → "$ 389.000" */
export const formatCOP = (pesos) => cop.format(pesos);

/** Fecha ISO → fecha y hora cortas en español de Colombia (zona horaria del navegador). */
export const formatDate = (iso) =>
  new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

/**
 * Recorta un texto en el último espacio antes de `max` caracteres y agrega "…".
 * @param {string} [text='']
 * @param {number} [max=140]
 * @returns {string}
 */
export function excerpt(text = '', max = 140) {
  if (text.length <= max) return text;
  return `${text.slice(0, text.lastIndexOf(' ', max))}…`;
}
