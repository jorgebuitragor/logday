// Contador del menú lateral (PM10, design §3): la fase, el tiempo y un
// control de pausa, encima de "Opciones". Se ve corriendo, en pausa y,
// tras un fin, hasta que se inicia o se salta la siguiente (D1). No tiene
// región viva: está en todas las secciones (design §8).
import type { MouseEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Pause, Play } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { FOCUS_RING } from '../../components/shared/controlClasses';
import type { SidebarStatusProps } from '../types';
import { POMODORO_ID, formatClock, fractionLeft, readOptions, remainingOf, showsCounter, wholeMinutes } from './model';
import { PHASE_ICON, phaseColor, requestViewFocus } from './parts';
import { togglePhase, usePomodoro } from './store';
import { makeTr, phaseName, readyName } from './text';

export default function PomodoroSidebarStatus({ collapsed }: SidebarStatusProps) {
  const { timer, now, active } = usePomodoro(useShallow((s) => ({ timer: s.timer, now: s.now, active: s.active })));
  const { language, raw, activeSection, setSection } = useAppStore(
    useShallow((s) => ({
      language: s.language,
      raw: s.extensions[POMODORO_ID]?.settings,
      activeSection: s.activeSection,
      setSection: s.setSection,
    })),
  );
  if (!active || !showsCounter(timer)) return null;
  const o = readOptions(raw);
  const tr = makeTr(language);
  const paused = timer.status === 'paused';
  const finished = timer.status === 'finished';
  const remaining = remainingOf(timer, now, o);
  const time = formatClock(remaining);
  const pct = Math.round(fractionLeft(timer, now, o) * 1000) / 10;
  const Icon = PHASE_ICON[timer.phase];
  const graphic = paused ? 'var(--text-hint)' : phaseColor(timer.phase);
  const phase = phaseName(tr, timer.phase);

  const label = paused ? tr('statePaused') : finished ? readyName(tr, timer.phase) : phase;
  // En minutos, para que no cambie cada segundo mientras tiene el foco.
  const openLabel = paused
    ? tr('sidebarOpenPaused', { phase, time })
    : finished
      ? tr('sidebarOpenReady', { phase })
      : wholeMinutes(remaining) === 0
        ? tr('sidebarOpenLessThanMin', { phase })
        : tr('sidebarOpen', { phase, min: wholeMinutes(remaining) });
  const toggleLabel = timer.status === 'running'
    ? tr('sidebarPause')
    : paused
      ? tr('sidebarResume')
      : tr(timer.phase === 'work' ? 'sidebarStartWork' : 'sidebarStartBreak');
  const ToggleIcon = timer.status === 'running' ? Pause : Play;

  const open = (e: MouseEvent) => {
    // `detail` 0: lo activó el teclado; el foco va al título de la vista.
    const keyboard = e.detail === 0;
    if (activeSection === `ext:${POMODORO_ID}`) {
      if (keyboard) document.getElementById('pomodoro-title')?.focus();
      return;
    }
    if (keyboard) requestViewFocus();
    void setSection(`ext:${POMODORO_ID}`);
  };
  const toggle = (e: MouseEvent) => {
    e.stopPropagation();
    togglePhase();
  };
  const bar = (
    <span aria-hidden className={`pointer-events-none absolute bottom-1 h-0.5 overflow-hidden rounded-full bg-[var(--phase-track)] ${collapsed ? 'inset-x-1.5' : 'inset-x-3'}`}>
      <span
        className="block h-full rounded-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
        style={{ width: `${pct}%`, background: graphic }}
      />
    </span>
  );

  if (collapsed) {
    return (
      <div className="pomodoro-fade-in flex w-10 shrink-0 flex-col items-center rounded-lg border border-[var(--border)]">
        <button
          type="button"
          onClick={open}
          aria-label={openLabel}
          title={openLabel}
          className={`relative flex h-10 w-full flex-col items-center justify-center gap-0.5 rounded-t-lg hover:bg-[var(--bg-hover)] ${FOCUS_RING}`}
        >
          <Icon size={12} style={{ color: graphic }} aria-hidden />
          <span className={`text-[10px] font-medium leading-none tabular-nums ${timer.status === 'running' ? 'text-[var(--text-secondary)]' : 'text-[var(--text-hint)]'}`}>
            {time}
          </span>
          {bar}
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-label={toggleLabel}
          title={toggleLabel}
          className={`flex h-7 w-full items-center justify-center rounded-b-lg border-t border-[var(--border)] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${FOCUS_RING}`}
        >
          <ToggleIcon size={13} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="pomodoro-fade-in @container/pomocount relative flex h-9 items-center rounded-lg pl-3 pr-1 hover:bg-[var(--bg-hover)]">
      <button type="button" onClick={open} aria-label={openLabel} title={openLabel} className={`flex h-full min-w-0 flex-1 items-center gap-2 rounded text-left ${FOCUS_RING}`}>
        <Icon size={14} className="shrink-0" style={{ color: graphic }} aria-hidden />
        <span className="hidden min-w-0 flex-1 truncate text-[var(--text-muted)] @min-[11rem]/pomocount:block">{label}</span>
        <span className={`ml-auto shrink-0 font-medium tabular-nums ${timer.status === 'running' ? 'text-[var(--text-secondary)]' : 'text-[var(--text-hint)]'}`}>{time}</span>
      </button>
      <button
        type="button"
        onClick={toggle}
        aria-label={toggleLabel}
        title={toggleLabel}
        className={`ml-1 flex size-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${FOCUS_RING}`}
      >
        <ToggleIcon size={13} aria-hidden />
      </button>
      {bar}
    </div>
  );
}
