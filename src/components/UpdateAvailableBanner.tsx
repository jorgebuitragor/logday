import { Download, Sparkles } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';

// Aviso de nueva versión sin actualización automática (con ella,
// installUpdate arranca solo y el aviso es UpdateRestartBanner). Antes era
// un toast de 6 s: si el usuario no estaba mirando, solo quedaba un punto
// en el ícono de Opciones. Se queda hasta actualizar o "Más tarde", que lo
// esconde para esta versión hasta el próximo arranque.
export function UpdateAvailableBanner() {
  const { language, updateInfo, updateStatus, updateBannerDismissedFor, installUpdate, dismissUpdateBanner, openReleaseNotes } =
    useAppStore();

  if (updateStatus !== 'available' || !updateInfo || updateBannerDismissedFor === updateInfo.version) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[11000] flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] px-4 py-3 shadow-2xl">
        <Sparkles size={14} className="shrink-0 text-indigo-400" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)]">{t(language, 'settings', 'updateBannerTitle')}</p>
          <p className="text-xs text-[var(--text-secondary)]">v{updateInfo.version}</p>
        </div>
        <button
          onClick={dismissUpdateBanner}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
        >
          {t(language, 'settings', 'remindLater')}
        </button>
        <button
          onClick={openReleaseNotes}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs text-indigo-400 transition hover:bg-indigo-500/10"
        >
          {t(language, 'settings', 'viewReleaseNotes')}
        </button>
        <button
          onClick={() => void installUpdate()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white transition hover:bg-indigo-500"
        >
          <Download size={12} />
          {t(language, 'settings', 'installUpdate')}
        </button>
      </div>
    </div>
  );
}
