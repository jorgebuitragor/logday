// Selector de tarea (PM6, design §2.8): un popover con buscador (patrón
// combobox) y la lista de tareas pendientes y en curso de todos los
// proyectos, leídas de disco al abrirlo. Solo lee (PM7).
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, CircleSlash, Search } from 'lucide-react';
import type { Task } from '../../types/task';
import { readAllTasks } from '../../lib/allTasks';
import { StatusItem, Spinner } from '../../components/shared/FormControls';
import { FOCUS_RING, INPUT_CLS } from '../../components/shared/controlClasses';
import { groupTasks } from './taskOptions';
import type { TaskRef } from './model';
import type { Tr } from './text';

type Load = { state: 'loading' } | { state: 'ok'; tasks: Task[] } | { state: 'error' };

const GROUP_TITLE = 'px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)]';

export function TaskPicker({
  tr, selectedId, onPick, onClose,
}: {
  tr: Tr;
  selectedId: string | null;
  onPick: (task: TaskRef | null) => void;
  /** Cierra sin elegir. `refocus`: el foco vuelve al botón que lo abrió. */
  onClose: (refocus: boolean) => void;
}) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [slow, setSlow] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `pomodoro-task-list-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    let alive = true;
    setLoad({ state: 'loading' });
    setSlow(false);
    // El "Cargando…" solo si tarda más de 150 ms, para que no parpadee.
    const timer = window.setTimeout(() => alive && setSlow(true), 150);
    readAllTasks().then(
      (tasks) => alive && setLoad({ state: 'ok', tasks }),
      () => alive && setLoad({ state: 'error' }),
    );
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [attempt]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Clic fuera cierra.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const groups = useMemo(() => (load.state === 'ok' ? groupTasks(load.tasks, query) : null), [load, query]);
  // "Sin tarea" va siempre primera, aunque haya búsqueda.
  const options: (Task | null)[] = useMemo(
    () => [null, ...(groups ? [...groups.inProgress, ...groups.todo] : [])],
    [groups],
  );
  useEffect(() => setActive(0), [query, load]);
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const pick = (task: Task | null) => onPick(task ? { id: task.id, title: task.title, project: task.project } : null);

  const onKey = (e: KeyboardEvent) => {
    const last = options.length - 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(last, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(last); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(options[active] ?? null); }
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (query) setQuery('');
      else onClose(true);
    } else if (e.key === 'Tab') onClose(false);
  };

  useEffect(() => {
    document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const renderOption = (task: Task | null, index: number) => {
    const selected = (task?.id ?? null) === selectedId;
    return (
      <li
        key={task?.id ?? 'none'}
        id={optionId(index)}
        role="option"
        aria-selected={selected}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => pick(task)}
        onMouseEnter={() => setActive(index)}
        className={`flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 ${index === active ? 'bg-[var(--bg-hover)]' : ''}`}
      >
        {task ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs text-[var(--text-body)]">{task.title}</span>
            <span className="block truncate text-[10px] text-[var(--text-hint)]">
              {task.project}{task.taskCode ? ` · ${task.taskCode}` : ''}
            </span>
          </span>
        ) : (
          <>
            <CircleSlash size={13} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-body)]">{tr('taskNone')}</span>
          </>
        )}
        {selected && <Check size={13} className="shrink-0 text-[var(--text-secondary)]" aria-hidden />}
      </li>
    );
  };

  const inProgressId = `${listId}-g1`;
  const todoId = `${listId}-g2`;
  let index = 1;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={tr('taskPickerLabel')}
      className="absolute left-0 top-full z-30 mt-1.5 flex w-full min-w-[18rem] max-h-[min(60vh,24rem)] flex-col overflow-hidden rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl"
    >
      <div className="relative border-b border-[var(--border)] p-2">
        <Search size={13} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-hint)]" aria-hidden />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={optionId(active)}
          aria-label={tr('taskSearch')}
          placeholder={tr('taskSearch')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
          autoComplete="off"
          className={`${INPUT_CLS} w-full pl-8 ${FOCUS_RING}`}
        />
      </div>
      <ul id={listId} role="listbox" aria-label={tr('taskPickerLabel')} className="min-h-0 flex-1 overflow-y-auto p-1">
        {renderOption(null, 0)}
        {groups && groups.inProgress.length > 0 && (
          <li role="presentation">
            <ul role="group" aria-labelledby={inProgressId}>
              <li role="presentation" id={inProgressId} className={GROUP_TITLE}>{tr('taskGroupInProgress')}</li>
              {groups.inProgress.map((task) => renderOption(task, index++))}
            </ul>
          </li>
        )}
        {groups && groups.todo.length > 0 && (
          <li role="presentation">
            <ul role="group" aria-labelledby={todoId}>
              <li role="presentation" id={todoId} className={GROUP_TITLE}>{tr('taskGroupTodo')}</li>
              {groups.todo.map((task) => renderOption(task, index++))}
            </ul>
          </li>
        )}
      </ul>
      <div className="px-3 pb-2 empty:hidden">
        {load.state === 'loading' && slow && (
          <p className="flex items-center gap-2 text-[11px] text-[var(--text-hint)]"><Spinner />{tr('taskLoading')}</p>
        )}
        {load.state === 'error' && (
          <div className="flex flex-wrap items-center gap-2">
            <StatusItem kind="error">{tr('taskError')}</StatusItem>
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`rounded px-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] ${FOCUS_RING}`}>
              {tr('retry')}
            </button>
          </div>
        )}
        {groups && groups.total === 0 && (
          <p className="text-[11px] text-[var(--text-hint)]">
            {query.trim() ? tr('taskNoMatch', { q: query.trim() }) : tr('taskEmpty')}
          </p>
        )}
        {groups && groups.hidden > 0 && <p className="text-[11px] text-[var(--text-hint)]">{tr('taskMore', { n: groups.hidden })}</p>}
      </div>
    </div>
  );
}
