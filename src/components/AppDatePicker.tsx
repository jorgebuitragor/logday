import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppStore } from '../store/appStore';

function getLocale(language: 'es' | 'en'): string {
  return language === 'es' ? 'es-CO' : 'en-US';
}

function getDayNames(language: 'es' | 'en'): string[] {
  const fmt = new Intl.DateTimeFormat(getLocale(language), { weekday: 'short' });
  const baseSunday = new Date(2024, 0, 7);
  return Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(baseSunday);
    d.setDate(baseSunday.getDate() + idx);
    return fmt.format(d).replace('.', '');
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateDisplay(iso: string, language: 'es' | 'en'): string {
  if (!iso) return language === 'es' ? 'Seleccionar fecha' : 'Select date';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat(getLocale(language), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

interface CalendarGridProps {
  value: string;
  max?: string;
  onChange: (iso: string) => void;
}

/** Grilla de calendario reutilizable (sin trigger propio). */
export function AppCalendarGrid({ value, max, onChange }: CalendarGridProps) {
  const language = useAppStore((s) => s.language);
  const [viewYear, setViewYear] = useState(() =>
    value ? parseInt(value.split('-')[0]) : new Date().getFullYear()
  );
  const [viewMonth, setViewMonth] = useState(() =>
    value ? parseInt(value.split('-')[1]) - 1 : new Date().getMonth()
  );

  const goPreMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const goNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const today = todayISO();
  const dayNames = getDayNames(language);
  const monthLabel = new Intl.DateTimeFormat(getLocale(language), { month: 'long' }).format(new Date(viewYear, viewMonth, 1));

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div>
      {/* Cabecera mes/año */}
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={goPreMonth}
          className="rounded p-1 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-semibold text-[var(--text-primary)]">
          {monthLabel} {viewYear}
        </span>
        <button
          type="button"
          onClick={goNextMonth}
          className="rounded p-1 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Días de la semana */}
      <div className="mb-1 grid grid-cols-7 text-center">
        {dayNames.map((d) => (
          <span key={d} className="text-[10px] font-medium text-[var(--text-hint)]">{d}</span>
        ))}
      </div>

      {/* Celdas */}
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {cells.map((day, i) => {
          if (!day) return <span key={i} />;
          const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = iso === value;
          const isToday = iso === today;
          const isDisabled = max ? iso > max : false;
          return (
            <button
              key={iso}
              type="button"
              disabled={isDisabled}
              onClick={() => onChange(iso)}
              className={`rounded-md py-0.5 text-xs transition-colors disabled:opacity-25 disabled:cursor-default ${
                isSelected
                  ? 'bg-indigo-600 text-white font-semibold'
                  : isToday
                  ? 'border border-indigo-500/50 text-indigo-400'
                  : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface PickerProps {
  value: string;
  max?: string;
  onChange: (iso: string) => void;
}

/** Componente completo: botón que muestra la fecha + dropdown con calendar. */
export function AppDatePicker({ value, max, onChange }: PickerProps) {
  const language = useAppStore((s) => s.language);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-1.5 text-left text-sm text-[var(--text-primary)] hover:border-indigo-500/50 focus:border-indigo-500 focus:outline-none transition-colors"
      >
        {formatDateDisplay(value, language)}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] p-3 shadow-2xl animate-in">
          <AppCalendarGrid
            value={value}
            max={max}
            onChange={(iso) => { onChange(iso); setOpen(false); }}
          />
        </div>
      )}
    </div>
  );
}
