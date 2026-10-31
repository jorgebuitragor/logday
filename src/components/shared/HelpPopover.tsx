// Ayuda contextual (specs/ayuda-contextual): la ayuda breve de la pantalla
// en un popover. Es la única pieza de ayuda: `useHelpPopover` le da el
// estado, el teclado y el foco a cualquier disparador (hoy, el botón
// "Ayuda" del menú lateral, `components/help/SidebarHelp.tsx`), y las
// pantallas y extensiones solo ponen sus textos ya traducidos.
import {
  Fragment, useCallback, useEffect, useId, useRef, useState,
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref, type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { X, type LucideIcon } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { interpolate } from '../../lib/interpolate';
import { Z_MODAL_NESTED } from '../../lib/zIndex';
import type { AnchorRect } from '../../lib/menuPosition';
import { usePositionedMenu } from '../../hooks/usePositionedMenu';
import { TourModal } from '../tour/TourModal';
import { ICON_BTN, KBD, PANEL_TITLE, TEXT_LINK } from './controlClasses';
import { closeOnEscape, helpAnchor, nextTrapIndex, passesToApp, scrollCloses } from './helpKeyboard';

export interface HelpAction {
  label: string;
  onClick: () => void;
}

/** Lo que muestra una ayuda. */
export interface HelpContent {
  /** El nombre de la pantalla, para "Ayuda: {screen}". */
  screen: string;
  title: string;
  intro?: string;
  /** La escena de `TourModal` de "Ver el recorrido" (0 Tu día, 1 Tareas…). */
  tourScene?: number;
  actions?: HelpAction[];
  body: ReactNode;
}

/** Lo que el disparador pone en su botón: nombre, ARIA y clic. */
export interface HelpTriggerProps {
  ref: RefObject<HTMLButtonElement | null>;
  type: 'button';
  'aria-label': string;
  'aria-haspopup': 'dialog';
  'aria-expanded': boolean;
  'aria-controls': string;
  onMouseDown: () => void;
  onClick: () => void;
}

/** El atributo del contenedor a cuya derecha se abre la ayuda (el menú
 *  lateral). */
export const HELP_EDGE_ATTR = 'data-help-edge';

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
const ESTIMATED_SIZE = { width: 320, height: 360 };
// A la derecha del menú, alineada por abajo con el botón, que está al pie
// (AY28). Si no cabe, menuPosition la voltea o la ajusta a la ventana.
const ANCHOR_OPTIONS = { sideX: 'right' as const, alignY: 'end' as const, gap: 8 };

/** Dónde abrir la ayuda de este botón: a la derecha del contenedor marcado
 *  con `HELP_EDGE_ATTR`, o en la esquina si el botón no se ve. */
function anchorFor(button: HTMLElement | null): AnchorRect {
  const shown = button && button.getClientRects().length > 0 ? button.getBoundingClientRect() : null;
  const edge = button?.closest(`[${HELP_EDGE_ATTR}]`)?.getBoundingClientRect().right ?? null;
  return helpAnchor(shown, edge, window.innerHeight);
}

/** El estado, el teclado y el foco de una ayuda (AY3, AY5–AY10), para el
 *  disparador que sea. Devuelve las props de su botón y el popover, que va
 *  en un portal a `document.body` con `Z_MODAL_NESTED` para quedar por
 *  encima de Opciones. */
export function useHelpPopover(content: HelpContent) {
  const language = useAppStore((s) => s.language);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Al abrirla con el atajo (⌘/), el foco vuelve adonde estaba (un campo,
  // una nota), no al botón del menú.
  const returnFocus = useRef<HTMLElement | null>(null);
  // El `mousedown` del propio botón no cuenta como "fuera": si no, la ayuda
  // se cerraría y el clic la volvería a abrir.
  const pressingButton = useRef(false);
  const baseId = useId();
  const popoverId = `${baseId}help`;
  const open = anchor !== null;

  const focusBack = useCallback((options?: FocusOptions) => {
    const target = returnFocus.current?.isConnected ? returnFocus.current : buttonRef.current;
    returnFocus.current = null;
    target?.focus(options);
  }, []);

  const close = useCallback((refocus: boolean) => {
    setAnchor(null);
    if (refocus) focusBack();
    else returnFocus.current = null;
  }, [focusBack]);

  const { ref: popoverRef, style, isReady } = usePositionedMenu(anchor, {
    estimatedSize: ESTIMATED_SIZE,
    closeOnEscape: false,
    anchorOptions: ANCHOR_OPTIONS,
    // El hook guarda esta función al abrir: solo usa refs y setters.
    onClose: () => {
      if (pressingButton.current) return;
      closeFromOutside();
    },
  });

  // Clic fuera o desplazamiento: si el foco estaba dentro, vuelve, salvo
  // que el clic lo haya llevado a otro control. Sin desplazar la vista.
  const closeFromOutside = () => {
    const wasInside = !!popoverRef.current?.contains(document.activeElement);
    setAnchor(null);
    if (!wasInside) {
      returnFocus.current = null;
      return;
    }
    window.setTimeout(() => {
      const active = document.activeElement;
      if (!active || active === document.body) focusBack({ preventScroll: true });
      else returnFocus.current = null;
    }, 0);
  };

  // AY7: el foco va al contenedor cuando ya es visible (antes de medirlo,
  // el hook lo deja con `visibility: hidden` y no puede tomar el foco).
  useEffect(() => {
    if (open && isReady) popoverRef.current?.focus({ preventScroll: true });
  }, [open, isReady, popoverRef]);

  // AY8: Esc en captura, para cerrar solo la ayuda aunque esté en Opciones.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => void closeOnEscape(e, () => close(true));
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, close]);

  // AY10: si lo que se desplaza mueve el botón, el popover fijo quedaría
  // flotando lejos de él.
  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      if (scrollCloses(e.target, popoverRef.current, buttonRef.current)) closeFromOutside();
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closeFromOutside solo usa refs y setters
  }, [open]);

  /** Abre o cierra. `fromShortcut`: con ⌘/, el foco vuelve después adonde
   *  estaba. */
  const toggle = (fromShortcut = false) => {
    if (open) {
      close(true);
      return;
    }
    const active = document.activeElement;
    returnFocus.current = fromShortcut && active instanceof HTMLElement && active !== document.body ? active : null;
    setAnchor(anchorFor(buttonRef.current));
  };

  // AY7: Tab recorre solo los controles de la ayuda.
  const onPopoverKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !popoverRef.current) return;
    const items = [...popoverRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const next = nextTrapIndex(items.indexOf(document.activeElement as HTMLElement), items.length, e.shiftKey);
    e.preventDefault();
    if (next >= 0) items[next].focus();
  };

  const footer = helpFooter(
    content.actions ?? [],
    content.tourScene !== undefined ? t(language, 'help', 'seeTour') : null,
    () => close(false),
    () => setTourOpen(true),
  );

  const closeTour = useCallback(() => {
    setTourOpen(false);
    focusBack();
  }, [focusBack]);

  const label = interpolate(t(language, 'help', 'buttonLabel'), { screen: content.screen });
  const triggerProps: HelpTriggerProps = {
    ref: buttonRef,
    type: 'button',
    'aria-label': label,
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    'aria-controls': popoverId,
    onMouseDown: () => {
      pressingButton.current = true;
      window.setTimeout(() => { pressingButton.current = false; }, 0);
    },
    onClick: () => toggle(),
  };

  const popover = (open || tourOpen) && createPortal(
    // AY9: los eventos de un portal suben por el árbol de React hasta la
    // pantalla de detrás. Se cortan aquí, salvo los atajos globales; el
    // clic derecho tampoco abre el menú de la vista (Tareas, Kanban).
    <div onKeyDown={(e) => { if (!passesToApp(e)) e.stopPropagation(); }} onContextMenu={(e) => e.stopPropagation()}>
      {open && (
        <HelpPanel
          panelRef={popoverRef}
          id={popoverId}
          style={{ ...style, zIndex: Z_MODAL_NESTED }}
          title={content.title}
          intro={content.intro}
          closeLabel={t(language, 'help', 'close')}
          onClose={() => close(true)}
          onKeyDown={onPopoverKeyDown}
          footer={footer}
        >
          {content.body}
        </HelpPanel>
      )}
      {tourOpen && <TourModal onClose={closeTour} initialScene={content.tourScene} />}
    </div>,
    document.body,
  );

  return { open, toggle, close, label, triggerProps, popover };
}

/** AY5: el pie, con las acciones de la pantalla y al final "Ver el
 *  recorrido" (`tourLabel`, si la pantalla tiene escena). Cada botón cierra
 *  antes la ayuda, sin devolver el foco al botón: lo que abre (la hoja de
 *  atajos, el recorrido) lo toma. */
export function helpFooter(
  actions: HelpAction[],
  tourLabel: string | null,
  close: () => void,
  openTour: () => void,
): HelpAction[] {
  const after = (run: () => void) => () => {
    close();
    run();
  };
  return [
    ...actions.map((a) => ({ label: a.label, onClick: after(a.onClick) })),
    ...(tourLabel ? [{ label: tourLabel, onClick: after(openTour) }] : []),
  ];
}

/** El popover en sí, sin estado: el diálogo con su título, la intro, el
 *  contenido y el pie. Aparte para dibujarlo en las pruebas sin DOM. */
export function HelpPanel({
  id, title, intro, closeLabel, onClose, footer = [], children, panelRef, style, onKeyDown,
}: {
  id: string;
  title: string;
  intro?: string;
  closeLabel: string;
  onClose: () => void;
  footer?: HelpAction[];
  children: ReactNode;
  panelRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
}) {
  const titleId = `${id}-title`;
  const introId = `${id}-intro`;
  return (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={intro ? introId : undefined}
      tabIndex={-1}
      style={style}
      onKeyDown={onKeyDown}
      className="help-popover animate-fade-in w-[320px] max-w-[calc(100vw-16px)] max-h-[min(70vh,440px)] overflow-y-auto rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-4 text-left shadow-2xl focus:outline-none"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 id={titleId} className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} className={`${ICON_BTN} -mr-1.5 -mt-1 shrink-0`}>
          <X size={14} aria-hidden />
        </button>
      </div>
      <div className="space-y-3">
        {intro && <p id={introId} className="text-xs leading-relaxed text-[var(--text-secondary)]">{intro}</p>}
        {children}
      </div>
      {footer.length > 0 && (
        // Pegado abajo: con ventanas bajas el contenido hace scroll y los
        // enlaces del pie ("Ver todos los atajos") quedaban fuera de vista.
        <div className="sticky -bottom-4 -mx-4 -mb-4 mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--border)] bg-[var(--bg-elevated)] px-4 pb-4 pt-2.5">
          {footer.map((a) => (
            <button key={a.label} type="button" onClick={a.onClick} className={`${TEXT_LINK} text-xs`}>{a.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Una lista de puntos (`ul`) o de pasos (`ol`), con un título opcional. */
export function HelpSection({ kind = 'points', title, items }: { kind?: 'points' | 'steps'; title?: string; items: ReactNode[] }) {
  const List = kind === 'steps' ? 'ol' : 'ul';
  return (
    <div>
      {title && <h3 className={`${PANEL_TITLE} mb-1.5`}>{title}</h3>}
      <List className={`${kind === 'steps' ? 'list-decimal' : 'list-disc'} space-y-1.5 pl-4 text-xs leading-relaxed text-[var(--text-secondary)]`}>
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </List>
    </div>
  );
}

export interface HelpShortcutRow {
  /** Las teclas ya formateadas para el sistema ("⇧⌘F", "Ctrl+Shift+F"). */
  keys: string[];
  label: ReactNode;
  /** Entre dos teclas: "/" para "una u otra", "…" para un rango. */
  sep?: string;
}

/** Los atajos de la pantalla, en dos columnas: teclas y qué hacen. */
export function HelpShortcuts({ rows }: { rows: HelpShortcutRow[] }) {
  const language = useAppStore((s) => s.language);
  return (
    <div>
      <h3 className={`${PANEL_TITLE} mb-1.5`}>{t(language, 'help', 'shortcuts')}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        {rows.map((row, i) => (
          <Fragment key={i}>
            <dt className="flex flex-wrap items-center gap-1 text-[var(--text-hint)]">
              {row.keys.map((k, j) => (
                <Fragment key={j}>
                  {j > 0 && row.sep && <span>{row.sep}</span>}
                  <kbd className={KBD}>{k}</kbd>
                </Fragment>
              ))}
            </dt>
            <dd className="text-[var(--text-secondary)]">{row.label}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

/** Una nota al pie del contenido, con un ícono opcional. */
export function HelpNote({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--text-hint)]">
      {Icon && <Icon size={11} className="mt-px shrink-0" aria-hidden />}
      <span>{children}</span>
    </p>
  );
}
