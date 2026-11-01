// Vista del Pomodoro (PM8, design §2): el anillo con el tiempo, el ciclo,
// los controles, la tarea y "Hoy". Los atajos solo actúan con la vista
// montada y el foco dentro (design §7).
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Bell, BellOff, CircleCheck, ExternalLink, Hourglass, ListRestart, ListTodo, Pause, Play, Replace, RotateCcw, ShieldCheck,
  SkipForward, SlidersHorizontal, TriangleAlert, X,
} from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { localISODate, addDaysISO } from '../../lib/localDate';
import { CHIP, FOCUS_RING, ICON_BTN, PANEL_TITLE, SECONDARY_CLS } from '../../components/shared/controlClasses';
import { StatusItem } from '../../components/shared/FormControls';
import {
  POMODORO_ID, cycleBlock, focusMinutes, formatClock, fractionLeft, longBreakNext, phaseMinutes, readOptions,
  remainingOf, todayEntries, type HistoryEntry, type PomodoroOptions, type TimerState,
} from './model';
import { MAIN_BTN, PHASE_ICON, phaseColor, takeViewFocus } from './parts';
import {
  chooseTask, refreshTaskInfo, restartCycle, restartPhase, skipPhase, togglePhase, updateOptions, usePomodoro, type TaskInfo,
} from './store';
import { TaskPicker } from './TaskPicker';
import {
  formatFocus, isMac, makeTr, phaseName, shortDate, shortcutLabel, timeOfDay, type Tr,
} from './text';
import type { Language } from '../../lib/i18n';

const INTERACTIVE = 'input, textarea, select, button, a[href], [role="radio"], [role="combobox"], [role="option"], [contenteditable="true"]';

export default function PomodoroView() {
  const { language, raw, openExtensionSettings } = useAppStore(
    useShallow((s) => ({
      language: s.language,
      raw: s.extensions[POMODORO_ID]?.settings,
      openExtensionSettings: s.openExtensionSettings,
    })),
  );
  const { timer, history, now, today, live, notice, taskInfo } = usePomodoro(
    useShallow((s) => ({
      timer: s.timer, history: s.history, now: s.now, today: s.today, live: s.live, notice: s.notice, taskInfo: s.taskInfo,
    })),
  );
  const o = useMemo(() => readOptions(raw), [raw]);
  const tr = useMemo(() => makeTr(language), [language]);
  const mac = useMemo(isMac, []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const taskTriggerRef = useRef<HTMLButtonElement>(null);

  // Al abrirla con el teclado (desde el contador), el foco va al título,
  // para que Espacio funcione enseguida (design §7).
  useEffect(() => {
    if (takeViewFocus()) titleRef.current?.focus();
    void refreshTaskInfo();
  }, []);

  const closePicker = useCallback((refocus: boolean) => {
    setPickerOpen(false);
    if (refocus) window.setTimeout(() => taskTriggerRef.current?.focus(), 0);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.defaultPrevented) return;
    const mod = mac ? e.metaKey : e.ctrlKey;
    const target = e.target as HTMLElement;
    const inField = !!target.closest('input, textarea, [contenteditable="true"]');
    if (e.key === ' ' && !mod && !e.shiftKey && !e.altKey && !target.closest(INTERACTIVE)) {
      e.preventDefault();
      togglePhase();
      return;
    }
    if (!mod || !e.shiftKey || inField) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      skipPhase();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      restartPhase();
    } else if (e.key.toLowerCase() === 't') {
      e.preventDefault();
      setPickerOpen(true);
    }
  };

  const busy = timer.status === 'running' || timer.status === 'paused';
  // Un solo "Reiniciar el ciclo", junto al ciclo y con borde, en todos los
  // anchos: antes era texto gris de 11 px que, en el layout ancho, se iba al
  // pie de "Hoy", y Jorge no lo encontró al probar la app de QA.
  const restartCycleBtn = (
    <button
      type="button"
      onClick={restartCycle}
      title={tr('restartCycleTitle')}
      className={`flex items-center gap-1 rounded-md border border-[var(--border-card)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${FOCUS_RING}`}
    >
      <ListRestart size={12} aria-hidden />
      {tr('restartCycle')}
    </button>
  );

  return (
    <section
      aria-labelledby="pomodoro-title"
      onKeyDown={onKeyDown}
      className="@container/pomodoro flex h-full min-h-0 flex-col overflow-y-auto"
    >
      <Header
        tr={tr}
        o={o}
        titleRef={titleRef}
        onOptions={() => openExtensionSettings(POMODORO_ID)}
      />
      <div className="grid flex-1 content-start gap-6 px-5 py-6 @4xl/pomodoro:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col items-center gap-5">
          <Ring timer={timer} now={now} o={o} tr={tr} language={language} today={today} />
          <CycleRow timer={timer} o={o} tr={tr} extra={restartCycleBtn} />
          <Controls timer={timer} tr={tr} mac={mac} busy={busy} />
          <TaskCard
            tr={tr}
            timer={timer}
            info={taskInfo}
            mac={mac}
            pickerOpen={pickerOpen}
            triggerRef={taskTriggerRef}
            onOpenPicker={() => setPickerOpen(true)}
            onClosePicker={closePicker}
          />
          <StateLine timer={timer} o={o} tr={tr} language={language} notice={notice} />
        </div>
        <Today tr={tr} history={history} today={today} language={language} />
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        <span key={live.seq}>{live.text}</span>
      </div>
    </section>
  );
}

function Header({
  tr, o, titleRef, onOptions,
}: {
  tr: Tr;
  o: PomodoroOptions;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onOptions: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-400">
          <Hourglass size={16} aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 id="pomodoro-title" ref={titleRef} tabIndex={-1} className="text-sm font-semibold text-[var(--text-primary)] focus:outline-none">
            {tr('title')}
          </h2>
          <p className="mt-0.5 text-[11px] tabular-nums text-[var(--text-hint)]">
            {tr('summary', { work: o.workMin, short: o.shortMin, long: o.longMin, n: o.longEvery })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={o.sound}
          aria-label={tr('sound')}
          title={tr(o.sound ? 'soundOnTitle' : 'soundOffTitle')}
          onClick={() => updateOptions({ sound: !o.sound })}
          className={`${ICON_BTN} min-h-7 min-w-7 justify-center`}
        >
          {o.sound
            ? <Bell size={14} className="text-[var(--text-secondary)]" aria-hidden />
            : <BellOff size={14} className="text-[var(--text-hint)]" aria-hidden />}
        </button>
        <button type="button" onClick={onOptions} title={tr('optionsTitle')} className={SECONDARY_CLS}>
          <SlidersHorizontal size={13} aria-hidden />
          <span className="sr-only @md/pomodoro:not-sr-only">{tr('options')}</span>
        </button>
      </div>
    </div>
  );
}

/** "En pausa desde las 14:05", "desde ayer a las 18:20" o con fecha. */
function pausedText(at: number | undefined, today: string, tr: Tr, language: Language): string {
  if (at === undefined) return tr('statePaused');
  const day = localISODate(new Date(at));
  if (day === today) return tr('pausedSince', { time: timeOfDay(at, language) });
  if (day === addDaysISO(today, -1)) return tr('pausedSinceYesterday', { time: timeOfDay(at, language) });
  return tr('pausedSinceDate', { date: shortDate(at, language) });
}

function Ring({
  timer, now, o, tr, language, today,
}: {
  timer: TimerState;
  now: number;
  o: PomodoroOptions;
  tr: Tr;
  language: Language;
  today: string;
}) {
  const paused = timer.status === 'paused';
  const remaining = remainingOf(timer, now, o);
  const left = fractionLeft(timer, now, o);
  const Icon = PHASE_ICON[timer.phase];
  const secs = Math.ceil(remaining / 1000);
  const state = paused
    ? pausedText(timer.pausedAt, today, tr, language)
    : timer.status === 'ready'
      ? tr('stateReady')
      : '';
  return (
    <div className="relative grid size-[13rem] place-items-center @4xl/pomodoro:size-[16rem]">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="none" strokeWidth="3" style={{ stroke: 'var(--phase-track)' }} />
        <circle
          cx="50" cy="50" r="46" fill="none" strokeWidth="3" strokeLinecap="round"
          pathLength={100} strokeDasharray="100" strokeDashoffset={100 - left * 100}
          style={{ stroke: paused ? 'var(--text-hint)' : phaseColor(timer.phase) }}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
        />
      </svg>
      <div className="flex flex-col items-center gap-1.5">
        <p id="pomodoro-phase" className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
          <Icon size={14} style={{ color: phaseColor(timer.phase) }} aria-hidden />
          {phaseName(tr, timer.phase)}
        </p>
        <div
          role="timer"
          aria-labelledby="pomodoro-phase"
          aria-describedby={state ? 'pomodoro-state' : undefined}
          className={`text-5xl font-semibold leading-none tracking-tight tabular-nums @4xl/pomodoro:text-6xl ${paused ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}
        >
          <span aria-hidden="true">{formatClock(remaining)}</span>
          {/* Para que "18:42" no se lea como una hora del día. */}
          <span className="sr-only">{tr('timeSr', { m: Math.floor(secs / 60), s: secs % 60 })}</span>
        </div>
        <p id="pomodoro-state" className="min-h-[1em] text-[11px] text-[var(--text-hint)]">{state}</p>
      </div>
    </div>
  );
}

function CycleRow({ timer, o, tr, extra }: { timer: TimerState; o: PomodoroOptions; tr: Tr; extra: ReactNode }) {
  const c = cycleBlock(timer, o);
  const doneDots = Math.min(timer.done, c.total);
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
      <span className="tabular-nums" title={longBreakNext(timer, o) ? tr('cycleLongNext') : undefined}>
        {tr(c.current ? 'cycle' : 'cycleDone', { n: c.n, total: c.total })}
      </span>
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: c.total }, (_, i) => {
          const done = i < doneDots;
          const current = !done && c.current && i === doneDots;
          return (
            <span
              key={i}
              className={`size-2 rounded-full ${!done && !current ? 'bg-[var(--phase-track)]' : ''}`}
              style={done ? { background: 'var(--phase-work)' } : current ? { border: '1.5px solid var(--phase-work)' } : undefined}
            />
          );
        })}
      </span>
      {extra}
    </div>
  );
}

function Controls({ timer, tr, mac, busy }: { timer: TimerState; tr: Tr; mac: boolean; busy: boolean }) {
  const running = timer.status === 'running';
  const mainLabel = running
    ? tr('pause')
    : timer.status === 'paused'
      ? tr('resume')
      : tr(timer.phase === 'work' ? 'startWork' : 'startBreak');
  const MainIcon = running ? Pause : Play;
  const skipTitle = `${tr(timer.phase === 'work' ? 'skipWorkTitle' : 'skipBreakTitle')} (${shortcutLabel('→', mac)})`;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button type="button" onClick={togglePhase} className={MAIN_BTN} title={`${mainLabel} (${tr('spaceKey')})`}>
        <MainIcon size={16} className="text-indigo-400" aria-hidden />
        {mainLabel}
      </button>
      <button type="button" onClick={skipPhase} title={skipTitle} className={SECONDARY_CLS}>
        <SkipForward size={13} aria-hidden />
        {tr('skip')}
      </button>
      <button
        type="button"
        onClick={restartPhase}
        disabled={!busy}
        aria-label={tr('restartPhase')}
        title={`${tr('restartPhase')} (${shortcutLabel('←', mac)})`}
        className={`${ICON_BTN} min-h-7 min-w-7 justify-center`}
      >
        <RotateCcw size={14} aria-hidden />
      </button>
    </div>
  );
}

function TaskCard({
  tr, timer, info, mac, pickerOpen, triggerRef, onOpenPicker, onClosePicker,
}: {
  tr: Tr;
  timer: TimerState;
  info: TaskInfo;
  mac: boolean;
  pickerOpen: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onOpenPicker: () => void;
  onClosePicker: (refocus: boolean) => void;
}) {
  const { setActiveTask, setSection, selectProject } = useAppStore(
    useShallow((s) => ({ setActiveTask: s.setActiveTask, setSection: s.setSection, selectProject: s.selectProject })),
  );
  const ref = timer.task;
  const live = info.state === 'ok' || info.state === 'done' ? info.task : null;
  const title = live?.title ?? ref?.title ?? '';
  const project = live?.project ?? ref?.project ?? '';
  const open = async () => {
    if (!live) return;
    // Como el buscador: la sección de tareas, su proyecto y la tarea.
    await setSection('tasks');
    selectProject(live.project);
    setActiveTask(live);
  };
  const picker = pickerOpen && (
    <TaskPicker
      tr={tr}
      selectedId={ref?.id ?? null}
      onPick={(task) => {
        chooseTask(task);
        onClosePicker(true);
      }}
      onClose={onClosePicker}
    />
  );
  return (
    <div className="w-full max-w-md">
      <h3 className={`${PANEL_TITLE} mb-1.5`}>{tr('taskLabel')}</h3>
      <div className="relative">
        {!ref ? (
          <>
            <button
              ref={triggerRef}
              type="button"
              onClick={onOpenPicker}
              aria-haspopup="dialog"
              aria-expanded={pickerOpen}
              className={`flex w-full items-center gap-2 rounded-lg border border-dashed border-[var(--border-card)] px-3 py-2.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] ${FOCUS_RING}`}
            >
              <ListTodo size={14} aria-hidden />
              <span className="flex-1 text-left">{tr('taskChoose')}</span>
              <kbd className="font-sans text-[10px] text-[var(--text-hint)]">{shortcutLabel('T', mac)}</kbd>
            </button>
            <p className="mt-1.5 text-[11px] text-[var(--text-hint)]">{tr('taskHint')}</p>
          </>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <button
                ref={triggerRef}
                type="button"
                onClick={onOpenPicker}
                aria-haspopup="dialog"
                aria-expanded={pickerOpen}
                title={tr('taskChange')}
                className={`line-clamp-2 select-text rounded text-left text-sm font-medium text-[var(--text-primary)] ${FOCUS_RING}`}
              >
                {title}
              </button>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--text-hint)]">
                <span>
                  {project}
                  {live && live.status !== 'done' ? ` · ${tr(live.status === 'in-progress' ? 'taskStatusInProgress' : 'taskStatusTodo')}` : ''}
                  {live?.taskCode ? ` · ${live.taskCode}` : ''}
                </span>
                {info.state === 'done' && <span className={CHIP}>{tr('taskCompleted')}</span>}
              </p>
              {info.state === 'done' && <p className="mt-1 text-[11px] text-[var(--text-hint)]">{tr('taskCompletedHint')}</p>}
              {info.state === 'missing' && (
                <p className="mt-1 flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)]">
                  <TriangleAlert size={12} className="mt-px shrink-0 text-amber-400" aria-hidden />
                  {tr('taskDeleted')}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => void open()}
                disabled={!live}
                aria-label={tr('taskOpen')}
                title={tr('taskOpenTitle', { title })}
                className={`${ICON_BTN} min-h-7 min-w-7 justify-center`}
              >
                <ExternalLink size={14} aria-hidden />
              </button>
              <button type="button" onClick={onOpenPicker} aria-label={tr('taskChange')} title={tr('taskChange')} className={`${ICON_BTN} min-h-7 min-w-7 justify-center`}>
                <Replace size={14} aria-hidden />
              </button>
              <button type="button" onClick={() => chooseTask(null)} aria-label={tr('taskClear')} title={tr('taskClear')} className={`${ICON_BTN} min-h-7 min-w-7 justify-center`}>
                <X size={14} aria-hidden />
              </button>
            </div>
          </div>
        )}
        {picker}
      </div>
    </div>
  );
}

/** La línea de estado tras un fin, al arrancar solo o con Logday cerrado
 *  (design §2.7). */
function StateLine({
  timer, o, tr, language, notice,
}: {
  timer: TimerState;
  o: PomodoroOptions;
  tr: Tr;
  language: Language;
  notice: { text: string } | null;
}) {
  const end = timer.lastEnd;
  let text: string | null = null;
  if (notice && timer.status === 'running') text = notice.text;
  else if (timer.status === 'finished' && end) {
    if (end.recovered) text = tr('endedWhileClosed', { time: timeOfDay(end.at, language) });
    else if (end.phase === 'work') text = tr(timer.phase === 'long' ? 'endedWorkLong' : 'endedWork', { min: phaseMinutes(timer.phase, o) });
    else text = tr('endedBreak');
  }
  if (!text) return null;
  return (
    <div className="w-full max-w-md">
      <StatusItem kind="valid" icon={CircleCheck}>{text}</StatusItem>
    </div>
  );
}

function Today({
  tr, history, today, language,
}: {
  tr: Tr;
  history: HistoryEntry[];
  today: string;
  language: Language;
}) {
  const entries = useMemo(() => todayEntries(history, today), [history, today]);
  const total = focusMinutes(entries);
  return (
    <section aria-labelledby="pomodoro-today-title" className="flex flex-col self-start rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-4">
      <h3 id="pomodoro-today-title" className={PANEL_TITLE}>{tr('todayTitle')}</h3>
      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Hourglass size={20} className="text-[var(--text-hint)]" aria-hidden />
          <p className="text-xs text-[var(--text-hint)]">{tr('historyEmpty')}</p>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm font-medium tabular-nums text-[var(--text-primary)]">
            {tr('todaySummary', { n: entries.length, focus: formatFocus(tr, total) })}
          </p>
          <ol className="mt-3 max-h-[60vh] divide-y divide-[var(--border)] overflow-y-auto">
            {entries.map((h) => (
              <li key={h.end} className="pomodoro-fade-in grid grid-cols-[auto_auto_1fr] items-baseline gap-3 py-1.5 text-xs">
                <span className="tabular-nums text-[var(--text-secondary)]">{timeOfDay(Date.parse(h.end), language)}</span>
                <span className="tabular-nums text-[var(--text-hint)]">{tr('historyMinutes', { m: h.minutes })}</span>
                {h.task
                  ? <span className="truncate text-[var(--text-body)]" title={h.task.title}>{h.task.title}</span>
                  : <span className="truncate text-[var(--text-hint)]">{tr('taskNone')}</span>}
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-[10px] text-[var(--text-hint)]">
        <ShieldCheck size={11} className="mt-px shrink-0" aria-hidden />
        {tr('historyNote')}
      </p>
    </section>
  );
}
