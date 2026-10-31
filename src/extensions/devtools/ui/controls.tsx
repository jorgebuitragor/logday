// Controles de DevTools: selector segmentado, interruptor con etiqueta,
// número, botones de ícono, Copiar y la línea de estado (design §3).
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, CircleAlert, CircleCheck, Copy, Sparkles, TriangleAlert } from 'lucide-react';
import ToggleSwitch from '../../../components/shared/ToggleSwitch';
import { useDevtools, type OptionValue } from './context';
import { useFlash } from './hooks';
import { FOCUS_RING, ICON_BTN, INPUT_CLS, SECONDARY_CLS } from './classes';

export interface SegmentOption<T> {
  value: T;
  label: string;
  title?: string;
}

/** `role="radiogroup"` con roving tabindex: ←/→ mueven la selección. */
export function Segmented<T extends OptionValue>({
  label, value, options, onChange, disabled = false, mono = false,
}: {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  mono?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={disabled ? undefined : onKey}
      className={`flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5 ${disabled ? 'opacity-50' : ''}`}
    >
      {options.map((o, i) => {
        const active = i === index;
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            title={o.title}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed ${mono ? 'font-mono' : ''} ${FOCUS_RING} ${
              active ? 'bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/40' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Etiqueta + control de la barra de opciones. */
export function Option({ label, children, hint }: { label?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {label && <span className="text-[var(--text-secondary)]">{label}</span>}
      {children}
      {hint && <span className="text-[11px] text-[var(--text-hint)]">{hint}</span>}
    </div>
  );
}

/** `ToggleSwitch` dentro de un `<label>`: el texto le da el nombre al
 *  interruptor y también lo activa al pulsarlo. */
export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 text-[var(--text-secondary)] ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
      <ToggleSwitch size="sm" checked={checked} onChange={onChange} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[var(--text-secondary)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={`h-3.5 w-3.5 cursor-pointer accent-[var(--accent)] ${FOCUS_RING}`}
      />
      <span>{label}</span>
    </label>
  );
}

/** Número con tope: mientras se escribe se deja libre y al salir del campo
 *  se ajusta al rango. */
export function NumberField({
  label, value, min, max, onChange, disabled, width = 'w-20',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  width?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (raw: string) => {
    const n = Math.round(Number(raw));
    const clamped = Number.isFinite(n) && raw.trim() ? Math.min(max, Math.max(min, n)) : value;
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() && Number.isInteger(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
      }}
      className={`${INPUT_CLS} ${width} tabular-nums disabled:opacity-50`}
    />
  );
}

/** Botón de ícono con `aria-label` y el atajo en el `title`. Con
 *  `showLabel`, el texto se ve desde que el panel mide 22rem. */
export function IconButton({
  icon: Icon, label, onClick, disabled, shortcut, showLabel = false, title,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  shortcut?: string;
  showLabel?: boolean;
  title?: string;
}) {
  const { shortcut: fmt } = useDevtools();
  const tip = title ?? (shortcut ? `${label} (${fmt(shortcut)})` : label);
  return (
    <button type="button" aria-label={label} title={tip} onClick={onClick} disabled={disabled} className={ICON_BTN}>
      <Icon size={14} className="shrink-0" />
      {showLabel && <span className="hidden @sm/tool:inline">{label}</span>}
    </button>
  );
}

/** Copiar con el estado "Copiado" de 1,5 s (patrón de `DailyEditor`).
 *  `row`: solo cambia el ícono (filas de hashes, timestamp, JWT). */
export function CopyButton({
  text, label, showLabel = false, row = false, shortcut, disabled,
}: {
  text: string | (() => string);
  label?: string;
  showLabel?: boolean;
  row?: boolean;
  shortcut?: string;
  disabled?: boolean;
}) {
  const { tr, copyText, shortcut: fmt } = useDevtools();
  const [copied, flash] = useFlash();
  const name = label ?? tr('copy');
  const run = async () => {
    if (await copyText(typeof text === 'function' ? text() : text)) flash();
  };
  const tip = shortcut ? `${name} (${fmt(shortcut)})` : name;
  return (
    <button
      type="button"
      aria-label={name}
      title={tip}
      disabled={disabled}
      onClick={() => void run()}
      className={copied && !row ? ICON_BTN.replace('text-[var(--text-hint)]', 'bg-emerald-500/10 text-emerald-400') : ICON_BTN}
    >
      {copied ? <Check size={14} className="shrink-0 text-emerald-400" /> : <Copy size={14} className="shrink-0" />}
      {showLabel && <span className="hidden @sm/tool:inline">{copied ? tr('copied') : name}</span>}
    </button>
  );
}

export type StatusKind = 'valid' | 'error' | 'warn' | 'info';

/** Una línea de la zona de estado (design §3). */
export function StatusItem({ kind, children, id, icon }: { kind: StatusKind; children: ReactNode; id?: string; icon?: LucideIcon }) {
  const Icon = icon ?? (kind === 'valid' ? CircleCheck : kind === 'error' ? CircleAlert : kind === 'warn' ? TriangleAlert : null);
  const iconCls = kind === 'valid' ? 'text-emerald-400' : kind === 'error' ? 'text-red-400' : 'text-amber-400';
  const textCls = kind === 'error' ? 'text-red-400' : kind === 'info' ? 'text-[var(--text-hint)]' : 'text-[var(--text-secondary)]';
  return (
    <p id={id} className={`flex items-start gap-1.5 text-[11px] ${textCls}`}>
      {Icon && <Icon size={12} className={`mt-px shrink-0 ${iconCls}`} aria-hidden />}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export function StatusArea({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1 px-5 pb-4">{children}</div>;
}

export function Spinner() {
  return <span className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" aria-hidden />;
}

/** El panel de salida vacío: "El resultado aparece aquí." + un ejemplo. */
export function EmptyOutput({ onExample, text, icon: Icon }: { onExample?: () => void; text?: string; icon?: LucideIcon }) {
  const { tr } = useDevtools();
  return (
    <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-card)] p-4 text-center">
      {Icon && <Icon size={28} className="text-[var(--text-hint)]" aria-hidden />}
      <p className="text-xs text-[var(--text-hint)]">{text ?? tr('outputEmpty')}</p>
      {onExample && (
        <button type="button" onClick={onExample} className={SECONDARY_CLS}>
          <Sparkles size={13} />
          {tr('tryExample')}
        </button>
      )}
    </div>
  );
}

/** Fila de título de un panel: etiqueta a la izquierda y acciones a la derecha. */
export function PanelHeader({ title, htmlFor, children, id }: { title: ReactNode; htmlFor?: string; children?: ReactNode; id?: string }) {
  const cls = 'text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)]';
  return (
    <div className="flex min-h-[28px] flex-wrap items-center justify-between gap-2">
      {htmlFor ? <label htmlFor={htmlFor} id={id} className={cls}>{title}</label> : <h3 id={id} className={cls}>{title}</h3>}
      {children && <div className="flex flex-wrap items-center gap-1">{children}</div>}
    </div>
  );
}

export const useFieldId = (name: string) => `devtools-${name}-${useId().replace(/:/g, '')}`;
