// Un menú pequeño con el patrón de teclado de siempre (Interfaz §5):
// ↑/↓, Home/End, Enter/Espacio para elegir y Esc para cerrar, que devuelve
// el foco al botón, y escribir letras salta a la opción que empieza así
// (typeahead). Lo usan los selectores de la barra (lenguaje, método,
// petición) y el del entorno.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { FOCUS_RING } from '../../../components/shared/controlClasses';

export interface MenuItem {
  key: string;
  label: ReactNode;
  /** Solo para lectores de pantalla, tras la etiqueta. */
  srSuffix?: string;
  checked?: boolean;
  /** Una acción (no una opción): sin marca de elegida, tras un separador. */
  action?: boolean;
  onSelect: () => void;
}

export const CHIP_BTN = `flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] ${FOCUS_RING}`;

export function Menu({
  label, button, items, hint, align = 'left',
}: {
  /** `aria-label` del botón. */
  label: string;
  button: ReactNode;
  items: MenuItem[];
  /** Una línea arriba, sin acción ("Se usa en todas las peticiones."). */
  hint?: string;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });

  useEffect(() => {
    if (!open) return;
    const first = listRef.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? listRef.current?.querySelector<HTMLElement>('[role^="menuitem"]');
    first?.focus();
    const onDown = (e: MouseEvent) => {
      if (!listRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = (focusButton: boolean) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const nodes = [...(listRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      nodes[(n + nodes.length) % nodes.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(nodes.length - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault();
      e.stopPropagation();
      close(e.key === 'Escape');
    } else if (e.key.length === 1 && e.key !== ' ' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Typeahead: la misma letra repetida recorre las que empiezan por ella.
      const now = Date.now();
      const prev = now - typed.current.at < 700 ? typed.current.text : '';
      const text = prev === e.key.toLowerCase() ? prev : prev + e.key.toLowerCase();
      typed.current = { text, at: now };
      const from = text.length === 1 ? i + 1 : Math.max(0, i);
      const found = [...nodes.slice(from), ...nodes.slice(0, from)]
        .find((n) => (n.textContent ?? '').trim().toLowerCase().startsWith(text));
      if (found) {
        e.preventDefault();
        found.focus();
      }
    }
  };

  const options = items.filter((i) => !i.action);
  const actions = items.filter((i) => i.action);
  const row = (item: MenuItem) => (
    <button
      key={item.key}
      type="button"
      role={item.action ? 'menuitem' : 'menuitemradio'}
      aria-checked={item.action ? undefined : !!item.checked}
      tabIndex={-1}
      onClick={() => {
        close(true);
        item.onSelect();
      }}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] focus:bg-[var(--bg-hover)] focus:outline-none`}
    >
      {!item.action && <span className="flex w-3 shrink-0 justify-center">{item.checked && <Check size={12} aria-hidden />}</span>}
      <span className="flex min-w-0 flex-1 items-center gap-1.5">{item.label}</span>
      {item.srSuffix && <span className="sr-only">, {item.srSuffix}</span>}
    </button>
  );

  return (
    <div className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={CHIP_BTN}
      >
        {button}
      </button>
      {open && (
        <div
          ref={listRef}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-30 mt-1 min-w-[220px] max-w-[22rem] rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-xl`}
        >
          {hint && <p className="px-3 py-1 text-[10px] text-[var(--text-hint)]">{hint}</p>}
          {options.map(row)}
          {actions.length > 0 && <div className="my-1 border-t border-[var(--border)]" role="separator" />}
          {actions.map(row)}
        </div>
      )}
    </div>
  );
}
