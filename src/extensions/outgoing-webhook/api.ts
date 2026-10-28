// Comandos Rust del webhook saliente (src-tauri/src/extensions/outgoing_webhook.rs).
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../store/appStore';
import { nowInstant } from '../../lib/localDate';
import { buildPayload, OUTGOING_WEBHOOK_ID, readWebhookSettings, type WebhookEvent, type WebhookLast } from './model';

export interface WebhookError {
  code: string;
  status?: number | null;
}

export function toWebhookError(err: unknown): WebhookError {
  if (typeof err === 'string') return { code: err };
  if (err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string') {
    const e = err as { code: string; status?: unknown };
    return { code: e.code, status: typeof e.status === 'number' ? e.status : null };
  }
  return { code: 'unknown' };
}

/** W1, sin red. `null` si vale. */
export async function validateWebhookUrl(url: string): Promise<WebhookError | null> {
  try {
    await invoke('outgoing_webhook_validate_url', { url });
    return null;
  } catch (err) {
    return toWebhookError(err);
  }
}

/** Envía un evento y guarda el resultado como último envío (W10). Nunca
 *  lanza: un envío que falla no afecta a la app. */
export async function deliverWebhook(event: WebhookEvent, data: unknown): Promise<WebhookError | null> {
  const at = nowInstant();
  let error: WebhookError | null = null;
  try {
    await invoke('outgoing_webhook_send', { body: buildPayload(event, data, at) });
  } catch (err) {
    error = toWebhookError(err);
  }
  const last: WebhookLast = { event, at, status: error ? 'error' : 'ok', ...(error ? { error } : {}) };
  const { updateExtensionSettings, extensions } = useAppStore.getState();
  // Si mientras tanto se quitó la configuración, no se vuelve a crear.
  if (readWebhookSettings(extensions[OUTGOING_WEBHOOK_ID]?.settings).hint) {
    await updateExtensionSettings(OUTGOING_WEBHOOK_ID, { last }).catch(() => {});
  }
  return error;
}
