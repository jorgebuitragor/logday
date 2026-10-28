import { useEffect, useState } from 'react';
import { RefreshCw, Download, ExternalLink, Scale, Sparkles } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { getVersion } from '@tauri-apps/api/app';
import ToggleSwitch from '../shared/ToggleSwitch';
import { fs } from '../../lib/invoke';
import {
  APP_COPYRIGHT, LICENSE_URL, RELEASES_URL, REPO_URL, appUpdatedAt, fetchRelease,
} from '../../lib/releases';

const LINK_CLS = 'inline-flex items-center gap-1 text-[10px] text-indigo-400 underline-offset-2 hover:underline';

function ExternalLinkButton({ url, label }: { url: string; label: string }) {
  return (
    <button type="button" onClick={() => void fs.openUrl(url)} className={LINK_CLS}>
      {label}
      <ExternalLink size={10} />
    </button>
  );
}

export function AboutSettingsTab() {
  const {
    language, updateInfo, updateStatus, autoUpdateEnabled, openReleaseNotes, openCurrentReleaseNotes,
    checkForUpdates, installUpdate, setAutoUpdateEnabled,
  } = useAppStore();
  const [appVersion, setAppVersion] = useState<string>('1.0.0');
  // Fecha de la última actualización: cuándo se instaló esta versión en el
  // equipo, o, si no se sabe (instalada antes de guardarlo), cuándo se
  // publicó el release.
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const [notesError, setNotesError] = useState(false);
  // Estado propio del botón manual — separado de `updateStatus` (global,
  // dirige el aviso/instalación en el resto de la app) porque acá sí
  // hace falta distinguir "ya estás al día" de "falló el chequeo", algo
  // que el chequeo en segundo plano ignora a propósito (ver
  // specs/actualizaciones-automaticas/requirements.md "Chequeo").
  const [manualCheck, setManualCheck] = useState<'idle' | 'checking' | 'upToDate' | 'error'>('idle');

  useEffect(() => {
    let alive = true;
    getVersion()
      .then(async (version) => {
        if (!alive) return;
        setAppVersion(version);
        const local = appUpdatedAt(version);
        if (local) { setUpdatedAt(local); return; }
        const release = await fetchRelease(version);
        if (alive && release?.publishedAt) setUpdatedAt(release.publishedAt);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function handleCurrentNotes() {
    setNotesError(false);
    if (!(await openCurrentReleaseNotes())) setNotesError(true);
  }

  const locale = language === 'en' ? 'en-US' : 'es-CO';
  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  async function handleCheckUpdate() {
    setManualCheck('checking');
    try {
      const found = await checkForUpdates();
      setManualCheck(found ? 'idle' : 'upToDate');
    } catch {
      setManualCheck('error');
    }
  }

  const hasUpdate = updateStatus === 'available' || updateStatus === 'downloading';

  return <>

  {/* Updates section */}
  <div>
    <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
      {t(language, 'settings', 'updates')}
    </p>
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'currentVersion')}</span>
        <span className="text-xs font-mono font-semibold text-[var(--text-secondary)]">v{appVersion}</span>
      </div>
      {updatedLabel && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--text-hint)]">{t(language, 'settings', 'lastUpdated')}</span>
          <span className="text-xs text-[var(--text-secondary)]">{updatedLabel}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void handleCurrentNotes()}
          className="inline-flex items-center gap-1.5 text-[10px] text-indigo-400 underline-offset-2 hover:underline"
        >
          <Sparkles size={11} />
          {t(language, 'settings', 'viewCurrentReleaseNotes')}
        </button>
        <ExternalLinkButton url={RELEASES_URL} label={t(language, 'settings', 'releaseHistory')} />
      </div>
      {notesError && (
        <p className="text-[10px] text-red-400">{t(language, 'settings', 'releaseNotesError')}</p>
      )}

      {hasUpdate && updateInfo ? (
        <div className="space-y-2">
          <p className="text-center text-[10px] text-indigo-400 font-semibold">
            {t(language, 'settings', 'updateAvailable')}: v{updateInfo.version}
          </p>
          <button
            onClick={openReleaseNotes}
            className="w-full text-center text-[10px] text-indigo-400 underline-offset-2 hover:underline"
          >
            {t(language, 'settings', 'viewReleaseNotes')}
          </button>
          <button
            onClick={() => void installUpdate()}
            disabled={updateStatus === 'downloading'}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-xs text-indigo-400 transition hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateStatus === 'downloading'
              ? <RefreshCw size={12} className="animate-spin" />
              : <Download size={12} />}
            {updateStatus === 'downloading'
              ? t(language, 'settings', 'downloadingUpdate')
              : t(language, 'settings', 'installUpdate')}
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={handleCheckUpdate}
            disabled={manualCheck === 'checking'}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] px-4 py-2 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={12} className={manualCheck === 'checking' ? 'animate-spin' : ''} />
            {manualCheck === 'checking'
              ? t(language, 'settings', 'checking')
              : t(language, 'settings', 'checkUpdates')}
          </button>
          {manualCheck === 'upToDate' && (
            <p className="text-center text-[10px] text-emerald-400">{t(language, 'settings', 'upToDate')}</p>
          )}
          {manualCheck === 'error' && (
            <p className="text-center text-[10px] text-red-400">{t(language, 'settings', 'checkError')}</p>
          )}
        </>
      )}

      <label className="flex items-center justify-between gap-3 border-t border-[var(--border-card)] pt-3">
        <span className="text-[10px] text-[var(--text-hint)]">
          {t(language, 'settings', 'autoUpdateLabel')}
          <span className="mt-0.5 block text-[9px] text-[var(--text-faint)]">
            {t(language, 'settings', 'autoUpdateHint')}
          </span>
        </span>
        <ToggleSwitch checked={autoUpdateEnabled} onChange={setAutoUpdateEnabled} />
      </label>
    </div>
  </div>

  {/* License section */}
  <div>
    <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
      {t(language, 'settings', 'licenseSection')}
    </p>
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <Scale size={13} className="shrink-0 text-[var(--text-hint)]" />
        <span className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'settings', 'licenseName')}</span>
      </div>
      <p className="text-[10px] leading-relaxed text-[var(--text-hint)]">{t(language, 'settings', 'licenseText')}</p>
      <p className="text-[10px] text-[var(--text-secondary)]">{APP_COPYRIGHT}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--border-card)] pt-2">
        <ExternalLinkButton url={LICENSE_URL} label={t(language, 'settings', 'viewLicense')} />
        <ExternalLinkButton url={REPO_URL} label={t(language, 'settings', 'sourceCode')} />
      </div>
    </div>
  </div>

  </>;
}
