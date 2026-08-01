interface ThemeTileProps {
  active: boolean;
  icon?: React.ReactNode;
  colorDot?: string;
  label: string;
  onClick: () => void;
  dashed?: boolean;
  title?: string;
}

export function ThemeTile({ active, icon, colorDot, label, onClick, dashed = false, title }: ThemeTileProps) {
  const borderClass = dashed
    ? active
      ? 'border-dashed border-indigo-500/60 bg-indigo-500/10 text-indigo-400'
      : 'border-dashed border-[var(--border-card)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--border-high)] hover:text-[var(--text-secondary)]'
    : active
      ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-400'
      : 'border-[var(--border-card)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--border-high)] hover:text-[var(--text-secondary)]';

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center transition ${borderClass}`}
    >
      {colorDot ? (
        <span className="h-5 w-5 rounded-full border border-[var(--border-card)]" style={{ background: colorDot }} />
      ) : (
        icon
      )}
      <span className="w-full truncate text-xs font-medium">{label}</span>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-indigo-400' : 'bg-transparent'}`} />
    </button>
  );
}
