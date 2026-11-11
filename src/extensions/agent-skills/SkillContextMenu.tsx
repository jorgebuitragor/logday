// Menú del clic derecho sobre una skill de la lista (pedido por Jorge el
// 11 nov 2026). Ofrece las mismas acciones que los botones del detalle
// (`skillActions`), más "Mostrar en el Finder", sin tener que elegirla antes.

import { useEffect, useRef } from 'react';
import { FolderOpen } from 'lucide-react';
import { usePositionedMenu } from '../../hooks/usePositionedMenu';
import { FOCUS_RING } from '../../components/shared/controlClasses';
import type { SkillAction } from './actions';
import type { Tr } from './text';
import { isMac } from './text';

export type SkillMenuAnchor = { x: number; y: number };

const ESTIMATED_SIZE = { width: 220, height: 220 };
const ITEM = `flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition ${FOCUS_RING}`;

export function SkillContextMenu({ anchor, name, actions, tr, onReveal, onClose }: {
  anchor: SkillMenuAnchor;
  name: string;
  actions: SkillAction[];
  tr: Tr;
  onReveal: () => void;
  onClose: () => void;
}) {
  const menu = usePositionedMenu(anchor, { estimatedSize: ESTIMATED_SIZE, onClose });
  const panel = useRef<HTMLDivElement | null>(null);

  // El foco entra al menú para poder usarlo con el teclado. Espera a que se
  // vea: oculto (mientras se mide) no se puede enfocar.
  useEffect(() => {
    if (menu.isReady) panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menu.isReady]);

  const items = [...actions.filter((a) => !a.danger), null, ...actions.filter((a) => a.danger)];
  const pick = (fn: () => void) => () => {
    onClose();
    fn();
  };

  // Flechas, Inicio y Fin entre las opciones; Tab cierra (como un menú nativo).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      onClose();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const all = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = all.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : e.key === 'ArrowDown' ? (i + 1) % all.length : (i - 1 + all.length) % all.length;
    all[next]?.focus();
  };

  return (
    <div
      ref={(el) => {
        panel.current = el;
        menu.ref.current = el;
      }}
      role="menu"
      aria-label={tr('contextMenuAria', { name })}
      className="fixed z-50 min-w-[200px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-xl"
      style={menu.style}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onKeyDown}
    >
      {items.map((a, i) =>
        a === null ? (
          <div key={`reveal-${i}`}>
            {actions.some((x) => !x.danger) && <div className="my-1 h-px bg-[var(--border)]" role="separator" />}
            <button type="button" role="menuitem" tabIndex={-1} onClick={pick(onReveal)} className={`${ITEM} text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]`}>
              <FolderOpen size={13} aria-hidden />
              {tr(isMac() ? 'reveal' : 'revealOther')}
            </button>
            {actions.some((x) => x.danger) && <div className="my-1 h-px bg-[var(--border)]" role="separator" />}
          </div>
        ) : (
          <button
            key={a.id}
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={pick(a.onSelect)}
            className={`${ITEM} ${a.danger ? 'text-red-400 hover:bg-red-400/10' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
          >
            <a.icon size={13} aria-hidden />
            {a.label}
          </button>
        ),
      )}
    </div>
  );
}
