// El marco de las miniaturas del recorrido (specs/onboarding OB13): el menú
// en el estilo elegido, con las secciones en el orden del usuario, y al lado
// la escena. Se dibuja con los tokens del tema; las animaciones son las
// clases `.obd-*` de App.css, y el estilo base de cada una es el fotograma
// final, así que sin animación ya se ve completa.
import type { CSSProperties, ReactNode } from 'react';
import type { SidebarStyle } from '../sidebar/sectionOrder';
import { LogoMark, type SectionItem } from '../sidebar/sections';

/** Cuándo se mueve el resaltado: al principio, a la mitad o al final. */
export type HighlightMove = 'early' | 'mid' | 'late';

/** Cuántas secciones caben en el menú de la miniatura, además de Inicio. */
const MAX_ROWS = 5;

/** Las filas del menú de la miniatura: Inicio y las primeras visibles. */
export function frameRows(home: SectionItem, items: readonly SectionItem[]): SectionItem[] {
  return [home, ...items.filter((i) => !i.hidden).slice(0, MAX_ROWS)];
}

/** El índice de la fila de una sección, o -1 si no está en el menú. */
export function rowIndex(rows: readonly SectionItem[], id: string | undefined): number {
  return id ? rows.findIndex((r) => r.id === id) : -1;
}

const LINE = 'h-1.5 rounded-full bg-[var(--bg-hover)]';

export function MiniLines({ widths, className = '' }: { widths: string[]; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {widths.map((w, i) => <div key={i} className={LINE} style={{ width: w }} />)}
    </div>
  );
}

export function MiniFrame({ variant, rows, from, to, move = 'mid', children }: {
  variant: SidebarStyle;
  rows: readonly SectionItem[];
  /** La sección resaltada al empezar; si no se da, la de `to`. */
  from?: string;
  /** La resaltada al final. Sin ella, no hay resaltado. */
  to?: string;
  move?: HighlightMove;
  children: ReactNode;
}) {
  const toIndex = rowIndex(rows, to);
  const fromIndex = from ? rowIndex(rows, from) : toIndex;
  const moves = fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex;
  const hlStyle = { '--obd-from': Math.max(0, fromIndex), '--obd-to': Math.max(0, toIndex) } as CSSProperties;
  const highlight = toIndex >= 0 && (
    <div
      data-highlight={rows[toIndex].id}
      className={`obd-hl ${moves ? `obd-anim obd-hl-${move}` : ''} absolute rounded bg-[var(--accent)] opacity-25 ${
        variant === 'icons' ? 'left-[3px] top-1.5 h-4 w-[18px]' : 'left-1 right-1 top-1.5 h-3.5'
      }`}
      style={hlStyle}
    />
  );

  return (
    <div
      aria-hidden="true"
      className={`obd-frame obd-frame-${variant} flex h-full w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-base)]`}
    >
      {variant === 'icons' ? (
        <>
          <div className="relative flex w-6 shrink-0 flex-col items-center gap-0.5 border-r border-[var(--border)] bg-[var(--bg-panel)] py-1.5">
            {highlight}
            {rows.map((row) => (
              <div key={row.id} className="relative flex h-4 w-4 items-center justify-center text-[var(--text-hint)]">
                {row.id === 'dashboard' ? <LogoMark size={11} /> : <row.Icon size={10} />}
              </div>
            ))}
          </div>
          <div className="flex w-12 shrink-0 flex-col gap-2 border-r border-[var(--border)] bg-[var(--bg-panel)] p-2">
            <div className={LINE} style={{ width: '70%' }} />
            <MiniLines widths={['90%', '60%', '75%']} />
          </div>
        </>
      ) : (
        <div className="relative flex w-20 shrink-0 flex-col gap-0.5 border-r border-[var(--border)] bg-[var(--bg-panel)] px-1 py-1.5">
          {highlight}
          {rows.map((row, i) => (
            <div key={row.id} className="relative flex h-3.5 items-center gap-1 px-1 text-[var(--text-hint)]">
              <row.Icon size={8} className="shrink-0" />
              <div className={LINE} style={{ width: `${55 + ((i * 13) % 30)}%` }} />
            </div>
          ))}
        </div>
      )}
      <div className="relative min-w-0 flex-1 overflow-hidden p-2.5">{children}</div>
    </div>
  );
}

/** Una tecla dentro de la miniatura (decorativa: el texto ya la nombra). */
export function MiniKey({ label, className = '' }: { label: string; className?: string }) {
  return (
    <span className={`inline-block rounded border border-[var(--border-card)] bg-[var(--bg-surface)] px-1 font-sans text-[8px] leading-[14px] text-[var(--text-secondary)] ${className}`}>
      {label}
    </span>
  );
}
