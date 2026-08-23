import { useEffect, useState } from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { fs, checkUpdate, ReleaseInfo } from '../../lib/invoke';
import { getVersion } from '@tauri-apps/api/app';

export function AboutSettingsTab() {
  const { language } = useAppStore();
  const [appVersion, setAppVersion] = useState<string>('1.0.0');
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'upToDate' | 'available' | 'error'>('idle');
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);

  // Cargar versión de la app
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  async function handleCheckUpdate() {
    setUpdateStatus('checking');
    setReleaseInfo(null);
    try {
      const info = await checkUpdate();
      const latest = info.tag_name.replace(/^v/, '');
      if (latest === appVersion) {
        setUpdateStatus('upToDate');
      } else {
        setReleaseInfo(info);
        setUpdateStatus('available');
      }
    } catch {
      setUpdateStatus('error');
    }
  }

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
      <button
        onClick={handleCheckUpdate}
        disabled={updateStatus === 'checking'}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] px-4 py-2 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCw size={12} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
        {updateStatus === 'checking'
          ? t(language, 'settings', 'checking')
          : t(language, 'settings', 'checkUpdates')}
      </button>
      {updateStatus === 'upToDate' && (
        <p className="text-center text-[10px] text-emerald-400">{t(language, 'settings', 'upToDate')}</p>
      )}
      {updateStatus === 'error' && (
        <p className="text-center text-[10px] text-red-400">{t(language, 'settings', 'checkError')}</p>
      )}
      {updateStatus === 'available' && releaseInfo && (
        <div className="space-y-2">
          <p className="text-center text-[10px] text-indigo-400 font-semibold">
            {t(language, 'settings', 'updateAvailable')}: {releaseInfo.tag_name}
          </p>
          {releaseInfo.body && (
            <p className="text-[10px] text-[var(--text-hint)] line-clamp-3">{releaseInfo.body}</p>
          )}
          <button
            onClick={() => fs.openUrl(releaseInfo.html_url)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-xs text-indigo-400 transition hover:bg-indigo-500/20"
          >
            <ExternalLink size={12} />
            {t(language, 'settings', 'downloadUpdate')} {releaseInfo.tag_name}
          </button>
        </div>
      )}
    </div>
  </div>

  </>;
}
