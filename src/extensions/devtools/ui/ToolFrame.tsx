// Plantilla común de herramienta (design §3): encabezado con el ícono, el
// título (o el selector de herramienta en ventana angosta) y "Traer de una
// nota"; la barra de opciones; el cuerpo y la zona de estado.
import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronDown, FileInput } from 'lucide-react';
import { useDevtools } from './context';
import { useFocusOnOpen } from './hooks';
import { PICKER_TOOLS, TOOL_ICON } from './meta';
import { toolKey } from './text';
import { FOCUS_RING, SECONDARY_CLS } from './classes';
import { ToolNav } from './ToolNav';

export function ToolFrame({
  options, children, status, headerExtra, notice, bodyClass = 'grid gap-4 px-5 py-4 @3xl/tool:grid-cols-2',
}: {
  options?: ReactNode;
  children: ReactNode;
  status?: ReactNode;
  headerExtra?: ReactNode;
  /** Un aviso fijo bajo la descripción (Cliente HTTP: que envía fuera). */
  notice?: ReactNode;
  bodyClass?: string;
}) {
  const { tool, tr, openPicker, shortcut } = useDevtools();
  const Icon = TOOL_ICON[tool];
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusOnOpen(titleRef, 'title');
  const name = tr(toolKey(tool, 'name'));
  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-400">
            <Icon size={16} aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 id="devtools-tool-title" ref={titleRef} tabIndex={-1} className="text-sm font-semibold text-[var(--text-primary)] focus:outline-none">
              <span className="hidden @xl/devtools:inline">{name}</span>
              <ToolSwitcher name={name} />
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--text-hint)]">{tr(toolKey(tool, 'desc'))}</p>
            {notice}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {headerExtra}
          {PICKER_TOOLS.has(tool) && (
            <button type="button" onClick={openPicker} title={`${tr('bringFromNote')} (${shortcut('mod+shift+O')})`} className={SECONDARY_CLS}>
              <FileInput size={13} aria-hidden />
              <span className="hidden @md/tool:inline">{tr('bringFromNote')}</span>
              <span className="sr-only @md/tool:hidden">{tr('bringFromNote')}</span>
            </button>
          )}
        </div>
      </header>
      {options && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 pt-4 text-xs">{options}</div>}
      <div className={bodyClass}>{children}</div>
      {status}
    </>
  );
}

/** En ventana angosta, el título abre la lista de herramientas (design §2). */
function ToolSwitcher({ name }: { name: string }) {
  const { tool, tr, switcherOpen, setSwitcherOpen, goTo } = useDevtools();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!switcherOpen) return;
    searchRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!popRef.current?.contains(target) && !buttonRef.current?.contains(target)) setSwitcherOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [switcherOpen, setSwitcherOpen]);

  const close = () => {
    setSwitcherOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <span className="relative inline-block @xl/devtools:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={switcherOpen}
        aria-label={`${name}. ${tr('switcherLabel')}`}
        onClick={() => setSwitcherOpen(!switcherOpen)}
        className={`-ml-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] ${FOCUS_RING}`}
      >
        {name}
        <ChevronDown size={13} className="text-[var(--text-hint)]" aria-hidden />
      </button>
      {switcherOpen && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={tr('switcherLabel')}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              close();
            }
          }}
          className="absolute left-0 z-30 mt-1.5 flex max-h-[60vh] w-[260px] flex-col rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] text-left font-normal shadow-xl"
        >
          <ToolNav
            active={tool}
            idPrefix="devtools-switcher"
            searchRef={searchRef}
            onEscapeEmpty={close}
            onSelect={(next, focusInput) => {
              setSwitcherOpen(false);
              if (next === tool) buttonRef.current?.focus();
              else goTo(next, focusInput ? 'input' : 'title');
            }}
          />
        </div>
      )}
    </span>
  );
}
