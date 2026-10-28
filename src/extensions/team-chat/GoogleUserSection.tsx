import { useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CheckCircle2, KeyRound, Link2, LogIn, LogOut, ShieldAlert } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { nowInstant } from '../../lib/localDate';
import { setExtensionSecret } from '../secrets';
import { connectGoogle, disconnectGoogle, parseSpaceLink } from './api';
import { chatErrorMessage, GOOGLE_CLIENT_SECRET_KEY, TEAM_CHAT_ID, type GoogleUserSettings } from './model';
import { GoogleSetupGuide } from './SetupGuide';

const INPUT_CLS =
  'min-w-0 flex-1 rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none';
const PRIMARY_CLS =
  'flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_CLS =
  'flex items-center gap-1.5 rounded-lg border border-[var(--border-card)] px-3 py-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50';

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

/** "Como yo" en Google Chat (specs/chat-como-usuario): aviso, cliente
 *  OAuth de la organización, cuenta y espacio. */
export function GoogleUserSection({
  google, saveGoogle, onError, onBackToBot,
}: {
  google: GoogleUserSettings | undefined;
  saveGoogle: (patch: Partial<Record<keyof GoogleUserSettings, string | undefined>>) => Promise<void>;
  onError: (message: string | null) => void;
  onBackToBot: () => void;
}) {
  const { language, showToast } = useAppStore(useShallow((s) => ({ language: s.language, showToast: s.showToast })));
  const [clientId, setClientId] = useState(google?.clientId ?? '');
  const [secret, setSecret] = useState('');
  const [editingClient, setEditingClient] = useState(!google?.clientId || !google.secretHint);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState<'client' | 'connect' | 'disconnect' | 'space' | null>(null);

  const hasClient = !!google?.clientId && !!google.secretHint;

  // C7: aviso propio, antes de pedir nada más.
  if (!google?.consentAt) {
    return (
      <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3">
        <p className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
          <ShieldAlert size={13} className="shrink-0 text-amber-400" />
          {t(language, 'teamChat', 'asUserConsentTitle')}
        </p>
        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{t(language, 'teamChat', 'asUserConsent')}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onBackToBot} className={SECONDARY_CLS}>{t(language, 'teamChat', 'asUserConsentCancel')}</button>
          <button type="button" onClick={() => void saveGoogle({ consentAt: nowInstant() })} className={PRIMARY_CLS}>
            {t(language, 'teamChat', 'asUserConsentAccept')}
          </button>
        </div>
      </div>
    );
  }

  const saveClient = async () => {
    onError(null);
    const id = clientId.trim();
    if (!id || !secret.trim()) return;
    setBusy('client');
    try {
      // Con otro cliente, el token de la cuenta conectada ya no sirve.
      if (google.account && id !== google.clientId) await disconnectGoogle().catch(() => {});
      const secretHint = await setExtensionSecret(TEAM_CHAT_ID, GOOGLE_CLIENT_SECRET_KEY, secret.trim());
      await saveGoogle({ clientId: id, secretHint, ...(id !== google.clientId ? { account: undefined } : {}) });
      setSecret('');
      setEditingClient(false);
    } catch (err) {
      onError(chatErrorMessage(language, { code: typeof err === 'string' ? err : 'keychain_error' }));
    } finally {
      setBusy(null);
    }
  };

  const connect = async () => {
    onError(null);
    if (!google.clientId) return;
    setBusy('connect');
    try {
      const res = await connectGoogle(google.clientId);
      if ('error' in res) {
        onError(chatErrorMessage(language, res.error));
        return;
      }
      await saveGoogle({ account: res.account || '—' });
      showToast({ kind: 'success', title: t(language, 'teamChat', 'asUserConnected'), description: res.account });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    onError(null);
    setBusy('disconnect');
    try {
      await disconnectGoogle();
      await saveGoogle({ account: undefined });
    } catch (err) {
      onError(chatErrorMessage(language, { code: typeof err === 'string' ? err : 'keychain_error' }));
    } finally {
      setBusy(null);
    }
  };

  const saveSpace = async () => {
    onError(null);
    const pasted = link.trim();
    if (!pasted) return;
    setBusy('space');
    try {
      const res = await parseSpaceLink(pasted);
      if ('error' in res) {
        onError(chatErrorMessage(language, res.error));
        return;
      }
      await saveGoogle({ space: res.space, spaceLink: pasted });
      setLink('');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <Step n={1} title={t(language, 'teamChat', 'asUserClientStep')} done={hasClient}>
        {hasClient && !editingClient ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="flex min-w-0 items-center gap-1.5 text-[var(--text-secondary)]">
              <KeyRound size={12} className="shrink-0 text-[var(--text-hint)]" />
              <span className="truncate font-mono">{google.clientId}</span>
              <span className="shrink-0 font-mono text-[var(--text-hint)]">· {google.secretHint}</span>
            </span>
            <button type="button" onClick={() => setEditingClient(true)} className="text-[11px] text-indigo-400 hover:underline">
              {t(language, 'teamChat', 'asUserClientChange')}
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <input
              aria-label={t(language, 'teamChat', 'asUserClientId')}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder={t(language, 'teamChat', 'asUserClientIdPlaceholder')}
              className={`${INPUT_CLS} w-full`}
            />
            <div className="flex gap-2">
              <input
                aria-label={t(language, 'teamChat', 'asUserClientSecret')}
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void saveClient(); }}
                spellCheck={false}
                autoComplete="off"
                placeholder={t(language, 'teamChat', 'asUserClientSecretPlaceholder')}
                className={INPUT_CLS}
              />
              <button type="button" onClick={() => void saveClient()} disabled={busy !== null || !clientId.trim() || !secret.trim()} className={PRIMARY_CLS}>
                {t(language, 'teamChat', 'save')}
              </button>
            </div>
            <p className="text-[10px] leading-relaxed text-[var(--text-hint)]">{t(language, 'teamChat', 'asUserClientHelp')}</p>
          </div>
        )}
      </Step>

      <Step n={2} title={t(language, 'teamChat', 'asUserAccountStep')} done={!!google.account}>
        {google.account ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="text-[var(--text-secondary)]">
              {t(language, 'teamChat', 'asUserConnectedAs')} <span className="font-medium text-[var(--text-primary)]">{google.account}</span>
            </span>
            <button type="button" onClick={() => void disconnect()} disabled={busy !== null} className={SECONDARY_CLS}>
              <LogOut size={12} />
              {t(language, 'teamChat', 'asUserDisconnect')}
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <button type="button" onClick={() => void connect()} disabled={busy !== null || !hasClient} className={PRIMARY_CLS}>
              <LogIn size={12} />
              {busy === 'connect' ? t(language, 'teamChat', 'asUserWaiting') : t(language, 'teamChat', 'asUserConnect')}
            </button>
            {busy === 'connect' && <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'teamChat', 'asUserWaitingHint')}</p>}
          </div>
        )}
      </Step>

      <Step n={3} title={t(language, 'teamChat', 'asUserSpaceStep')} done={!!google.space}>
        <div className="space-y-1.5">
          {google.spaceLink && (
            <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
              <Link2 size={12} className="shrink-0 text-[var(--text-hint)]" />
              <span className="truncate font-mono">{google.spaceLink}</span>
            </p>
          )}
          <div className="flex gap-2">
            <input
              aria-label={t(language, 'teamChat', 'asUserSpaceStep')}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void saveSpace(); }}
              spellCheck={false}
              autoComplete="off"
              placeholder={t(language, 'teamChat', google.space ? 'asUserSpaceReplace' : 'asUserSpacePlaceholder')}
              className={INPUT_CLS}
            />
            <button type="button" onClick={() => void saveSpace()} disabled={busy !== null || !link.trim()} className={PRIMARY_CLS}>
              {t(language, 'teamChat', 'save')}
            </button>
          </div>
        </div>
      </Step>

      <GoogleSetupGuide defaultOpen={!hasClient || !google.account || !google.space} />
    </div>
  );
}
