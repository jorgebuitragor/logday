import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Circle, Clock, CheckCircle2, Calendar, GripVertical, X, ChevronDown } from 'lucide-react';
import { Task, TaskStatus } from '../types';
import { useAppStore } from '../store/appStore';
import { TaskContextMenu, NewTaskContextMenu } from './TaskContextMenu';
import { t } from '../lib/i18n';

const COLUMN_DEFS: { status: TaskStatus; color: string; border: string; Icon: React.ElementType }[] = [
  { status: 'todo',        color: 'text-zinc-400',  border: 'border-zinc-600/30',  Icon: Circle },
  { status: 'in-progress', color: 'text-amber-400', border: 'border-amber-500/30', Icon: Clock },
  { status: 'done',        color: 'text-green-400', border: 'border-green-500/30', Icon: CheckCircle2 },
];

// Variable de módulo para el id en drag (evita problemas de closure en async)
let _draggingId: string | null = null;

interface KanbanCardProps {
  task: Task;
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent, taskId: string) => void;
}

function KanbanCard({ task, isDragging, onPointerDown }: KanbanCardProps) {
  const { setActiveTask, activeTask } = useAppStore();
  const isActive = activeTask?.id === task.id;
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = task.due && task.due < today && task.status !== 'done';
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <>
    <div
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
      className={`rounded-xl border p-3.5 transition select-none ${
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
      <div className="flex items-start gap-2">
        <div
          className="mt-0.5 shrink-0 touch-none text-[var(--text-faint)] hover:text-[var(--text-hint)] cursor-grab"
          onPointerDown={(e) => onPointerDown(e, task.id)}
        >
          <GripVertical size={13} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug ${task.status === 'done' ? 'line-through text-[var(--text-hint)]' : 'text-[var(--text-body)]'}`}>
            {task.title}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {task.project !== 'inbox' && (
              <span className="text-[9px] text-[var(--text-hint)]">{task.project}</span>
            )}
            {task.due && (
              <span className={`flex items-center gap-0.5 text-[9px] ${isOverdue ? 'text-red-400' : 'text-[var(--text-hint)]'}`}>
                <Calendar size={8} />
                {task.due}
              </span>
            )}
            {task.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-[8px] text-indigo-400">
                {tag}
              </span>
            ))}
          </div>
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

function ProjectSelect({ value, options, onChange, placeholder }: {
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const label = value ?? placeholder;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className={`flex min-w-[9rem] items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-xs transition ${
          open
            ? 'border-indigo-500/60 bg-indigo-500/10 text-[var(--text-secondary)]'
            : 'border-[var(--border-card)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-high)] hover:bg-[var(--bg-hover)]'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="font-medium truncate">{label}</span>
        <ChevronDown size={12} className={`shrink-0 text-[var(--text-hint)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1.5 min-w-full overflow-hidden rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl">
          <div role="listbox" className="p-1">
            <button
              type="button"
              role="option"
              aria-selected={value === null}
              onClick={() => { onChange(null); setOpen(false); }}
              className={`w-full rounded-md px-3 py-1.5 text-left text-xs font-medium transition ${
                value === null
                  ? 'bg-indigo-500/10 text-indigo-400'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {placeholder}
            </button>
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={opt === value}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`w-full rounded-md px-3 py-1.5 text-left text-xs font-medium transition ${
                  opt === value
                    ? 'bg-indigo-500/10 text-indigo-400'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function KanbanBoard() {
  const { tasks, currentView, projects, language } = useAppStore();
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const COLUMNS = COLUMN_DEFS.map((col) => ({
    ...col,
    label: t(language, 'tasks', col.status === 'todo' ? 'statusTodo' : col.status === 'in-progress' ? 'statusInProgress' : 'statusDone'),
  }));

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const [targetStatus, setTargetStatus] = useState<TaskStatus | null>(null);
  const [emptyCtxMenu, setEmptyCtxMenu] = useState<{ x: number; y: number } | null>(null);

  // ── Filtros ──────────────────────────────────────────────────────────────────
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [filterTags, setFilterTags] = useState<string[]>([]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    tasks.forEach((t) => t.tags.forEach((tag) => s.add(tag)));
    return Array.from(s).sort();
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterProject && t.project !== filterProject) return false;
      if (filterTags.length > 0 && !filterTags.some((tag) => t.tags.includes(tag))) return false;
      return true;
    });
  }, [tasks, filterProject, filterTags]);

  const toggleFilterTag = (tag: string) =>
    setFilterTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);

  const isFiltered = !!filterProject || filterTags.length > 0;

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
          await useAppStore.getState().updateTask({ ...task, status });
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
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">{t(language, 'tasks', 'kanbanTitle')}</h1>

        {/* Barra de filtros */}
        {(projects.length > 1 || allTags.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Proyecto */}
            {projects.length > 1 && (
              <ProjectSelect
                value={filterProject}
                options={projects}
                onChange={setFilterProject}
                placeholder={t(language, 'tasks', 'allProjects')}
              />
            )}

            {/* Tags */}
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleFilterTag(tag)}
                className={`rounded-full px-2.5 py-0.5 text-[10px] border transition ${
                  filterTags.includes(tag)
                    ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-400'
                    : 'border-[var(--border-card)] bg-[var(--bg-surface)] text-[var(--text-hint)] hover:border-indigo-400/40 hover:text-indigo-400'
                }`}
              >
                {tag}
              </button>
            ))}

            {/* Limpiar filtros */}
            {isFiltered && (
              <button
                onClick={() => { setFilterProject(null); setFilterTags([]); }}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] text-[var(--text-hint)] transition hover:text-red-400"
              >
                <X size={9} /> {t(language, 'tasks', 'clearFilters')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 gap-4 overflow-x-auto p-5">
        {COLUMNS.map((col) => {
          const { Icon } = col;
          const colTasks = filteredTasks.filter((t) => t.status === col.status);
          const isTarget = targetStatus === col.status;

          return (
            <div
              key={col.status}
              data-col-status={col.status}
              className={`flex flex-1 flex-col rounded-2xl border min-w-[240px] transition-colors ${
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
                  <span className="text-xs text-[var(--text-hint)]">{colTasks.length}</span>
                </div>
                <KanbanAddButton status={col.status} />
              </div>

              {/* Tarjetas */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {colTasks.map((task) => (
                  <KanbanCard
                    key={task.id}
                    task={task}
                    isDragging={draggingId === task.id}
                    onPointerDown={handleCardPointerDown}
                  />
                ))}
                {colTasks.length === 0 && !draggingTask && (
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
    </div>
  );
}

function KanbanAddButton({ status }: { status: TaskStatus }) {
  const { updateTask, createTask, activeProject, language } = useAppStore();
  const [newTitle, setNewTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleCreate = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTitle.trim()) {
      const task = await createTask(newTitle.trim(), activeProject || 'inbox');
      await updateTask({ ...task, status });
      setNewTitle('');
      setIsAdding(false);
    }
    if (e.key === 'Escape') { setNewTitle(''); setIsAdding(false); }
  };

  return (
    <>
      <button
        onClick={() => setIsAdding(true)}
        className="rounded-lg p-1 text-[var(--text-hint)] transition hover:text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
      >
        <Plus size={14} />
      </button>
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setIsAdding(false); setNewTitle(''); }}>
          <div className="w-72 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">{t(language, 'tasks', 'newTask')}</p>
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={handleCreate}
              placeholder={t(language, 'tasks', 'taskNamePlaceholder')}
              className="w-full rounded-xl border border-indigo-500/40 bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder-[var(--text-hint)]"
            />
            <p className="mt-1.5 text-[10px] text-[var(--text-faint)]">{t(language, 'tasks', 'enterToCreate')}</p>
          </div>
        </div>
      )}
    </>
  );
}
