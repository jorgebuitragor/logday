// El store con lo nativo fallando (el navegador con Tauri simulado): el fin
// lo detecta el reloj del frontend, la recuperación al abrir termina la
// fase una vez y nada lanza aunque `invoke` falle.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS, finishKey, initialTimer, start } from './model';

const app = vi.hoisted(() => ({
  language: 'es',
  extensions: { pomodoro: { enabled: true, settings: {} as Record<string, unknown> } },
  notificationsEnabled: true,
  tasks: [],
  updateExtensionSettings: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
    app.extensions.pomodoro.settings = { ...app.extensions.pomodoro.settings, ...patch };
  }),
}));
const native = vi.hoisted(() => ({ invoke: vi.fn(), notify: vi.fn() }));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select: (s: typeof app) => unknown) => select(app);
  useAppStore.getState = () => app;
  useAppStore.subscribe = () => () => {};
  return { useAppStore };
});
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }));
vi.mock('../../lib/invoke', () => ({ isPermissionGranted: async () => true, sendNotification: native.notify }));
vi.mock('./sound', () => ({ playChime: vi.fn(), closeAudio: vi.fn() }));

import { activate, deactivate, handleFinish, resetPomodoro, startPhase, tick, togglePhase, usePomodoro } from './store';

const MIN = 60_000;
const T0 = new Date(2026, 9, 30, 9, 0).getTime();
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('store del Pomodoro sin Rust', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    app.extensions.pomodoro = { enabled: true, settings: {} };
    native.invoke.mockReset().mockRejectedValue(new Error('sin Tauri'));
    native.notify.mockReset();
    app.updateExtensionSettings.mockClear();
  });
  afterEach(() => {
    deactivate();
    vi.useRealTimers();
  });

  it('el reloj del frontend termina la fase y avisa desde el webview', async () => {
    activate();
    startPhase();
    await flush();
    expect(usePomodoro.getState().native).toBe(false);
    expect(usePomodoro.getState().timer.status).toBe('running');
    // Se guardó al cambiar de estado, no en cada segundo.
    expect(app.updateExtensionSettings).toHaveBeenCalledTimes(1);
    vi.setSystemTime(T0 + 10 * MIN);
    tick();
    expect(app.updateExtensionSettings).toHaveBeenCalledTimes(1);
    vi.setSystemTime(T0 + 25 * MIN);
    tick();
    await flush();
    const s = usePomodoro.getState();
    expect(s.timer).toMatchObject({ phase: 'short', status: 'finished', done: 1 });
    expect(s.history).toHaveLength(1);
    expect(native.notify).toHaveBeenCalledWith({ title: 'Terminó el pomodoro', body: 'Toca un descanso de 5 min.' });
    // Un segundo aviso con la misma clave no hace nada.
    handleFinish(`work:${T0 + 25 * MIN}`, 'native');
    expect(usePomodoro.getState().history).toHaveLength(1);
  });

  it('con Rust activo, el frontend le da 3 s antes de terminar él', async () => {
    native.invoke.mockResolvedValue(true);
    activate();
    startPhase();
    await flush();
    expect(usePomodoro.getState().native).toBe(true);
    vi.setSystemTime(T0 + 25 * MIN + 1000);
    tick();
    expect(usePomodoro.getState().timer.status).toBe('running');
    // Llega el evento de Rust: termina, y no se avisa otra vez desde aquí.
    handleFinish(`work:${T0 + 25 * MIN}`, 'native');
    expect(usePomodoro.getState().timer.status).toBe('finished');
    expect(native.notify).not.toHaveBeenCalled();
  });

  it('al abrir con el fin ya pasado, termina una vez y no arranca sola (D5)', async () => {
    const t = start(initialTimer(T0), T0, DEFAULT_OPTIONS);
    app.extensions.pomodoro.settings = { timer: t, history: [], autoBreaks: true };
    vi.setSystemTime(T0 + 60 * MIN);
    activate();
    await flush();
    const s = usePomodoro.getState();
    expect(s.timer.status).toBe('finished');
    expect(s.timer.lastEnd).toMatchObject({ recovered: true });
    expect(s.history).toHaveLength(1);
    // Hace más de 5 min: sin aviso.
    expect(native.notify).not.toHaveBeenCalled();
    handleFinish(finishKey(t), 'restore');
    expect(usePomodoro.getState().history).toHaveLength(1);
  });

  it('restablecer (PM16): para el temporizador, borra el historial y vuelve a las opciones por defecto', async () => {
    native.invoke.mockResolvedValue(true);
    app.extensions.pomodoro.settings = {
      workMin: 50, autoBreaks: true, showTrayTime: false, showSidebarCounter: false,
      history: [{ end: new Date(T0 - 30 * MIN).toISOString(), minutes: 50 }],
    };
    activate();
    startPhase();
    usePomodoro.setState((s) => ({ timer: { ...s.timer, done: 2, task: { id: 'a', title: 'Informe', project: 'P' } } }));
    await flush();
    expect(usePomodoro.getState().history).toHaveLength(1);
    native.invoke.mockClear();
    await resetPomodoro();
    const s = usePomodoro.getState();
    expect(s.timer).toMatchObject({ phase: 'work', status: 'ready', done: 0, task: null });
    expect(s.timer.endAt).toBeUndefined();
    expect(s.history).toEqual([]);
    // Lo guardado: opciones por defecto (las nuevas incluidas), Listo y sin historial.
    const saved = app.extensions.pomodoro.settings as Record<string, unknown>;
    expect(saved).toMatchObject({
      workMin: 25, autoBreaks: false, showTrayTime: true, showSidebarCounter: true, history: [],
      timer: { phase: 'work', status: 'ready', done: 0, task: null },
    });
    // La bandeja se pone al día: Listo, con el tiempo visible otra vez.
    expect(native.invoke).toHaveBeenCalledWith('pomodoro_idle', {
      tray: expect.objectContaining({ toggle: 'Iniciar un pomodoro (25 min)', showTime: true, skip: null }),
    });
    // Un fin que llegue tarde con la clave vieja no hace nada.
    vi.setSystemTime(T0 + 50 * MIN);
    handleFinish(`work:${T0 + 50 * MIN}`, 'native');
    expect(usePomodoro.getState().history).toEqual([]);
  });

  it('desactivar a mitad de fase la para y no cuenta (PM13)', async () => {
    activate();
    togglePhase();
    app.extensions.pomodoro.enabled = false;
    deactivate();
    await flush();
    const saved = app.extensions.pomodoro.settings as { timer: { status: string } };
    expect(saved.timer.status).toBe('ready');
    expect(usePomodoro.getState().active).toBe(false);
  });
});
