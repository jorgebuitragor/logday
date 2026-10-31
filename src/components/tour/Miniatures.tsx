// Las 5 miniaturas del recorrido (specs/onboarding OB13, design Paso 4).
// Cada elemento que se mueve lleva `obd-anim` y la clase de su animación;
// su estilo base (en App.css) es el fotograma final. Son decorativas: el
// texto de la escena dice lo mismo.
import { FolderOpen } from 'lucide-react';
import type { SidebarStyle } from '../sidebar/sectionOrder';
import type { SectionItem } from '../sidebar/sections';
import { MiniFrame, MiniKey, MiniLines } from './MiniFrame';
import type { TourSceneId } from './scenes';

/** Lo que las miniaturas escriben: teclas y nombres, ya traducidos. */
export interface MiniatureText {
  newDaily: string;
  search: string;
  /** La tecla de Tareas según el orden del menú (vacía si no tiene). */
  tasksKey: string;
  /** Lo que se escribe en Buscar: el principio del nombre de Tareas. */
  query: string;
  goToTasks: string;
  sync: string;
  git: string;
  extensions: string;
  optional: string;
}

const CARD = 'rounded-md border border-[var(--border-card)] bg-[var(--bg-panel)]';
const LINE = 'h-1.5 rounded-full bg-[var(--bg-hover)]';

function DayScene() {
  return (
    <>
      {/* Inicio: "Hoy" y "Esta semana", que se van. */}
      <div className="obd-anim obd-out-mid absolute inset-2.5 flex flex-col gap-2">
        <div className={`${CARD} space-y-1.5 p-2`}>
          <div className={LINE} style={{ width: '30%' }} />
          <MiniLines widths={['80%', '65%']} />
        </div>
        <div className={`${CARD} p-2`}>
          <div className={LINE} style={{ width: '40%' }} />
          <div className="mt-2 flex gap-1">
            {Array.from({ length: 7 }, (_, i) => <div key={i} className="h-4 flex-1 rounded-sm bg-[var(--bg-hover)]" />)}
          </div>
        </div>
      </div>
      {/* Dailys: el editor del día, con sus líneas escribiéndose. */}
      <div className="obd-anim obd-in-mid absolute inset-2.5 flex flex-col gap-2">
        <div className="h-2 w-1/3 rounded-full bg-[var(--text-hint)] opacity-60" />
        {['85%', '70%', '55%'].map((w, i) => (
          <div key={i} className={`obd-anim obd-grow obd-grow-${i + 1} ${LINE}`} style={{ width: w }} />
        ))}
      </div>
    </>
  );
}

function TasksScene() {
  return (
    <>
      <div className="obd-anim obd-out-mid absolute inset-2.5 flex flex-col gap-1.5">
        {['75%', '60%', '85%', '50%'].map((w, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="h-2 w-2 shrink-0 rounded-full border border-[var(--text-hint)]" />
            <div className={LINE} style={{ width: w }} />
          </div>
        ))}
      </div>
      <div className="obd-anim obd-in-mid absolute inset-2.5 flex gap-1">
        {[1, 2, 1].map((cards, col) => (
          <div key={col} className={`${CARD} flex flex-1 flex-col gap-1 p-1`}>
            <div className={LINE} style={{ width: '50%' }} />
            {Array.from({ length: cards }, (_, i) => <div key={i} className="h-3 rounded-sm bg-[var(--bg-hover)]" />)}
            {/* La tarjeta que pasa de la columna 1 a la 2. */}
            {col === 1 && <div className="obd-anim obd-card-move h-3 rounded-sm border border-[var(--accent)] bg-[var(--bg-elevated)]" />}
          </div>
        ))}
      </div>
    </>
  );
}

function NotesScene() {
  return (
    <div className="absolute inset-2.5 flex gap-2">
      {/* La lista pasa a árbol: las notas se sangran bajo su carpeta. */}
      <div className={`${CARD} flex w-16 shrink-0 flex-col gap-1.5 p-1.5`}>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 shrink-0 rounded-sm bg-[var(--text-hint)] opacity-60" />
          <div className={LINE} style={{ width: '60%' }} />
        </div>
        {['70%', '55%', '65%'].map((w, i) => (
          <div key={i} className="obd-anim obd-indent flex items-center">
            <div className={LINE} style={{ width: w }} />
          </div>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="h-2 w-2/5 rounded-full bg-[var(--text-hint)] opacity-60" />
        {['90%', '70%'].map((w, i) => (
          <div key={i} className={`obd-anim obd-grow obd-grow-${i + 1} ${LINE}`} style={{ width: w }} />
        ))}
        {/* Un diagrama de 3 cajas. */}
        <div className="mt-1 flex items-center gap-1.5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="contents">
              {n > 1 && <div className={`obd-anim obd-pop obd-pop-${n} h-px w-3 bg-[var(--text-hint)]`} />}
              <div className={`obd-anim obd-pop obd-pop-${n} h-5 w-8 rounded border border-[var(--accent)] bg-[var(--bg-elevated)]`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MoveScene({ text }: { text: MiniatureText }) {
  return (
    <>
      <MiniLines widths={['60%', '85%', '45%', '70%']} className="absolute inset-2.5" />
      {/* Buscar con lo escrito e "Ir a Tareas", que se cierra al elegirlo. */}
      <div className={`obd-anim obd-search absolute left-[10%] top-2 w-4/5 overflow-hidden rounded-md border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-lg`}>
        <div className="flex items-center gap-1 border-b border-[var(--border)] px-2 py-1 text-[9px] text-[var(--text-primary)]">
          <span className="text-[var(--text-hint)]">⌕</span>
          <span>{text.query}</span>
        </div>
        <div className="p-1">
          <div className="rounded-sm bg-[var(--accent)]/20 px-1.5 py-0.5 text-[8px] text-[var(--text-secondary)]">{text.goToTasks}</div>
        </div>
      </div>
      <div className="absolute bottom-2 right-2 flex gap-1">
        <MiniKey label={text.search} className="obd-anim obd-in-early" />
        {text.tasksKey && <MiniKey label={text.tasksKey} className="obd-anim obd-in-late" />}
      </div>
    </>
  );
}

function DataScene({ text }: { text: MiniatureText }) {
  const files = ['projects/…/….md', 'notes/….md', 'dailys/….md'];
  const optional = [text.sync, text.git, text.extensions];
  return (
    <div className="absolute inset-2.5 flex gap-3">
      <div className="flex flex-col gap-1">
        <FolderOpen size={16} className="text-[var(--accent)]" />
        {files.map((f, i) => (
          <span key={f} className={`obd-anim obd-drop obd-drop-${i + 1} rounded border border-[var(--border-card)] bg-[var(--bg-panel)] px-1 font-mono text-[8px] text-[var(--text-secondary)]`}>
            {f}
          </span>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {optional.map((name, i) => (
          <span key={name} className={`obd-anim obd-chip obd-chip-${i + 1} rounded border border-dashed border-[var(--border-high)] px-1.5 py-0.5 text-[8px] text-[var(--text-secondary)]`}>
            {name} · <span className="text-[var(--text-hint)]">{text.optional}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Qué sección resalta el menú en cada escena, y si se mueve. */
const HIGHLIGHT: Record<TourSceneId, { from?: string; to?: string; move?: 'early' | 'mid' | 'late' }> = {
  day: { from: 'dashboard', to: 'dailys', move: 'mid' },
  tasks: { to: 'tasks' },
  notes: { to: 'notes' },
  move: { from: 'dashboard', to: 'tasks', move: 'late' },
  data: {},
};

export function SceneMiniature({ id, variant, rows, text }: {
  id: TourSceneId;
  variant: SidebarStyle;
  rows: readonly SectionItem[];
  text: MiniatureText;
}) {
  const hl = HIGHLIGHT[id];
  return (
    <MiniFrame variant={variant} rows={rows} from={hl.from} to={hl.to} move={hl.move}>
      {id === 'day' && <>
        <DayScene />
        <MiniKey label={text.newDaily} className="obd-anim obd-in-late absolute bottom-2 right-2" />
      </>}
      {id === 'tasks' && <TasksScene />}
      {id === 'notes' && <NotesScene />}
      {id === 'move' && <MoveScene text={text} />}
      {id === 'data' && <DataScene text={text} />}
    </MiniFrame>
  );
}
