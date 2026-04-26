import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';

export function ToastViewport() {
  const { toasts, dismissToast, language } = useAppStore(
    useShallow((state) => ({
      toasts: state.toasts,
      dismissToast: state.dismissToast,
      language: state.language,
    })),
  );

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[11000] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertCircle : Info;
        const accentClass = toast.kind === 'success'
          ? 'text-emerald-400 border-emerald-400/20 bg-emerald-500/10'
          : toast.kind === 'error'
            ? 'text-red-400 border-red-400/20 bg-red-500/10'
            : 'text-sky-400 border-sky-400/20 bg-sky-500/10';

        return (
          <div
            key={toast.id}
            className="toast-card pointer-events-auto flex items-start gap-3 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] px-3 py-3 shadow-2xl backdrop-blur-sm"
          >
            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${accentClass}`}>
              <Icon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text-primary)]">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="rounded-lg p-1 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              aria-label={t(language, 'toast', 'dismiss')}
              title={t(language, 'toast', 'dismiss')}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}