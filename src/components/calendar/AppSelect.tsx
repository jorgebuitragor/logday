import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface AppSelectOption<T> {
  value: T;
  label: string;
}

export function AppSelect<T extends string | number>({
  value, options, onChange,
}: {
  value: T;
  options: AppSelectOption<T>[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const active = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className={`flex min-w-[10rem] items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-xs transition ${
          open
            ? 'border-indigo-500/60 bg-indigo-500/10 text-[var(--text-secondary)]'
            : 'border-[var(--border-card)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-high)] hover:bg-[var(--bg-hover)]'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="font-medium">{active?.label}</span>
        <ChevronDown size={12} className={`shrink-0 text-[var(--text-hint)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1.5 min-w-full overflow-hidden rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl">
          <div role="listbox" className="p-1">
            {options.map((opt) => {
              const isActive = opt.value === value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`w-full rounded-md px-3 py-1.5 text-left text-xs font-medium transition ${
                    isActive
                      ? 'bg-indigo-500/10 text-indigo-400'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
