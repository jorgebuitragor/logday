import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AlertCircle, Bot, CheckCircle2, KeyRound, Send, UserRound } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import type { Language } from '../../types/common';
import { AppSelect } from '../../components/calendar/AppSelect';
import { getExtensionSecretHint, setExtensionSecret } from '../secrets';
import { SetupGuide } from './SetupGuide';
import { GoogleUserSection } from './GoogleUserSection';
import { useTeamChatSettings, validateWebhookUrl } from './api';
import {
  CHAT_PROVIDERS, TEAM_CHAT_ID, WEBHOOK_SECRET_KEY, chatErrorMessage, isReadyToSend, toChatError,
  type ChatLastResult, type ChatProvider, type SendAs,
} from './model';

const PROVIDER_LABEL_KEY = {
  google_chat: 'providerGoogleChat',
  slack: 'providerSlack',
  teams: 'providerTeams',
} as const;

function formatLast(language: Language, last: ChatLastResult): string {
  const locale = language === 'en' ? 'en-US' : 'es-CO';
  const when = new Date(last.sentAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const what = last.test
    ? t(language, 'teamChat', 'lastTest')
    : last.date ? `${t(language, 'teamChat', 'lastDaily')} ${last.date}` : '';
  return [when, what].filter(Boolean).join(' · ');
}

/** Tarjeta de la extensión en Opciones → Extensiones (modo local). */
export default function TeamChatSettings() {
  const { language, showToast } = useAppStore(
    useShallow((s) => ({ language: s.language, showToast: s.showToast })),
  );
  const { settings, save, saveGoogle, send } = useTeamChatSettings();

  const [provider, setProvider] = useState<ChatProvider>(settings.provider ?? 'google_chat');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  // R14: hay pista en la configuración pero el llavero ya no tiene la URL.
  const [missingSecret, setMissingSecret] = useState(false);

  useEffect(() => {
    let alive = true;
    getExtensionSecretHint(TEAM_CHAT_ID, WEBHOOK_SECRET_KEY)
      .then((hint) => { if (alive) setMissingSecret(!hint && !!settings.hint); })
      .catch(() => { /* sin llavero: se verá al enviar */ });
    return () => { alive = false; };
  }, [settings.hint]);

  // "Como yo" solo existe con Google Chat (specs/chat-como-usuario C1).
  const asUser = provider === 'google_chat' && settings.sendAs === 'user';
  const configured = isReadyToSend(settings) && (asUser || !missingSecret);

  const chooseSendAs = (next: SendAs) => {
    setError(null);
    void save(next === 'user' ? { provider: 'google_chat', sendAs: 'user' } : { sendAs: 'bot' });
  };

  const handleSave = async () => {
    setError(null);
    const pasted = url.trim();
    if (!pasted) return;
    setBusy('save');
    try {
      const invalid = await validateWebhookUrl(provider, pasted);
      if (invalid) {
        setError(chatErrorMessage(language, invalid));
        return;
      }
      // La URL cruza a Rust una sola vez, para guardarla en el llavero.
      const hint = await setExtensionSecret(TEAM_CHAT_ID, WEBHOOK_SECRET_KEY, pasted);
      await save({ provider, hint });
      setUrl('');
      setMissingSecret(false);
      showToast({ kind: 'success', title: t(language, 'teamChat', 'saved'), description: hint });
    } catch (err) {
      setError(chatErrorMessage(language, toChatError(err)));
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    setError(null);
    setBusy('test');
    try {
      const failed = await send(t(language, 'teamChat', 'testText'), { test: true });
      if (failed) {
        setError(chatErrorMessage(language, failed));
        if (failed.code === 'needs_reconfig') setMissingSecret(true);
      } else {
        showToast({ kind: 'success', title: t(language, 'teamChat', 'testOk') });
      }
    } finally {
      setBusy(null);
    }
  };

  const last = settings.last;

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-28 shrink-0 text-[var(--text-secondary)]">{t(language, 'teamChat', 'provider')}</span>
        <AppSelect
          value={provider}
          onChange={(v) => { setProvider(v); setError(null); }}
          options={CHAT_PROVIDERS.map((p) => ({ value: p, label: t(language, 'teamChat', PROVIDER_LABEL_KEY[p]) }))}
        />
      </div>

      {provider === 'google_chat' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-28 shrink-0 text-[var(--text-secondary)]">{t(language, 'teamChat', 'sendAs')}</span>
          <div role="radiogroup" className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5">
            {([['bot', Bot, 'sendAsBot'], ['user', UserRound, 'sendAsUser']] as const).map(([value, Icon, key]) => {
              const active = (value === 'user') === asUser;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => chooseSendAs(value)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    active ? 'bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/40' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <Icon size={12} />
                  {t(language, 'teamChat', key)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {asUser ? (
        <GoogleUserSection
          google={settings.google}
          saveGoogle={saveGoogle}
          onError={setError}
          onBackToBot={() => chooseSendAs('bot')}
        />
      ) : (<>

      <div className="space-y-1.5">
        <label className="block text-[var(--text-secondary)]" htmlFor="team-chat-webhook">
          {t(language, 'teamChat', 'webhookUrl')}
        </label>
        <div className="flex gap-2">
          <input
            id="team-chat-webhook"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSave(); }}
            placeholder={t(language, 'teamChat', settings.hint ? 'webhookPlaceholderReplace' : 'webhookPlaceholder')}
            className="min-w-0 flex-1 rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy !== null || !url.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'save' ? t(language, 'teamChat', 'saving') : t(language, 'teamChat', 'save')}
          </button>
        </div>
        {/* La URL guardada solo vale para su proveedor: cambiarlo pide la nueva. */}
        {settings.hint && provider !== settings.provider && (
          <p className="text-[10px] text-amber-400">{t(language, 'teamChat', 'providerChangedNeedsUrl')}</p>
        )}
        {/* Abierta mientras no haya una URL guardada: es justo cuando hace falta. */}
        <SetupGuide provider={provider} defaultOpen={!settings.hint} />
      </div>

      <div className="flex items-center gap-1.5 text-[11px]">
        <KeyRound size={12} className="shrink-0 text-[var(--text-hint)]" />
        {missingSecret ? (
          <span className="text-amber-400">{t(language, 'teamChat', 'needsReconfig')}</span>
        ) : settings.hint ? (
          <span className="text-[var(--text-secondary)]">
            {t(language, 'teamChat', 'savedHint')} <span className="font-mono">{settings.hint}</span>
            {settings.provider && ` · ${t(language, 'teamChat', PROVIDER_LABEL_KEY[settings.provider])}`}
          </span>
        ) : (
          <span className="text-[var(--text-hint)]">{t(language, 'teamChat', 'notConfigured')}</span>
        )}
      </div>
      <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'teamChat', 'localOnly')}</p>
      </>)}

      {error && (
        <div role="alert" className="flex items-start gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <div className="min-w-0 text-[11px]">
          <span className="text-[var(--text-hint)]">{t(language, 'teamChat', 'lastResult')}: </span>
          {last ? (
            <span className={last.status === 'ok' ? 'text-emerald-400' : 'text-red-400'}>
              {last.status === 'ok' ? <CheckCircle2 size={11} className="mr-1 inline" /> : <AlertCircle size={11} className="mr-1 inline" />}
              {last.status === 'ok'
                ? t(language, 'teamChat', 'lastOk')
                : `${t(language, 'teamChat', 'lastError')}: ${chatErrorMessage(language, last.error ?? { code: 'unknown' })}`}
              <span className="text-[var(--text-hint)]"> · {formatLast(language, last)}</span>
            </span>
          ) : (
            <span className="text-[var(--text-hint)]">{t(language, 'teamChat', 'lastNever')}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={!configured || busy !== null}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-card)] px-3 py-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send size={12} />
          {t(language, 'teamChat', 'sendTest')}
        </button>
      </div>
    </div>
  );
}
