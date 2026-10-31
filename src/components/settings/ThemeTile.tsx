interface ThemeTileProps {
  active: boolean;
  icon?: React.ReactNode;
  colorDot?: string;
  label: string;
  onClick: () => void;
  dashed?: boolean;
  title?: string;
  /** Con nombre, el tile es un radio nativo de ese grupo (specs/onboarding
   *  OB10, OB17): flechas, anuncio y foco del navegador. Sin él, un botón
   *  con `aria-pressed`. */
  name?: string;
  /** Un botón que hace algo (p. ej. "Crear tema") y no se queda elegido:
   *  sin `aria-pressed`. */
  action?: boolean;
  /** Menos alto, para que la bienvenida quepa en 800×600. */
  compact?: boolean;
}

export function ThemeTile({ active, icon, colorDot, label, onClick, dashed = false, title, name, action = false, compact = false }: ThemeTileProps) {
  const borderClass = dashed
    ? active
      ? 'border-dashed border-indigo-500/60 bg-indigo-500/10 text-indigo-400'
      : 'border-dashed border-[var(--border-card)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--border-high)] hover:text-[var(--text-secondary)]'
    : active
      ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-400'
      : 'border-[var(--border-card)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--border-high)] hover:text-[var(--text-secondary)]';
  const cls = `flex flex-col items-center rounded-xl border px-3 text-center transition ${compact ? 'gap-1.5 py-2.5' : 'gap-2 py-4'} ${borderClass}`;

  const content = <>
    {colorDot ? (
      <span aria-hidden="true" className="h-5 w-5 rounded-full border border-[var(--border-card)]" style={{ background: colorDot }} />
    ) : (
      icon
    )}
    <span className="w-full truncate text-xs font-medium">{label}</span>
    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-indigo-400' : 'bg-transparent'}`} />
  </>;

  if (name) {
    return (
      <label title={title} className={`${cls} cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500`}>
        <input type="radio" name={name} checked={active} onChange={onClick} className="sr-only" />
        {content}
      </label>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={action ? undefined : active}
      className={cls}
    >
      {content}
    </button>
  );
}
