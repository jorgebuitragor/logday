import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, RefreshCw, Sparkles } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';
import { ModalOverlay } from './shared/ModalOverlay';
import { ModalPanel } from './shared/ModalPanel';

// Novedades de una versión: la disponible (desde UpdateAvailableBanner,
// UpdateRestartBanner o Acerca de) o la recién instalada, al abrirla por
// primera vez (ver showReleaseNotesAfterUpdate en appStore.ts). Las notas
// son el markdown del release (el mensaje del tag anotado, ver
// .github/workflows/release.yml); se renderizan sin HTML crudo.
export function ReleaseNotesModal() {
  const { language, releaseNotes, updateStatus, closeReleaseNotes, installUpdate } = useAppStore();
  if (!releaseNotes) return null;

  const installing = updateStatus === 'downloading';
  const canInstall = releaseNotes.mode === 'available' && (updateStatus === 'available' || installing);

  return (
    <ModalOverlay onClose={closeReleaseNotes} zIndex={11010}>
      <ModalPanel className="flex max-h-[80vh] w-[440px] max-w-[92vw] flex-col rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Sparkles size={16} className="text-indigo-400" />
            {t(language, 'settings', 'releaseNotesTitle')} v{releaseNotes.version}
          </div>
          {releaseNotes.mode === 'installed' && (
            <p className="mt-1 text-xs text-[var(--text-hint)]">{t(language, 'settings', 'releaseNotesInstalledHint')}</p>
          )}
        </div>

        <div className="release-notes min-h-0 flex-1 overflow-y-auto px-5 py-4 text-xs leading-relaxed text-[var(--text-secondary)]">
          {releaseNotes.body?.trim() ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-2">{children}</p>,
                ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-4">{children}</ul>,
                ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-4">{children}</ol>,
                strong: ({ children }) => <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>,
                h1: ({ children }) => <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">{children}</p>,
                h2: ({ children }) => <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">{children}</p>,
                h3: ({ children }) => <p className="mb-1 font-semibold text-[var(--text-primary)]">{children}</p>,
                a: ({ children, href }) => (
                  <a href={href} target="_blank" rel="noreferrer" className="text-indigo-400 underline">
                    {children}
                  </a>
                ),
                code: ({ children }) => <code className="rounded bg-[var(--bg-hover)] px-1 font-mono">{children}</code>,
              }}
            >
              {releaseNotes.body}
            </ReactMarkdown>
          ) : (
            <p className="text-[var(--text-hint)]">{t(language, 'settings', 'releaseNotesEmpty')}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          {canInstall ? (
            <>
              <button
                onClick={closeReleaseNotes}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              >
                {t(language, 'settings', 'remindLater')}
              </button>
              <button
                onClick={() => void installUpdate()}
                disabled={installing}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {installing ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
                {installing ? t(language, 'settings', 'downloadingUpdate') : t(language, 'settings', 'installUpdate')}
              </button>
            </>
          ) : (
            <button
              onClick={closeReleaseNotes}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500"
            >
              {t(language, 'settings', 'gotIt')}
            </button>
          )}
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}
