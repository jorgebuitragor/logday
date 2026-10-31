import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Circle, Clock, CheckCircle2, GripVertical, Check } from 'lucide-react';
import { Task, TaskStatus } from '../../types/task';
import { useAppStore } from '../../store/appStore';
import { TaskContextMenu, NewTaskContextMenu } from './TaskContextMenu';
import { t } from '../../lib/i18n';
import { QuickAddInput } from './QuickAddInput';
import { localISODate } from '../../lib/localDate';
import { completedLocalDate, filterTasks, sortColumn } from '../../lib/taskListing';
import { addDaysISO } from '../../lib/localDate';
import { TaskMeta } from './TaskMeta';
import { TaskFilterBar } from './TaskFilterBar';
import { TaskShortcutsSheet } from './TaskShortcutsSheet';
import { TasksHelp } from '../help/ScreenHelp';

const COLUMN_DEFS: { status: TaskStatus; color: string; border: string; Icon: React.ElementType }[] = [
  { status: 'todo',        color: 'text-zinc-400',  border: 'border-zinc-600/30',  Icon: Circle },
  { status: 'in-progress', color: 'text-amber-400', border: 'border-amber-500/30', Icon: Clock },
  { status: 'done',        color: 'text-green-400', border: 'border-green-500/30', Icon: CheckCircle2 },
];

const DONE_RECENT_DAYS = 14;

// Variable de módulo para el id en drag (evita problemas de closure en async)
let _draggingId: string | null = null;

interface KanbanCardProps {
  task: Task;
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent, taskId: string) => void;
  staggerIndex?: number;
}

function KanbanCard({ task, isDragging, onPointerDown, staggerIndex = 0 }: KanbanCardProps) {
  const { setActiveTask, activeTask, language, updateTaskWithUndo } = useAppStore();
  const isActive = activeTask?.id === task.id;
  const isDone = task.status === 'done';
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  // Completar o reabrir sin arrastrar a la otra columna, con deshacer.
  const toggleDone = (e: React.MouseEvent) => {
    e.stopPropagation();
    void updateTaskWithUndo({ ...task, status: isDone ? 'todo' : 'done' }, {
      title: t(language, 'tasks', isDone ? 'toastReopened' : 'toastCompleted'),
      description: task.title,
    });
  };

  return (
    <>
    <div
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
      className={`kanban-card-enter kanban-d${Math.min(staggerIndex, 7)} group rounded-xl border p-3 transition select-none ${
        isDragging
          ? 'opacity-40 border-indigo-400/40 bg-indigo-500/5'
          : isActive
          ? 'border-indigo-500/40 bg-indigo-500/5 cursor-pointer'
          : 'border-[var(--border-card)] bg-[var(--bg-surface)] hover:border-[var(--border-high)] cursor-pointer'
      }`}
      onClick={() => {
        if (_draggingId) return;
        setActiveTask(isActive ? null : task);
      }}
    >
      <div className="flex items-start gap-1.5">
        <div
          className="mt-0.5 shrink-0 touch-none text-[var(--text-faint)] hover:text-[var(--text-hint)] cursor-grab"
          onPointerDown={(e) => onPointerDown(e, task.id)}
        >
          <GripVertical size={13} />
        </div>
        <button
          type="button"
          role="checkbox"
          aria-checked={isDone}
          aria-label={t(language, 'tasks', isDone ? 'markUndone' : 'markDone')}
          title={t(language, 'tasks', isDone ? 'markUndone' : 'markDone')}
          onClick={toggleDone}
          className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] transition ${
            isDone
              ? 'border-green-500 bg-green-500 text-white'
              : 'border-[var(--text-hint)] text-transparent hover:border-green-500 hover:text-green-500'
          }`}
        >
          <Check size={10} strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug ${isDone ? 'line-through text-[var(--text-hint)]' : 'text-[var(--text-body)]'}`}>
            {task.title}
          </p>
          <TaskMeta task={task} language={language} due={{ today: localISODate() }} />
        </div>
      </div>
    </div>
    {ctxMenu && (
      <TaskContextMenu
        task={task}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu(null)}
      />
    )}
    </>
  );
}

function DragGhost({ task, x, y }: { task: Task; x: number; y: number }) {
  return (
    <div
      style={{ left: x + 14, top: y + 6, pointerEvents: 'none', position: 'fixed', zIndex: 9999, width: 220 }}
      className="rounded-xl border border-indigo-400/60 bg-[var(--bg-panel)] p-3 shadow-2xl opacity-90"
    >
      <p className="text-sm font-medium text-[var(--text-body)] truncate">{task.title}</p>
    </div>
  );
}

export function KanbanBoard() {
  const { tasks, currentView, language, taskFilter, taskSortBy, activeProject } = useAppStore();
  // La columna de hechas muestra solo las de los últimos días: con meses de
  // uso, todas juntas son una pared que empuja todo lo demás.
  const [showAllDone, setShowAllDone] = useState(false);
  const recentDoneFrom = addDaysISO(localISODate(), -DONE_RECENT_DAYS);
  const [addingStatus, setAddingStatus] = useState<TaskStatus | null>(null);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const [boardKey, setBoardKey] = useState(0);
  useEffect(() => {
    if (currentView === 'kanban') setBoardKey((k) => k + 1);
  }, [currentView]);

  const COLUMNS = COLUMN_DEFS.map((col) => ({
    ...col,
    label: t(language, 'tasks', col.status === 'todo' ? 'statusTodo' : col.status === 'in-progress' ? 'statusInProgress' : 'statusDone'),
  }));

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const [targetStatus, setTargetStatus] = useState<TaskStatus | null>(null);
  const [emptyCtxMenu, setEmptyCtxMenu] = useState<{ x: number; y: number } | null>(null);
  // La hoja de atajos, desde "Ver todos los atajos" de la ayuda (AY17).
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Filtro común (búsqueda y tags; el estado son las columnas) y el mismo
  // orden que la lista. El proyecto lo da la barra lateral.
  const filteredTasks = useMemo(() => filterTasks(tasks, taskFilter, { ignoreStatus: true }), [tasks, taskFilter]);

  useEffect(() => {
    if (!draggingId) return;

    const handlePointerMove = (e: PointerEvent) => {
      setGhostPos({ x: e.clientX, y: e.clientY });
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const colEl = el?.closest('[data-col-status]');
      const status = (colEl?.getAttribute('data-col-status') as TaskStatus) ?? null;
      setTargetStatus(status);
    };

    const handlePointerUp = async (e: PointerEvent) => {
      const id = _draggingId;
      _draggingId = null;
      setDraggingId(null);
      setTargetStatus(null);
      if (!id) return;

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const colEl = el?.closest('[data-col-status]');
      const status = colEl?.getAttribute('data-col-status') as TaskStatus | null;
      if (status) {
        const task = tasksRef.current.find((t) => t.id === id);
        if (task && task.status !== status) {
          const { updateTaskWithUndo, language: lang } = useAppStore.getState();
          const title = status === 'done' ? 'toastCompleted' : task.status === 'done' ? 'toastReopened' : 'toastStatus';
          await updateTaskWithUndo({ ...task, status }, { title: t(lang, 'tasks', title), description: task.title });
        }
      }
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingId]);

  const handleCardPointerDown = (e: React.PointerEvent, taskId: string) => {
    e.preventDefault();
    _draggingId = taskId;
    setDraggingId(taskId);
    setGhostPos({ x: e.clientX, y: e.clientY });
  };

  if (currentView !== 'kanban') return null;

  const draggingTask = draggingId ? tasks.find((t) => t.id === draggingId) : null;

  return (
    <div
      className="flex flex-1 flex-col overflow-hidden"
      style={{ userSelect: draggingId ? 'none' : undefined }}
      onContextMenu={(e) => { e.preventDefault(); setEmptyCtxMenu({ x: e.clientX, y: e.clientY }); }}
    >
      {/* Header + filtros */}
      <div className="border-b border-[var(--border)] px-6 pt-4 pb-3 space-y-2.5">
        {/* El proyecto, como en la lista: se ve que el tablero está filtrado. */}
        <div className="flex min-w-0 items-center gap-1">
          <h1 className="truncate text-lg font-semibold text-[var(--text-primary)] capitalize">{activeProject ?? t(language, 'tasks', 'kanbanTitle')}</h1>
          <TasksHelp onShowShortcuts={() => setShowShortcuts(true)} />
        </div>

        <TaskFilterBar showStatus={false} />
      </div>

      <div key={boardKey} className="flex flex-1 gap-4 overflow-x-auto p-5">
        {COLUMNS.map((col, colIndex) => {
          const { Icon } = col;
          const allColTasks = sortColumn(filteredTasks.filter((t) => t.status === col.status), taskSortBy);
          // Día local de completado: `completedAt` puede ser un instante o un
          // `YYYY-MM-DD` legado, y solo cuenta si la tarea está hecha.
          const olderDone = col.status === 'done' ? allColTasks.filter((t) => completedLocalDate(t) < recentDoneFrom).length : 0;
          const colTasks = col.status === 'done' && !showAllDone
            ? allColTasks.filter((t) => completedLocalDate(t) >= recentDoneFrom)
            : allColTasks;
          const isTarget = targetStatus === col.status;

          return (
            <div
              key={col.status}
              data-col-status={col.status}
              className={`kanban-col-enter kanban-col-d${colIndex} flex flex-1 flex-col rounded-2xl border min-w-[240px] transition-colors ${
                isTarget
                  ? 'border-indigo-400/60 bg-indigo-500/5'
                  : 'bg-[var(--bg-panel)] border-[var(--border)]'
              }`}
            >
              {/* Encabezado */}
              <div className={`flex items-center justify-between border-b ${col.border} px-4 py-3`}>
                <div className="flex items-center gap-2">
                  <Icon size={14} className={col.color} />
                  <span className={`text-sm font-medium ${col.color}`}>{col.label}</span>
                  <span className="text-xs text-[var(--text-hint)]">{allColTasks.length}</span>
                </div>
                <button
                  onClick={() => setAddingStatus(col.status)}
                  aria-label={t(language, 'tasks', 'newTask')}
                  title={t(language, 'tasks', 'newTask')}
                  className="rounded-lg p-1 text-[var(--text-hint)] transition hover:text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Tarjetas */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {/* Captura rápida, la misma de la lista, con el estado de la columna. */}
                {addingStatus === col.status && (
                  <QuickAddInput compact autoFocus status={col.status} onDismiss={() => setAddingStatus(null)} />
                )}
                {colTasks.map((task, cardIndex) => (
                  <KanbanCard
                    key={task.id}
                    task={task}
                    isDragging={draggingId === task.id}
                    onPointerDown={handleCardPointerDown}
                    staggerIndex={cardIndex}
                  />
                ))}
                {olderDone > 0 && (
                  <button
                    onClick={() => setShowAllDone((v) => !v)}
                    className="w-full rounded-lg py-1.5 text-center text-xs text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
                  >
                    {showAllDone
                      ? t(language, 'tasks', 'showRecentDone')
                      : t(language, 'tasks', 'showAllDone').replace('{n}', String(olderDone))}
                  </button>
                )}
                {colTasks.length === 0 && !olderDone && !draggingTask && (
                  <p className="py-4 text-center text-xs text-[var(--text-faint)] italic">{t(language, 'tasks', 'noTasks')}</p>
                )}
                {isTarget && draggingTask && (
                  <div className="rounded-xl border-2 border-dashed border-indigo-400/40 p-2.5 text-center text-xs text-indigo-400">
                    {t(language, 'tasks', 'dropHere')}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {draggingTask && <DragGhost task={draggingTask} x={ghostPos.x} y={ghostPos.y} />}
      {emptyCtxMenu && (
        <NewTaskContextMenu
          x={emptyCtxMenu.x}
          y={emptyCtxMenu.y}
          onClose={() => setEmptyCtxMenu(null)}
        />
      )}
      {showShortcuts && <TaskShortcutsSheet onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
