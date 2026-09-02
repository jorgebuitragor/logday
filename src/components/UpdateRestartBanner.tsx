import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { relaunch } from '@tauri-apps/plugin-process';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';

// Solo se monta cuando updateStatus === 'ready' (ver appStore.ts
// installUpdate/postponeUpdateRestart) — la actualización automática
// (opt-in) nunca reinicia sin avisar, ver
// specs/actualizaciones-automaticas/requirements.md "Actualización
// automática". La instalación manual ("Actualizar ahora" en Ajustes)
// no pasa por acá — reinicia directo, el usuario ya lo pidió.
export function UpdateRestartBanner() {
  const { language, updateStatus, updateRestartAt, postponeUpdateRestart } = useAppStore();
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (updateStatus !== 'ready' || !updateRestartAt) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((updateRestartAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) void relaunch();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [updateStatus, updateRestartAt]);

  if (updateStatus !== 'ready' || !updateRestartAt) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[11000] flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] px-4 py-3 shadow-2xl">
        <RefreshCw size={14} className="shrink-0 text-indigo-400" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {t(language, 'settings', 'restartReadyTitle')}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            {t(language, 'settings', 'restartInPrefix')} {secondsLeft}s
          </p>
        </div>
        <button
          onClick={postponeUpdateRestart}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
        >
          {t(language, 'settings', 'postponeRestart')}
        </button>
        <button
          onClick={() => void relaunch()}
          className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white transition hover:bg-indigo-500"
        >
          {t(language, 'settings', 'restartNow')}
        </button>
      </div>
    </div>
  );
}
