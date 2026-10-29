import { useEffect, useRef, useState } from 'react';
import { Gauge, X } from 'lucide-react';
import type { Language } from '../../types/common';
import { t } from '../../lib/i18n';
import { normalizeProgress } from '../../lib/taskProgress';

// Campo "Progreso" del panel de la tarea, con la misma forma que los demás
// (etiqueta con ícono y control sin borde). El valor es el del borrador del
// panel (useFieldDrafts): '' = sin progreso, si no, el entero 0–100.

interface Props {
  value: string;
  language: Language;
  labelClass: string;
  controlClass: string;
  /** Cada cambio del slider o del número, ya normalizado. */
  onChange: (value: string) => void;
  /** Guardar ya lo pendiente (Enter o salir del número). */
  onCommit: () => void;
  /** Volver a "sin progreso". */
  onClear: () => void;
}

export function TaskProgressField({ value, language, labelClass, controlClass, onChange, onCommit, onClear }: Props) {
  const hasProgress = value !== '';
  // "Sin progreso" abre el control sin guardar nada: 0 % es un valor real
  // (distinto de no tener) y no se escribe hasta que el usuario elige uno.
  // El panel se vuelve a montar al cambiar de tarea, así que esto no se
  // arrastra de una a otra.
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open && !hasProgress) inputRef.current?.focus();
    // Solo al abrirlo, no en cada valor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Lo que se ve es lo que se guarda: solo dígitos, entero y en 0–100. Borrar
  // el número para escribir otro no cierra el control.
  const change = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '');
    setOpen(true);
    onChange(digits === '' ? '' : String(normalizeProgress(digits)));
  };

  const clear = () => {
    setOpen(false);
    onClear();
  };

  return (
    <div className="flex items-center gap-3">
      <span className={labelClass}>
        <Gauge size={12} />
        {t(language, 'tasks', 'progressField')}
      </span>
      {hasProgress || open ? (
        <>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={hasProgress ? Number(value) : 0}
            onChange={(e) => change(e.target.value)}
            aria-label={t(language, 'tasks', 'progressField')}
            className={`min-w-0 flex-1 cursor-pointer ${hasProgress ? '' : 'opacity-40'}`}
            style={{ accentColor: 'var(--accent)' }}
          />
          <span className="flex shrink-0 items-center text-xs text-[var(--text-secondary)]">
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              value={value}
              onChange={(e) => change(e.target.value)}
              onBlur={onCommit}
              onKeyDown={(e) => { if (e.key === 'Enter') onCommit(); }}
              placeholder="—"
              aria-label={t(language, 'tasks', 'progressInputAria')}
              maxLength={3}
              className={`${controlClass} w-10 bg-transparent text-right tabular-nums outline-none placeholder-[var(--text-faint)] focus:bg-[var(--bg-hover)]`}
            />
            %
          </span>
          <button
            type="button"
            onClick={clear}
            aria-label={t(language, 'tasks', 'progressClear')}
            title={t(language, 'tasks', 'progressClear')}
            className="rounded-md p-1 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-red-400"
          >
            <X size={12} />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={t(language, 'tasks', 'progressAdd')}
          className={`${controlClass} flex-1 text-left text-[var(--text-faint)]`}
        >
          {t(language, 'tasks', 'progressNone')}
        </button>
      )}
    </div>
  );
}
