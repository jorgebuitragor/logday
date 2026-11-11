// Marco de los modales de la extensión: el fondo y el panel de la app, con
// `role="dialog"`, Escape para cerrar y el foco dentro al abrir.
import { useEffect, useRef, type ReactNode } from 'react';
import { ModalOverlay } from '../../components/shared/ModalOverlay';
import { ModalPanel } from '../../components/shared/ModalPanel';
import { Z_MODAL } from '../../lib/zIndex';

export function SkillModal({
  title,
  onClose,
  wide = false,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
  footer: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    // El primer campo, o el panel.
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-skip-focus])');
    (first ?? ref.current)?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <ModalOverlay zIndex={Z_MODAL}>
      <ModalPanel>
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby="agent-skills-modal-title"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              onClose();
            }
            // Que el foco no se salga del modal con Tab.
            if (e.key === 'Tab' && ref.current) {
              const nodes = Array.from(
                ref.current.querySelectorAll<HTMLElement>('input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])'),
              ).filter((n) => !n.hasAttribute('disabled'));
              if (!nodes.length) return;
              const first = nodes[0];
              const last = nodes[nodes.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }
          }}
          className={`modal-spring-in flex max-h-[85vh] flex-col rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl focus:outline-none ${
            wide ? 'w-[min(960px,92vw)]' : 'w-[min(440px,92vw)]'
          }`}
        >
          <h2 id="agent-skills-modal-title" className="border-b border-[var(--border)] px-5 py-3 text-sm font-semibold text-[var(--text-primary)]">
            {title}
          </h2>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">{footer}</div>
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}
