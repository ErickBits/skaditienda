/**
 * Webhook de eventos de Wompi.
 * Configura en el panel de Wompi la URL: https://<tu-dominio>/api/webhooks/wompi
 *
 * Reglas de respuesta:
 *  · 401 → firma inválida (no procesamos nada).
 *  · 200 → evento procesado o ignorado a propósito (Wompi deja de reintentar).
 *  · 5xx → fallo temporal (BD o API de Wompi caída): Wompi reintentará.
 */
import { Router } from 'express';
import { query } from '../config/db.js';
import { applyTransaction } from '../services/order.service.js';
import { getTransaction, verifyEventSignature } from '../services/wompi.service.js';

const router = Router();

/** POST /wompi — Recibe los eventos de Wompi y actualiza la orden correspondiente. */
router.post('/wompi', async (req, res) => {
  const event = req.body;

  // 1) Autenticidad: checksum firmado con el secreto de eventos.
  if (!verifyEventSignature(event)) {
    console.warn('[wompi] evento con firma inválida rechazado', { ip: req.ip });
    return res.status(401).json({ error: 'Firma inválida' });
  }

  if (event.event !== 'transaction.updated' || !event.data?.transaction?.id) {
    return res.json({ ok: true, ignored: true });
  }

  // 2) Defensa en profundidad: el estado y el monto se toman de la API de Wompi,
  //    no del cuerpo del evento.
  const tx = await getTransaction(event.data.transaction.id);
  if (!tx) return res.json({ ok: true, ignored: 'transacción inexistente' });

  // 3) Aplicación idempotente (monto validado contra la orden dentro del servicio).
  const result = await applyTransaction(tx);

  // 4) Bitácora para auditoría; los reintentos con el mismo checksum no se duplican.
  await query(
    `INSERT INTO webhook_events (checksum, event_type, transaction_id, status, payload)
     VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id`,
    [event.signature.checksum.toLowerCase(), event.event, tx.id, tx.status, JSON.stringify(event)],
  );

  console.info(`[wompi] ${tx.reference} → ${tx.status}`, result);
  res.json({ ok: true });
});

export default router;
