// Las piezas flotantes del menú de secciones (specs/navegacion-secciones,
// design §3-5): el tooltip propio, el menú "Más" y el clic derecho.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, EyeOff, Pin, SlidersHorizontal } from 'lucide-react';
import { usePositionedMenu } from '../../hooks/usePositionedMenu';
import type { AnchorRect } from '../../lib/menuPosition';
import { t } from '../../lib/i18n';
import type { Language } from '../../types/common';
import { FOCUS_RING } from '../shared/controlClasses';
import { shortcutLabel } from './sectionOrder';
import { IS_MAC, type SectionItem } from './sections';

const TOOLTIP_DELAY_MS = 300;
export const SECTION_TOOLTIP_ID = 'section-nav-tooltip';

export interface TooltipState {
  id: string;
  label: string;
  shortcut?: string;
  rect: AnchorRect;
}

export interface TooltipHandlers {
  'aria-describedby'?: string;
  onPointerEnter?: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerLeave?: () => void;
  onFocus?: (e: React.FocusEvent<HTMLElement>) => void;
  onBlur?: () => void;
  onPointerDown?: () => void;
}

/** NS16: el tooltip de los botones de la columna. Con el puntero, a los
 *  300 ms; con el foco del teclado, enseguida. Se va al salir o con Esc. */
export function useNavTooltip(enabled: boolean) {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const hide = () => {
    window.clearTimeout(timer.current);
    setTip(null);
  };
  const showFor = (el: HTMLElement, item: { id: string; label: string; shortcut?: string }) => {
    const r = el.getBoundingClientRect();
    setTip({ id: item.id, label: item.label, shortcut: item.shortcut, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } });
  };
  const bind = (item: { id: string; label: string; shortcut?: string }): TooltipHandlers => {
    if (!enabled) return {};
    return {
      'aria-describedby': tip?.id === item.id ? SECTION_TOOLTIP_ID : undefined,
      onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
        const el = e.currentTarget;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => showFor(el, item), TOOLTIP_DELAY_MS);
      },
      onPointerLeave: hide,
      onFocus: (e: React.FocusEvent<HTMLElement>) => {
        if (e.currentTarget.matches(':focus-visible')) showFor(e.currentTarget, item);
      },
      onBlur: hide,
      onPointerDown: hide,
    };
  };
  return { tip, hide, bind };
}

export function NavTooltip({ tip }: { tip: TooltipState | null }) {
  if (!tip) return null;
  return (
    <div
      id={SECTION_TOOLTIP_ID}
      role="tooltip"
      className="pointer-events-none fixed z-50 flex items-center gap-2 whitespace-nowrap rounded-md border border-[var(--border-card)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] text-[var(--text-primary)] shadow-lg"
      style={{ left: tip.rect.right + 8, top: (tip.rect.top + tip.rect.bottom) / 2, transform: 'translateY(-50%)' }}
    >
      <span>{tip.label}</span>
      {tip.shortcut && <span className="text-[var(--text-hint)]">{shortcutLabel(tip.shortcut, IS_MAC)}</span>}
    </div>
  );
}

const MENU_ITEM = `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${FOCUS_RING}`;

/** Recorre los `menuitem` de un menú con ↑/↓, Inicio y Fin (NS18). */
function moveMenuFocus(menu: HTMLElement | null, key: string): boolean {
  if (!menu) return false;
  const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')];
  if (items.length === 0) return false;
  const i = items.indexOf(document.activeElement as HTMLElement);
  let next: number | null = null;
  if (key === 'ArrowDown') next = i < 0 ? 0 : Math.min(items.length - 1, i + 1);
  else if (key === 'ArrowUp') next = i < 0 ? items.length - 1 : Math.max(0, i - 1);
  else if (key === 'Home') next = 0;
  else if (key === 'End') next = items.length - 1;
  if (next === null) return false;
  items[next].focus();
  return true;
}

/** En la columna, "Más" se abre a la derecha del botón; en la Lista,
 *  debajo (o encima, si no cabe). */
export function moreMenuAnchor(r: AnchorRect, variant: 'icons' | 'list'): AnchorRect {
  if (variant === 'icons') return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  return { left: r.left - 4, right: r.left - 4, top: r.bottom + 2, bottom: r.top - 2 };
}

interface MoreMenuProps {
  /** Ya ubicado por `moreMenuAnchor`. */
  anchor: AnchorRect | null;
  items: SectionItem[];
  activeSection: string;
  language: Language;
  onSelect: (id: SectionItem['id']) => void;
  /** `returnFocus`: con Esc, el foco vuelve al botón "Más". */
  onClose: (returnFocus: boolean) => void;
  onItemContextMenu: (e: React.MouseEvent, item: SectionItem) => void;
  onArrange: () => void;
}

/** NS12, NS13, NS18: el menú de "Más", con las secciones que no caben y
 *  las ocultas, y "Ordenar secciones…" al final. */
export function SectionMoreMenu({ anchor, items, activeSection, language, onSelect, onClose, onItemContextMenu, onArrange }: MoreMenuProps) {
  const layout = usePositionedMenu(anchor, {
    estimatedSize: { width: 200, height: 40 + items.length * 30 },
    onClose: () => onClose(false),
    closeOnEscape: false,
  });

  // Al abrir, el foco va a la activa (si está dentro) o a la primera.
  // Espera a que el menú esté ubicado: hasta entonces está oculto
  // (`visibility: hidden`) y no puede recibir el foco.
  const focusedFor = useRef<AnchorRect | null>(null);
  useEffect(() => {
    if (!anchor) {
      focusedFor.current = null;
      return;
    }
    if (!layout.isReady || focusedFor.current === anchor) return;
    focusedFor.current = anchor;
    const menu = layout.ref.current;
    const active = menu?.querySelector<HTMLElement>('[aria-current="page"]');
    (active ?? menu?.querySelector<HTMLElement>('[role="menuitem"]'))?.focus();
  }, [anchor, layout.isReady, layout.ref]);

  if (!anchor) return null;
  return (
    <div
      ref={layout.ref}
      role="menu"
      aria-label={t(language, 'sectionNav', 'moreLabel')}
      className="z-50 min-w-44 rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-1 shadow-xl"
      style={layout.style}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose(true);
        } else if (e.key === 'Tab') {
          onClose(false);
        } else if (moveMenuFocus(layout.ref.current, e.key)) {
          e.preventDefault();
        }
      }}
    >
      {items.map((item) => {
        const isActive = item.id === activeSection;
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
            onContextMenu={(e) => onItemContextMenu(e, item)}
            className={`${MENU_ITEM} ${
              isActive
                ? 'bg-indigo-500/15 font-medium text-indigo-400'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <item.Icon size={14} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.shortcut && (
              <span className="ml-3 text-[10px] text-[var(--text-hint)]">{shortcutLabel(item.shortcut, IS_MAC)}</span>
            )}
          </button>
        );
      })}
      <div className="my-1 h-px bg-[var(--border)]" role="separator" />
      <button type="button" role="menuitem" tabIndex={-1} onClick={onArrange} className={`${MENU_ITEM} text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]`}>
        <SlidersHorizontal size={14} className="shrink-0" />
        <span>{t(language, 'sectionNav', 'orderEllipsis')}</span>
      </button>
    </div>
  );
}

export interface SectionCtx {
  item: SectionItem;
  x: number;
  y: number;
  canUp: boolean;
  canDown: boolean;
}

/** NS10: el clic derecho sobre una sección. */
export function SectionContextMenu({ ctx, language, onClose, onToggleHidden, onMove }: {
  ctx: SectionCtx | null;
  language: Language;
  onClose: () => void;
  onToggleHidden: (item: SectionItem) => void;
  onMove: (item: SectionItem, delta: -1 | 1) => void;
}) {
  const layout = usePositionedMenu(ctx, { estimatedSize: { width: 190, height: 110 }, onClose });
  if (!ctx) return null;
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const cls = `${MENU_ITEM} text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`;
  return (
    <div ref={layout.ref} role="menu" className="z-50 min-w-44 rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-1 shadow-xl" style={layout.style}>
      <button type="button" role="menuitem" className={cls} onClick={run(() => onToggleHidden(ctx.item))}>
        {ctx.item.hidden ? <Pin size={13} /> : <EyeOff size={13} />}
        {t(language, 'sectionNav', ctx.item.hidden ? 'pin' : 'remove')}
      </button>
      <button type="button" role="menuitem" className={cls} disabled={!ctx.canUp} onClick={run(() => onMove(ctx.item, -1))}>
        <ChevronUp size={13} />
        {t(language, 'sectionNav', 'moveUp')}
      </button>
      <button type="button" role="menuitem" className={cls} disabled={!ctx.canDown} onClick={run(() => onMove(ctx.item, 1))}>
        <ChevronDown size={13} />
        {t(language, 'sectionNav', 'moveDown')}
      </button>
    </div>
  );
}
