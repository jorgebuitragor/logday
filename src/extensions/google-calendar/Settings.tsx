import { useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AlertCircle, CheckCircle2, ChevronDown, ExternalLink, KeyRound, Lightbulb, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { fs } from '../../lib/invoke';
import { setExtensionSecret } from '../secrets';
import { readTeamChatSettings } from '../team-chat/model';
import { connectCalendar, copyClientFromTeamChat, disconnectCalendar, toCalendarError, type CalendarCommandError } from './api';
import { refreshGoogleCalendar, useCalendarSync } from './sync';
import { CLIENT_SECRET_KEY, GOOGLE_CALENDAR_ID, readCalendarSettings } from './model';

const INPUT_CLS =
  'min-w-0 flex-1 rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none';
const PRIMARY_CLS =
  'flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_CLS =
  'flex items-center gap-1.5 rounded-lg border border-[var(--border-card)] px-3 py-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50';

const KNOWN_ERRORS = new Set([
  'needs_client', 'needs_reconnect', 'not_allowed', 'rate_limited', 'cancelled', 'state_mismatch', 'token_error',
  'browser_error', 'server_error', 'timeout', 'network', 'provider_error', 'keychain_error', 'invalid_range',
]);

type GuideKey = Parameters<typeof t<'googleCalendar'>>[2];
const STEPS: GuideKey[] = ['guide1', 'guide2', 'guide3', 'guide4'];
const ADMIN_STEPS: GuideKey[] = ['guideAdmin1', 'guideAdmin2', 'guideAdmin3'];
const HELP_URL = 'https://developers.google.com/calendar/api/guides/overview';

/** Mensaje para el usuario, con el código de Google si lo hubo. */
export function calendarErrorMessage(language: 'es' | 'en', err: CalendarCommandError): string {
  const code = KNOWN_ERRORS.has(err.code) ? err.code : 'unknown';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = t(language, 'googleCalendar', `err_${code}` as any);
  return err.status ? `${text} (${err.status})` : text;
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[var(--text-secondary)]">
        {done
          ? <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />
          : <span className="flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-full border border-[var(--border-high)] text-[8px] text-[var(--text-hint)]">{n}</span>}
        {title}
      </p>
      <div className="pl-5">{children}</div>
    </div>
  );
}

/** Panel de Google Calendar en Opciones (specs/google-calendar). */
export default function GoogleCalendarSettings() {
  const { language, raw, teamChatRaw, update, showToast } = useAppStore(
    useShallow((s) => ({
      language: s.language,
      raw: s.extensions[GOOGLE_CALENDAR_ID]?.settings,
      teamChatRaw: s.extensions['team-chat']?.settings,
      update: s.updateExtensionSettings,
      showToast: s.showToast,
    })),
  );
  const settings = readCalendarSettings(raw);
  const teamChatGoogle = readTeamChatSettings(teamChatRaw).google;
  const status = useCalendarSync((s) => s.status);

  const [clientId, setClientId] = useState(settings.clientId ?? '');
  const [secret, setSecret] = useState('');
  const [editingClient, setEditingClient] = useState(!settings.clientId || !settings.secretHint);
  const [busy, setBusy] = useState<'client' | 'copy' | 'connect' | 'disconnect' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(!settings.account);
  const [adminOpen, setAdminOpen] = useState(false);

  const hasClient = !!settings.clientId && !!settings.secretHint;
  const canReuse = !!teamChatGoogle?.clientId && !!teamChatGoogle.secretHint && teamChatGoogle.clientId !== settings.clientId;
  const fail = (err: unknown) => setError(calendarErrorMessage(language, toCalendarError(err)));

  // Con otro cliente, el token de la cuenta conectada ya no sirve.
  const dropAccountIfClientChanges = async (id: string) => {
    if (settings.account && id !== settings.clientId) await disconnectCalendar().catch(() => {});
  };

  const saveClient = async () => {
    setError(null);
    const id = clientId.trim();
    if (!id || !secret.trim()) return;
    setBusy('client');
    try {
      await dropAccountIfClientChanges(id);
      const secretHint = await setExtensionSecret(GOOGLE_CALENDAR_ID, CLIENT_SECRET_KEY, secret.trim());
      await update(GOOGLE_CALENDAR_ID, { clientId: id, secretHint, ...(id !== settings.clientId ? { account: '' } : {}) });
      setSecret('');
      setEditingClient(false);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const reuseTeamChatClient = async () => {
    if (!teamChatGoogle?.clientId) return;
    setError(null);
    setBusy('copy');
    try {
      await dropAccountIfClientChanges(teamChatGoogle.clientId);
      await copyClientFromTeamChat();
      await update(GOOGLE_CALENDAR_ID, { clientId: teamChatGoogle.clientId, secretHint: teamChatGoogle.secretHint, account: '' });
      setClientId(teamChatGoogle.clientId);
      setEditingClient(false);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const connect = async () => {
    if (!settings.clientId) return;
    setError(null);
    setBusy('connect');
    try {
      const account = await connectCalendar(settings.clientId);
      await update(GOOGLE_CALENDAR_ID, { account: account || '—' });
      showToast({ kind: 'success', title: t(language, 'googleCalendar', 'connected'), description: account });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setError(null);
    setBusy('disconnect');
    try {
      await disconnectCalendar();
      await update(GOOGLE_CALENDAR_ID, { account: '' });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const locale = language === 'en' ? 'en-US' : 'es-CO';

  return (
    <div className="space-y-3 text-xs">
      <Step n={1} title={t(language, 'googleCalendar', 'clientStep')} done={hasClient}>
        {hasClient && !editingClient ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="flex min-w-0 items-center gap-1.5 text-[var(--text-secondary)]">
              <KeyRound size={12} className="shrink-0 text-[var(--text-hint)]" />
              <span className="truncate font-mono">{settings.clientId}</span>
              <span className="shrink-0 font-mono text-[var(--text-hint)]">· {settings.secretHint}</span>
            </span>
            <button type="button" onClick={() => setEditingClient(true)} className="text-[11px] text-indigo-400 hover:underline">
              {t(language, 'googleCalendar', 'clientChange')}
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {canReuse && (
              <button type="button" onClick={() => void reuseTeamChatClient()} disabled={busy !== null} className={SECONDARY_CLS}>
                {t(language, 'googleCalendar', 'reuseClient')}
              </button>
            )}
            <input
              aria-label={t(language, 'googleCalendar', 'clientId')}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder={t(language, 'googleCalendar', 'clientIdPlaceholder')}
              className={`${INPUT_CLS} w-full`}
            />
            <div className="flex gap-2">
              <input
                aria-label={t(language, 'googleCalendar', 'clientSecret')}
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void saveClient(); }}
                spellCheck={false}
                autoComplete="off"
                placeholder={t(language, 'googleCalendar', 'clientSecret')}
                className={INPUT_CLS}
              />
              <button type="button" onClick={() => void saveClient()} disabled={busy !== null || !clientId.trim() || !secret.trim()} className={PRIMARY_CLS}>
                {t(language, 'googleCalendar', 'save')}
              </button>
            </div>
          </div>
        )}
      </Step>

      <Step n={2} title={t(language, 'googleCalendar', 'accountStep')} done={!!settings.account}>
        {settings.account ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="text-[var(--text-secondary)]">
              {t(language, 'googleCalendar', 'connectedAs')} <span className="font-medium text-[var(--text-primary)]">{settings.account}</span>
            </span>
            <button type="button" onClick={() => void disconnect()} disabled={busy !== null} className={SECONDARY_CLS}>
              <LogOut size={12} />
              {t(language, 'googleCalendar', 'disconnect')}
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <button type="button" onClick={() => void connect()} disabled={busy !== null || !hasClient} className={PRIMARY_CLS}>
              <LogIn size={12} />
              {busy === 'connect' ? t(language, 'googleCalendar', 'waiting') : t(language, 'googleCalendar', 'connect')}
            </button>
            {busy === 'connect' && <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'googleCalendar', 'waitingHint')}</p>}
          </div>
        )}
      </Step>

      {settings.account && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-[11px]">
          <span className={status.state === 'error' ? 'text-amber-400' : 'text-[var(--text-hint)]'}>
            {status.state === 'loading' && t(language, 'googleCalendar', 'syncing')}
            {status.state === 'ok' && `${t(language, 'googleCalendar', 'syncedAt')} ${new Date(status.at).toLocaleTimeString(locale, { timeStyle: 'short' })} · ${status.count} ${t(language, 'googleCalendar', status.count === 1 ? 'eventOne' : 'eventMany')}`}
            {status.state === 'error' && calendarErrorMessage(language, status)}
            {status.state === 'idle' && t(language, 'googleCalendar', 'openCalendarHint')}
          </span>
          <button type="button" onClick={() => void refreshGoogleCalendar()} disabled={status.state === 'loading'} className={SECONDARY_CLS}>
            <RefreshCw size={12} className={status.state === 'loading' ? 'animate-spin' : ''} />
            {t(language, 'googleCalendar', 'refresh')}
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-lg border border-[var(--border-card)]">
        <button
          type="button"
          onClick={() => setGuideOpen((v) => !v)}
          aria-expanded={guideOpen}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
        >
          {t(language, 'googleCalendar', 'guideTitle')}
          <ChevronDown size={12} className={`shrink-0 transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
        </button>
        {guideOpen && (
          <div className="space-y-3 border-t border-[var(--border-card)] px-3 py-3">
            <ol className="list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {STEPS.map((k) => <li key={k}>{t(language, 'googleCalendar', k)}</li>)}
            </ol>
            <p className="flex gap-1.5 rounded-lg bg-[var(--bg-hover)] px-3 py-2 text-[10px] leading-relaxed text-[var(--text-hint)]">
              <Lightbulb size={11} className="mt-0.5 shrink-0 text-amber-400" />
              <span>{t(language, 'googleCalendar', 'guideTip')}</span>
            </p>
            <div className="rounded-lg border border-[var(--border-card)]">
              <button
                type="button"
                onClick={() => setAdminOpen((v) => !v)}
                aria-expanded={adminOpen}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              >
                {t(language, 'googleCalendar', 'guideAdminTitle')}
                <ChevronDown size={12} className={`shrink-0 transition-transform ${adminOpen ? 'rotate-180' : ''}`} />
              </button>
              {adminOpen && (
                <ol className="list-decimal space-y-1.5 border-t border-[var(--border-card)] px-3 py-3 pl-7 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {ADMIN_STEPS.map((k) => <li key={k}>{t(language, 'googleCalendar', k)}</li>)}
                </ol>
              )}
            </div>
            <button type="button" onClick={() => void fs.openUrl(HELP_URL)} className="inline-flex items-center gap-1 text-[10px] text-indigo-400 underline-offset-2 hover:underline">
              {t(language, 'googleCalendar', 'guideHelp')}
              <ExternalLink size={10} />
            </button>
          </div>
        )}
      </div>

      <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'googleCalendar', 'readOnly')}</p>
    </div>
  );
}
