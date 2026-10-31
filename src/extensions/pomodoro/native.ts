// Lo que se le pasa a Rust (src-tauri/src/extensions/pomodoro.rs): el fin,
// los textos de la notificación y los de la bandeja, ya traducidos. Rust
// solo rellena `{min}` y `{time}` (design §9). Las funciones que arman los
// textos son puras; `sendNative` nunca lanza.
import { invoke } from '@tauri-apps/api/core';
import {
  breakAfter, finishKey, phaseMinutes, type PomodoroOptions, type TimerState,
} from './model';
import { clipTitle, phaseName, type Tr } from './text';

export interface TrayTexts {
  status: string | null;
  statusLessThanMin: string | null;
  toggle: string;
  skip: string | null;
  tooltip: string | null;
}

export interface FinishAlert {
  notify: boolean;
  ownSound: boolean;
  title: string;
  body: string;
}

export type NativeRequest =
  | { cmd: 'pomodoro_schedule'; args: { endAt: number; key: string; alert: FinishAlert; tray: TrayTexts } }
  | { cmd: 'pomodoro_pause'; args: { remaining: number; tray: TrayTexts } }
  | { cmd: 'pomodoro_idle'; args: { tray: TrayTexts } };

/** Título y cuerpo de la notificación al terminar la fase en curso (PM5). */
export function finishTexts(t: TimerState, o: PomodoroOptions, tr: Tr): { title: string; body: string } {
  if (t.phase === 'work') {
    const next = breakAfter(t.done + 1, o);
    const min = phaseMinutes(next, o);
    const key = next === 'long'
      ? (o.autoBreaks ? 'notifWorkBodyLongAuto' : 'notifWorkBodyLong')
      : (o.autoBreaks ? 'notifWorkBodyAuto' : 'notifWorkBody');
    const prefix = t.task?.title ? tr('notifTaskPrefix', { task: clipTitle(t.task.title) }) : '';
    return { title: tr('notifWorkTitle'), body: prefix + tr(key, { min }) };
  }
  return {
    title: tr('notifBreakTitle'),
    body: tr(o.autoWork ? 'notifBreakBodyAuto' : 'notifBreakBody', { min: o.workMin }),
  };
}

/** Los textos de la bandeja para el estado (design §4). */
export function trayTexts(t: TimerState, o: PomodoroOptions, tr: Tr): TrayTexts {
  const phase = phaseName(tr, t.phase);
  switch (t.status) {
    case 'running':
      return {
        status: tr('trayStatus', { phase }),
        statusLessThanMin: tr('trayStatusLessThanMin', { phase }),
        toggle: tr('trayPause'),
        skip: tr('traySkip'),
        tooltip: tr('trayTooltip', { phase }),
      };
    case 'paused':
      return {
        status: tr('trayStatusPaused', { phase }),
        statusLessThanMin: null,
        toggle: tr('trayResume'),
        skip: tr('traySkip'),
        tooltip: tr('trayTooltipPaused', { phase }),
      };
    case 'finished':
      return {
        status: tr('trayStatusReady', { phase, min: phaseMinutes(t.phase, o) }),
        statusLessThanMin: null,
        toggle: tr(t.phase === 'work' ? 'trayStartWork' : 'trayStartBreak'),
        skip: tr('traySkip'),
        tooltip: null,
      };
    default:
      // D2: sin nada en curso, solo "Iniciar un pomodoro".
      return {
        status: null,
        statusLessThanMin: null,
        toggle: t.phase === 'work' ? tr('trayStartIdle', { min: o.workMin }) : tr('trayStartBreak'),
        skip: null,
        tooltip: null,
      };
  }
}

/** El comando nativo para el estado. */
export function nativeRequest(t: TimerState, o: PomodoroOptions, tr: Tr, notificationsEnabled: boolean): NativeRequest {
  const tray = trayTexts(t, o, tr);
  if (t.status === 'running' && t.endAt !== undefined) {
    const { title, body } = finishTexts(t, o, tr);
    return {
      cmd: 'pomodoro_schedule',
      args: { endAt: t.endAt, key: finishKey(t), alert: { notify: notificationsEnabled, ownSound: o.sound, title, body }, tray },
    };
  }
  if (t.status === 'paused') return { cmd: 'pomodoro_pause', args: { remaining: t.remainingMs ?? 0, tray } };
  return { cmd: 'pomodoro_idle', args: { tray } };
}

/** Manda el estado a Rust. `true` solo si Rust lo confirmó: en el
 *  navegador (Tauri simulado) `invoke` falla o devuelve otra cosa, y
 *  entonces el fin lo detecta solo el frontend. */
export async function sendNative(req: NativeRequest): Promise<boolean> {
  try {
    return (await invoke(req.cmd, req.args)) === true;
  } catch {
    return false;
  }
}

export async function clearNative(): Promise<void> {
  try {
    await invoke('pomodoro_clear');
  } catch {
    // Sin bandeja nativa: nada que limpiar.
  }
}
