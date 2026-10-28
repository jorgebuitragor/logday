import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AlertCircle, CheckCircle2, ChevronDown, KeyRound, Lightbulb, Send } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import ToggleSwitch from '../../components/shared/ToggleSwitch';
import { clearExtensionSecret, setExtensionSecret } from '../secrets';
import { deliverWebhook, validateWebhookUrl } from './api';
import { webhookErrorMessage } from './messages';
import {
  AUTOMATIC_EVENTS, OUTGOING_WEBHOOK_ID, SIGNING_SECRET_KEY, URL_SECRET_KEY, readWebhookSettings,
  type AutomaticEvent,
} from './model';

const INPUT_CLS =
  'min-w-0 flex-1 rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none';
const PRIMARY_CLS =
  'rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_CLS =
  'flex items-center gap-1.5 rounded-lg border border-[var(--border-card)] px-3 py-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50';

const EVENT_LABEL = {
  'task.created': 'eventTaskCreated',
  'task.completed': 'eventTaskCompleted',
  'overtime.saved': 'eventOvertimeSaved',
} as const;

type GuideKey = Parameters<typeof t<'outgoingWebhook'>>[2];
const GUIDE: GuideKey[] = ['guide1', 'guide2', 'guide3', 'guide4', 'guide5'];

/** Panel del webhook saliente en Opciones (specs/webhook-saliente). */
export default function OutgoingWebhookSettings() {
  const { language, raw, update, showToast } = useAppStore(
    useShallow((s) => ({
      language: s.language,
      raw: s.extensions[OUTGOING_WEBHOOK_ID]?.settings,
      update: s.updateExtensionSettings,
      showToast: s.showToast,
    })),
  );
  const settings = readWebhookSettings(raw);
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState<'url' | 'secret' | 'test' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(!settings.hint);

  const saveUrl = async () => {
    setError(null);
    const pasted = url.trim();
    if (!pasted) return;
    setBusy('url');
    try {
      const invalid = await validateWebhookUrl(pasted);
      if (invalid) {
        setError(webhookErrorMessage(language, invalid));
        return;
      }
      // W2: la URL cruza a Rust una sola vez, para guardarla en el llavero.
      const hint = await setExtensionSecret(OUTGOING_WEBHOOK_ID, URL_SECRET_KEY, pasted);
      await update(OUTGOING_WEBHOOK_ID, { hint });
      setUrl('');
      showToast({ kind: 'success', title: t(language, 'outgoingWebhook', 'saved'), description: hint });
    } catch {
      setError(webhookErrorMessage(language, { code: 'keychain_error' }));
    } finally {
      setBusy(null);
    }
  };

  const saveSecret = async (clear = false) => {
    setError(null);
    setBusy('secret');
    try {
      if (clear) {
        await clearExtensionSecret(OUTGOING_WEBHOOK_ID, SIGNING_SECRET_KEY);
        await update(OUTGOING_WEBHOOK_ID, { secretHint: '' });
      } else if (secret.trim()) {
        const secretHint = await setExtensionSecret(OUTGOING_WEBHOOK_ID, SIGNING_SECRET_KEY, secret.trim());
        await update(OUTGOING_WEBHOOK_ID, { secretHint });
        setSecret('');
      }
    } catch {
      setError(webhookErrorMessage(language, { code: 'keychain_error' }));
    } finally {
      setBusy(null);
    }
  };

  const toggleEvent = (ev: AutomaticEvent, on: boolean) => {
    const events = on ? [...settings.events, ev] : settings.events.filter((e) => e !== ev);
    void update(OUTGOING_WEBHOOK_ID, { events });
  };

  const sendTest = async () => {
    setError(null);
    setBusy('test');
    try {
      const failed = await deliverWebhook('test', { message: t(language, 'outgoingWebhook', 'testMessage') });
      if (failed) setError(webhookErrorMessage(language, failed));
      else showToast({ kind: 'success', title: t(language, 'outgoingWebhook', 'testOk') });
    } finally {
      setBusy(null);
    }
  };

  const last = settings.last;
  const locale = language === 'en' ? 'en-US' : 'es-CO';

  return (
    <div className="space-y-3 text-xs">
      <div className="space-y-1.5">
        <label className="block text-[var(--text-secondary)]" htmlFor="outgoing-webhook-url">{t(language, 'outgoingWebhook', 'url')}</label>
        <div className="flex gap-2">
          <input
            id="outgoing-webhook-url"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void saveUrl(); }}
            placeholder={t(language, 'outgoingWebhook', settings.hint ? 'urlPlaceholderReplace' : 'urlPlaceholder')}
            className={INPUT_CLS}
          />
          <button type="button" onClick={() => void saveUrl()} disabled={busy !== null || !url.trim()} className={PRIMARY_CLS}>
            {t(language, 'outgoingWebhook', 'save')}
          </button>
        </div>
        <p className="flex items-center gap-1.5 text-[11px]">
          <KeyRound size={12} className="shrink-0 text-[var(--text-hint)]" />
          {settings.hint
            ? <span className="text-[var(--text-secondary)]">{t(language, 'outgoingWebhook', 'savedHint')} <span className="font-mono">{settings.hint}</span></span>
            : <span className="text-[var(--text-hint)]">{t(language, 'outgoingWebhook', 'notConfigured')}</span>}
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-[var(--text-secondary)]" htmlFor="outgoing-webhook-secret">{t(language, 'outgoingWebhook', 'secret')}</label>
        <div className="flex gap-2">
          <input
            id="outgoing-webhook-secret"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void saveSecret(); }}
            placeholder={t(language, 'outgoingWebhook', settings.secretHint ? 'secretPlaceholderReplace' : 'secretPlaceholder')}
            className={INPUT_CLS}
          />
          <button type="button" onClick={() => void saveSecret()} disabled={busy !== null || !secret.trim()} className={PRIMARY_CLS}>
            {t(language, 'outgoingWebhook', 'save')}
          </button>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-[10px] text-[var(--text-hint)]">
          {settings.secretHint ? (
            <>
              <span>{t(language, 'outgoingWebhook', 'secretSaved')} <span className="font-mono">{settings.secretHint}</span></span>
              <button type="button" onClick={() => void saveSecret(true)} disabled={busy !== null} className="text-red-400 hover:underline">
                {t(language, 'outgoingWebhook', 'secretRemove')}
              </button>
            </>
          ) : t(language, 'outgoingWebhook', 'secretHelp')}
        </p>
      </div>

      <div className="space-y-1.5 border-t border-[var(--border)] pt-3">
        <p className="text-[var(--text-secondary)]">{t(language, 'outgoingWebhook', 'events')}</p>
        {AUTOMATIC_EVENTS.map((ev) => (
          <div key={ev} className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-[var(--text-secondary)]">
              {t(language, 'outgoingWebhook', EVENT_LABEL[ev])} <span className="font-mono text-[10px] text-[var(--text-hint)]">{ev}</span>
            </span>
            <ToggleSwitch checked={settings.events.includes(ev)} onChange={(on) => toggleEvent(ev, on)} />
          </div>
        ))}
        <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'outgoingWebhook', 'dailyManual')}</p>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <div className="min-w-0 text-[11px]">
          <span className="text-[var(--text-hint)]">{t(language, 'outgoingWebhook', 'lastResult')}: </span>
          {last ? (
            <span className={last.status === 'ok' ? 'text-emerald-400' : 'text-red-400'}>
              {last.status === 'ok' ? <CheckCircle2 size={11} className="mr-1 inline" /> : <AlertCircle size={11} className="mr-1 inline" />}
              <span className="font-mono">{last.event}</span>
              {last.status === 'error' && ` · ${webhookErrorMessage(language, last.error ?? { code: 'unknown' })}`}
              <span className="text-[var(--text-hint)]"> · {new Date(last.at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </span>
          ) : (
            <span className="text-[var(--text-hint)]">{t(language, 'outgoingWebhook', 'lastNever')}</span>
          )}
        </div>
        <button type="button" onClick={() => void sendTest()} disabled={!settings.hint || busy !== null} className={SECONDARY_CLS}>
          <Send size={12} />
          {t(language, 'outgoingWebhook', 'sendTest')}
        </button>
      </div>

      <div className="rounded-lg border border-[var(--border-card)]">
        <button
          type="button"
          onClick={() => setGuideOpen((v) => !v)}
          aria-expanded={guideOpen}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
        >
          {t(language, 'outgoingWebhook', 'guideTitle')}
          <ChevronDown size={12} className={`shrink-0 transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
        </button>
        {guideOpen && (
          <div className="space-y-3 border-t border-[var(--border-card)] px-3 py-3">
            <ol className="list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {GUIDE.map((k) => <li key={k}>{t(language, 'outgoingWebhook', k)}</li>)}
            </ol>
            <p className="flex gap-1.5 rounded-lg bg-[var(--bg-hover)] px-3 py-2 text-[10px] leading-relaxed text-[var(--text-hint)]">
              <Lightbulb size={11} className="mt-0.5 shrink-0 text-amber-400" />
              <span>{t(language, 'outgoingWebhook', 'guideTip')}</span>
            </p>
            <pre className="overflow-x-auto rounded-lg bg-[var(--bg-surface)] px-3 py-2 font-mono text-[10px] leading-relaxed text-[var(--text-primary)]">{`{
  "event": "task.completed",
  "at": "2026-10-28T21:00:00.000Z",
  "source": "logday-desktop",
  "data": { "id": "…", "title": "…", "project": "…", "status": "done" }
}`}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
