import { t } from '../../lib/i18n';
import type { Language } from '../../types/common';
import type { WebhookError } from './api';

const KNOWN = new Set([
  'invalid_url', 'not_https', 'needs_reconfig', 'rate_limited', 'timeout', 'network', 'provider_error',
  'keychain_error', 'invalid_body',
]);

/** Mensaje para el usuario, con el código HTTP del flujo si respondió. */
export function webhookErrorMessage(language: Language, err: WebhookError): string {
  const code = KNOWN.has(err.code) ? err.code : 'unknown';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = t(language, 'outgoingWebhook', `err_${code}` as any);
  return err.status ? `${text} (${err.status})` : text;
}
