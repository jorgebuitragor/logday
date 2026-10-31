// Controles de formulario que comparten las extensiones (DevTools,
// Pomodoro): interruptor con etiqueta, número con tope, la línea de estado
// y el indicador de carga (specs/devtools design §3).
import { useEffect, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import ToggleSwitch from './ToggleSwitch';
import { INPUT_CLS } from './controlClasses';

/** `ToggleSwitch` dentro de un `<label>`: el texto le da el nombre al
 *  interruptor y también lo activa al pulsarlo. */
export function Toggle({ label, checked, onChange, disabled, srSuffix }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** Solo para lectores de pantalla, tras la etiqueta: distingue varios
   *  interruptores iguales en una lista ("Mostrar en el menú: Tareas"). */
  srSuffix?: string;
}) {
  return (
    <label className={`flex items-center gap-2 text-[var(--text-secondary)] ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
      <ToggleSwitch size="sm" checked={checked} onChange={onChange} disabled={disabled} />
      <span>{label}{srSuffix && <span className="sr-only">: {srSuffix}</span>}</span>
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

export function Spinner() {
  return <span className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" aria-hidden />;
}
