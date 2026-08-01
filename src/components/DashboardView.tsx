import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck2, CalendarClock, CalendarDays, Clock, Coffee, FileText, ListTodo, NotebookText, RefreshCw, Sun, TriangleAlert } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/appStore';
import { fs } from '../lib/invoke';
import { parseFrontmatter, parseNote } from '../lib/markdown';
import { Note, Task, CalendarEvent } from '../types';
import { t as tFn } from '../lib/i18n';
import { isWorkDay, isColombianHoliday, toISO } from '../lib/colombianHolidays';
import { TaskContextMenu } from './TaskContextMenu';
import { AbsenceModal } from './AbsenceModal';
import { placeMenuAtPointer } from '../lib/menuPosition';

type RecentItem =
  | { kind: 'task'; id: string; title: string; date: string; task: Task }
  | { kind: 'note'; id: string; title: string; date: string; note: Note };

type DashboardData = {
  todayDaily?: { date: string; content: string };
  overdueOrToday: Task[];
  inProgressNoDue: Task[];
  recentActivity: RecentItem[];
  doneThisWeek: number;
};

const DASHBOARD_CACHE_TTL_MS = 45_000;
const dashboardCache = new Map<string, { at: number; data: DashboardData }>();



function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDailyFile(content: string): Record<string, string> {
  const entries: Record<string, string> = {};
  const parts = content.split(/^## (\d{4}-\d{2}-\d{2})\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const raw = (parts[i + 1] || '').trim().replace(/(\n*---\s*)+$/, '').trim();
    entries[parts[i].trim()] = raw;
  }
  return entries;
}

async function scanFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = await fs.listDir(current).catch(() => [] as Array<{ name: string; path: string; is_dir: boolean }>);
    for (const e of entries) {
      if (e.is_dir) stack.push(e.path);
      else if (e.name.endsWith('.md')) out.push(e.path);
    }
  }
  return out;
}

async function buildDashboardData(basePath: string): Promise<DashboardData> {
  const today = toISODate(new Date());

  const taskFiles = await scanFilesRecursive(`${basePath}/projects`);
  const taskRaw = await Promise.all(taskFiles.map((p) => fs.readFile(p).catch(() => '')));
  const tasks = taskRaw
    .map((raw, i) => (raw ? parseFrontmatter(raw, taskFiles[i]) : null))
    .filter((t): t is Task => t !== null);

  const noteFiles = await scanFilesRecursive(`${basePath}/notes`);
  const noteRaw = await Promise.all(noteFiles.map((p) => fs.readFile(p).catch(() => '')));
  const notes = noteRaw
    .map((raw, i) => (raw ? parseNote(raw, noteFiles[i]) : null))
    .filter((n): n is Note => n !== null);

  const dailysEntriesByDate: Record<string, string> = {};
  const dailyFiles = await scanFilesRecursive(`${basePath}/dailys`);
  const dailyRaw = await Promise.all(dailyFiles.map((p) => fs.readFile(p).catch(() => '')));
  for (const raw of dailyRaw) {
    if (!raw) continue;
    const parsed = parseDailyFile(raw);
    for (const [date, content] of Object.entries(parsed)) {
      dailysEntriesByDate[date] = content;
    }
  }

  const overdueOrToday = tasks
    .filter((t) => t.status !== 'done' && !!t.due && t.due <= today)
    .sort((a, b) => (a.due || '').localeCompare(b.due || ''));

  const inProgressNoDue = tasks
    .filter((t) => t.status === 'in-progress' && !t.due)
    .sort((a, b) => b.created.localeCompare(a.created));

  const taskItems: RecentItem[] = tasks.map((t) => ({
    kind: 'task',
    id: t.id,
    title: t.title,
    date: t.completedAt || t.due || t.created,
    task: t,
  }));

  const noteItems: RecentItem[] = notes.map((n) => ({
    kind: 'note',
    id: n.id,
    title: n.title,
    date: n.updated,
    note: n,
  }));

  const recentActivity = [...taskItems, ...noteItems]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() - diffToMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekStartISO = toISODate(weekStart);
  const weekEndISO = toISODate(weekEnd);

  const doneThisWeek = tasks.filter((t) => t.status === 'done' && !!t.completedAt && t.completedAt >= weekStartISO && t.completedAt <= weekEndISO).length;

  return {
    todayDaily: dailysEntriesByDate[today] ? { date: today, content: dailysEntriesByDate[today] } : undefined,
    overdueOrToday,
    inProgressNoDue,
    recentActivity,
    doneThisWeek,
  };
}

const STATUS_DOT: Record<string, string> = {
  todo: 'bg-zinc-500',
  'in-progress': 'bg-amber-400',
  done: 'bg-green-400',
};

const EVENT_COLOR_DOT: Record<string, string> = {
  indigo:  'bg-[#818cf8]',
  amber:   'bg-amber-400',
  emerald: 'bg-emerald-400',
  rose:    'bg-rose-400',
  sky:     'bg-sky-400',
  violet:  'bg-violet-400',
};

function WeeklyMiniCalendar({
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
  const todayISO = toISODate(todayDate);
  const [selectedDay, setSelectedDay] = useState(todayISO);
  const dow = todayDate.getDay();
  const diffToMon = dow === 0 ? 6 : dow - 1;

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayDate);
    d.setDate(todayDate.getDate() - diffToMon + i);
    return toISODate(d);
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

export function DashboardView() {
  const {
    basePath,
    activeSection,
    setSection,
    setActiveTask,
    setActiveNote,
    createTodayDaily,
    setActiveDailyDate,
    setActiveDailyMonth,
    language,
    tasks,
    calendarEvents,
    setView,
    createNote,
    workWeekDays,
    holidaysAsNonWork,
    absenceDays,
  } = useAppStore(
    useShallow((s) => ({
      basePath: s.basePath,
      activeSection: s.activeSection,
      setSection: s.setSection,
      setActiveTask: s.setActiveTask,
      setActiveNote: s.setActiveNote,
      createTodayDaily: s.createTodayDaily,
      setActiveDailyDate: s.setActiveDailyDate,
      setActiveDailyMonth: s.setActiveDailyMonth,
      language: s.language,
      tasks: s.tasks,
      calendarEvents: s.calendarEvents,
      setView: s.setView,
      createNote: s.createNote,
      workWeekDays: s.workWeekDays,
      holidaysAsNonWork: s.holidaysAsNonWork,
      absenceDays: s.absenceDays,
    }))
  );

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [ctxTask, setCtxTask] = useState<{ task: Task; x: number; y: number } | null>(null);
  const [noteCtx, setNoteCtx] = useState<{ note: Note; x: number; y: number } | null>(null);
  const noteCtxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!noteCtx) return;
    const handler = (e: MouseEvent) => {
      if (!noteCtxRef.current?.contains(e.target as Node)) setNoteCtx(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [noteCtx]);

  const [dayCtx, setDayCtx] = useState<{ iso: string; x: number; y: number } | null>(null);
  const dayCtxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dayCtx) return;
    const handler = (e: MouseEvent) => {
      if (!dayCtxRef.current?.contains(e.target as Node)) setDayCtx(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dayCtx]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!basePath || activeSection !== 'dashboard') return;
      setLoading(true);
      setError(null);

      const cached = dashboardCache.get(basePath);
      if (cached && Date.now() - cached.at < DASHBOARD_CACHE_TTL_MS) {
        if (!alive) return;
        setData(cached.data);
        setLoading(false);
        return;
      }

      const snapshot = await buildDashboardData(basePath).catch(() => null);
      if (!alive) return;
      if (!snapshot) {
        setError(tFn(language, 'dashboard', 'errorLoad'));
        setLoading(false);
        return;
      }

      dashboardCache.set(basePath, { at: Date.now(), data: snapshot });
      setData(snapshot);
      setLoading(false);
    };
    run();
    return () => { alive = false; };
  }, [basePath, activeSection, reloadTick]);

  const todayPreview = useMemo(() => {
    const txt = data?.todayDaily?.content || '';
    const compact = txt.replace(/\s+/g, ' ').trim();
    return compact.length > 220 ? `${compact.slice(0, 220)}…` : compact;
  }, [data?.todayDaily?.content]);

  const openTodayDaily = () => {
    const today = toISODate(new Date());
    setActiveDailyMonth(today.slice(0, 7));
    setActiveDailyDate(today);
    setSection('dailys');
  };

  const createToday = () => {
    createTodayDaily();
    setSection('dailys');
  };

  const openTask = (task: Task) => {
    setActiveTask(task);
    setSection('tasks');
  };

  const openNote = (note: Note) => {
    setActiveNote(note);
    setSection('notes');
  };

  const handleNewTask = () => {
    setSection('tasks');
    setView('list');
    setTimeout(() => window.dispatchEvent(new CustomEvent('logday:new-task')), 80);
  };

  const handleNewNote = async () => {
    await createNote();
    setSection('notes');
  };

  const handleCalendar = () => {
    setSection('tasks');
    setView('calendar');
  };

  const today = new Date();
  const todayIsWorkDay = isWorkDay(today, workWeekDays, holidaysAsNonWork);
  const isHoliday = isColombianHoliday(today);
  const todayAbsence = absenceDays.find((a) => a.date === toISO(today)) ?? null;
  const todayAbsenceLabel = todayAbsence
    ? tFn(language, 'absence', `type${todayAbsence.type.charAt(0).toUpperCase()}${todayAbsence.type.slice(1)}` as 'typeIncapacidad' | 'typeVacaciones' | 'typeOtro')
    : null;

  const hour = today.getHours();
  const greetingKey = hour < 12 ? 'greetingMorning' : hour < 19 ? 'greetingAfternoon' : 'greetingEvening';
  const greeting = tFn(language, 'dashboard', greetingKey);

  const retryLoad = () => {
    if (basePath) dashboardCache.delete(basePath);
    setReloadTick((v) => v + 1);
  };

  if (activeSection !== 'dashboard') return null;

  const hasOverdue = (data?.overdueOrToday.length ?? 0) > 0;
  const hasInProgress = (data?.inProgressNoDue.length ?? 0) > 0;
  const activePanels = [hasOverdue, hasInProgress, true].filter(Boolean).length;

  return (
    <>
    <div className="flex-1 overflow-y-auto px-8 py-7">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">

        {/* Acciones rápidas */}
        <div className="flex flex-wrap gap-2 dash-enter dash-d0">
          {[
            { icon: <ListTodo size={14} />, label: tFn(language, 'dashboard', 'quickNewTask'), action: handleNewTask },
            { icon: <NotebookText size={14} />, label: tFn(language, 'dashboard', 'quickNewNote'), action: handleNewNote },
            { icon: <CalendarCheck2 size={14} />, label: tFn(language, 'dashboard', 'quickNewDaily'), action: createToday },
            { icon: <Clock size={14} />, label: tFn(language, 'dashboard', 'quickExtras'), action: () => setSection('overtime') },
            { icon: <CalendarDays size={14} />, label: tFn(language, 'dashboard', 'calendarLabel'), action: handleCalendar },
          ].map(({ icon, label, action }, i) => (
            <button
              key={label}
              onClick={action}
              style={{ animationDelay: `${i * 40}ms` }}
              className="dash-action-btn inline-flex items-center gap-2 rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-high)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <span className="text-indigo-400">{icon}</span>
              {label}
            </button>
          ))}
        </div>
        <section className="dash-enter dash-d1 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <CalendarCheck2 size={18} />
              <h2 className="text-base font-semibold">{tFn(language, 'dashboard', 'today')}</h2>
              {(!todayIsWorkDay || todayAbsence) && (
                <span className="rounded-full border border-[var(--border-card)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-hint)]">
                  {todayAbsenceLabel ?? (isHoliday ? tFn(language, 'dashboard', 'offDayHoliday') : tFn(language, 'dashboard', 'offDayWeekend'))}
                </span>
              )}
              <button
                onClick={() => setShowAbsenceModal(true)}
                className="rounded-full px-2 py-0.5 text-[10px] font-medium text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-indigo-400"
                title={tFn(language, 'absence', 'markButton')}
              >
                {tFn(language, 'dashboard', 'quickMarkAbsence')}
              </button>
            </div>
            <button
              onClick={retryLoad}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
              title={tFn(language, 'dashboard', 'refreshTitle')}
            >
              <RefreshCw size={12} />
              {tFn(language, 'dashboard', 'refresh')}
            </button>
          </div>

          {!loading && error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-sm text-red-300">{error}</p>
              <button
                onClick={retryLoad}
                className="mt-2 rounded-md border border-red-400/40 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/20"
              >
                {tFn(language, 'dashboard', 'retry')}
              </button>
            </div>
          )}

          {!todayIsWorkDay ? (
            /* ── Día no laborable ── */
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="dash-icon-greet flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-400">
                  <Coffee size={20} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{tFn(language, 'dashboard', 'offDayGreeting')}</p>
                  <p className="mt-0.5 max-w-md text-xs text-[var(--text-hint)]">{tFn(language, 'dashboard', 'offDaySubtitle')}</p>
                </div>
              </div>
              <button
                onClick={() => setSection('overtime')}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-300 transition hover:bg-indigo-500/20"
              >
                <Clock size={14} />
                {tFn(language, 'dashboard', 'offDayAddExtras')}
              </button>
            </div>
          ) : (
            /* ── Día laboral ── */
            <div className="space-y-4">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="dash-icon-greet flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-400">
                    <Sun size={18} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{greeting}</p>
                    <p className="mt-0.5 text-xs text-[var(--text-hint)]">{tFn(language, 'dashboard', 'greetingSubtitle')}</p>
                  </div>
                </div>
                {!loading && (
                  <button
                    onClick={data?.todayDaily ? openTodayDaily : createToday}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-300 transition hover:bg-indigo-500/20"
                  >
                    <CalendarCheck2 size={14} />
                    {data?.todayDaily ? tFn(language, 'dashboard', 'continueTxt') : tFn(language, 'dashboard', 'createToday')}
                  </button>
                )}
              </div>
              {loading ? (
                <p className="text-sm text-[var(--text-hint)]">{tFn(language, 'dashboard', 'loading')}</p>
              ) : data?.todayDaily ? (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--text-hint)]">
                    {tFn(language, 'dashboard', 'dailyOf')} {new Date(`${data.todayDaily.date}T12:00:00`).toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US')}
                  </p>
                  <p className="rounded-xl border border-[var(--border)] bg-[var(--bg-base)] p-3 text-sm text-[var(--text-secondary)]">
                    {todayPreview || tFn(language, 'dashboard', 'noContent')}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-hint)]">{tFn(language, 'dashboard', 'noDailyToday')}</p>
              )}
            </div>
          )}
        </section>

        <div className={`dash-enter dash-d2 grid grid-cols-1 gap-5 ${activePanels === 3 ? 'lg:grid-cols-3' : activePanels === 2 ? 'lg:grid-cols-2' : ''}`}>
          {hasOverdue && (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-4">
              <div className="mb-3 flex items-center gap-2 text-[var(--text-primary)]">
                <TriangleAlert size={16} className="text-indigo-400" />
                <h3 className="text-sm font-semibold">{tFn(language, 'dashboard', 'overdueTitle')}</h3>
              </div>
              <div className="space-y-2">
                {(data?.overdueOrToday || []).slice(0, 8).map((t, i) => (
                  <button
                    key={t.id}
                    onClick={() => openTask(t)}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxTask({ task: t, x: e.clientX, y: e.clientY }); }}
                    style={{ animation: 'dash-in 200ms ease-out both', animationDelay: `${130 + i * 25}ms` }}
                    className="block w-full rounded-lg border border-[var(--border)] px-3 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <div className="truncate font-medium text-[var(--text-primary)]">{t.title}</div>
                    <div className="mt-1 text-[var(--text-hint)]">{tFn(language, 'dashboard', 'dueLabel')} {t.due}</div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {hasInProgress && (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-4">
              <div className="mb-3 flex items-center gap-2 text-[var(--text-primary)]">
                <CalendarClock size={16} className="text-indigo-400" />
                <h3 className="text-sm font-semibold">{tFn(language, 'dashboard', 'inProgressTitle')}</h3>
              </div>
              <div className="space-y-2">
                {(data?.inProgressNoDue || []).slice(0, 8).map((t, i) => (
                  <button
                    key={t.id}
                    onClick={() => openTask(t)}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxTask({ task: t, x: e.clientX, y: e.clientY }); }}
                    style={{ animation: 'dash-in 200ms ease-out both', animationDelay: `${130 + i * 25}ms` }}
                    className="block w-full rounded-lg border border-[var(--border)] px-3 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <div className="truncate font-medium text-[var(--text-primary)]">{t.title}</div>
                    <div className="mt-1 text-[var(--text-hint)]">{tFn(language, 'dashboard', 'projectLabel')} {t.project}</div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Actividad reciente */}
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-4">
            <div className="mb-3 flex items-center gap-2 text-[var(--text-primary)]">
              <FileText size={16} className="text-indigo-400" />
              <h3 className="text-sm font-semibold">{tFn(language, 'dashboard', 'recentActivityTitle')}</h3>
            </div>
            <div className="space-y-1.5">
              {(data?.recentActivity || []).map((item, i) => (
                <button
                  key={item.id}
                  onClick={() => item.kind === 'task' ? openTask(item.task) : openNote(item.note)}
                  onContextMenu={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    if (item.kind === 'task') setCtxTask({ task: item.task, x: e.clientX, y: e.clientY });
                    else setNoteCtx({ note: item.note, x: e.clientX, y: e.clientY });
                  }}
                  style={{ animation: 'dash-in 200ms ease-out both', animationDelay: `${130 + i * 25}ms` }}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--border)] px-3 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  {item.kind === 'task'
                    ? <ListTodo size={13} className="shrink-0 text-indigo-400" />
                    : <NotebookText size={13} className="shrink-0 text-indigo-400" />
                  }
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-[var(--text-primary)]">
                      {item.title || tFn(language, 'dashboard', 'recentTask')}
                    </div>
                    <div className="text-[10px] text-[var(--text-hint)]">
                      {tFn(language, 'dashboard', item.kind === 'task' ? 'recentTask' : 'recentNote')} · {item.date}
                    </div>
                  </div>
                </button>
              ))}
              {(!data || data.recentActivity.length === 0) && (
                <p className="text-xs text-[var(--text-hint)]">{tFn(language, 'dashboard', 'recentEmpty')}</p>
              )}
            </div>
          </section>
        </div>

        <section className="dash-enter dash-d3 rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <CalendarDays size={16} className="text-indigo-400" />
              <h3 className="text-sm font-semibold">{tFn(language, 'dashboard', 'weekTitle')}</h3>
            </div>
            <button
              onClick={handleCalendar}
              className="text-xs text-[var(--text-hint)] transition hover:text-[var(--text-secondary)]"
            >
              {tFn(language, 'dashboard', 'calendarLabel')} →
            </button>
          </div>
          <WeeklyMiniCalendar
            tasks={tasks}
            calendarEvents={calendarEvents}
            language={language}
            onTaskClick={openTask}
            onTaskContextMenu={(task, x, y) => setCtxTask({ task, x, y })}
            onDayContextMenu={(iso, x, y) => setDayCtx({ iso, x, y })}
          />
          {data && data.doneThisWeek > 0 && (
            <p className="mt-3 text-xs text-[var(--text-hint)]">
              {data.doneThisWeek} {tFn(language, 'dashboard', 'doneWeek')}
            </p>
          )}
        </section>
      </div>
    </div>

      {ctxTask !== null && (
        <TaskContextMenu
          task={ctxTask.task}
          x={ctxTask.x}
          y={ctxTask.y}
          onClose={() => setCtxTask(null)}
        />
      )}

      {showAbsenceModal && (
        <AbsenceModal initialDate={toISO(today)} onClose={() => setShowAbsenceModal(false)} />
      )}

      {noteCtx !== null && createPortal(
        (() => {
          const nc = noteCtx;
          const pos = placeMenuAtPointer(
            { x: nc.x, y: nc.y },
            { width: 176, height: 84 },
            { padding: 8 },
          );
          return (
            <div
              ref={noteCtxRef}
              style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 9999 }}
              className="w-44 rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
            >
              <button
                onClick={() => { openNote(nc.note); setNoteCtx(null); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <NotebookText size={13} className="shrink-0 text-indigo-400" />
                {tFn(language, 'dashboard', 'openNote')}
              </button>
              <button
                onClick={() => { navigator.clipboard.writeText(nc.note.title); setNoteCtx(null); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <FileText size={13} className="shrink-0 text-[var(--text-hint)]" />
                {tFn(language, 'dashboard', 'copyTitle')}
              </button>
            </div>
          );
        })()
      , document.body)}

      {dayCtx !== null && createPortal(
        (() => {
          const dc = dayCtx;
          const pos = placeMenuAtPointer({ x: dc.x, y: dc.y }, { width: 176, height: 144 }, { padding: 8 });
          const displayDate = new Date(`${dc.iso}T12:00:00`).toLocaleDateString(
            language === 'es' ? 'es-CO' : 'en-US',
            { weekday: 'short', month: 'short', day: 'numeric' },
          );
          return (
            <div
              ref={dayCtxRef}
              style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 9999 }}
              className="w-44 rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
            >
              <div className="border-b border-[var(--border)] px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-hint)]">{displayDate}</p>
              </div>
              <button
                onClick={() => { handleNewTask(); setDayCtx(null); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <ListTodo size={13} className="shrink-0 text-indigo-400" />
                {tFn(language, 'dashboard', 'quickNewTask')}
              </button>
              <button
                onClick={() => {
                  setDayCtx(null);
                  setSection('tasks');
                  setView('calendar');
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('logday:new-event', { detail: { date: dc.iso } }));
                  }, 80);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <CalendarClock size={13} className="shrink-0 text-emerald-400" />
                {tFn(language, 'calendar', 'addEvent')}
              </button>
              <button
                onClick={() => { handleCalendar(); setDayCtx(null); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <CalendarDays size={13} className="shrink-0 text-[var(--text-hint)]" />
                {tFn(language, 'dashboard', 'calendarLabel')}
              </button>
            </div>
          );
        })()
      , document.body)}
    </>
  );
}
