// Lógica pura del Pomodoro (specs/pomodoro): fases, ciclo, lo que falta
// contra el reloj, terminar una fase una sola vez, el historial de 14 días,
// el cambio de día y la lectura de las opciones. Sin React, store ni Tauri,
// para probarla sola. Los instantes son milisegundos desde 1970 (`Date.now()`).
import { addDaysISO, localISODate } from '../../lib/localDate';

export const POMODORO_ID = 'pomodoro' as const;

export const EVT_FINISHED = 'pomodoro:finished';
export const EVT_TRAY_ACTION = 'pomodoro:tray-action';

export type Phase = 'work' | 'short' | 'long';

/** ready: Listo (al empezar, tras saltar o reiniciar el ciclo).
 *  finished: Terminado, la fase siguiente espera a que la inicies (PM3). */
export type TimerStatus = 'ready' | 'running' | 'paused' | 'finished';

// ─── Opciones (PM1, PM3, PM5) ───

export interface PomodoroOptions {
  workMin: number;
  shortMin: number;
  longMin: number;
  /** Bloques de trabajo antes del descanso largo. */
  longEvery: number;
  autoBreaks: boolean;
  autoWork: boolean;
  sound: boolean;
}

export const DEFAULT_OPTIONS: PomodoroOptions = {
  workMin: 25, shortMin: 5, longMin: 15, longEvery: 4, autoBreaks: false, autoWork: false, sound: true,
};

export const MIN_MINUTES = 1;
export const MAX_MINUTES = 120;
export const MIN_LONG_EVERY = 2;
export const MAX_LONG_EVERY = 10;

const intIn = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

/** Las opciones de `extensions.pomodoro.settings`, con los valores por
 *  defecto y los rangos de PM1 si falta algo o viene mal. */
export function readOptions(raw: Record<string, unknown> | undefined): PomodoroOptions {
  const s = raw ?? {};
  return {
    workMin: intIn(s.workMin, MIN_MINUTES, MAX_MINUTES, DEFAULT_OPTIONS.workMin),
    shortMin: intIn(s.shortMin, MIN_MINUTES, MAX_MINUTES, DEFAULT_OPTIONS.shortMin),
    longMin: intIn(s.longMin, MIN_MINUTES, MAX_MINUTES, DEFAULT_OPTIONS.longMin),
    longEvery: intIn(s.longEvery, MIN_LONG_EVERY, MAX_LONG_EVERY, DEFAULT_OPTIONS.longEvery),
    autoBreaks: typeof s.autoBreaks === 'boolean' ? s.autoBreaks : DEFAULT_OPTIONS.autoBreaks,
    autoWork: typeof s.autoWork === 'boolean' ? s.autoWork : DEFAULT_OPTIONS.autoWork,
    sound: typeof s.sound === 'boolean' ? s.sound : DEFAULT_OPTIONS.sound,
  };
}

export function isDefaultOptions(o: PomodoroOptions): boolean {
  return (Object.keys(DEFAULT_OPTIONS) as (keyof PomodoroOptions)[]).every((k) => o[k] === DEFAULT_OPTIONS[k]);
}

export function phaseMinutes(phase: Phase, o: PomodoroOptions): number {
  return phase === 'work' ? o.workMin : phase === 'short' ? o.shortMin : o.longMin;
}

export const phaseMs = (phase: Phase, o: PomodoroOptions) => phaseMinutes(phase, o) * 60_000;

// ─── Estado del temporizador (PM12) ───

/** La tarea elegida (PM6). Se copian el título y el proyecto al elegirla,
 *  para el historial si después se borra (design §10). */
export interface TaskRef {
  id: string;
  title: string;
  project: string;
}

/** El último fin, para la línea de estado de la vista (design §2.7). */
export interface LastEnd {
  phase: Phase;
  at: number;
  /** Terminó con Logday cerrado o el equipo suspendido (D5). */
  recovered: boolean;
  /** La fase siguiente arrancó sola (PM3). */
  auto: boolean;
}

export interface TimerState {
  /** La fase en curso, o la que espera a iniciarse. */
  phase: Phase;
  status: TimerStatus;
  /** running: el instante de fin (PM4). */
  endAt?: number;
  /** paused: lo que falta, fijo. */
  remainingMs?: number;
  /** paused: desde cuándo. */
  pausedAt?: number;
  /** running/paused: la duración con que arrancó (las opciones nuevas se
   *  aplican desde la siguiente fase). */
  durationMs?: number;
  /** Bloques de trabajo terminados en el ciclo. */
  done: number;
  task: TaskRef | null;
  lastEnd?: LastEnd;
  /** La clave del último fin aplicado: terminar es idempotente. */
  lastKey?: string;
  /** Día (YYYY-MM-DD local) del último cambio, para el cambio de día (D6). */
  day: string;
}

export function initialTimer(now: number): TimerState {
  return { phase: 'work', status: 'ready', done: 0, task: null, day: localISODate(new Date(now)) };
}

const PHASES: readonly Phase[] = ['work', 'short', 'long'];
const STATUSES: readonly TimerStatus[] = ['ready', 'running', 'paused', 'finished'];
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

function readTask(v: unknown): TaskRef | null {
  if (!v || typeof v !== 'object') return null;
  const t = v as Record<string, unknown>;
  const id = str(t.id);
  if (!id) return null;
  return { id, title: str(t.title) ?? '', project: str(t.project) ?? '' };
}

/** El estado guardado, o el inicial si falta o está roto. Un estado que no
 *  cuadra (corriendo sin fin, en pausa sin resto) vuelve a Listo. */
export function readTimer(raw: unknown, now: number): TimerState {
  if (!raw || typeof raw !== 'object') return initialTimer(now);
  const r = raw as Record<string, unknown>;
  const phase = PHASES.includes(r.phase as Phase) ? (r.phase as Phase) : 'work';
  let status = STATUSES.includes(r.status as TimerStatus) ? (r.status as TimerStatus) : 'ready';
  const endAt = num(r.endAt);
  const remainingMs = num(r.remainingMs);
  const durationMs = num(r.durationMs);
  if (status === 'running' && (endAt === undefined || durationMs === undefined)) status = 'ready';
  if (status === 'paused' && (remainingMs === undefined || durationMs === undefined)) status = 'ready';
  const t: TimerState = {
    phase,
    status,
    done: Math.max(0, Math.round(num(r.done) ?? 0)),
    task: readTask(r.task),
    day: str(r.day) ?? localISODate(new Date(now)),
  };
  if (status === 'running') Object.assign(t, { endAt, durationMs });
  if (status === 'paused') Object.assign(t, { remainingMs, durationMs, pausedAt: num(r.pausedAt) });
  const le = r.lastEnd as Record<string, unknown> | undefined;
  if (le && PHASES.includes(le.phase as Phase) && num(le.at) !== undefined) {
    t.lastEnd = { phase: le.phase as Phase, at: num(le.at)!, recovered: le.recovered === true, auto: le.auto === true };
  }
  if (str(r.lastKey)) t.lastKey = str(r.lastKey);
  return t;
}

/** La clave de un fin: fase + instante. Con ella, el aviso de Rust, el
 *  del frontend y la recuperación al abrir terminan la fase una vez. */
export const finishKey = (t: Pick<TimerState, 'phase' | 'endAt'>) => `${t.phase}:${t.endAt ?? 0}`;

/** La duración de la fase: la fija si ya arrancó; si no, la de las opciones. */
export function durationOf(t: TimerState, o: PomodoroOptions): number {
  return (t.status === 'running' || t.status === 'paused') && t.durationMs ? t.durationMs : phaseMs(t.phase, o);
}

/** Lo que falta, contra el reloj (PM4). */
export function remainingOf(t: TimerState, now: number, o: PomodoroOptions): number {
  if (t.status === 'running') return Math.max(0, (t.endAt ?? now) - now);
  if (t.status === 'paused') return Math.max(0, t.remainingMs ?? 0);
  return phaseMs(t.phase, o);
}

/** El descanso que toca después de `done` bloques hechos. */
export const breakAfter = (done: number, o: PomodoroOptions): Phase => (done >= o.longEvery ? 'long' : 'short');

/** La fase siguiente y cómo queda el ciclo. Un salto de trabajo no suma. */
export function nextPhase(t: TimerState, o: PomodoroOptions, counted: boolean): { phase: Phase; done: number } {
  if (t.phase === 'work') {
    const done = counted ? t.done + 1 : t.done;
    return { phase: breakAfter(done, o), done };
  }
  // Tras el largo, el ciclo vuelve a empezar.
  return { phase: 'work', done: t.phase === 'long' ? 0 : t.done };
}

/** El bloque que se ve ("Bloque 2 de 4"): en trabajo, el actual; en un
 *  descanso, los hechos. Nunca pasa del total, aunque se haya bajado el
 *  "largo cada" a mitad de ciclo. */
export function cycleBlock(t: TimerState, o: PomodoroOptions): { n: number; total: number; current: boolean } {
  const total = o.longEvery;
  if (t.phase === 'work') return { n: Math.min(t.done + 1, total), total, current: true };
  return { n: Math.min(Math.max(t.done, 1), total), total, current: false };
}

/** Si al terminar este bloque toca el descanso largo. */
export const longBreakNext = (t: TimerState, o: PomodoroOptions) => t.phase === 'work' && t.done + 1 >= o.longEvery;

const withDay = (t: TimerState, now: number): TimerState => ({ ...t, day: localISODate(new Date(now)) });

// ─── Controles (PM2) ───

export function start(t: TimerState, now: number, o: PomodoroOptions): TimerState {
  if (t.status === 'running') return t;
  if (t.status === 'paused') return resume(t, now);
  const durationMs = phaseMs(t.phase, o);
  return withDay({ ...t, status: 'running', endAt: now + durationMs, durationMs, remainingMs: undefined, pausedAt: undefined, lastEnd: undefined }, now);
}

export function pause(t: TimerState, now: number): TimerState {
  if (t.status !== 'running') return t;
  return withDay({ ...t, status: 'paused', remainingMs: Math.max(0, (t.endAt ?? now) - now), pausedAt: now, endAt: undefined }, now);
}

export function resume(t: TimerState, now: number): TimerState {
  if (t.status !== 'paused') return t;
  return withDay({ ...t, status: 'running', endAt: now + (t.remainingMs ?? 0), remainingMs: undefined, pausedAt: undefined }, now);
}

/** Iniciar, pausar o reanudar, según el estado (Espacio y la bandeja). */
export function toggle(t: TimerState, now: number, o: PomodoroOptions): TimerState {
  return t.status === 'running' ? pause(t, now) : start(t, now, o);
}

/** Saltar a la fase siguiente: no cuenta (PM9) y queda Lista. */
export function skip(t: TimerState, now: number, o: PomodoroOptions): TimerState {
  const next = nextPhase(t, o, false);
  return withDay({
    ...t, phase: next.phase, done: next.done, status: 'ready',
    endAt: undefined, remainingMs: undefined, pausedAt: undefined, durationMs: undefined, lastEnd: undefined,
  }, now);
}

/** Reiniciar la fase: vuelve a la duración con que arrancó; corriendo
 *  sigue corriendo y en pausa sigue en pausa. */
export function restartPhase(t: TimerState, now: number): TimerState {
  const d = t.durationMs ?? 0;
  if (t.status === 'running') return withDay({ ...t, endAt: now + d }, now);
  if (t.status === 'paused') return withDay({ ...t, remainingMs: d, pausedAt: now }, now);
  return t;
}

/** Reiniciar el ciclo: trabajo, con el contador en cero. No toca el historial. */
export function restartCycle(t: TimerState, now: number): TimerState {
  return { ...initialTimer(now), task: t.task, lastKey: t.lastKey };
}

export function setTask(t: TimerState, task: TaskRef | null): TimerState {
  return { ...t, task };
}

// ─── Historial (PM9) ───

export interface HistoryEntry {
  /** Instante de fin (ISO). El bloque cuenta para el día en que termina. */
  end: string;
  minutes: number;
  task?: TaskRef;
}

export const HISTORY_DAYS = 14;

/** Solo los últimos 14 días, contando hoy. */
export function pruneHistory(history: HistoryEntry[], today: string): HistoryEntry[] {
  const from = addDaysISO(today, -(HISTORY_DAYS - 1));
  return history.filter((h) => localISODate(new Date(h.end)) >= from);
}

export function readHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const end = str(r.end);
    const minutes = num(r.minutes);
    if (!end || Number.isNaN(Date.parse(end)) || minutes === undefined) continue;
    const task = readTask(r.task);
    out.push(task ? { end, minutes, task } : { end, minutes });
  }
  return out;
}

/** Los de hoy, del más reciente al más antiguo. */
export function todayEntries(history: HistoryEntry[], today: string): HistoryEntry[] {
  return history
    .filter((h) => localISODate(new Date(h.end)) === today)
    .sort((a, b) => Date.parse(b.end) - Date.parse(a.end));
}

export const focusMinutes = (entries: HistoryEntry[]) => entries.reduce((sum, h) => sum + h.minutes, 0);

// ─── Terminar una fase (PM3, PM4, PM5, D5) ───

/** D5: un fin detectado más tarde que esto se da por "con Logday cerrado". */
export const STALE_MS = 5 * 60_000;

export interface FinishResult {
  timer: TimerState;
  history: HistoryEntry[];
  /** Lo que terminó, para el aviso. `null`: no había nada que terminar. */
  ended: { phase: Phase; next: Phase; at: number; alert: boolean; auto: boolean } | null;
}

/** Termina la fase en curso si `key` es la suya y su fin ya llegó. Es
 *  idempotente: con otra clave, o la misma por segunda vez, no cambia nada.
 *  - Un bloque de trabajo cuenta siempre, con su hora de fin real.
 *  - Se avisa solo si terminó hace menos de 5 min (`alert`).
 *  - La siguiente arranca sola si la opción está activa, salvo al
 *    recuperar (`recovered` o fin viejo): así no se encadenan fases
 *    fantasma mientras el equipo dormía. */
export function finish(
  t: TimerState,
  history: HistoryEntry[],
  key: string,
  now: number,
  o: PomodoroOptions,
  opts: { recovered?: boolean } = {},
): FinishResult {
  const none = { timer: t, history, ended: null };
  if (t.status !== 'running' || t.endAt === undefined || key !== finishKey(t) || t.lastKey === key) return none;
  if (now < t.endAt) return none;
  const at = t.endAt;
  const stale = now - at >= STALE_MS;
  const recovered = !!opts.recovered || stale;
  let nextHistory = history;
  if (t.phase === 'work') {
    const entry: HistoryEntry = { end: new Date(at).toISOString(), minutes: Math.round((t.durationMs ?? 0) / 60_000) };
    if (t.task) entry.task = t.task;
    nextHistory = pruneHistory([...history, entry], localISODate(new Date(now)));
  }
  const next = nextPhase(t, o, true);
  const auto = !recovered && (t.phase === 'work' ? o.autoBreaks : o.autoWork);
  const base: TimerState = {
    ...t, phase: next.phase, done: next.done, lastKey: key,
    endAt: undefined, remainingMs: undefined, pausedAt: undefined, durationMs: undefined,
    lastEnd: { phase: t.phase, at, recovered, auto },
    day: localISODate(new Date(now)),
  };
  // Si arranca sola, lo hace desde el fin, no desde que se detectó: así
  // el ciclo sigue exacto aunque el aviso llegue un segundo tarde.
  const timer: TimerState = auto
    ? { ...base, status: 'running', endAt: at + phaseMs(next.phase, o), durationMs: phaseMs(next.phase, o) }
    : { ...base, status: 'finished' };
  return { timer, history: nextHistory, ended: { phase: t.phase, next: next.phase, at, alert: !stale && !opts.recovered, auto } };
}

/** D6: si cambió el día y no hay nada corriendo ni en pausa, el ciclo
 *  vuelve a "Bloque 1". */
export function rolloverDay(t: TimerState, today: string): TimerState {
  if (t.day === today) return t;
  if (t.status === 'running' || t.status === 'paused') return t;
  return { phase: 'work', status: 'ready', done: 0, task: t.task, lastKey: t.lastKey, day: today };
}

// ─── Formatos ───

/** `m:ss` en minutos totales, sin horas: igual en la vista, el menú y la
 *  bandeja (design §2.4). Hacia arriba: el último segundo es `0:01`. */
export function formatClock(ms: number): string {
  const secs = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

/** Minutos enteros que faltan ("18 min" con 18:42). */
export const wholeMinutes = (ms: number) => Math.floor(Math.max(0, ms) / 60_000);

/** Minutos para la región viva ("Quedan 19 minutos" con 18:42): hacia arriba. */
export const roundedMinutes = (ms: number) => Math.ceil(Math.max(0, ms) / 60_000);

/** Si el contador del menú se ve (PM10, D1). */
export const showsCounter = (t: TimerState) => t.status !== 'ready';

/** Fracción que queda de la fase (para el anillo y la barra), de 0 a 1. */
export function fractionLeft(t: TimerState, now: number, o: PomodoroOptions): number {
  const d = durationOf(t, o);
  return d > 0 ? Math.min(1, Math.max(0, remainingOf(t, now, o) / d)) : 1;
}

/** Cruces de hitos para la región viva (design §8): 5 y 1 minutos, solo si
 *  la fase dura más que eso. */
export function milestoneCrossed(prevMs: number, nextMs: number, durationMs: number): 5 | 1 | null {
  for (const m of [5, 1] as const) {
    const at = m * 60_000;
    if (durationMs > at && prevMs > at && nextMs <= at) return m;
  }
  return null;
}
