// Tarjeta del Pomodoro en Inicio (PM17, specs/extensiones R27): la fase,
// el tiempo, el progreso, la tarea, el resumen de hoy y el botón principal.
// El tiempo no tiene región viva (cambiaría cada segundo); los avisos de
// iniciar, pausar y terminar se leen con la de abajo, la misma que usa la
// vista (design §8). Con la opción "Mostrar en Inicio" apagada no se dibuja.
import { useMemo, type MouseEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Hourglass, Pause, Play } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { FOCUS_RING } from '../../components/shared/controlClasses';
import { HomeCardShell } from '../../components/dashboard/HomeCardShell';
import { POMODORO_ID, focusMinutes, formatClock, fractionLeft, readOptions, remainingOf, todayEntries } from './model';
import { PHASE_ICON, phaseColor, requestViewFocus } from './parts';
import { togglePhase, usePomodoro } from './store';
import { formatFocus, makeTr, phaseName, readyName } from './text';

/** El CTA tintado de "Hoy" en Inicio, con el texto en `--text-primary`
 *  como el botón principal de la vista: el `text-indigo-300` de "Hoy" no
 *  se aclara en sepia (design §2.6). */
const MAIN_CLS = `inline-flex shrink-0 items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-indigo-500/20 ${FOCUS_RING}`;

export default function PomodoroHomeCard() {
  const { timer, now, active, history, today, live, taskInfo } = usePomodoro(
    useShallow((s) => ({
      timer: s.timer, now: s.now, active: s.active, history: s.history, today: s.today, live: s.live, taskInfo: s.taskInfo,
    })),
  );
  const { language, raw, setSection } = useAppStore(
    useShallow((s) => ({ language: s.language, raw: s.extensions[POMODORO_ID]?.settings, setSection: s.setSection })),
  );
  const o = useMemo(() => readOptions(raw), [raw]);
  const tr = useMemo(() => makeTr(language), [language]);
  const entries = useMemo(() => todayEntries(history, today), [history, today]);
  if (!active || !o.showOnHome) return null;

  const paused = timer.status === 'paused';
  const running = timer.status === 'running';
  const remaining = remainingOf(timer, now, o);
  const secs = Math.ceil(remaining / 1000);
  const pct = Math.round(fractionLeft(timer, now, o) * 1000) / 10;
  const Icon = PHASE_ICON[timer.phase];
  const graphic = paused ? 'var(--text-hint)' : phaseColor(timer.phase);
  const state = running
    ? phaseName(tr, timer.phase)
    : paused
      ? tr('statePaused')
      : readyName(tr, timer.phase);
  const mainLabel = running
    ? tr('pause')
    : paused
      ? tr('resume')
      : tr(timer.phase === 'work' ? 'startWork' : 'startBreak');
  const MainIcon = running ? Pause : Play;
  const liveTask = taskInfo.state === 'ok' || taskInfo.state === 'done' ? taskInfo.task : null;
  const taskTitle = liveTask?.title ?? timer.task?.title ?? '';

  const open = (e: MouseEvent) => {
    // `detail` 0: lo activó el teclado; la vista pone el foco en su título,
    // como desde el contador del menú (design §7).
    if (e.detail === 0) requestViewFocus();
    void setSection(`ext:${POMODORO_ID}`);
  };

  return (
    <HomeCardShell
      icon={Hourglass}
      title={tr('title')}
      titleId="home-pomodoro-title"
      link={{ label: tr('homeOpen'), ariaLabel: tr('homeOpenAria'), onClick: open }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
            <Icon size={14} className="shrink-0" style={{ color: graphic }} aria-hidden />
            {state}
          </p>
          <p className={`mt-1 text-2xl font-semibold leading-none tabular-nums ${paused ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>
            <span aria-hidden="true">{formatClock(remaining)}</span>
            {/* Para que "18:42" no se lea como una hora del día. */}
            <span className="sr-only">{tr('timeSr', { m: Math.floor(secs / 60), s: secs % 60 })}</span>
          </p>
        </div>
        <button type="button" onClick={togglePhase} className={MAIN_CLS}>
          <MainIcon size={14} className="text-indigo-400" aria-hidden />
          {mainLabel}
        </button>
      </div>
      <span aria-hidden className="mt-3 block h-1 overflow-hidden rounded-full bg-[var(--phase-track)]">
        <span
          className="block h-full rounded-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
          style={{ width: `${pct}%`, background: graphic }}
        />
      </span>
      {taskTitle && (
        <p className="mt-3 truncate text-xs text-[var(--text-secondary)]" title={taskTitle}>
          {tr('homeTask', { title: taskTitle })}
        </p>
      )}
      <p className="mt-3 border-t border-[var(--border)] pt-2.5 text-[11px] tabular-nums text-[var(--text-hint)]">
        {entries.length === 0
          ? tr('homeTodayEmpty')
          : tr('homeToday', { n: entries.length, focus: formatFocus(tr, focusMinutes(entries)) })}
      </p>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        <span key={live.seq}>{live.text}</span>
      </div>
    </HomeCardShell>
  );
}
