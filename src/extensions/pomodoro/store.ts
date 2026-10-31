// Store chico del Pomodoro (design "Arquitectura"): el temporizador, el
// historial y el reloj que comparten la vista, el contador del menú y la
// bandeja. El estado se guarda en `extensions.pomodoro.settings` al cambiar
// (PM12), nunca en cada segundo. Las acciones no lanzan aunque falle lo
// nativo: sin Rust, el fin lo detecta el reloj del frontend.
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { useAppStore } from '../../store/appStore';
import { localISODate } from '../../lib/localDate';
import { isPermissionGranted, sendNotification } from '../../lib/invoke';
import { readAllTasks } from '../../lib/allTasks';
import type { Task } from '../../types/task';
import {
  POMODORO_ID, finish, finishKey, initialTimer, milestoneCrossed, phaseMinutes, pause as pauseTimer,
  pruneHistory, readHistory, readOptions, readTimer, remainingOf, restartCycle as restartCycleTimer,
  restartPhase as restartPhaseTimer, roundedMinutes, rolloverDay, setTask as setTaskTimer, skip as skipTimer,
  start as startTimer, type HistoryEntry, type PomodoroOptions, type TaskRef, type TimerState,
} from './model';
import { clearNative, finishTexts, nativeRequest, sendNative } from './native';
import { closeAudio, playChime } from './sound';
import { makeTr, phaseInSentence, phaseName, type Tr } from './text';

/** Lo que se sabe de la tarea elegida (design §10). */
export type TaskInfo =
  | { state: 'none' }
  | { state: 'ok' | 'done'; task: Task }
  | { state: 'missing' }
  /** No se pudo leer (sin carpeta de datos, navegador): sin avisos. */
  | { state: 'unknown' };

export interface PomodoroStore {
  active: boolean;
  timer: TimerState;
  history: HistoryEntry[];
  /** El reloj: cambia cada segundo con una fase corriendo y cada minuto si no. */
  now: number;
  today: string;
  /** Rust confirmó el último estado: el fin lo vigila él. */
  native: boolean;
  /** La región viva de la vista (design §8). `seq` cambia en cada aviso,
   *  para que el mismo texto se vuelva a leer. */
  live: { text: string; seq: number };
  /** Línea temporal bajo los controles ("Empezó el descanso de 5 min."). */
  notice: { text: string; until: number } | null;
  taskInfo: TaskInfo;
}

const initialState = (): PomodoroStore => {
  const now = Date.now();
  return {
    active: false,
    timer: initialTimer(now),
    history: [],
    now,
    today: localISODate(new Date(now)),
    native: false,
    live: { text: '', seq: 0 },
    notice: null,
    taskInfo: { state: 'none' },
  };
};

export const pomodoroApi = createStore<PomodoroStore>(() => initialState());

/** El hook del store, con `getState`/`setState` como los de `create`. */
export const usePomodoro = Object.assign(
  <T,>(select: (s: PomodoroStore) => T): T => useStore(pomodoroApi, select),
  pomodoroApi,
);

// ─── Entorno ───

const settingsOf = () => useAppStore.getState().extensions[POMODORO_ID]?.settings;
export const currentOptions = (): PomodoroOptions => readOptions(settingsOf());
const currentTr = (): Tr => makeTr(useAppStore.getState().language);

/** Si el fin lo detecta el frontend sin Rust, o Rust no avisó a tiempo:
 *  con Rust se le dan 3 s, para no avisar dos veces. */
const NATIVE_GRACE_MS = 3000;
const NOTICE_MS = 10_000;

function announce(text: string) {
  usePomodoro.setState((s) => ({ live: { text, seq: s.live.seq + 1 } }));
}

function persist(timer: TimerState, history: HistoryEntry[]) {
  // `updateExtensionSettings` escribe config.json; si falla, el estado en
  // memoria sigue y se reintenta en el siguiente cambio.
  void useAppStore.getState().updateExtensionSettings(POMODORO_ID, { timer, history }).catch((err) => {
    console.error('[pomodoro]', err);
  });
}

let lastNative = '';

/** Manda a Rust el estado, si cambió algo de lo que le llega. */
export function syncNative(force = false) {
  const s = usePomodoro.getState();
  if (!s.active) return;
  const req = nativeRequest(s.timer, currentOptions(), currentTr(), useAppStore.getState().notificationsEnabled);
  const sig = JSON.stringify(req);
  if (!force && sig === lastNative) return;
  lastNative = sig;
  void sendNative(req).then((ok) => {
    if (usePomodoro.getState().active) usePomodoro.setState({ native: ok });
  });
}

function commit(timer: TimerState, history = usePomodoro.getState().history) {
  usePomodoro.setState({ timer, history, now: Date.now() });
  persist(timer, history);
  syncNative();
}

// ─── La tarea (PM6, D7) ───

let taskSeq = 0;

/** Lee la tarea elegida por `id`: primero en el proyecto abierto y, si no
 *  está, en todos. No escribe en ella (PM7). */
export async function refreshTaskInfo(): Promise<void> {
  const ref = usePomodoro.getState().timer.task;
  const seq = ++taskSeq;
  if (!ref) {
    usePomodoro.setState({ taskInfo: { state: 'none' } });
    return;
  }
  let info: TaskInfo;
  const inStore = useAppStore.getState().tasks.find((t) => t.id === ref.id);
  if (inStore) {
    info = { state: inStore.status === 'done' ? 'done' : 'ok', task: inStore };
  } else {
    try {
      const found = (await readAllTasks()).find((t) => t.id === ref.id);
      info = found ? { state: found.status === 'done' ? 'done' : 'ok', task: found } : { state: 'missing' };
    } catch {
      info = { state: 'unknown' };
    }
  }
  if (seq === taskSeq && usePomodoro.getState().timer.task?.id === ref.id) usePomodoro.setState({ taskInfo: info });
}

// ─── Acciones (PM2) ───

export function startPhase() {
  const s = usePomodoro.getState();
  const o = currentOptions();
  let timer = s.timer;
  // D7: una tarea completada o borrada no sigue en el bloque siguiente.
  if (timer.phase === 'work' && timer.status !== 'paused' && (s.taskInfo.state === 'done' || s.taskInfo.state === 'missing')) {
    timer = setTaskTimer(timer, null);
    usePomodoro.setState({ taskInfo: { state: 'none' } });
  }
  const wasPaused = timer.status === 'paused';
  const next = startTimer(timer, Date.now(), o);
  if (next === s.timer) return;
  usePomodoro.setState({ notice: null });
  commit(next);
  const tr = currentTr();
  const min = roundedMinutes(remainingOf(next, Date.now(), o));
  announce(wasPaused ? tr('liveResumed', { min }) : tr('liveStarted', { phase: phaseName(tr, next.phase), min }));
}

export function pausePhase() {
  const s = usePomodoro.getState();
  const next = pauseTimer(s.timer, Date.now());
  if (next === s.timer) return;
  commit(next);
  announce(currentTr()('livePaused', { min: roundedMinutes(next.remainingMs ?? 0) }));
}

/** Iniciar, pausar o reanudar (Espacio, el menú lateral y la bandeja). */
export function togglePhase() {
  if (usePomodoro.getState().timer.status === 'running') pausePhase();
  else startPhase();
}

export function skipPhase() {
  const s = usePomodoro.getState();
  const next = skipTimer(s.timer, Date.now(), currentOptions());
  usePomodoro.setState({ notice: null });
  commit(next);
  const language = useAppStore.getState().language;
  const tr = currentTr();
  announce(tr('liveSkipped', { phase: phaseInSentence(tr, next.phase, language) }));
}

export function restartPhase() {
  const s = usePomodoro.getState();
  const next = restartPhaseTimer(s.timer, Date.now());
  if (next === s.timer) return;
  commit(next);
  announce(currentTr()('liveRestartPhase'));
}

export function restartCycle() {
  const s = usePomodoro.getState();
  usePomodoro.setState({ notice: null });
  commit(restartCycleTimer(s.timer, Date.now()));
  announce(currentTr()('liveRestartCycle', { total: currentOptions().longEvery }));
}

/** D8: se puede cambiar a mitad de bloque; cuenta la que esté al terminar. */
export function chooseTask(task: TaskRef | null) {
  const s = usePomodoro.getState();
  commit(setTaskTimer(s.timer, task));
  const tr = currentTr();
  announce(task ? tr('liveTask', { title: task.title }) : tr('liveTaskCleared'));
  void refreshTaskInfo();
}

export function updateOptions(patch: Partial<PomodoroOptions>) {
  void useAppStore.getState().updateExtensionSettings(POMODORO_ID, patch).catch((err) => console.error('[pomodoro]', err));
}

// ─── El fin (PM3, PM4, PM5) ───

export type FinishSource = 'native' | 'clock' | 'restore';

/** Termina la fase de `key` una sola vez, venga de Rust, del reloj del
 *  frontend o de la recuperación al abrir. Rust ya avisó si el fin le llegó
 *  a él; si no, avisa el frontend. */
export function handleFinish(key: string, source: FinishSource) {
  const s = usePomodoro.getState();
  if (!s.active) return;
  const o = currentOptions();
  const tr = currentTr();
  const before = s.timer;
  const texts = finishTexts(before, o, tr);
  const r = finish(before, s.history, key, Date.now(), o, { recovered: source === 'restore' });
  if (!r.ended) return;
  const ended = r.ended;
  usePomodoro.setState({
    notice: ended.auto
      ? { text: tr(ended.next === 'work' ? 'autoStartedWork' : 'autoStartedBreak', { min: phaseMinutes(ended.next, o) }), until: Date.now() + NOTICE_MS }
      : null,
  });
  commit(r.timer, r.history);
  announce(`${texts.title}. ${texts.body}`);
  if (ended.alert) {
    if (o.sound) playChime(ended.phase === 'work' ? 'down' : 'up');
    if (source !== 'native' && useAppStore.getState().notificationsEnabled) void notifyFromWebview(texts);
  }
  if (ended.phase === 'work') void refreshTaskInfo();
}

async function notifyFromWebview(texts: { title: string; body: string }) {
  try {
    if (await isPermissionGranted()) await sendNotification(texts);
  } catch {
    // Sin notificaciones (navegador o sin permiso): queda la vista y el sonido.
  }
}

/** El reloj del frontend: mueve `now`, anuncia los hitos, cambia de día y,
 *  si Rust no lo hizo, termina la fase. */
export function tick() {
  const s = usePomodoro.getState();
  if (!s.active) return;
  const now = Date.now();
  const o = currentOptions();
  const today = localISODate(new Date(now));
  if (today !== s.today) {
    usePomodoro.setState({ today });
    const rolled = rolloverDay(s.timer, today);
    if (rolled !== s.timer) commit(rolled);
  }
  const t = usePomodoro.getState().timer;
  if (t.status === 'running' && t.endAt !== undefined) {
    const prev = remainingOf(t, s.now, o);
    const left = remainingOf(t, now, o);
    const crossed = milestoneCrossed(prev, left, t.durationMs ?? 0);
    usePomodoro.setState({ now });
    if (crossed) announce(currentTr()(crossed === 5 ? 'liveFiveLeft' : 'liveOneLeft'));
    if (now >= t.endAt + (s.native ? NATIVE_GRACE_MS : 0)) handleFinish(finishKey(t), 'clock');
  } else if (Math.floor(now / 60_000) !== Math.floor(s.now / 60_000)) {
    // "En pausa desde ayer" y "Hoy" no necesitan más que un cambio por minuto.
    usePomodoro.setState({ now });
  }
  const notice = usePomodoro.getState().notice;
  if (notice && now >= notice.until) usePomodoro.setState({ notice: null });
}

// ─── Ciclo de vida (PM12, PM13) ───

/** Restaura lo guardado al activar la extensión o abrir Logday. Si el fin
 *  pasó con Logday cerrado, la fase se termina una vez (D5). */
export function activate() {
  const now = Date.now();
  const raw = settingsOf() ?? {};
  const today = localISODate(new Date(now));
  const history = pruneHistory(readHistory(raw.history), today);
  const timer = rolloverDay(readTimer(raw.timer, now), today);
  lastNative = '';
  usePomodoro.setState({ ...initialState(), active: true, timer, history, now, today });
  if (timer.status === 'running' && timer.endAt !== undefined && timer.endAt <= now) {
    handleFinish(finishKey(timer), 'restore');
  } else {
    syncNative(true);
  }
  void refreshTaskInfo();
}

/** Para todo. Si la extensión se desactivó, el bloque en curso no cuenta y
 *  el temporizador vuelve a Listo; el historial y las opciones quedan
 *  (PM13). Si solo se desmontó la app, el estado guardado queda como está. */
export function deactivate() {
  const s = usePomodoro.getState();
  const disabled = useAppStore.getState().extensions[POMODORO_ID]?.enabled !== true;
  usePomodoro.setState({ ...initialState() });
  lastNative = '';
  void clearNative();
  closeAudio();
  if (disabled && s.active && s.timer.status !== 'ready') {
    persist({ ...initialTimer(Date.now()), task: null }, s.history);
  }
}

/** Para las pruebas del sonido desde Opciones. */
export const testSound = () => playChime('down');
