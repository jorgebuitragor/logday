import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, CheckSquare, ChevronRight } from 'lucide-react';
import { Task } from '../../types/task';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { NewTaskContextMenu } from './TaskContextMenu';
import { TaskRow } from './TaskRow';
import { NewTaskModal } from './NewTaskModal';
import { QuickAddInput } from './QuickAddInput';
import { TaskFilterBar } from './TaskFilterBar';
import { TaskSelectionBar } from './TaskSelectionBar';
import { DatePickerPopover } from './DatePickerPopover';
import type { AnchorRect } from '../../lib/menuPosition';
import type { QuickCaptureResult } from '../../lib/quickCapture';
import { t } from '../../lib/i18n';
import { addDaysISO, localISODate } from '../../lib/localDate';
import { doneTasks, filterTasks, formatDueLabel, groupOpenTasks, isTaskFilterActive, rangeIds, type TaskGroupKey } from '../../lib/taskListing';

const DONE_COLLAPSED_KEY = 'logday_tasks_done_collapsed';

const GROUP_LABEL_KEY: Record<TaskGroupKey, 'groupOverdue' | 'groupToday' | 'groupTomorrow' | 'groupWeek' | 'groupLater' | 'groupNone' | 'groupPending'> = {
  overdue: 'groupOverdue',
  today: 'groupToday',
  tomorrow: 'groupTomorrow',
  week: 'groupWeek',
  later: 'groupLater',
  none: 'groupNone',
  pending: 'groupPending',
};

export function TaskList() {
  const { tasks, activeProject, currentView, deleteTask, deleteTasks, updateTasksWithUndo, isLoading, language, setActiveTask, taskSortBy, taskFilter } = useAppStore(
    useShallow((s) => ({
      tasks: s.tasks,
      taskSortBy: s.taskSortBy,
      taskFilter: s.taskFilter,
      activeProject: s.activeProject,
      currentView: s.currentView,
      deleteTask: s.deleteTask,
      updateTasksWithUndo: s.updateTasksWithUndo,
      deleteTasks: s.deleteTasks,
      isLoading: s.isLoading,
      language: s.language,
      setActiveTask: s.setActiveTask,
    }))
  );
  // Borrador de la ventana "Nueva tarea" (null = cerrada). La captura
  // rápida le pasa lo que ya se escribió.
  const [newTaskDraft, setNewTaskDraft] = useState<Partial<QuickCaptureResult> | null>(null);
  const quickAddRef = useRef<HTMLInputElement>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Selección múltiple (⌘-clic, ⇧-clic) y el calendario de la tecla `d`.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [datePicker, setDatePicker] = useState<{ anchor: AnchorRect; ids: string[] } | null>(null);
  const filter = taskFilter.status;
  const [emptyCtxMenu, setEmptyCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [newTaskIds, setNewTaskIds] = useState<Set<string>>(new Set());
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [listKey, setListKey] = useState(0);
  const loadedRef = useRef(false);
  const prevIdsRef = useRef<Set<string>>(new Set());

  // Detectar tareas nuevas para animación de entrada
  useEffect(() => {
    const currentIds = new Set(tasks.map((t) => t.id));
    if (!loadedRef.current) {
      loadedRef.current = true;
      prevIdsRef.current = currentIds;
      return;
    }
    const added = [...currentIds].filter((id) => !prevIdsRef.current.has(id));
    prevIdsRef.current = currentIds;
    if (added.length === 0) return;
    setNewTaskIds((prev) => new Set([...prev, ...added]));
    const timer = setTimeout(() => {
      setNewTaskIds((prev) => {
        const next = new Set(prev);
        added.forEach((id) => next.delete(id));
        return next;
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [tasks]);

  const handleBeforeDelete = (task: Task) => {
    setRemovingIds((prev) => new Set([...prev, task.id]));
    setTimeout(async () => {
      await deleteTask(task);
      setRemovingIds((prev) => { const n = new Set(prev); n.delete(task.id); return n; });
    }, 220);
  };

  useEffect(() => {
    setActiveTask(null);
    setSelectedIds(new Set());
    setListKey((k) => k + 1);
  }, [activeProject, currentView]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Desde el calendario llega la fecha del día elegido.
    const handler = (e: Event) => {
      const due = (e as CustomEvent<{ due?: string } | null>).detail?.due;
      setNewTaskDraft(due ? { due } : {});
    };
    window.addEventListener('logday:new-task', handler);
    return () => window.removeEventListener('logday:new-task', handler);
  }, []);

  const [doneCollapsed, setDoneCollapsed] = useState(() => {
    try { return localStorage.getItem(DONE_COLLAPSED_KEY) !== '0'; } catch { return true; }
  });
  const toggleDoneCollapsed = () => {
    setDoneCollapsed((v) => {
      try { localStorage.setItem(DONE_COLLAPSED_KEY, v ? '0' : '1'); } catch { /* sin almacenamiento */ }
      return !v;
    });
  };

  // "Hoy" en hora local; se recalcula con cada cambio de tareas, y al
  // volver a la ventana para que la lista no quede en el día anterior.
  const [today, setToday] = useState(() => localISODate());
  useEffect(() => {
    const refresh = () => setToday(localISODate());
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  useEffect(() => { setToday(localISODate()); }, [tasks]);

  const filtered = useMemo(() => filterTasks(tasks, taskFilter), [tasks, taskFilter]);
  const openGroups = useMemo(() => groupOpenTasks(filtered, taskSortBy, today), [filtered, taskSortBy, today]);
  const done = useMemo(() => doneTasks(filtered), [filtered]);
  // Con búsqueda o tags, las hechas que coinciden se muestran desplegadas.
  const narrowed = isTaskFilterActive({ ...taskFilter, status: 'all' });
  const showDone = filter === 'done' || narrowed || !doneCollapsed;
  const visibleCount = openGroups.reduce((n, g) => n + g.tasks.length, 0) + done.length;

  const newTaskModal = newTaskDraft ? (
    <NewTaskModal initial={newTaskDraft} onClose={() => setNewTaskDraft(null)} />
  ) : null;

  // Orden en pantalla, para moverse con el teclado.
  const visibleTasks = useMemo(
    () => [...openGroups.flatMap((g) => g.tasks), ...(showDone ? done : [])],
    [openGroups, done, showDone],
  );

  const selectedTasks = useMemo(() => visibleTasks.filter((tk) => selectedIds.has(tk.id)), [visibleTasks, selectedIds]);
  const countLabel = (list: Task[]) =>
    list.length === 1 ? list[0].title : t(language, 'tasks', 'nTasks').replace('{n}', String(list.length));

  // Acciones sobre una o varias tareas, con un solo aviso para deshacer.
  const reschedule = (targets: Task[], due: string | undefined, title?: string) => {
    const nexts = targets.filter((tk) => tk.due !== due).map((tk) => ({ ...tk, due }));
    if (!nexts.length) return;
    void updateTasksWithUndo(nexts, {
      title: title ?? t(language, 'tasks', due ? 'toastDue' : 'toastDueCleared'),
      description: countLabel(nexts) + (due ? ` · ${formatDueLabel(due, today, language).label}` : ''),
    });
  };
  const toggleDone = (targets: Task[]) => {
    const reopening = targets.every((tk) => tk.status === 'done');
    const nexts = targets.filter((tk) => (tk.status === 'done') === reopening).map((tk) => ({ ...tk, status: reopening ? 'todo' as const : 'done' as const }));
    if (!nexts.length) return;
    void updateTasksWithUndo(nexts, { title: t(language, 'tasks', reopening ? 'toastReopened' : 'toastCompleted'), description: countLabel(nexts) });
  };
  const moveTo = (targets: Task[], project: string) => {
    const nexts = targets.filter((tk) => tk.project !== project).map((tk) => ({ ...tk, project }));
    if (nexts.length) void updateTasksWithUndo(nexts, { title: t(language, 'tasks', 'movedTo'), description: project });
  };
  const openDatePicker = (targets: Task[]) => {
    const el = document.querySelector(`[data-task-id="${targets[0]?.id}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setDatePicker({ anchor: { left: r.right - 256, top: r.top, right: r.right, bottom: r.bottom }, ids: targets.map((tk) => tk.id) });
  };

  // ⌘-clic suma o quita una fila; ⇧-clic suma el tramo desde la fila
  // enfocada. Al empezar con ⌘-clic, la enfocada también entra.
  const multiSelect = (task: Task, e: React.MouseEvent) => {
    const order = visibleTasks.map((tk) => tk.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (e.shiftKey) rangeIds(order, focusedId ?? task.id, task.id).forEach((id) => next.add(id));
      else {
        if (!prev.size && focusedId && focusedId !== task.id) next.add(focusedId);
        if (next.has(task.id)) next.delete(task.id);
        else next.add(task.id);
      }
      return next;
    });
    if (!e.shiftKey || !focusedId) setFocusedId(task.id);
  };
  const selectRow = (task: Task) => {
    setFocusedId(task.id);
    if (selectedIds.size && !selectedIds.has(task.id)) setSelectedIds(new Set());
  };

  // Atajos de la lista (fuera de campos de texto y sin ventanas abiertas):
  // ↑/↓ o j/k para moverse, Enter para abrir, Espacio o x para completar o
  // reabrir, t/m/w/0 para la fecha (hoy, mañana, +1 semana, sin fecha), d
  // para elegirla, n para la captura rápida y Esc para soltar la selección.
  // Con varias seleccionadas, las acciones van sobre todas.
  useEffect(() => {
    if (currentView !== 'list' || newTaskDraft) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement;
      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      const index = visibleTasks.findIndex((t) => t.id === focusedId);
      const focused = index >= 0 ? visibleTasks[index] : null;
      const move = (delta: number) => {
        if (!visibleTasks.length) return;
        const next = index < 0 ? (delta > 0 ? 0 : visibleTasks.length - 1) : Math.min(Math.max(index + delta, 0), visibleTasks.length - 1);
        setFocusedId(visibleTasks[next].id);
      };
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && focused) { e.preventDefault(); setActiveTask(focused); }
      const targets = selectedTasks.length ? selectedTasks : focused ? [focused] : [];
      const dueKeys: Record<string, string | undefined> = { t: today, m: addDaysISO(today, 1), w: addDaysISO(today, 7), '0': undefined };
      if ((e.key === ' ' || e.key === 'x') && targets.length) {
        e.preventDefault();
        if (selectedTasks.length) setSelectedIds(new Set());
        else {
          // La tarea cambia de grupo: el foco pasa a la siguiente.
          const neighbor = visibleTasks[index + 1] ?? visibleTasks[index - 1];
          setFocusedId(neighbor?.id ?? null);
        }
        toggleDone(targets);
      }
      else if (e.key in dueKeys && targets.length) { e.preventDefault(); reschedule(targets, dueKeys[e.key]); }
      else if (e.key === 'd' && targets.length) { e.preventDefault(); openDatePicker(targets); }
      else if (e.key === 'n') { e.preventDefault(); quickAddRef.current?.focus(); }
      else if (e.key === 'Escape' && selectedIds.size) { e.preventDefault(); setSelectedIds(new Set()); }
      // Con el panel abierto, Esc lo cierra (TaskEditor) y el foco se queda.
      else if (e.key === 'Escape' && focusedId && !useAppStore.getState().activeTask) setFocusedId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- las acciones se recrean en cada render con los mismos datos
  }, [currentView, newTaskDraft, visibleTasks, selectedTasks, selectedIds, focusedId, setActiveTask, language, today]);

  if (currentView !== 'list') return newTaskModal;

  const title = activeProject ? activeProject : t(language, 'tasks', 'title');

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden"
      onContextMenu={(e) => { e.preventDefault(); setEmptyCtxMenu({ x: e.clientX, y: e.clientY }); }}
    >
      {/* Header */}
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-[var(--text-primary)] capitalize">{title}</h1>
          <button
            onClick={() => setNewTaskDraft({})}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white transition hover:bg-indigo-500"
          >
            <Plus size={14} />
            {t(language, 'tasks', 'newTask')}
          </button>
        </div>

        <TaskFilterBar />
        {/* Captura rápida */}
        <div className="mt-3">
          <QuickAddInput ref={quickAddRef} onMoreOptions={(draft) => setNewTaskDraft(draft)} />
        </div>
        </div>
      </div>

      {/* Modal nueva tarea */}
      {newTaskModal}

      {/* Task list */}
      <div className={`flex-1 overflow-y-auto px-4 py-3 ${selectedTasks.length ? 'pb-20' : ''}`}>
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-[var(--text-hint)]">{t(language, 'tasks', 'loading')}</span>
          </div>
        ) : visibleCount === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CheckSquare size={36} className="text-[var(--text-faint)]" strokeWidth={1.5} />
            <p className="text-sm text-[var(--text-hint)]">
              {t(language, 'tasks', narrowed ? 'emptyFiltered' : filter === 'all' ? 'emptyAll' : filter === 'todo' ? 'emptyTodo' : filter === 'in-progress' ? 'emptyInProgress' : 'emptyDone')}
            </p>
            {filter === 'all' && !narrowed && (
              <button
                onClick={() => setNewTaskDraft({})}
                className="mt-1 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-500"
              >
                <Plus size={14} />
                {t(language, 'tasks', 'newTask')}
              </button>
            )}
          </div>
        ) : (
          <div key={listKey} className="mx-auto w-full max-w-3xl space-y-4">
            {filter === 'all' && !narrowed && openGroups.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-[var(--text-hint)]">{t(language, 'tasks', 'emptyAllDone')}</p>
            )}
            {openGroups.map((group, groupIdx) => {
              const offset = openGroups.slice(0, groupIdx).reduce((n, g) => n + g.tasks.length, 0);
              return (
                <section key={group.key}>
                  {/* Con un solo grupo de pendientes (orden por creación o
                      título) el encabezado no aporta: se omite. */}
                  {group.key !== 'pending' && (
                    <h2 className={`mb-1 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wider ${
                      group.key === 'overdue' ? 'text-red-400' : group.key === 'today' ? 'text-amber-400' : 'text-[var(--text-hint)]'
                    }`}>
                      {t(language, 'tasks', GROUP_LABEL_KEY[group.key])}
                      <span className="font-normal text-[var(--text-faint)]">{group.tasks.length}</span>
                      {/* Reprogramar lo atrasado de una vez, con deshacer. */}
                      {group.key === 'overdue' && (
                        <button
                          onClick={() => reschedule(group.tasks, today, t(language, 'tasks', 'toastMovedToday'))}
                          className="ml-auto rounded-md px-2 py-0.5 text-[11px] font-normal normal-case tracking-normal text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-indigo-400"
                        >
                          {t(language, 'tasks', 'moveOverdueToday')}
                        </button>
                      )}
                    </h2>
                  )}
                  <div className="space-y-0.5">
                    {group.tasks.map((task, idx) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        today={today}
                        isFocused={focusedId === task.id}
                        isSelected={selectedIds.has(task.id)}
                        onSelect={() => selectRow(task)}
                        onMultiSelect={(e) => multiSelect(task, e)}
                        isNew={newTaskIds.has(task.id)}
                        isRemoving={removingIds.has(task.id)}
                        hideDue={group.key === 'today' || group.key === 'tomorrow'}
                        staggerIndex={offset + idx}
                        onBeforeDelete={() => handleBeforeDelete(task)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
            {done.length > 0 && (
              <section>
                {filter === 'all' && (
                  <button
                    onClick={toggleDoneCollapsed}
                    disabled={narrowed}
                    aria-expanded={showDone}
                    className="mb-1 flex items-center gap-1.5 rounded-md px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-hint)] transition hover:text-[var(--text-secondary)]"
                  >
                    <ChevronRight size={12} className={`transition-transform ${showDone ? 'rotate-90' : ''}`} />
                    {t(language, 'tasks', 'groupDone')}
                    <span className="font-normal text-[var(--text-faint)]">{done.length}</span>
                  </button>
                )}
                {showDone && (
                  <div className="space-y-0.5">
                    {done.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        today={today}
                        isFocused={focusedId === task.id}
                        isSelected={selectedIds.has(task.id)}
                        onSelect={() => selectRow(task)}
                        onMultiSelect={(e) => multiSelect(task, e)}
                        isNew={newTaskIds.has(task.id)}
                        isRemoving={removingIds.has(task.id)}
                        onBeforeDelete={() => handleBeforeDelete(task)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
            <p className="pt-2 text-center text-[10px] text-[var(--text-faint)]">{t(language, 'tasks', 'shortcutsHint')}</p>
          </div>
        )}
      </div>

      {selectedTasks.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
          <TaskSelectionBar
            tasks={selectedTasks}
            today={today}
            onReschedule={(due) => reschedule(selectedTasks, due)}
            onComplete={() => { setSelectedIds(new Set()); toggleDone(selectedTasks); }}
            onMove={(project) => { setSelectedIds(new Set()); moveTo(selectedTasks, project); }}
            onDelete={() => { setSelectedIds(new Set()); void deleteTasks(selectedTasks); }}
            onClear={() => setSelectedIds(new Set())}
          />
        </div>
      )}
      {datePicker && (
        <DatePickerPopover
          anchor={datePicker.anchor}
          value={tasks.find((tk) => tk.id === datePicker.ids[0])?.due}
          onPick={(due) => reschedule(tasks.filter((tk) => datePicker.ids.includes(tk.id)), due)}
          onClose={() => setDatePicker(null)}
        />
      )}
      {emptyCtxMenu && (
        <NewTaskContextMenu
          x={emptyCtxMenu.x}
          y={emptyCtxMenu.y}
          onClose={() => setEmptyCtxMenu(null)}
        />
      )}
    </div>
  );
}
