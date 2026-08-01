import { useEffect, useRef, useState } from 'react';
import { hexToHsl, hslToHex } from '../lib/themeColor';

interface Props {
  value: string;
  onChange: (hex: string) => void;
}

// Selector de color propio de la interfaz (no usa <input type="color">
// nativo del SO) para que se vea idéntico en macOS/Windows/Linux.
export function ColorPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const [h, s, l] = hexToHsl(value);

  useEffect(() => { setHexInput(value); }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const setHsl = (nh: number, ns: number, nl: number) => {
    onChange(hslToHex(nh, ns, nl));
  };

  const commitHex = () => {
    const clean = hexInput.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{6}$/.test(clean)) {
      onChange(`#${clean.toLowerCase()}`);
    } else {
      setHexInput(value);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-full items-center gap-1.5 rounded-lg border border-[var(--border-card)] px-1.5"
        style={{ background: 'var(--bg-input)' }}
      >
        <span className="h-5 w-5 shrink-0 rounded border border-[var(--border-card)]" style={{ background: value }} />
        <span className="truncate text-[9px] uppercase text-[var(--text-hint)]">{value}</span>
      </button>

      {open && (
        <div className="absolute left-1/2 top-9 z-30 w-52 -translate-x-1/2 space-y-2.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-3 shadow-2xl">
          <input
            type="range"
            min={0}
            max={360}
            value={h}
            onChange={(e) => setHsl(Number(e.target.value), s, l)}
            className="color-picker-slider"
            style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={s}
            onChange={(e) => setHsl(h, Number(e.target.value), l)}
            className="color-picker-slider"
            style={{ background: `linear-gradient(to right, ${hslToHex(h, 0, l)}, ${hslToHex(h, 100, l)})` }}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={l}
            onChange={(e) => setHsl(h, s, Number(e.target.value))}
            className="color-picker-slider"
            style={{ background: `linear-gradient(to right, #000000, ${hslToHex(h, s, 50)}, #ffffff)` }}
          />
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 shrink-0 rounded border border-[var(--border-card)]" style={{ background: value }} />
            <input
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onBlur={commitHex}
              onKeyDown={(e) => { if (e.key === 'Enter') commitHex(); }}
              spellCheck={false}
              className="w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500/60"
            />
          </div>
        </div>
      )}
    </div>
  );
}
