import { useEffect, useMemo, useRef } from 'react';
import { Search, X, Circle, Clock, CheckCircle2, Calendar, BookOpen } from 'lucide-react';
import { Task, TaskStatus } from '../types';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';

const STATUS_ICONS: Record<TaskStatus, React.ReactNode> = {
  todo: <Circle size={13} className="text-zinc-500 shrink-0" />,
  'in-progress': <Clock size={13} className="text-amber-400 shrink-0" />,
  done: <CheckCircle2 size={13} className="text-green-400 shrink-0" />,
};

export function SearchModal() {
  const {
    isSearchOpen, searchQuery, searchResults, runSearch, toggleSearch, setActiveTask,
    dailyEntries, setSection, setActiveDailyDate, setActiveDailyMonth, shortcuts, language,
  } = useAppStore();
  const inputRef = useRef<HTMLInputElement>(null);

  // Búsqueda client-side en dailys cargados en memoria
  const dailyHits = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    return Object.entries(dailyEntries)
      .filter(([, text]) => text.toLowerCase().includes(q))
      .map(([date, text]) => {
        const matchLine = text.split('\n').find((l) => l.toLowerCase().includes(q)) ?? '';
        return { date, snippet: matchLine.replace(/^-\s*/, '').trim() };
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [searchQuery, dailyEntries]);

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isSearchOpen]);

  // Keyboard shortcut: Cmd+F / Ctrl+F (configurable)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === shortcuts.search) {
        e.preventDefault();
        toggleSearch();
      }
      if (e.key === 'Escape' && isSearchOpen) {
        toggleSearch();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isSearchOpen, toggleSearch, shortcuts]);

  if (!isSearchOpen) return null;

  const handleSelectTask = (task: Task) => {
    setActiveTask(task);
    toggleSearch();
  };

  const handleSelectDaily = (date: string) => {
    setSection('dailys');
    setActiveDailyMonth(date.slice(0, 7));
    setActiveDailyDate(date);
    toggleSearch();
  };

  const hasResults = searchResults.length > 0 || dailyHits.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onClick={toggleSearch}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-xl rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3.5">
          <Search size={16} className="text-[var(--text-hint)] shrink-0" />
          <input
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => runSearch(e.target.value)}
            placeholder={t(language, 'extras', 'searchPlaceholder')}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder-[var(--text-hint)]"
          />
          {searchQuery && (
            <button onClick={() => runSearch('')} className="text-[var(--text-hint)] hover:text-[var(--text-tertiary)]">
              <X size={14} />
            </button>
          )}
          <kbd className="rounded-md border border-[var(--border-card)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[10px] text-[var(--text-hint)]">
            ESC
          </kbd>
        </div>

        {/* Resultados */}
        <div className="max-h-[400px] overflow-y-auto">
          {!searchQuery ? (
            <div className="py-10 text-center text-sm text-[var(--text-faint)]">
              {t(language, 'extras', 'searchTypeHint')}
            </div>
          ) : !hasResults ? (
            <div className="py-10 text-center text-sm text-[var(--text-faint)]">
              {t(language, 'extras', 'noResultsFor')} "{searchQuery}"
            </div>
          ) : (
            <div className="p-2">
              {/* ── Tareas ── */}
              {searchResults.length > 0 && (
                <>
                  <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                    {t(language, 'extras', 'tasksTitle')}
                  </p>
                  <ul className="space-y-0.5">
                    {searchResults.map((task) => (
                      <li key={task.id}>
                        <button
                          onClick={() => handleSelectTask(task)}
                          className="flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-[var(--bg-hover)]"
                        >
                          {STATUS_ICONS[task.status]}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[var(--text-body)] truncate">{task.title}</p>
                            <div className="mt-0.5 flex items-center gap-2">
                              <span className="text-[10px] text-[var(--text-hint)]">{task.project}</span>
                              {task.due && (
                                <span className="flex items-center gap-0.5 text-[10px] text-[var(--text-hint)]">
                                  <Calendar size={8} />
                                  {task.due}
                                </span>
                              )}
                              {task.tags.slice(0, 3).map((t) => (
                                <span key={t} className="text-[9px] text-indigo-400">{t}</span>
                              ))}
                            </div>
                            {task.content && (
                              <p className="mt-1 text-[10px] text-[var(--text-hint)] line-clamp-1">
                                {task.content.slice(0, 120)}
                              </p>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {/* ── Dailys ── */}
              {dailyHits.length > 0 && (
                <>
                  <p className="px-4 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                    {t(language, 'extras', 'dailysTitle')}
                  </p>
                  <ul className="space-y-0.5">
                    {dailyHits.map(({ date, snippet }) => (
                      <li key={date}>
                        <button
                          onClick={() => handleSelectDaily(date)}
                          className="flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-[var(--bg-hover)]"
                        >
                          <BookOpen size={13} className="mt-0.5 shrink-0 text-indigo-400" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[var(--text-body)]">{date}</p>
                            {snippet && (
                              <p className="mt-0.5 truncate text-[10px] text-[var(--text-hint)]">{snippet}</p>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>

        {hasResults && searchQuery && (
          <div className="border-t border-[var(--border)] px-4 py-2">
            <p className="text-[10px] text-[var(--text-faint)]">
              {searchResults.length} {t(language, 'extras', 'tasksCount')} · {dailyHits.length} {t(language, 'extras', 'dailysCount')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
