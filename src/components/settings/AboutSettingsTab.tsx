import { useEffect, useState } from 'react';
import { RefreshCw, Download } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { getVersion } from '@tauri-apps/api/app';
import ToggleSwitch from '../shared/ToggleSwitch';

export function AboutSettingsTab() {
  const {
    language, updateInfo, updateStatus, autoUpdateEnabled,
    checkForUpdates, installUpdate, setAutoUpdateEnabled,
  } = useAppStore();
  const [appVersion, setAppVersion] = useState<string>('1.0.0');
  // Estado propio del botón manual — separado de `updateStatus` (global,
  // dirige el aviso/instalación en el resto de la app) porque acá sí
  // hace falta distinguir "ya estás al día" de "falló el chequeo", algo
  // que el chequeo en segundo plano ignora a propósito (ver
  // specs/actualizaciones-automaticas/requirements.md "Chequeo").
  const [manualCheck, setManualCheck] = useState<'idle' | 'checking' | 'upToDate' | 'error'>('idle');

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

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

      {hasUpdate && updateInfo ? (
        <div className="space-y-2">
          <p className="text-center text-[10px] text-indigo-400 font-semibold">
            {t(language, 'settings', 'updateAvailable')}: v{updateInfo.version}
          </p>
          {updateInfo.body && (
            <p className="text-[10px] text-[var(--text-hint)] line-clamp-3">{updateInfo.body}</p>
          )}
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

  </>;
}
