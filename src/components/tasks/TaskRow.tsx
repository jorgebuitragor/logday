import { useState, useEffect, useRef, memo } from 'react';
import { Check } from 'lucide-react';
import { Task } from '../../types/task';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { TaskContextMenu } from './TaskContextMenu';
import { t } from '../../lib/i18n';
import { DueChip, TaskMeta } from './TaskMeta';

// Fila de la lista de tareas.

// Lo que tarda la casilla en mostrarse marcada antes de que la tarea se
// mueva a "Hechas": sin esta pausa la fila desaparece sin que se vea el clic.
const COMPLETE_DELAY_MS = 350;

export const TaskRow = memo(function TaskRow({
  task,
  today,
  isFocused,
  onSelect,
  isNew,
  isRemoving,
  staggerIndex = 0,
  onBeforeDelete,
  hideDue,
  isSelected,
  onMultiSelect,
}: {
  task: Task;
  today: string;
  /** Seleccionada con el teclado (↑/↓). */
  isFocused?: boolean;
  onSelect?: () => void;
  isNew?: boolean;
  isRemoving?: boolean;
  staggerIndex?: number;
  onBeforeDelete?: () => void;
  /** Dentro de los grupos "Hoy" y "Mañana" la fecha ya la dice el
   *  encabezado: repetirla en cada fila era ruido. */
  hideDue?: boolean;
  /** En la selección múltiple. */
  isSelected?: boolean;
  /** ⌘-clic o ⇧-clic: agrega a la selección en vez de abrir la tarea. */
  onMultiSelect?: (e: React.MouseEvent) => void;
}) {
  const { setActiveTask, activeTask, updateTaskWithUndo, language } = useAppStore(
    useShallow((s) => ({ setActiveTask: s.setActiveTask, activeTask: s.activeTask, updateTaskWithUndo: s.updateTaskWithUndo, language: s.language }))
  );
  const isActive = activeTask?.id === task.id;
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isFocused) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isFocused]);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [statusPopped, setStatusPopped] = useState(false);
  const [completing, setCompleting] = useState(false);
  // Animación de entrada
  const [visible, setVisible] = useState(!isNew);
  useEffect(() => {
    if (isNew) requestAnimationFrame(() => setVisible(true));
  }, [isNew]);

  const staggerClass = `task-d${Math.min(staggerIndex, 10)}`;
  const isDone = task.status === 'done' || completing;
  const isInProgress = task.status === 'in-progress' && !completing;
  const showDue = !!task.due && task.status !== 'done' && !hideDue;

  // La casilla solo completa o reabre. "En progreso" se elige en el menú
  // contextual o en el panel: antes el ícono rotaba entre los tres estados
  // y para deshacer un "hecho" había que dar la vuelta completa.
  const toggleDone = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    // Sin foco en la casilla, para que los atajos de la lista sigan andando.
    e.currentTarget.blur();
    onSelect?.();
    setStatusPopped(true);
    if (task.status === 'done') {
      void updateTaskWithUndo({ ...task, status: 'todo' }, { title: t(language, 'tasks', 'toastReopened'), description: task.title });
      return;
    }
    setCompleting(true);
    // La tarea se va a "Hechas" (plegada): el aviso permite deshacerlo.
    setTimeout(() => {
      void updateTaskWithUndo({ ...task, status: 'done' }, { title: t(language, 'tasks', 'toastCompleted'), description: task.title })
        .finally(() => setCompleting(false));
    }, COMPLETE_DELAY_MS);
  };

  return (
    <>
    <div
      className={`task-row-enter ${staggerClass} transition-all duration-[220ms] ease-out ${
        isRemoving
          ? 'opacity-0 scale-95 pointer-events-none'
          : isNew && !visible
          ? 'opacity-0 -translate-y-1'
          : 'opacity-100 translate-y-0 scale-100'
      }`}
    >
    <div
      ref={rowRef}
      data-task-id={task.id}
      aria-selected={isSelected}
      // ⇧-clic sin seleccionar el texto de las filas de en medio.
      onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); }}
      onClick={(e) => {
        if ((e.metaKey || e.ctrlKey || e.shiftKey) && onMultiSelect) {
          e.preventDefault();
          onMultiSelect(e);
          return;
        }
        onSelect?.();
        setActiveTask(isActive ? null : task);
      }}
      // El clic derecho también selecciona: si no, el menú era de una fila
      // y el resaltado quedaba en otra.
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onSelect?.(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
      className={`flex items-start gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition group ${
        isSelected
          ? 'bg-indigo-500/15 border border-indigo-500/40'
          : isActive
          ? 'bg-indigo-500/10 border border-indigo-500/20'
          : isFocused
          ? 'border border-indigo-500/40 bg-[var(--bg-hover)]'
          : 'border border-transparent hover:bg-[var(--bg-hover)]'
      }`}
    >
      {/* Casilla: completar / reabrir */}
      <button
        type="button"
        role="checkbox"
        aria-checked={isDone}
        aria-label={t(language, 'tasks', isDone ? 'markUndone' : 'markDone')}
        title={t(language, 'tasks', isDone ? 'markUndone' : 'markDone')}
        onClick={toggleDone}
        onAnimationEnd={() => setStatusPopped(false)}
        className={`group/check mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition ${
          isDone
            ? 'border-green-500 bg-green-500 text-white'
            : isInProgress
            ? 'border-amber-400 text-amber-400 hover:bg-amber-400/10'
            : 'border-[var(--text-hint)] text-[var(--text-hint)] hover:border-green-500 hover:text-green-500'
        } ${statusPopped ? 'status-pop' : ''}`}
      >
        {isDone ? (
          <Check size={11} strokeWidth={3} />
        ) : isInProgress ? (
          <>
            <span className="h-2 w-2 rounded-full bg-amber-400 group-hover/check:hidden" />
            <Check size={11} strokeWidth={3} className="hidden group-hover/check:block" />
          </>
        ) : (
          <Check size={11} strokeWidth={3} className="opacity-0 transition group-hover/check:opacity-100" />
        )}
      </button>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p
            className={`flex-1 min-w-0 text-sm leading-snug transition-colors ${
              isDone
                ? 'line-through text-[var(--text-hint)]'
                : isActive
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            {task.title}
          </p>
          {showDue && <DueChip due={task.due!} today={today} language={language} />}
        </div>
        <TaskMeta task={task} language={language} showInProgress={!completing} />
      </div>
    </div>
    {ctxMenu && (
      <TaskContextMenu
        task={task}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu(null)}
        onBeforeDelete={onBeforeDelete}
      />
    )}
    </div>
    </>
  );
});
