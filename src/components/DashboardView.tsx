import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarCheck2, CalendarClock, CheckCircle2, NotebookText, RefreshCw, TriangleAlert } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/appStore';
import { fs } from '../lib/invoke';
import { parseFrontmatter, parseNote } from '../lib/markdown';
import { Note, Task } from '../types';
import { t as tFn, MONTHS_LONG } from '../lib/i18n';

type DashboardData = {
  todayDaily?: { date: string; content: string };
  overdueOrToday: Task[];
  inProgressNoDue: Task[];
  latestNotes: Note[];
  streak: number;
  doneThisWeek: number;
  totalNotes: number;
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

  const latestNotes = [...notes]
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 3);

  let streak = 0;
  const cursor = new Date();
  while (true) {
    const d = toISODate(cursor);
    if (dailysEntriesByDate[d]) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

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
    latestNotes,
    streak,
    doneThisWeek,
    totalNotes: notes.length,
  };
}

function formatMonthYear(ymd: string, lang: 'es' | 'en'): string {
  const [y, m] = ymd.split('-');
  const month = MONTHS_LONG[lang][Number(m) - 1];
  return lang === 'es' ? `${month} ${y}` : `${month} ${y}`;
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
    }))
  );

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

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

  const retryLoad = () => {
    if (basePath) dashboardCache.delete(basePath);
    setReloadTick((v) => v + 1);
  };

  if (activeSection !== 'dashboard') return null;

  return (
    <div className="flex-1 overflow-y-auto px-8 py-7">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <CalendarCheck2 size={18} />
              <h2 className="text-base font-semibold">{tFn(language, 'dashboard', 'today')}</h2>
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

          {loading ? (
            <p className="text-sm text-[var(--text-hint)]">{tFn(language, 'dashboard', 'loading')}</p>
          ) : data?.todayDaily ? (
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-widest text-[var(--text-hint)]">
                {tFn(language, 'dashboard', 'dailyOf')} {new Date(`${data.todayDaily.date}T12:00:00`).toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US')}
              </p>
              <p className="rounded-xl border border-[var(--border)] bg-[var(--bg-base)] p-3 text-sm text-[var(--text-secondary)]">
                {todayPreview || tFn(language, 'dashboard', 'noContent')}
              </p>
              <button
                onClick={openTodayDaily}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
              >
                {tFn(language, 'dashboard', 'continueTxt')}
                <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-hint)]">{tFn(language, 'dashboard', 'noDailyToday')}</p>
              <button
                onClick={createToday}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
              >
                {tFn(language, 'dashboard', 'createToday')}
                <ArrowRight size={14} />
              </button>
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-4">
            <div className="mb-3 flex items-center gap-2 text-[var(--text-primary)]">
              <TriangleAlert size={16} className="text-amber-400" />
              <h3 className="text-sm font-semibold">{tFn(language, 'dashboard', 'overdueTitle')}</h3>
            </div>
            <div className="space-y-2">
              {(data?.overdueOrToday || []).slice(0, 8).map((t) => (
                <button
                  key={t.id}
                  onClick={() => openTask(t)}
                  className="block w-full rounded-lg border border-[var(--border)] px-3 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  <div className="truncate font-medium text-[var(--text-primary)]">{t.title}</div>
                  <div className="mt-1 text-[var(--text-hint)]">{tFn(language, 'dashboard', 'dueLabel')} {t.due}</div>
                </button>
              ))}
              {(!data || data.overdueOrToday.length === 0) && (
                <p className="text-xs text-[var(--text-hint)]">{tFn(language, 'dashboard', 'noOverdue')}</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-4">
            <div className="mb-3 flex items-center gap-2 text-[var(--text-primary)]">
              <CalendarClock size={16} className="text-sky-400" />
              <h3 className="text-sm font-semibold">{tFn(language, 'dashboard', 'inProgressTitle')}</h3>
            </div>
            <div className="space-y-2">
              {(data?.inProgressNoDue || []).slice(0, 8).map((t) => (
                <button
                  key={t.id}
                  onClick={() => openTask(t)}
                  className="block w-full rounded-lg border border-[var(--border)] px-3 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  <div className="truncate font-medium text-[var(--text-primary)]">{t.title}</div>
                  <div className="mt-1 text-[var(--text-hint)]">{tFn(language, 'dashboard', 'projectLabel')} {t.project}</div>
                </button>
              ))}
              {(!data || data.inProgressNoDue.length === 0) && (
                <p className="text-xs text-[var(--text-hint)]">{tFn(language, 'dashboard', 'noInProgress')}</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-4">
            <div className="mb-3 flex items-center gap-2 text-[var(--text-primary)]">
              <NotebookText size={16} className="text-emerald-400" />
              <h3 className="text-sm font-semibold">{tFn(language, 'dashboard', 'latestNotesTitle')}</h3>
            </div>
            <div className="space-y-2">
              {(data?.latestNotes || []).map((n) => (
                <button
                  key={n.id}
                  onClick={() => openNote(n)}
                  className="block w-full rounded-lg border border-[var(--border)] px-3 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  <div className="truncate font-medium text-[var(--text-primary)]">{n.title || tFn(language, 'dashboard', 'noTitle')}</div>
                  <div className="mt-1 text-[var(--text-hint)]">{tFn(language, 'dashboard', 'updatedLabel')} {n.updated}</div>
                </button>
              ))}
              {(!data || data.latestNotes.length === 0) && (
                <p className="text-xs text-[var(--text-hint)]">{tFn(language, 'dashboard', 'noNotes')}</p>
              )}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-panel)] p-4">
          <div className="mb-3 flex items-center gap-2 text-[var(--text-primary)]">
            <CheckCircle2 size={16} className="text-indigo-400" />
              <h3 className="text-sm font-semibold">{tFn(language, 'dashboard', 'metricsTitle')}</h3>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-base)] px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-hint)]">{tFn(language, 'dashboard', 'streak')}</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{data?.streak ?? 0}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-base)] px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-hint)]">{tFn(language, 'dashboard', 'doneWeek')}</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{data?.doneThisWeek ?? 0}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-base)] px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-hint)]">{tFn(language, 'dashboard', 'totalNotes')}</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{data?.totalNotes ?? 0}</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-[var(--text-hint)]">
            {tFn(language, 'dashboard', 'contextLabel')} {formatMonthYear(toISODate(new Date()), language)}
          </p>
        </section>
      </div>
    </div>
  );
}
