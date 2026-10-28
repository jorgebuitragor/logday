import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Check, Send } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { localISODate } from '../../lib/localDate';
import { ModalOverlay } from '../../components/shared/ModalOverlay';
import { ModalPanel } from '../../components/shared/ModalPanel';
import { Z_MODAL_NESTED } from '../../lib/zIndex';
import type { DailyActionProps } from '../types';
import { useTeamChatSettings } from './api';
import { chatErrorMessage, wasSentToday } from './model';

/** "Enviar al chat" junto a Copiar en el daily (R15, R31). Envía el mismo
 *  texto que Copiar (`buildDailyCopyText`). */
export default function SendToChatButton({ date, getText }: DailyActionProps) {
  const { language, showToast } = useAppStore(
    useShallow((s) => ({ language: s.language, showToast: s.showToast })),
  );
  const { settings, send } = useTeamChatSettings();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [confirmText, setConfirmText] = useState<string | null>(null);

  // R31: solo con una integración configurada.
  if (!settings.provider || !settings.hint) return null;

  const doSend = async (text: string) => {
    setSending(true);
    try {
      const error = await send(text, { date });
      if (error) {
        showToast({
          kind: 'error',
          title: t(language, 'teamChat', 'sendFailedToast'),
          description: chatErrorMessage(language, error),
          durationMs: 5000,
        });
      } else {
        showToast({ kind: 'success', title: t(language, 'teamChat', 'sentToast') });
        setSent(true);
        setTimeout(() => setSent(false), 2500);
      }
    } finally {
      setSending(false);
    }
  };

  const handleClick = async () => {
    if (sending) return;
    const text = await getText();
    if (wasSentToday(settings.last, date, localISODate())) {
      setConfirmText(text);
      return;
    }
    await doSend(text);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={sending}
        className={`flex items-center justify-center rounded-lg p-1.5 text-xs transition disabled:opacity-50 ${
          sent
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20'
        }`}
        title={sending ? t(language, 'teamChat', 'sending') : t(language, 'teamChat', 'sendToChatTitle')}
        aria-label={t(language, 'teamChat', 'sendToChat')}
      >
        {sent ? <Check size={14} /> : <Send size={14} />}
      </button>

      {confirmText !== null && (
        <ModalOverlay zIndex={Z_MODAL_NESTED} onClose={() => setConfirmText(null)}>
          <ModalPanel className="w-80 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Send size={15} className="text-indigo-400" />
              {t(language, 'teamChat', 'resendTitle')}
            </div>
            <p className="mb-4 text-xs text-[var(--text-secondary)]">{t(language, 'teamChat', 'resendMessage')}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmText(null)}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              >
                {t(language, 'teamChat', 'cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const text = confirmText;
                  setConfirmText(null);
                  void doSend(text);
                }}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500"
              >
                {t(language, 'teamChat', 'resendConfirm')}
              </button>
            </div>
          </ModalPanel>
        </ModalOverlay>
      )}
    </>
  );
}
