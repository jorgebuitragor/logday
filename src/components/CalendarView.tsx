import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Pencil, Trash2, Clock, CalendarDays, Copy, Bell, Repeat2, X } from 'lucide-react';
import { Task, TaskStatus } from '../types/task';
import { CalendarEvent, EventColor, EventRepeat } from '../types/calendar';
import { useAppStore } from '../store/appStore';
import { TaskContextMenu, NewTaskContextMenu } from './TaskContextMenu';
import { AppDatePicker } from './AppDatePicker';
import ToggleSwitch from './ToggleSwitch';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { usePositionedMenu } from '../hooks/usePositionedMenu';
import { v4 as uuidv4 } from 'uuid';
import { t, MONTHS_TITLE, WEEKDAYS_SHORT } from '../lib/i18n';

const ESTIMATED_DAY_CTX_MENU = { width: 190, height: 88 };
const ESTIMATED_EVENT_CTX_MENU = { width: 190, height: 128 };

const STATUS_DOT: Record<TaskStatus, string> = {
  todo: 'bg-zinc-500',
  'in-progress': 'bg-amber-400',
  done: 'bg-green-400',
};

const EVENT_COLOR_DOT: Record<EventColor, string> = {
  indigo:  'bg-[#818cf8]',
  amber:   'bg-amber-400',
  emerald: 'bg-emerald-400',
  rose:    'bg-rose-400',
  sky:     'bg-sky-400',
  violet:  'bg-violet-400',
};

const EVENT_COLOR_BADGE: Record<EventColor, string> = {
  indigo:  'border-[#6366f1]/40 bg-[#6366f1]/10 text-[#818cf8]',
  amber:   'border-amber-500/40 bg-amber-500/10 text-amber-300',
  emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  rose:    'border-rose-500/40 bg-rose-500/10 text-rose-300',
  sky:     'border-sky-500/40 bg-sky-500/10 text-sky-300',
  violet:  'border-violet-500/40 bg-violet-500/10 text-violet-300',
};

const EVENT_COLORS: EventColor[] = ['indigo', 'amber', 'emerald', 'rose', 'sky', 'violet'];
const REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440] as const;

function reminderLabel(lang: 'es' | 'en', mins: number): string {
  if (mins === 0)    return t(lang, 'calendar', 'reminderNone');
  if (mins === 5)    return t(lang, 'calendar', 'reminder5m');
  if (mins === 10)   return t(lang, 'calendar', 'reminder10m');
  if (mins === 15)   return t(lang, 'calendar', 'reminder15m');
  if (mins === 30)   return t(lang, 'calendar', 'reminder30m');
  if (mins === 60)   return t(lang, 'calendar', 'reminder1h');
  if (mins === 120)  return t(lang, 'calendar', 'reminder2h');
  if (mins === 1440) return t(lang, 'calendar', 'reminder1d');
  return `${mins}m`;
}

// ── AppSelect ── custom dropdown with app styles ───────────────

interface AppSelectOption<T> {
  value: T;
  label: string;
}

function AppSelect<T extends string | number>({
  value, options, onChange,
}: {
  value: T;
  options: AppSelectOption<T>[];
  onChange: (v: T) => void;
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

  const active = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className={`flex min-w-[10rem] items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-xs transition ${
          open
            ? 'border-indigo-500/60 bg-indigo-500/10 text-[var(--text-secondary)]'
            : 'border-[var(--border-card)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-high)] hover:bg-[var(--bg-hover)]'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="font-medium">{active?.label}</span>
        <ChevronDown size={12} className={`shrink-0 text-[var(--text-hint)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1.5 min-w-full overflow-hidden rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl">
          <div role="listbox" className="p-1">
            {options.map((opt) => {
              const isActive = opt.value === value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`w-full rounded-md px-3 py-1.5 text-left text-xs font-medium transition ${
                    isActive
                      ? 'bg-indigo-500/10 text-indigo-400'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Event Editor Modal ──────────────────────────────────────────

interface EventEditorProps {
  initial: Partial<CalendarEvent> & { date: string };
  language: 'es' | 'en';
  onSave: (ev: CalendarEvent) => void;
  onDelete?: () => void;
  onClose: () => void;
}

function EventEditor({ initial, language, onSave, onDelete, onClose }: EventEditorProps) {
  const isNew = !initial.id;
  const [title, setTitle]   = useState(initial.title ?? '');
  const [date, setDate]     = useState(initial.date);
  const [allDay, setAllDay] = useState(!initial.time);
  const [time, setTime]     = useState(initial.time || '09:00');
  const [desc, setDesc]     = useState(initial.description ?? '');
  const [color, setColor]   = useState<EventColor>(initial.color ?? 'indigo');

  const [reminderEnabled, setReminderEnabled] = useState<boolean>(() => {
    if (isNew) return useAppStore.getState().notificationsEnabled;
    return (initial.reminderMinutes ?? 0) > 0;
  });
  const [reminder, setReminder] = useState<number>(() => {
    const m = initial.reminderMinutes ?? 0;
    return m > 0 ? m : useAppStore.getState().defaultReminderMinutes;
  });

  const initRepeat = (initial.repeat ?? 'none') as EventRepeat;
  const [repeatEnabled, setRepeatEnabled] = useState(initRepeat !== 'none');
  const [repeat, setRepeat] = useState<Exclude<EventRepeat, 'none'>>(
    initRepeat !== 'none' ? (initRepeat as Exclude<EventRepeat, 'none'>) : 'weekly'
  );

  const [confirmDel, setConfirmDel] = useState(false);

  const reminderOptions = REMINDER_OPTIONS.filter((m) => m > 0).map((m) => ({
    value: m as number,
    label: reminderLabel(language, m),
  }));

  const repeatOptions: AppSelectOption<Exclude<EventRepeat, 'none'>>[] = [
    { value: 'daily',     label: t(language, 'calendar', 'repeatDaily') },
    { value: 'weekly',    label: t(language, 'calendar', 'repeatWeekly') },
    { value: 'biweekly',  label: t(language, 'calendar', 'repeatBiweekly') },
    { value: 'monthly',   label: t(language, 'calendar', 'repeatMonthly') },
    { value: 'yearly',    label: t(language, 'calendar', 'repeatYearly') },
  ];

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      id: initial.id ?? uuidv4(),
      title: title.trim(),
      date,
      time: allDay ? '' : time,
      description: desc,
      color,
      reminderMinutes: (allDay || !reminderEnabled) ? 0 : reminder,
      repeat: repeatEnabled ? repeat : 'none',
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="border-b border-[var(--border)] px-5 py-4 shrink-0">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {initial.id ? t(language, 'calendar', 'editEvent') : t(language, 'calendar', 'addEvent')}
          </h2>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          {/* Título */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              {t(language, 'calendar', 'eventTitle')}
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t(language, 'calendar', 'eventTitlePlaceholder')}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-body)] placeholder:text-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          {/* Fecha */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
              {t(language, 'calendar', 'eventDate')}
            </label>
            <AppDatePicker value={date} onChange={setDate} />
          </div>

          {/* Segmented: Todo el día / Hora específica */}
          <div className="flex rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] p-1 gap-1">
            <button
              type="button"
              onClick={() => { setAllDay(true); setReminderEnabled(false); }}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
                allDay
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-hint)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {t(language, 'calendar', 'eventAllDay')}
            </button>
            <button
              type="button"
              onClick={() => setAllDay(false)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
                !allDay
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-hint)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {t(language, 'calendar', 'eventSpecificTime')}
            </button>
          </div>

          {/* Hora (solo si hora específica) */}
          {!allDay && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                {t(language, 'calendar', 'eventTime')}
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          )}

          {/* Recordatorio (solo si hora específica) */}
          {!allDay && (
            <div className="space-y-1.5">
              <div
                onClick={() => setReminderEnabled(!reminderEnabled)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 text-left transition hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'calendar', 'reminderLabel')}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'calendar', 'reminderToggleDesc')}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${reminderEnabled ? 'text-[var(--accent)]' : 'text-[var(--text-hint)]'}`}>
                    {reminderEnabled ? t(language, 'calendar', 'reminderOn') : t(language, 'calendar', 'reminderOff')}
                  </span>
                  <ToggleSwitch checked={reminderEnabled} onChange={setReminderEnabled} size="lg" />
                </div>
              </div>
              {reminderEnabled && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
                  <p className="text-xs font-medium text-[var(--text-secondary)]">
                    {t(language, 'calendar', 'reminderWhen')}
                  </p>
                  <AppSelect
                    value={reminder}
                    options={reminderOptions}
                    onChange={(v) => setReminder(v as number)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Repetir */}
          <div className="space-y-1.5">
            <div
              onClick={() => setRepeatEnabled(!repeatEnabled)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3 text-left transition hover:bg-[var(--bg-hover)] cursor-pointer"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--text-secondary)]">{t(language, 'calendar', 'repeatToggleLabel')}</p>
                <p className="mt-0.5 text-[10px] text-[var(--text-hint)]">{t(language, 'calendar', 'repeatToggleDesc')}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${repeatEnabled ? 'text-[var(--accent)]' : 'text-[var(--text-hint)]'}`}>
                  {repeatEnabled ? t(language, 'calendar', 'reminderOn') : t(language, 'calendar', 'reminderOff')}
                </span>
                <ToggleSwitch checked={repeatEnabled} onChange={setRepeatEnabled} size="lg" />
              </div>
            </div>
            {repeatEnabled && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] px-4 py-3">
                <p className="text-xs font-medium text-[var(--text-secondary)]">
                  {t(language, 'calendar', 'repeatFrequency')}
                </p>
                <AppSelect
                  value={repeat}
                  options={repeatOptions}
                  onChange={(v) => setRepeat(v as Exclude<EventRepeat, 'none'>)}
                />
              </div>
            )}
          </div>

          {/* Color */}
          <div>
            <label className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
              {t(language, 'calendar', 'eventColor')}
            </label>
            <div className="flex gap-2">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-full transition ring-offset-2 ring-offset-[var(--bg-elevated)] ${EVENT_COLOR_DOT[c]} ${
                    color === c ? 'ring-2 ring-white/60' : 'opacity-60 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              {t(language, 'calendar', 'eventDesc')}
            </label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={t(language, 'calendar', 'eventDescPlaceholder')}
              rows={2}
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-body)] placeholder:text-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border)] px-5 py-3 flex items-center justify-between gap-2 shrink-0">
          {onDelete ? (
            confirmDel ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-400">{t(language, 'calendar', 'deleteEventConfirm')}</span>
                <button onClick={onDelete} className="rounded-lg px-3 py-1.5 text-xs font-medium bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition">
                  {t(language, 'calendar', 'delete')}
                </button>
                <button onClick={() => setConfirmDel(false)} className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-hint)] hover:text-[var(--text-body)] transition">
                  {t(language, 'calendar', 'cancel')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDel(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 transition"
              >
                <Trash2 size={13} /> {t(language, 'calendar', 'deleteEvent')}
              </button>
            )
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-hint)] hover:text-[var(--text-body)] hover:bg-[var(--bg-hover)] transition">
              {t(language, 'calendar', 'cancel')}
            </button>
            <button
              disabled={!title.trim()}
              onClick={handleSave}
              className="rounded-lg px-4 py-1.5 text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t(language, 'calendar', 'saveEvent')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CalendarView ────────────────────────────────────────────────


export function CalendarView() {
  const { tasks, currentView, setActiveTask, activeTask, language, calendarEvents, saveCalendarEvent, deleteCalendarEvent, showToast, confirmDestructiveActions, activeCalendarEvent, setActiveCalendarEvent } = useAppStore();

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
  const [ctxMenu, setCtxMenu]           = useState<{ task: Task; x: number; y: number } | null>(null);
  const [emptyCtxMenu, setEmptyCtxMenu] = useState<{ x: number; y: number } | null>(null);
  // Event editor modal
  const [eventEditor, setEventEditor] = useState<{ event: Partial<CalendarEvent> & { date: string } } | null>(null);
  // Day context menu (right-click on a specific day cell)
  const [dayCtxMenu, setDayCtxMenu] = useState<{ x: number; y: number; date: string } | null>(null);
  const dayCtxLayout = usePositionedMenu(dayCtxMenu, {
    estimatedSize: ESTIMATED_DAY_CTX_MENU,
    onClose: () => setDayCtxMenu(null),
  });
  // Event context menu (right-click on an event card)
  const [evCtxMenu, setEvCtxMenu] = useState<{ event: CalendarEvent; x: number; y: number } | null>(null);
  const evCtxLayout = usePositionedMenu(evCtxMenu, {
    estimatedSize: ESTIMATED_EVENT_CTX_MENU,
    onClose: () => setEvCtxMenu(null),
  });
  // Active event detail panel - managed in store (mutual exclusion with activeTask)
  const confirmDeleteEventDialog = useConfirmDelete<CalendarEvent>(confirmDestructiveActions);
  // Inline-editing state for the event detail panel
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState('');
  const [evAllDay, setEvAllDay] = useState(true);
  const [evTime, setEvTime] = useState('09:00');
  const [evDesc, setEvDesc] = useState('');
  const [evColor, setEvColor] = useState<EventColor>('indigo');
  const [evReminderEnabled, setEvReminderEnabled] = useState(false);
  const [evReminder, setEvReminder] = useState(15);
  const [evRepeatEnabled, setEvRepeatEnabled] = useState(false);
  const [evRepeat, setEvRepeat] = useState<Exclude<EventRepeat, 'none'>>('weekly');
  const [evDirty, setEvDirty] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const date = (e as CustomEvent<{ date: string }>).detail?.date;
      if (!date) return;
      const d = new Date(`${date}T12:00:00`);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
      setSelectedDate(date);
      setEventEditor({ event: { date } });
    };
    window.addEventListener('logday:new-event', handler);
    return () => window.removeEventListener('logday:new-event', handler);
  }, []);

  // Cerrar panel de detalle al cambiar de día seleccionado
  useEffect(() => {
    setActiveCalendarEvent(null);
    setActiveTask(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Sync inline-edit form when activeCalendarEvent changes
  useEffect(() => {
    if (!activeCalendarEvent) return;
    setEvTitle(activeCalendarEvent.title);
    setEvDate(activeCalendarEvent.date);
    setEvAllDay(!activeCalendarEvent.time);
    setEvTime(activeCalendarEvent.time || '09:00');
    setEvDesc(activeCalendarEvent.description);
    setEvColor(activeCalendarEvent.color);
    setEvReminderEnabled(activeCalendarEvent.reminderMinutes > 0);
    setEvReminder(activeCalendarEvent.reminderMinutes > 0 ? activeCalendarEvent.reminderMinutes : 15);
    setEvRepeatEnabled(activeCalendarEvent.repeat !== 'none');
    setEvRepeat(activeCalendarEvent.repeat !== 'none' ? (activeCalendarEvent.repeat as Exclude<EventRepeat, 'none'>) : 'weekly');
    setEvDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCalendarEvent?.id]);

  // Auto-save inline edits with debounce
  useEffect(() => {
    if (!evDirty || !activeCalendarEvent) return;
    const timer = setTimeout(async () => {
      await saveCalendarEvent({
        id: activeCalendarEvent.id,
        title: evTitle.trim() || activeCalendarEvent.title,
        date: evDate,
        time: evAllDay ? '' : evTime,
        description: evDesc,
        color: evColor,
        reminderMinutes: evAllDay || !evReminderEnabled ? 0 : evReminder,
        repeat: evRepeatEnabled ? evRepeat : 'none',
      });
      setEvDirty(false);
    }, 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evDirty, evTitle, evDate, evAllDay, evTime, evDesc, evColor, evReminderEnabled, evReminder, evRepeatEnabled, evRepeat]);

  if (currentView !== 'calendar') return null;

  const firstDay    = new Date(year, month, 1);
  const lastDay     = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay(); // 0=Sun
  const totalCells  = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;

  // Index tasks by due date
  const tasksByDate: Record<string, Task[]> = {};
  for (const task of tasks) {
    if (task.due) {
      if (!tasksByDate[task.due]) tasksByDate[task.due] = [];
      tasksByDate[task.due].push(task);
    }
  }

  // Index events by date
  const eventsByDate: Record<string, CalendarEvent[]> = {};
  for (const ev of calendarEvents) {
    if (!eventsByDate[ev.date]) eventsByDate[ev.date] = [];
    eventsByDate[ev.date].push(ev);
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
    if (!tasksByDate[dateStr]?.length && !eventsByDate[dateStr]?.length) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      const tooltipWidth = 224; // w-56
      const spaceRight = window.innerWidth - rect.right - 6;
      const x = spaceRight >= tooltipWidth
        ? rect.right + 6
        : rect.left - tooltipWidth - 6;
      setHoverPos({ x, y: rect.top });
      setHoverDate(dateStr);
    }, 350);
  };

  const handleDayMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoverDate(null);
  };

  const selectedTasks  = selectedDate ? (tasksByDate[selectedDate]  || []) : [];
  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];
  const todayStr = today.toISOString().slice(0, 10);

  const handleSaveEvent = async (ev: CalendarEvent) => {
    await saveCalendarEvent(ev);
    showToast({ kind: 'success', title: t(language, 'calendar', 'eventSaved') });
    setEventEditor(null);
  };

  const handleDeleteEvent = async (id: string) => {
    await deleteCalendarEvent(id);
    showToast({ kind: 'success', title: t(language, 'calendar', 'eventDeleted') });
    setEventEditor(null);
  };

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
          <div key={`${year}-${month}`} className="cal-grid-enter grid grid-cols-7 gap-1">
            {Array.from({ length: totalCells }).map((_, i) => {
              const dayNum = i - startOffset + 1;
              const isValid = dayNum >= 1 && dayNum <= lastDay.getDate();
              if (!isValid) return <div key={i} />;

              const dateStr   = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const dayTasks  = tasksByDate[dateStr]  || [];
              const dayEvents = eventsByDate[dateStr] || [];
              const isToday    = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  onMouseEnter={(e) => handleDayMouseEnter(e, dateStr)}
                  onMouseLeave={handleDayMouseLeave}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDayCtxMenu({ x: e.clientX, y: e.clientY, date: dateStr });
                  }}
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
                  {/* Task + event dots */}
                  {(dayTasks.length > 0 || dayEvents.length > 0) && (
                    <div className="mt-1 flex flex-wrap justify-center gap-0.5">
                      {dayTasks.slice(0, 2).map((tk) => (
                        <span key={tk.id} className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[tk.status]}`} />
                      ))}
                      {dayEvents.slice(0, 2).map((ev) => (
                        <span key={ev.id} className={`h-1.5 w-1.5 rounded-full ${EVENT_COLOR_DOT[ev.color]}`} />
                      ))}
                      {(dayTasks.length + dayEvents.length) > 4 && (
                        <span className="text-[8px] text-[var(--text-hint)]">+{dayTasks.length + dayEvents.length - 4}</span>
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
          <div key={selectedDate} className="cal-panel-enter w-72 border-l border-[var(--border)] flex flex-col overflow-hidden">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <p className="text-sm font-medium text-[var(--text-primary)]">{selectedDate}</p>
              <p className="text-xs text-[var(--text-hint)]">
                {selectedTasks.length} {t(language, 'calendar', 'tasks')} · {selectedEvents.length} {t(language, 'calendar', 'events')}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">

              {/* Events section */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)]">
                    {t(language, 'calendar', 'events')}
                  </span>
                  <button
                    onClick={() => setEventEditor({ event: { date: selectedDate } })}
                    className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 transition"
                  >
                    <Plus size={11} /> {t(language, 'calendar', 'addEvent')}
                  </button>
                </div>
                {selectedEvents.length === 0 ? (
                  <p className="text-xs text-[var(--text-faint)] italic py-1">{t(language, 'calendar', 'noEvents')}</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedEvents.map((ev) => (
                      <div
                        key={ev.id}
                        onClick={() => setActiveCalendarEvent(activeCalendarEvent?.id === ev.id ? null : ev)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setActiveCalendarEvent(null);
                          setEvCtxMenu({ event: ev, x: e.clientX, y: e.clientY });
                        }}
                        className={`rounded-xl border px-3 py-2 flex items-start justify-between gap-2 cursor-pointer select-none transition hover:brightness-110 ${activeCalendarEvent?.id === ev.id ? 'ring-1 ring-white/20' : ''} ${EVENT_COLOR_BADGE[ev.color]}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{ev.title}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {ev.time ? (
                              <span className="flex items-center gap-0.5 text-[10px] opacity-70">
                                <Clock size={9} /> {ev.time}
                              </span>
                            ) : (
                              <span className="flex items-center gap-0.5 text-[10px] opacity-70">
                                <CalendarDays size={9} /> {t(language, 'calendar', 'allDayBadge')}
                              </span>
                            )}
                          </div>
                          {ev.description && (
                            <p className="mt-0.5 text-[10px] opacity-60 line-clamp-2">{ev.description}</p>
                          )}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEventEditor({ event: ev }); }}
                          className="shrink-0 opacity-50 hover:opacity-100 transition mt-0.5"
                        >
                          <Pencil size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-[var(--border)]" />

              {/* Tasks section */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)]">
                    {t(language, 'calendar', 'tasks')}
                  </span>
                  <button
                    onClick={() => { window.dispatchEvent(new CustomEvent('logday:new-task')); }}
                    className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 transition"
                  >
                    <Plus size={11} /> {t(language, 'tasks', 'newTask')}
                  </button>
                </div>
                {selectedTasks.length === 0 ? (
                  <p className="text-xs text-[var(--text-faint)] italic py-1">{t(language, 'tasks', 'noTasksDate')}</p>
                ) : (
                  selectedTasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => setActiveTask(activeTask?.id === task.id ? null : task)}
                      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ task, x: e.clientX, y: e.clientY }); }}
                      className={`w-full text-left rounded-xl border px-3 py-2.5 transition mb-1 ${
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
                          {task.tags.slice(0, 2).map((tg) => (
                            <span key={tg} className="text-[8px] text-indigo-400">{tg}</span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Event detail panel — inline editable */}
        {activeCalendarEvent && (
          <div key={activeCalendarEvent.id} className="task-panel-enter flex h-full w-[420px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-input)]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const idx = EVENT_COLORS.indexOf(evColor);
                    const next = EVENT_COLORS[(idx + 1) % EVENT_COLORS.length];
                    setEvColor(next); setEvDirty(true);
                  }}
                  className={`h-3 w-3 shrink-0 rounded-full ${EVENT_COLOR_DOT[evColor]} transition ring-offset-2 ring-offset-[var(--bg-input)] hover:ring-2 hover:ring-white/40`}
                  title={t(language, 'calendar', 'eventColor')}
                />
                {evDirty && <span className="text-[10px] text-[var(--text-hint)]">{t(language, 'tasks', 'saving')}</span>}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const ev = activeCalendarEvent;
                    setActiveCalendarEvent(null);
                    confirmDeleteEventDialog.request(ev, (e) => void handleDeleteEvent(e.id!));
                  }}
                  className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:text-red-400 hover:bg-red-400/10"
                >
                  <Trash2 size={14} />
                </button>
                <button
                  onClick={() => setActiveCalendarEvent(null)}
                  className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Title */}
              <div className="px-5 pt-5 pb-3">
                <textarea
                  value={evTitle}
                  onChange={(e) => { setEvTitle(e.target.value); setEvDirty(true); }}
                  placeholder={t(language, 'calendar', 'eventTitlePlaceholder')}
                  rows={1}
                  className="w-full resize-none bg-transparent text-xl font-semibold text-[var(--text-primary)] outline-none placeholder-[var(--text-faint)] leading-tight"
                  style={{ overflow: 'hidden' }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = 'auto';
                    el.style.height = el.scrollHeight + 'px';
                  }}
                />
              </div>

              {/* Metadata */}
              <div className="px-5 pb-4 space-y-2 text-sm">
                {/* Date */}
                <div className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-[var(--text-hint)]">
                    <CalendarDays size={12} className="inline mr-1" />
                    {t(language, 'calendar', 'eventDate')}
                  </span>
                  <div className="flex-1">
                    <AppDatePicker value={evDate} onChange={(v) => { setEvDate(v); setEvDirty(true); }} />
                  </div>
                </div>

                {/* All day / Time toggle */}
                <div className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-[var(--text-hint)]">
                    <Clock size={12} className="inline mr-1" />
                    {t(language, 'calendar', 'eventTime')}
                  </span>
                  <div className="flex rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] p-0.5 gap-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => { setEvAllDay(true); setEvReminderEnabled(false); setEvDirty(true); }}
                      className={`rounded-md px-2.5 py-1 font-medium transition ${evAllDay ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-hint)] hover:text-[var(--text-secondary)]'}`}
                    >
                      {t(language, 'calendar', 'eventAllDay')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEvAllDay(false); setEvDirty(true); }}
                      className={`rounded-md px-2.5 py-1 font-medium transition ${!evAllDay ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-hint)] hover:text-[var(--text-secondary)]'}`}
                    >
                      {t(language, 'calendar', 'eventSpecificTime')}
                    </button>
                  </div>
                </div>

                {/* Time input */}
                {!evAllDay && (
                  <div className="flex items-center gap-3">
                    <span className="w-24 shrink-0" />
                    <input
                      type="time"
                      value={evTime}
                      onChange={(e) => { setEvTime(e.target.value); setEvDirty(true); }}
                      className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-body)] focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    />
                  </div>
                )}

                {/* Reminder */}
                {!evAllDay && (
                  <div className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-[var(--text-hint)]">
                      <Bell size={12} className="inline mr-1" />
                      {t(language, 'calendar', 'reminderLabel')}
                    </span>
                    <div className="flex items-center gap-2">
                      <ToggleSwitch
                        checked={evReminderEnabled}
                        onChange={(v) => { setEvReminderEnabled(v); setEvDirty(true); }}
                        size="md"
                      />
                      {evReminderEnabled && (
                        <AppSelect
                          value={evReminder}
                          options={REMINDER_OPTIONS.filter((m) => m > 0).map((m) => ({ value: m as number, label: reminderLabel(language, m) }))}
                          onChange={(v) => { setEvReminder(v as number); setEvDirty(true); }}
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Repeat */}
                <div className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-[var(--text-hint)]">
                    <Repeat2 size={12} className="inline mr-1" />
                    {t(language, 'calendar', 'repeatToggleLabel')}
                  </span>
                  <div className="flex items-center gap-2">
                    <ToggleSwitch
                      checked={evRepeatEnabled}
                      onChange={(v) => { setEvRepeatEnabled(v); setEvDirty(true); }}
                      size="md"
                    />
                    {evRepeatEnabled && (
                      <AppSelect
                        value={evRepeat}
                        options={[
                          { value: 'daily'    as const, label: t(language, 'calendar', 'repeatDaily') },
                          { value: 'weekly'   as const, label: t(language, 'calendar', 'repeatWeekly') },
                          { value: 'biweekly' as const, label: t(language, 'calendar', 'repeatBiweekly') },
                          { value: 'monthly'  as const, label: t(language, 'calendar', 'repeatMonthly') },
                          { value: 'yearly'   as const, label: t(language, 'calendar', 'repeatYearly') },
                        ]}
                        onChange={(v) => { setEvRepeat(v as Exclude<EventRepeat, 'none'>); setEvDirty(true); }}
                      />
                    )}
                  </div>
                </div>

                {/* Color */}
                <div className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-[var(--text-hint)]">
                    {t(language, 'calendar', 'eventColor')}
                  </span>
                  <div className="flex gap-2">
                    {EVENT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => { setEvColor(c); setEvDirty(true); }}
                        className={`h-5 w-5 rounded-full transition ring-offset-2 ring-offset-[var(--bg-input)] ${EVENT_COLOR_DOT[c]} ${evColor === c ? 'ring-2 ring-white/60' : 'opacity-50 hover:opacity-100'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="mx-5 mb-3 h-px bg-[var(--border)]" />

              {/* Description */}
              <div className="px-5 pb-6">
                <textarea
                  value={evDesc}
                  onChange={(e) => { setEvDesc(e.target.value); setEvDirty(true); }}
                  placeholder={t(language, 'calendar', 'eventDescPlaceholder')}
                  rows={4}
                  className="w-full resize-none bg-transparent text-xs text-[var(--text-secondary)] outline-none placeholder:text-[var(--text-faint)] leading-relaxed"
                />
              </div>
            </div>
          </div>
        )}
      </div>
      {hoverDate && (tasksByDate[hoverDate]?.length > 0 || eventsByDate[hoverDate]?.length > 0) && (
        <div
          style={{ position: 'fixed', top: hoverPos.y, left: hoverPos.x, zIndex: 9998 }}
          className="w-56 rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-2 shadow-2xl pointer-events-none"
        >
          <p className="border-b border-[var(--border)] px-3 pb-2 text-[10px] font-semibold text-[var(--text-hint)] uppercase tracking-widest">
            {hoverDate}
          </p>
          <div className="space-y-1 px-2 pt-2 max-h-48 overflow-hidden">
            {(eventsByDate[hoverDate] || []).slice(0, 3).map((ev) => (
              <div key={ev.id} className="flex items-center gap-2 px-1 py-0.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${EVENT_COLOR_DOT[ev.color]}`} />
                <p className="truncate text-[11px] text-[var(--text-body)]">
                  {ev.time ? `${ev.time} · ` : ''}{ev.title}
                </p>
              </div>
            ))}
            {(tasksByDate[hoverDate] || []).slice(0, 3).map((tk) => (
              <div key={tk.id} className="flex items-center gap-2 px-1 py-0.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[tk.status]}`} />
                <p className={`truncate text-[11px] ${tk.status === 'done' ? 'line-through text-[var(--text-hint)]' : 'text-[var(--text-body)]'}`}>
                  {tk.title}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event context menu */}
      {evCtxMenu && createPortal(
        <div
          ref={evCtxLayout.ref}
          style={{ ...evCtxLayout.style, zIndex: 9999 }}
          className="min-w-[190px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
        >
          <div className="border-b border-[var(--border)] px-3 pb-2 pt-1.5">
            <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)]">{evCtxMenu.event.title}</p>
          </div>
          <button
            onClick={() => { setEventEditor({ event: evCtxMenu.event }); setEvCtxMenu(null); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Pencil size={12} className="text-indigo-400" />
            {t(language, 'calendar', 'editEvent')}
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(evCtxMenu.event.title); setEvCtxMenu(null); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Copy size={12} className="text-[var(--text-hint)]" />
            {t(language, 'tasks', 'copyTitle')}
          </button>
          <div className="my-1 border-t border-[var(--border)]" />
          <button
            onClick={() => {
              confirmDeleteEventDialog.request(evCtxMenu.event, (ev) => void handleDeleteEvent(ev.id!));
              setEvCtxMenu(null);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-red-400"
          >
            <Trash2 size={12} className="text-red-400/60" />
            {t(language, 'calendar', 'deleteEvent')}
          </button>
        </div>,
        document.body
      )}

      {/* Modal confirmación eliminar evento */}
      {confirmDeleteEventDialog.isOpen && confirmDeleteEventDialog.pending && createPortal(
        <ConfirmDeleteModal
          title={t(language, 'calendar', 'deleteEvent')}
          message={t(language, 'calendar', 'deleteEventConfirm')}
          cancelLabel={t(language, 'calendar', 'cancel')}
          confirmLabel={t(language, 'calendar', 'deleteEvent')}
          onCancel={confirmDeleteEventDialog.cancel}
          onConfirm={() => { void handleDeleteEvent(confirmDeleteEventDialog.pending!.id!); confirmDeleteEventDialog.cancel(); }}
        />,
        document.body
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
          onNewEvent={() => {
            setEventEditor({ event: { date: selectedDate ?? todayStr } });
            setEmptyCtxMenu(null);
          }}
        />
      )}

      {/* Day cell context menu */}
      {dayCtxMenu && createPortal(
        <div
          ref={dayCtxLayout.ref}
          style={{ ...dayCtxLayout.style, zIndex: 9999 }}
          className="min-w-[190px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
        >
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('logday:new-task'));
              setDayCtxMenu(null);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Plus size={12} className="text-indigo-400" />
            {t(language, 'tasks', 'newTask')}
          </button>
          <button
            onClick={() => {
              setEventEditor({ event: { date: dayCtxMenu.date } });
              setSelectedDate(dayCtxMenu.date);
              setDayCtxMenu(null);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <CalendarDays size={12} className="text-emerald-400" />
            {t(language, 'calendar', 'addEvent')}
          </button>
        </div>,
        document.body
      )}

      {/* Event Editor Modal */}
      {eventEditor && (
        <EventEditor
          initial={eventEditor.event}
          language={language}
          onSave={handleSaveEvent}
          onDelete={eventEditor.event.id ? () => handleDeleteEvent(eventEditor.event.id!) : undefined}
          onClose={() => setEventEditor(null)}
        />
      )}
    </div>
  );
}
