import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Check, Webhook } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import type { DailyActionProps } from '../types';
import { deliverWebhook } from './api';
import { webhookErrorMessage } from './messages';
import { OUTGOING_WEBHOOK_ID, readWebhookSettings } from './model';

/** W6: "Enviar a n8n" junto a Copiar; manda el mismo texto que Copiar. */
export default function SendDailyButton({ date, getText }: DailyActionProps) {
  const { language, showToast, raw } = useAppStore(
    useShallow((s) => ({ language: s.language, showToast: s.showToast, raw: s.extensions[OUTGOING_WEBHOOK_ID]?.settings })),
  );
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  if (!readWebhookSettings(raw).hint) return null;

  const handleClick = async () => {
    if (sending) return;
    setSending(true);
    try {
      const error = await deliverWebhook('daily.sent', { date, text: await getText() });
      if (error) {
        showToast({ kind: 'error', title: t(language, 'outgoingWebhook', 'sendFailedToast'), description: webhookErrorMessage(language, error), durationMs: 5000 });
      } else {
        showToast({ kind: 'success', title: t(language, 'outgoingWebhook', 'sentToast') });
        setSent(true);
        setTimeout(() => setSent(false), 2500);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={sending}
      className={`flex items-center justify-center rounded-lg p-1.5 text-xs transition disabled:opacity-50 ${
        sent ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20'
      }`}
      title={t(language, 'outgoingWebhook', 'sendDailyTitle')}
      aria-label={t(language, 'outgoingWebhook', 'sendDaily')}
    >
      {sent ? <Check size={14} /> : <Webhook size={14} />}
    </button>
  );
}
