import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, Check, ChevronDown, Search, Tag, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import type { TaskSortBy } from '../../types/config';
import { t } from '../../lib/i18n';
import { EMPTY_TASK_FILTER, allTaskTags, filterTasks, isTaskFilterActive } from '../../lib/taskListing';

// Barra de filtros común a lista, Kanban y calendario: estado, búsqueda de
// texto, tags y orden. Antes cada vista filtraba distinto (la lista solo
// por estado; el Kanban por proyecto, con un selector que repetía la barra
// lateral, y por una fila de chips de tags que no escalaba). El filtro vive
// en el store, así que se conserva al cambiar de vista. El proyecto sigue
// siendo el de la barra lateral.

const SORT_LABEL_KEY: Record<TaskSortBy, 'sortDue' | 'sortCreated' | 'sortTitle'> = {
  due: 'sortDue',
  created: 'sortCreated',
  title: 'sortTitle',
};

const STATUS_FILTERS = ['all', 'todo', 'in-progress', 'done'] as const;
const STATUS_LABEL_KEY = {
  all: 'filterAll',
  todo: 'filterTodo',
  'in-progress': 'filterInProgress',
  done: 'filterDone',
} as const;

/** Cierra un menú desplegable al hacer clic fuera. */
function useClickOutside(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);
  return ref;
}

const MENU = 'absolute top-full z-50 mt-1 rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-xl';
const TRIGGER = 'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition';

function TagsMenu() {
  const { tasks, filter, setTaskFilter, language } = useAppStore(
    useShallow((s) => ({ tasks: s.tasks, filter: s.taskFilter, setTaskFilter: s.setTaskFilter, language: s.language })),
  );
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useClickOutside(open, () => setOpen(false));
  const tags = useMemo(() => allTaskTags(tasks), [tasks]);
  // Los elegidos siguen en la lista aunque ya no los tenga ninguna tarea
  // del proyecto, para poder quitarlos.
  const options = useMemo(() => {
    const all = [...new Set([...filter.tags, ...tags])];
    const q = search.trim().toLowerCase();
    return q ? all.filter((tag) => tag.toLowerCase().includes(q)) : all;
  }, [tags, filter.tags, search]);

  const toggle = (tag: string) =>
    setTaskFilter({ tags: filter.tags.includes(tag) ? filter.tags.filter((x) => x !== tag) : [...filter.tags, tag] });

  const active = filter.tags.length > 0;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((v) => !v); setSearch(''); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={active ? filter.tags.join(', ') : undefined}
        className={`${TRIGGER} ${
          active ? 'bg-indigo-500/10 text-indigo-400' : open ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
        }`}
      >
        <Tag size={12} />
        {active ? (filter.tags.length === 1 ? filter.tags[0] : `${t(language, 'tasks', 'tagsFilter')} · ${filter.tags.length}`) : t(language, 'tasks', 'tagsFilter')}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`${MENU} right-0 w-56`}>
          {tags.length > 6 && (
            <div className="border-b border-[var(--border)] px-2 pb-1.5 pt-0.5">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setOpen(false);
                  if (e.key === 'Enter' && options.length === 1) toggle(options[0]);
                }}
                placeholder={t(language, 'tasks', 'tagsFilterSearch')}
                className="w-full bg-transparent px-1 py-1 text-xs text-[var(--text-primary)] outline-none placeholder-[var(--text-faint)]"
              />
            </div>
          )}
          <div role="listbox" aria-multiselectable className="max-h-64 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[var(--text-faint)]">
                {t(language, 'tasks', tags.length ? 'noTagsFound' : 'noTagsYet')}
              </p>
            ) : (
              options.map((tag) => {
                const selected = filter.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    role="option"
                    aria-selected={selected}
                    onClick={() => toggle(tag)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-[var(--bg-hover)] ${
                      selected ? 'text-indigo-400' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                      selected ? 'border-indigo-400 bg-indigo-500/20' : 'border-[var(--border-high)]'
                    }`}>
                      {selected && <Check size={10} />}
                    </span>
                    <span className="truncate">{tag}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SortMenu() {
  const { taskSortBy, setTaskSort, language } = useAppStore(
    useShallow((s) => ({ taskSortBy: s.taskSortBy, setTaskSort: s.setTaskSort, language: s.language })),
  );
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${TRIGGER} ${open ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'}`}
      >
        <ArrowUpDown size={12} />
        {t(language, 'tasks', SORT_LABEL_KEY[taskSortBy])}
      </button>
      {open && (
        <div role="menu" className={`${MENU} right-0 min-w-[180px]`}>
          <p className="px-3 pt-1.5 pb-1 text-[9px] font-bold uppercase tracking-widest text-[var(--text-faint)]">{t(language, 'tasks', 'sortLabel')}</p>
          {(['due', 'created', 'title'] as const).map((opt) => (
            <button
              key={opt}
              role="menuitemradio"
              aria-checked={taskSortBy === opt}
              onClick={() => { setTaskSort(opt); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition ${
                taskSortBy === opt ? 'text-indigo-400 bg-indigo-500/10' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {t(language, 'tasks', SORT_LABEL_KEY[opt])}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  /** Botones de estado (no en el Kanban: ahí el estado son las columnas). */
  showStatus?: boolean;
  /** Menú de orden (no en el calendario: ahí manda la fecha). */
  showSort?: boolean;
}

export function TaskFilterBar({ showStatus = true, showSort = true }: Props) {
  const { tasks, filter, setTaskFilter, language } = useAppStore(
    useShallow((s) => ({ tasks: s.tasks, filter: s.taskFilter, setTaskFilter: s.setTaskFilter, language: s.language })),
  );
  // Los números de cada estado respetan la búsqueda y los tags.
  const counts = useMemo(() => {
    const base = filterTasks(tasks, filter, { ignoreStatus: true });
    return {
      all: base.length,
      todo: base.filter((t) => t.status === 'todo').length,
      'in-progress': base.filter((t) => t.status === 'in-progress').length,
      done: base.filter((t) => t.status === 'done').length,
    };
  }, [tasks, filter]);
  const active = isTaskFilterActive(showStatus ? filter : { ...filter, status: 'all' });

  return (
    <div className="flex flex-wrap items-center gap-1">
      {showStatus && STATUS_FILTERS.map((f) => (
        <button
          key={f}
          onClick={() => setTaskFilter({ status: f })}
          aria-pressed={filter.status === f}
          className={`rounded-lg px-2.5 py-1 text-xs transition ${
            filter.status === f
              ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
              : 'text-[var(--text-hint)] hover:text-[var(--text-tertiary)]'
          }`}
        >
          {t(language, 'tasks', STATUS_LABEL_KEY[f])}
          <span className="ml-1.5 text-[10px] text-[var(--text-hint)]">{counts[f]}</span>
        </button>
      ))}
      <div className="ml-auto flex items-center gap-1">
        <label className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2 py-1 text-xs transition focus-within:border-indigo-500/50">
          <Search size={12} className="shrink-0 text-[var(--text-hint)]" />
          <input
            value={filter.query}
            onChange={(e) => setTaskFilter({ query: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Escape') { setTaskFilter({ query: '' }); e.currentTarget.blur(); } }}
            placeholder={t(language, 'tasks', 'searchPlaceholder')}
            aria-label={t(language, 'tasks', 'searchPlaceholder')}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-32 bg-transparent text-[var(--text-primary)] outline-none placeholder-[var(--text-hint)]"
          />
        </label>
        <TagsMenu />
        {showSort && <SortMenu />}
        {/* Solo el ícono: con el texto, la barra saltaba a dos filas al
            aparecer. */}
        {active && (
          <button
            onClick={() => setTaskFilter(showStatus ? EMPTY_TASK_FILTER : { tags: [], query: '' })}
            title={t(language, 'tasks', 'clearFilters')}
            aria-label={t(language, 'tasks', 'clearFilters')}
            className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-red-400"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
