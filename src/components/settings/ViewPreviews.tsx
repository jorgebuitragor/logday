// Miniaturas de las vistas de Notas y Tareas para Opciones → Navegación: sin
// ellas, "Lista", "Árbol" o "Kanban" no decían a qué se parecía cada vista
// (Jorge, 31 oct 2026). Se dibujan con los tokens del tema y son
// decorativas (`aria-hidden`): el nombre y la descripción las explican.
import type { ReactNode } from 'react';

export type ViewPreviewKind = 'notes-list' | 'notes-tree' | 'tasks-list' | 'tasks-kanban' | 'tasks-calendar';

const line = (w: string, active = false) => (
  <span className={`block h-1 rounded-full ${active ? 'bg-[var(--accent)]' : 'bg-[var(--bg-hover)]'}`} style={{ width: w }} />
);

/** El marco: un panel a la izquierda (opcional) y el contenido. */
function Frame({ side, sideWidth = '34%', children }: { side?: ReactNode; sideWidth?: string; children: ReactNode }) {
  return (
    <span aria-hidden="true" className="flex h-14 w-full overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-base)]">
      {side && <span className="flex flex-col gap-1 border-r border-[var(--border)] bg-[var(--bg-panel)] p-1.5" style={{ width: sideWidth }}>{side}</span>}
      <span className="flex flex-1 flex-col gap-1 p-1.5">{children}</span>
    </span>
  );
}

const editor = (
  <>
    {line('60%')}
    {line('90%')}
    {line('75%')}
    {line('85%')}
  </>
);

export function ViewPreview({ kind, active }: { kind: ViewPreviewKind; active: boolean }) {
  switch (kind) {
    case 'notes-list':
      // Carpetas en el menú y, al lado, la lista de notas con su resumen.
      return (
        <Frame side={<>{line('80%', active)}{line('60%')}{line('70%')}</>}>
          <span className="flex h-full gap-1.5">
            <span className="flex w-[45%] flex-col gap-1 border-r border-[var(--border)] pr-1.5">
              <span className={`block rounded-sm p-0.5 ${active ? 'bg-[var(--accent-soft)]' : ''}`}>{line('85%', active)}</span>
              {line('70%')}
              {line('80%')}
            </span>
            <span className="flex flex-1 flex-col gap-1">{editor}</span>
          </span>
        </Frame>
      );
    case 'notes-tree': {
      // Carpetas (un cuadrito) con sus notas debajo, con sangría y una guía
      // vertical, todo en el menú lateral.
      const row = (indent: number, folder: boolean, w: string, on = false) => (
        <span className="flex items-center gap-1" style={{ paddingLeft: indent }}>
          <span className={`h-1.5 w-1.5 shrink-0 ${folder ? 'rounded-[1px] bg-[var(--border-high)]' : 'rounded-full border border-[var(--border-high)]'}`} />
          {line(w, on)}
        </span>
      );
      return (
        <Frame sideWidth="48%" side={<>
          {row(0, true, '70%')}
          <span className="ml-[3px] flex flex-col gap-1 border-l border-[var(--border)]">
            {row(5, false, '75%', active)}
            {row(5, false, '60%')}
          </span>
          {row(0, true, '55%')}
        </>}>
          {editor}
        </Frame>
      );
    }
    case 'tasks-list':
      return (
        <Frame>
          {[90, 70, 80].map((w, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full border ${i === 0 && active ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border-high)]'}`} />
              {line(`${w}%`, i === 0 && active)}
            </span>
          ))}
        </Frame>
      );
    case 'tasks-kanban':
      return (
        <Frame>
          <span className="flex h-full gap-1">
            {[2, 1, 1].map((cards, col) => (
              <span key={col} className="flex flex-1 flex-col gap-0.5 rounded-sm bg-[var(--bg-panel)] p-0.5">
                {Array.from({ length: cards }, (_, i) => (
                  <span key={i} className={`block h-2.5 rounded-sm border ${col === 0 && i === 0 && active ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)] bg-[var(--bg-surface)]'}`} />
                ))}
              </span>
            ))}
          </span>
        </Frame>
      );
    case 'tasks-calendar':
      return (
        <Frame>
          <span className="grid h-full grid-cols-7 gap-px">
            {Array.from({ length: 21 }, (_, i) => (
              <span key={i} className={`rounded-[2px] ${[3, 9, 16].includes(i) ? (active ? 'bg-[var(--accent)]' : 'bg-[var(--border-high)]') : 'bg-[var(--bg-hover)]'}`} />
            ))}
          </span>
        </Frame>
      );
  }
}
