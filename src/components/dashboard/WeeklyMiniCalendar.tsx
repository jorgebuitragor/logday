import { useState } from 'react';
import { Task } from '../../types/task';
import { CalendarEvent } from '../../types/calendar';
import { t as tFn } from '../../lib/i18n';
import { toISO } from '../../lib/colombianHolidays';
import { EVENT_COLOR_DOT } from '../../lib/calendarEventPresentation';

const STATUS_DOT: Record<string, string> = {
  todo: 'bg-zinc-500',
  'in-progress': 'bg-amber-400',
  done: 'bg-green-400',
};

export function WeeklyMiniCalendar({
  tasks,
  calendarEvents,
  language,
  onTaskClick,
  onTaskContextMenu,
  onDayContextMenu,
}: {
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  language: 'es' | 'en';
  onTaskClick: (task: Task) => void;
  onTaskContextMenu: (task: Task, x: number, y: number) => void;
  onDayContextMenu?: (iso: string, x: number, y: number) => void;
}) {
  const todayDate = new Date();
  const todayISO = toISO(todayDate);
  const [selectedDay, setSelectedDay] = useState(todayISO);
  const dow = todayDate.getDay();
  const diffToMon = dow === 0 ? 6 : dow - 1;

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayDate);
    d.setDate(todayDate.getDate() - diffToMon + i);
    return toISO(d);
  });

  const dayLabels = language === 'es'
    ? ['L', 'M', 'X', 'J', 'V', 'S', 'D']
    : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const selectedDayTasks = tasks.filter((t) => t.due === selectedDay);
  const selectedDayEvents = calendarEvents.filter((e) => e.date === selectedDay);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((iso, i) => {
          const dayTasks = tasks.filter((t) => t.due === iso);
          const dayEvents = calendarEvents.filter((e) => e.date === iso);
          const isToday = iso === todayISO;
          const isSelected = iso === selectedDay;
          const isPast = iso < todayISO;
          const dayNum = parseInt(iso.split('-')[2], 10);
          return (
            <button
              key={iso}
              type="button"
              onClick={() => setSelectedDay(iso)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onDayContextMenu?.(iso, e.clientX, e.clientY); }}
              className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 transition-all duration-200 hover:bg-[var(--bg-hover)] ${isPast ? 'opacity-40' : ''} ${isSelected && !isToday ? 'bg-indigo-500/5' : ''}`}
            >
              <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-hint)]">{dayLabels[i]}</span>
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all duration-200 ${
                isToday ? 'bg-indigo-600 text-white scale-110' : isSelected ? 'bg-indigo-500/25 text-indigo-400 scale-105 ring-1 ring-indigo-500/40' : 'text-[var(--text-primary)]'
              }`}>
                {dayNum}
              </span>
              <div className="flex min-h-[10px] flex-wrap justify-center gap-0.5">
                {dayTasks.slice(0, 3).map((tk) => (
                  <span key={tk.id} className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[tk.status]}`} />
                ))}
                {dayEvents.slice(0, 2).map((ev) => (
                  <span key={ev.id} className={`h-1.5 w-1.5 rounded-full ${EVENT_COLOR_DOT[ev.color]}`} />
                ))}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-3 border-t border-[var(--border)] pt-3">
        {selectedDayTasks.length === 0 && selectedDayEvents.length === 0 ? (
          <p key={selectedDay} className="text-xs text-[var(--text-hint)] logday-animate-in">{tFn(language, 'dashboard', 'weekNoTasks')}</p>
        ) : (
          <div key={selectedDay} className="space-y-1 logday-animate-in">
            {selectedDayEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[var(--text-secondary)]"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${EVENT_COLOR_DOT[ev.color] ?? 'bg-[#818cf8]'}`} />
                <span className="truncate flex-1">{ev.title}</span>
                {ev.time && <span className="shrink-0 text-[var(--text-hint)]">{ev.time}</span>}
              </div>
            ))}
            {selectedDayTasks.map((t) => (
              <button
                key={t.id}
                onClick={() => onTaskClick(t)}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onTaskContextMenu(t, e.clientX, e.clientY); }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[t.status]}`} />
                <span className="truncate">{t.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
