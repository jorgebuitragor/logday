import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Task, TaskStatus } from '../types';
import { useAppStore } from '../store/appStore';
import { TaskContextMenu, NewTaskContextMenu } from './TaskContextMenu';
import { t, MONTHS_TITLE, WEEKDAYS_SHORT } from '../lib/i18n';

const STATUS_DOT: Record<TaskStatus, string> = {
  todo: 'bg-zinc-500',
  'in-progress': 'bg-amber-400',
  done: 'bg-green-400',
};


export function CalendarView() {
  const { tasks, currentView, setActiveTask, activeTask, language } = useAppStore();

  const MONTHS = MONTHS_TITLE[language];
  const WEEKDAYS = WEEKDAYS_SHORT[language];

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Hover preview
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Context menu en tarea del panel lateral
  const [ctxMenu, setCtxMenu] = useState<{ task: Task; x: number; y: number } | null>(null);
  const [emptyCtxMenu, setEmptyCtxMenu] = useState<{ x: number; y: number } | null>(null);

  if (currentView !== 'calendar') return null;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay(); // 0=Sun

  // All days to render (padding + actual days)
  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;

  // Index tasks by due date
  const tasksByDate: Record<string, Task[]> = {};
  for (const task of tasks) {
    if (task.due) {
      if (!tasksByDate[task.due]) tasksByDate[task.due] = [];
      tasksByDate[task.due].push(task);
    }
  }

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
    setHoverDate(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
    setHoverDate(null);
  };

  const handleDayMouseEnter = (e: React.MouseEvent, dateStr: string) => {
    if (!tasksByDate[dateStr]?.length) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setHoverPos({ x: rect.right + 6, y: rect.top });
      setHoverDate(dateStr);
    }, 350);
  };

  const handleDayMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoverDate(null);
  };

  const selectedTasks = selectedDate ? (tasksByDate[selectedDate] || []) : [];
  const todayStr = today.toISOString().slice(0, 10);

  return (
    <div
      className="flex flex-1 flex-col overflow-hidden"
      onContextMenu={(e) => { e.preventDefault(); setEmptyCtxMenu({ x: e.clientX, y: e.clientY }); }}
    >
      {/* Header */}
      <div className="border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">{t(language, 'tasks', 'calendarTitle')}</h1>
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="rounded-lg p-1.5 text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition">
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[140px] text-center text-sm font-medium text-[var(--text-secondary)]">
            {MONTHS[month]} {year}
          </span>
          <button onClick={nextMonth} className="rounded-lg p-1.5 text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Calendar grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2 text-center text-xs text-[var(--text-hint)] font-medium">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: totalCells }).map((_, i) => {
              const dayNum = i - startOffset + 1;
              const isValid = dayNum >= 1 && dayNum <= lastDay.getDate();
              if (!isValid) return <div key={i} />;

              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const dayTasks = tasksByDate[dateStr] || [];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  onMouseEnter={(e) => handleDayMouseEnter(e, dateStr)}
                  onMouseLeave={handleDayMouseLeave}
                  className={`flex flex-col items-center rounded-xl p-2 transition min-h-[60px] ${
                    isSelected
                      ? 'bg-indigo-500/20 border border-indigo-500/40'
                      : 'hover:bg-[var(--bg-hover)] border border-transparent'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                      isToday
                        ? 'bg-indigo-600 text-white'
                        : isSelected
                        ? 'text-indigo-300'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {dayNum}
                  </span>
                  {/* Task dots */}
                  {dayTasks.length > 0 && (
                    <div className="mt-1 flex flex-wrap justify-center gap-0.5">
                      {dayTasks.slice(0, 3).map((t) => (
                        <span
                          key={t.id}
                          className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[t.status]}`}
                        />
                      ))}
                      {dayTasks.length > 3 && (
                        <span className="text-[8px] text-[var(--text-hint)]">+{dayTasks.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected day panel */}
        {selectedDate && (
          <div className="w-64 border-l border-[var(--border)] flex flex-col overflow-hidden">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <p className="text-sm font-medium text-[var(--text-primary)]">{selectedDate}</p>
              <p className="text-xs text-[var(--text-hint)]">{selectedTasks.length} {t(language, 'tasks', 'taskCount')}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {selectedTasks.length === 0 ? (
                <p className="text-xs text-[var(--text-faint)] italic text-center pt-4">{t(language, 'tasks', 'noTasksDate')}</p>
              ) : (
                selectedTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => setActiveTask(activeTask?.id === task.id ? null : task)}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ task, x: e.clientX, y: e.clientY }); }}
                    className={`w-full text-left rounded-xl border px-3 py-2.5 transition ${
                      activeTask?.id === task.id
                        ? 'border-indigo-500/40 bg-indigo-500/10'
                        : 'border-[var(--border-card)] hover:border-[var(--border-high)]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[task.status]}`} />
                      <p className={`text-xs font-medium ${task.status === 'done' ? 'line-through text-[var(--text-hint)]' : 'text-[var(--text-body)]'}`}>
                        {task.title}
                      </p>
                    </div>
                    {task.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1 pl-4">
                        {task.tags.slice(0, 2).map((t) => (
                          <span key={t} className="text-[8px] text-indigo-400">{t}</span>
                        ))}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hover preview tooltip */}
      {hoverDate && tasksByDate[hoverDate]?.length > 0 && (
        <div
          style={{ position: 'fixed', top: hoverPos.y, left: hoverPos.x, zIndex: 9998 }}
          className="w-52 rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-2 shadow-2xl pointer-events-none"
        >
          <p className="border-b border-[var(--border)] px-3 pb-2 text-[10px] font-semibold text-[var(--text-hint)] uppercase tracking-widest">
            {hoverDate}
          </p>
          <div className="space-y-1 px-2 pt-2 max-h-48 overflow-hidden">
            {tasksByDate[hoverDate].slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center gap-2 px-1 py-0.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[t.status]}`} />
                <p className={`truncate text-[11px] ${t.status === 'done' ? 'line-through text-[var(--text-hint)]' : 'text-[var(--text-body)]'}`}>
                  {t.title}
                </p>
              </div>
            ))}
            {tasksByDate[hoverDate].length > 6 && (
              <p className="px-1 text-[10px] text-[var(--text-faint)]">
                +{tasksByDate[hoverDate].length - 6} {t(language, 'tasks', 'moreSuffix')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Context menu en tareas del panel lateral */}
      {ctxMenu && (
        <TaskContextMenu
          task={ctxMenu.task}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
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
