/**
 * Integración con Wompi (Web Checkout + eventos).
 *
 * Flujo:
 *  1. El backend crea la orden y firma (referencia + monto + moneda) con el
 *     secreto de integridad → el cliente no puede alterar el monto.
 *  2. El navegador va a checkout.wompi.co con esos parámetros firmados.
 *  3. Wompi notifica el resultado al webhook; se valida el checksum con el
 *     secreto de eventos y, además, se consulta la transacción en la API.
 *
 * Los secretos (integridad y eventos) NUNCA salen del servidor.
 * Docs: https://docs.wompi.co/docs/colombia/widget-checkout-web/
 *       https://docs.wompi.co/docs/colombia/eventos/
 */
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const API_URL = {
  sandbox: 'https://sandbox.wompi.co/v1',
  production: 'https://production.wompi.co/v1',
}[env.WOMPI_ENV];

const CHECKOUT_URL = 'https://checkout.wompi.co/p/';

/** Valor de `environment` que Wompi envía en sus eventos. */
const EVENT_ENVIRONMENT = env.WOMPI_ENV === 'production' ? 'prod' : 'test';

const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

/** Compara dos hashes hex en tiempo constante (evita ataques de temporización). */
function safeEqualHex(a, b) {
  const bufA = Buffer.from(String(a).toLowerCase(), 'utf8');
  const bufB = Buffer.from(String(b).toLowerCase(), 'utf8');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/** Firma de integridad: SHA256("<referencia><monto_en_centavos><moneda><secreto_integridad>") */
export function integritySignature({ reference, amountInCents, currency = 'COP' }) {
  return sha256(`${reference}${amountInCents}${currency}${env.WOMPI_INTEGRITY_SECRET}`);
}

/** URL del Web Checkout de Wompi con todos los parámetros firmados. */
export function buildCheckoutUrl({ reference, amountInCents, currency = 'COP', customer }) {
  const params = new URLSearchParams({
    'public-key': env.WOMPI_PUBLIC_KEY,
    currency,
    'amount-in-cents': String(amountInCents),
    reference,
    'signature:integrity': integritySignature({ reference, amountInCents, currency }),
    'redirect-url': `${env.APP_URL}/pago/resultado`,
    'customer-data:email': customer.email,
    'customer-data:full-name': customer.name,
  });
  return `${CHECKOUT_URL}?${params}`;
}

/** Lee una ruta tipo "transaction.amount_in_cents" dentro de `obj`. */
const readPath = (obj, dottedPath) => dottedPath.split('.').reduce((acc, key) => acc?.[key], obj);

/**
 * Verifica la autenticidad de un evento de Wompi.
 *
 * checksum = SHA256( valores de signature.properties (en orden, tomados de event.data)
 *                    + timestamp + secreto_de_eventos )
 */
export function verifyEventSignature(event) {
  const { signature, timestamp, data, environment } = event ?? {};
  if (!Array.isArray(signature?.properties) || typeof signature.checksum !== 'string' || !timestamp || !data) {
    return false;
  }
  if (environment && environment !== EVENT_ENVIRONMENT) return false;

  const values = signature.properties.map((prop) => readPath(data, prop));
  if (values.some((v) => v === undefined || v === null)) return false;

  const expected = sha256(`${values.join('')}${timestamp}${env.WOMPI_EVENTS_SECRET}`);
  return safeEqualHex(expected, signature.checksum);
}

/**
 * Consulta una transacción directamente en la API de Wompi (fuente autoritativa).
 * Devuelve `null` si no existe.
 */
export async function getTransaction(transactionId) {
  const res = await fetch(`${API_URL}/transactions/${encodeURIComponent(transactionId)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wompi respondió ${res.status} al consultar la transacción`);
  const { data } = await res.json();
  return data;
}
