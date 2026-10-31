// Envoltorio de las tarjetas que las extensiones ponen en Inicio
// (specs/extensiones R27): el mismo marco y la misma cabecera que las
// tarjetas propias de Inicio ("Actividad reciente", "Esta semana"), con un
// enlace opcional a la derecha como "Ver calendario →".
import type { MouseEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { FOCUS_RING } from '../shared/controlClasses';

export interface HomeCardLink {
  label: string;
  /** El nombre completo para el lector de pantalla ("Abrir Pomodoro"). */
  ariaLabel: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function HomeCardShell({
  icon: Icon, title, titleId, aside, link, children,
}: {
  icon: LucideIcon;
  title: string;
  titleId: string;
  /** Texto pequeño junto al título ("Google Calendar"). */
  aside?: string;
  link?: HomeCardLink;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={titleId}
      className="dash-enter dash-d4 min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[var(--text-primary)]">
          <Icon size={16} className="shrink-0 text-indigo-400" aria-hidden />
          <h3 id={titleId} className="truncate text-sm font-semibold">{title}</h3>
          {aside && <span className="shrink-0 truncate text-[10px] text-[var(--text-hint)]">{aside}</span>}
        </div>
        {link && (
          <button
            type="button"
            onClick={link.onClick}
            aria-label={link.ariaLabel}
            className={`shrink-0 rounded text-xs text-[var(--text-hint)] transition hover:text-[var(--text-secondary)] ${FOCUS_RING}`}
          >
            {link.label} <span aria-hidden>→</span>
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
