// Módulo de "Webhook saliente". Se carga con `import()` solo cuando la
// extensión está activa (specs/extensiones R16).
import { onAppEvent } from '../../lib/appEvents';
import { useAppStore } from '../../store/appStore';
import type { ExtensionModule } from '../types';
import { deliverWebhook } from './api';
import { OUTGOING_WEBHOOK_ID, readWebhookSettings, webhookEventFor } from './model';
import SendDailyButton from './SendDailyButton';
import Settings from './Settings';

/** W5, W8: escucha los eventos del store y envía los que el usuario eligió. */
function start(): () => void {
  return onAppEvent((ev) => {
    const settings = readWebhookSettings(useAppStore.getState().extensions[OUTGOING_WEBHOOK_ID]?.settings);
    if (!settings.hint) return;
    const out = webhookEventFor(ev);
    if (out && settings.events.includes(out.event)) void deliverWebhook(out.event, out.data);
  });
}

const outgoingWebhook: ExtensionModule = { Settings, dailyActions: SendDailyButton, start };

export default outgoingWebhook;
