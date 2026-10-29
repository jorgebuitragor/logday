import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, CheckCircle2, ChevronDown, Download, Lightbulb, LogIn, LogOut } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import ToggleSwitch from '../../components/shared/ToggleSwitch';
import { importFromGranola } from './importer';
import { GRANOLA_ID, readGranolaSettings } from './model';

const PRIMARY_CLS =
  'flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_CLS =
  'flex items-center gap-1.5 rounded-lg border border-[var(--border-card)] px-3 py-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50';

const KNOWN_ERRORS = new Set([
  'needs_reconnect', 'registration_error', 'token_error', 'cancelled', 'state_mismatch', 'timeout', 'network',
  'browser_error', 'server_error', 'provider_error', 'rate_limited', 'tool_error', 'unexpected_format', 'keychain_error',
]);

type Key = Parameters<typeof t<'granola'>>[2];
const GUIDE: Key[] = ['guide1', 'guide2', 'guide3', 'guide4'];

function errorText(language: 'es' | 'en', code: string | undefined): string {
  const c = code && KNOWN_ERRORS.has(code) ? code : 'unknown';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return t(language, 'granola', `err_${c}` as any);
}

/** Panel de Granola en Opciones (specs/granola). */
export default function GranolaSettings() {
  const { language, raw, update, showToast } = useAppStore(
    useShallow((s) => ({ language: s.language, raw: s.extensions[GRANOLA_ID]?.settings, update: s.updateExtensionSettings, showToast: s.showToast })),
  );
  const settings = readGranolaSettings(raw);
  const [busy, setBusy] = useState<'connect' | 'disconnect' | 'import' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState(settings.folder);
  const [guideOpen, setGuideOpen] = useState(!settings.account);
  const locale = language === 'en' ? 'en-US' : 'es-CO';

  const connect = async () => {
    setError(null);
    setBusy('connect');
    try {
      const account = await invoke<string>('granola_connect');
      await update(GRANOLA_ID, { account: account || '—' });
      showToast({ kind: 'success', title: t(language, 'granola', 'connected'), description: account });
    } catch (err) {
      setError(errorText(language, typeof err === 'string' ? err : undefined));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setError(null);
    setBusy('disconnect');
    try {
      await invoke('granola_disconnect');
      await update(GRANOLA_ID, { account: '' });
    } catch (err) {
      setError(errorText(language, typeof err === 'string' ? err : undefined));
    } finally {
      setBusy(null);
    }
  };

  const importNow = async () => {
    setError(null);
    setBusy('import');
    try {
      const created = await importFromGranola();
      showToast({
        kind: 'success',
        title: created ? `${created} ${t(language, 'granola', created === 1 ? 'importedOne' : 'importedMany')}` : t(language, 'granola', 'nothingNew'),
      });
    } catch {
      // El detalle queda en settings.last y se muestra abajo.
    } finally {
      setBusy(null);
    }
  };

  // Un nombre simple: la carpeta se crea en la raíz de las notas.
  const saveFolder = () => {
    const name = folder.trim().replace(/[\\/]/g, '-');
    if (!name || name === settings.folder) { setFolder(settings.folder); return; }
    setFolder(name);
    void update(GRANOLA_ID, { folder: name });
  };

  const last = settings.last;

  return (
    <div className="space-y-3 text-xs">
      {settings.account ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="text-[var(--text-secondary)]">
            {t(language, 'granola', 'connectedAs')} <span className="font-medium text-[var(--text-primary)]">{settings.account}</span>
          </span>
          <button type="button" onClick={() => void disconnect()} disabled={busy !== null} className={SECONDARY_CLS}>
            <LogOut size={12} />
            {t(language, 'granola', 'disconnect')}
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          <button type="button" onClick={() => void connect()} disabled={busy !== null} className={PRIMARY_CLS}>
            <LogIn size={12} />
            {busy === 'connect' ? t(language, 'granola', 'waiting') : t(language, 'granola', 'connect')}
          </button>
          {busy === 'connect' && <p className="text-[10px] text-[var(--text-hint)]">{t(language, 'granola', 'waitingHint')}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="granola-folder" className="w-28 shrink-0 text-[var(--text-secondary)]">{t(language, 'granola', 'folder')}</label>
        <input
          id="granola-folder"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          onBlur={saveFolder}
          onKeyDown={(e) => { if (e.key === 'Enter') saveFolder(); }}
          className="w-40 rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[var(--text-secondary)]">{t(language, 'granola', 'auto')}</p>
          <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'granola', 'autoDesc')}</p>
        </div>
        <ToggleSwitch checked={settings.auto} onChange={(v) => void update(GRANOLA_ID, { auto: v })} />
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <div className="min-w-0 text-[11px]">
          <span className="text-[var(--text-hint)]">{t(language, 'granola', 'lastResult')}: </span>
          {last ? (
            <span className={last.status === 'ok' ? 'text-emerald-400' : 'text-red-400'}>
              {last.status === 'ok' ? <CheckCircle2 size={11} className="mr-1 inline" /> : <AlertCircle size={11} className="mr-1 inline" />}
              {last.status === 'ok'
                ? `${last.created ?? 0} ${t(language, 'granola', (last.created ?? 0) === 1 ? 'importedOne' : 'importedMany')}`
                : errorText(language, last.error)}
              <span className="text-[var(--text-hint)]"> · {new Date(last.at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </span>
          ) : (
            <span className="text-[var(--text-hint)]">{t(language, 'granola', 'lastNever')}</span>
          )}
        </div>
        <button type="button" onClick={() => void importNow()} disabled={!settings.account || busy !== null} className={SECONDARY_CLS}>
          <Download size={12} className={busy === 'import' ? 'animate-pulse' : ''} />
          {busy === 'import' ? t(language, 'granola', 'importing') : t(language, 'granola', 'importNow')}
        </button>
      </div>

      <div className="rounded-lg border border-[var(--border-card)]">
        <button
          type="button"
          onClick={() => setGuideOpen((v) => !v)}
          aria-expanded={guideOpen}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
        >
          {t(language, 'granola', 'guideTitle')}
          <ChevronDown size={12} className={`shrink-0 transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
        </button>
        {guideOpen && (
          <div className="space-y-3 border-t border-[var(--border-card)] px-3 py-3">
            <ol className="list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {GUIDE.map((k) => <li key={k}>{t(language, 'granola', k)}</li>)}
            </ol>
            {(['guideTipFree', 'guideTipOnce'] as const).map((k) => (
              <p key={k} className="flex gap-1.5 rounded-lg bg-[var(--bg-hover)] px-3 py-2 text-[10px] leading-relaxed text-[var(--text-hint)]">
                <Lightbulb size={11} className="mt-0.5 shrink-0 text-amber-400" />
                <span>{t(language, 'granola', k)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
