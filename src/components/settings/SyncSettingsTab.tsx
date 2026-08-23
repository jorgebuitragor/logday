import { useState } from 'react';
import { Upload, Eye, EyeOff, RefreshCw, CheckCircle2, AlertCircle, CloudOff } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';

// Sin timers de fondo (a diferencia de GitSettingsTab) — no hace
// falta el patrón "active prop, siempre montado". El shell lo monta
// condicionalmente igual que el resto de los tabs simples, así que
// el estado local ya arranca fresco (desde syncConfig) cada vez que
// se entra a este tab.
export function SyncSettingsTab() {
  const {
    syncConfig, syncConnectionStatus, syncErrorMsg,
    syncConnect, syncDisconnect,
    language,
  } = useAppStore();

  const [syncServerUrl, setSyncServerUrl] = useState(syncConfig.serverUrl);
  const [syncEmail, setSyncEmail] = useState(syncConfig.email);
  const [syncPassword, setSyncPassword] = useState('');
  const [showSyncPassword, setShowSyncPassword] = useState(false);

  const handleSyncConnect = async () => {
    try {
      await syncConnect(syncServerUrl.trim(), syncEmail.trim(), syncPassword);
      setSyncPassword('');
    } catch {
      // syncErrorMsg ya queda seteado en el store
    }
  };

  const handleSyncDisconnect = () => {
    syncDisconnect();
    setSyncPassword('');
  };

  const connected = syncConfig.enabled && syncConnectionStatus !== 'disconnected';
  const statusLabel = {
    disconnected: t(language, 'extras', 'syncDisconnected'),
    connecting: t(language, 'extras', 'syncConnecting'),
    connected: t(language, 'extras', 'syncConnected'),
    error: t(language, 'extras', 'syncError'),
  }[syncConnectionStatus];
  const statusIcon = {
    disconnected: <CloudOff size={12} className="text-[var(--text-hint)]" />,
    connecting: <RefreshCw size={12} className="text-amber-400 animate-spin" />,
    connected: <CheckCircle2 size={12} className="text-green-400" />,
    error: <AlertCircle size={12} className="text-red-400" />,
  }[syncConnectionStatus];

  return <>
    {/* Header de sección */}
    <div className="flex items-center gap-2 mb-1">
      <Upload size={14} className="text-indigo-400" />
      <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-hint)]">
        {t(language, 'extras', 'syncTitle')}
      </p>
    </div>
    <p className="text-[10px] text-[var(--text-hint)] -mt-2">
      {t(language, 'extras', 'syncOptionalHint')}
    </p>

    {connected ? (
      <>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
          <div>
            <p className="text-xs font-medium text-[var(--text-secondary)]">{syncConfig.serverUrl}</p>
            <p className="text-[10px] text-[var(--text-hint)]">{syncConfig.email}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {statusIcon}
            <span className="text-[11px] text-[var(--text-secondary)]">{statusLabel}</span>
          </div>
        </div>
        <button
          onClick={handleSyncDisconnect}
          className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] py-2 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)]"
        >
          {t(language, 'extras', 'syncDisconnect')}
        </button>
      </>
    ) : (
      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
            {t(language, 'extras', 'syncServerUrl')}
          </label>
          <input
            type="text"
            value={syncServerUrl}
            onChange={(e) => setSyncServerUrl(e.target.value)}
            placeholder={t(language, 'extras', 'syncServerUrlPlaceholder')}
            className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
            {t(language, 'extras', 'syncEmail')}
          </label>
          <input
            type="email"
            value={syncEmail}
            onChange={(e) => setSyncEmail(e.target.value)}
            placeholder="tu@email.com"
            className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-[var(--text-hint)]">
            {t(language, 'extras', 'syncPassword')}
          </label>
          <div className="relative">
            <input
              type={showSyncPassword ? 'text' : 'password'}
              value={syncPassword}
              onChange={(e) => setSyncPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSyncConnect(); }}
              className="w-full rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 pr-9 text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowSyncPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-2.5 text-[var(--text-hint)] transition hover:text-[var(--text-primary)]"
              title={showSyncPassword ? t(language, 'extras', 'hidePassword') : t(language, 'extras', 'showPassword')}
            >
              {showSyncPassword ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Error */}
    {syncErrorMsg && (
      <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
        <AlertCircle size={13} className="mt-0.5 shrink-0 text-red-400" />
        <p className="flex-1 text-[11px] text-red-400 break-all">{syncErrorMsg}</p>
      </div>
    )}

    {!connected && (
      <div className="pt-1">
        <button
          onClick={handleSyncConnect}
          disabled={syncConnectionStatus === 'connecting' || !syncServerUrl.trim() || !syncEmail.trim() || !syncPassword}
          className="w-full rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {syncConnectionStatus === 'connecting' ? t(language, 'extras', 'syncConnecting') : t(language, 'extras', 'syncConnect')}
        </button>
      </div>
    )}
  </>;
}
