import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPTIONS, STALE_MS, cycleBlock, finish, finishKey, formatClock, fractionLeft, initialTimer, isDefaultOptions,
  longBreakNext, milestoneCrossed, nextPhase, pause, pruneHistory, readHistory, readOptions, readTimer, remainingOf,
  restartCycle, restartPhase, resume, rolloverDay, showsCounter, skip, start, todayEntries, toggle, wholeMinutes,
  type HistoryEntry, type PomodoroOptions, type TimerState,
} from './model';

const MIN = 60_000;
const o: PomodoroOptions = { ...DEFAULT_OPTIONS };
// 30 oct 2026, 09:00 en Bogotá (la zona de las pruebas).
const T0 = new Date(2026, 9, 30, 9, 0, 0).getTime();

const running = (over: Partial<TimerState> = {}): TimerState => start({ ...initialTimer(T0), ...over }, T0, o);

describe('opciones (PM1)', () => {
  it('valores por defecto y rangos', () => {
    expect(readOptions(undefined)).toEqual(DEFAULT_OPTIONS);
    expect(readOptions({ workMin: 0, shortMin: 500, longMin: 'x', longEvery: 1 })).toMatchObject({
      workMin: 1, shortMin: 120, longMin: 15, longEvery: 2,
    });
    expect(readOptions({ longEvery: 11, autoBreaks: true, sound: false })).toMatchObject({ longEvery: 10, autoBreaks: true, sound: false });
    expect(readOptions({ workMin: 1 }).workMin).toBe(1);
    expect(isDefaultOptions(readOptions({}))).toBe(true);
    expect(isDefaultOptions(readOptions({ autoWork: true }))).toBe(false);
  });
});

describe('fases y ciclo', () => {
  it('trabajo, corto y, cada 4, el largo', () => {
    const t = initialTimer(T0);
    expect(nextPhase(t, o, true)).toEqual({ phase: 'short', done: 1 });
    expect(nextPhase({ ...t, done: 3 }, o, true)).toEqual({ phase: 'long', done: 4 });
    expect(nextPhase({ ...t, phase: 'short', done: 2 }, o, true)).toEqual({ phase: 'work', done: 2 });
    expect(nextPhase({ ...t, phase: 'long', done: 4 }, o, true)).toEqual({ phase: 'work', done: 0 });
    // Saltar un bloque no suma.
    expect(nextPhase({ ...t, done: 1 }, o, false)).toEqual({ phase: 'short', done: 1 });
  });

  it('bajar "largo cada" por debajo del bloque actual: toca el largo', () => {
    const t = { ...initialTimer(T0), done: 2 };
    expect(nextPhase(t, { ...o, longEvery: 2 }, true).phase).toBe('long');
    expect(cycleBlock(t, { ...o, longEvery: 2 })).toEqual({ n: 2, total: 2, current: true });
  });

  it('el bloque que se ve', () => {
    expect(cycleBlock({ ...initialTimer(T0), done: 1 }, o)).toEqual({ n: 2, total: 4, current: true });
    expect(cycleBlock({ ...initialTimer(T0), phase: 'short', done: 2 }, o)).toEqual({ n: 2, total: 4, current: false });
    expect(longBreakNext({ ...initialTimer(T0), done: 3 }, o)).toBe(true);
    expect(longBreakNext({ ...initialTimer(T0), done: 2 }, o)).toBe(false);
  });
});

describe('contra el reloj (PM4)', () => {
  it('lo que falta sale del instante de fin', () => {
    const t = running();
    expect(t.endAt).toBe(T0 + 25 * MIN);
    expect(remainingOf(t, T0 + 6 * MIN + 18_000, o)).toBe(18 * MIN + 42_000);
    expect(remainingOf(t, T0 + 30 * MIN, o)).toBe(0);
    // Listo: la duración de las opciones.
    expect(remainingOf(initialTimer(T0), T0, { ...o, workMin: 50 })).toBe(50 * MIN);
  });

  it('pausa fija el tiempo y reanudar mueve el fin', () => {
    const p = pause(running(), T0 + 5 * MIN);
    expect(p.status).toBe('paused');
    expect(remainingOf(p, T0 + 999 * MIN, o)).toBe(20 * MIN);
    const r = resume(p, T0 + 60 * MIN);
    expect(r.endAt).toBe(T0 + 80 * MIN);
    expect(toggle(r, T0 + 61 * MIN, o).status).toBe('paused');
  });

  it('las opciones cambiadas a mitad de fase no tocan la fase en curso', () => {
    const t = running();
    expect(fractionLeft(t, T0 + 12.5 * MIN, { ...o, workMin: 100 })).toBeCloseTo(0.5);
  });

  it('reiniciar la fase y el ciclo', () => {
    const t = restartPhase(running(), T0 + 10 * MIN);
    expect(t.endAt).toBe(T0 + 35 * MIN);
    const p = restartPhase(pause(running(), T0 + 10 * MIN), T0 + 11 * MIN);
    expect(p.remainingMs).toBe(25 * MIN);
    const c = restartCycle({ ...running(), done: 3, phase: 'short' }, T0);
    expect(c).toMatchObject({ phase: 'work', status: 'ready', done: 0 });
  });

  it('saltar deja la siguiente lista, sin contar', () => {
    const s = skip(running({ done: 1 }), T0 + MIN, o);
    expect(s).toMatchObject({ phase: 'short', status: 'ready', done: 1 });
    expect(s.endAt).toBeUndefined();
    expect(showsCounter(s)).toBe(false);
  });
});

describe('terminar una fase', () => {
  it('cuenta el bloque y deja el descanso listo', () => {
    const t = running({ task: { id: 'a', title: 'Informe Q3', project: 'Trabajo' } });
    const r = finish(t, [], finishKey(t), T0 + 25 * MIN + 400, o);
    expect(r.timer).toMatchObject({ phase: 'short', status: 'finished', done: 1 });
    expect(r.history).toEqual([{ end: new Date(T0 + 25 * MIN).toISOString(), minutes: 25, task: t.task }]);
    expect(r.ended).toMatchObject({ phase: 'work', next: 'short', alert: true, auto: false });
    expect(showsCounter(r.timer)).toBe(true);
  });

  it('es idempotente: la misma clave no termina dos veces', () => {
    const t = running();
    const key = finishKey(t);
    const once = finish(t, [], key, T0 + 26 * MIN, o);
    const twice = finish(once.timer, once.history, key, T0 + 26 * MIN, o);
    expect(twice.ended).toBeNull();
    expect(twice.history).toHaveLength(1);
    // Otra clave (otra fase) tampoco.
    expect(finish(t, [], 'short:1', T0 + 26 * MIN, o).ended).toBeNull();
    // Antes del fin, nada.
    expect(finish(t, [], key, T0 + 24 * MIN, o).ended).toBeNull();
  });

  it('arranca sola si la opción está activa, desde el fin', () => {
    const t = running();
    const r = finish(t, [], finishKey(t), T0 + 25 * MIN + 900, { ...o, autoBreaks: true });
    expect(r.timer).toMatchObject({ phase: 'short', status: 'running', endAt: T0 + 30 * MIN });
    expect(r.ended?.auto).toBe(true);
  });

  it('al recuperar (Logday cerrado) cuenta, no avisa si es viejo y no arranca sola (D5)', () => {
    const t = running();
    const late = finish(t, [], finishKey(t), T0 + 25 * MIN + STALE_MS, { ...o, autoBreaks: true });
    expect(late.history).toHaveLength(1);
    expect(late.ended).toMatchObject({ alert: false, auto: false });
    expect(late.timer.status).toBe('finished');
    expect(late.timer.lastEnd?.recovered).toBe(true);
    const fresh = finish(t, [], finishKey(t), T0 + 26 * MIN, { ...o, autoBreaks: true }, { recovered: true });
    expect(fresh.timer.status).toBe('finished');
  });

  it('el fin del descanso largo reinicia el ciclo', () => {
    const t = start({ ...initialTimer(T0), phase: 'long', done: 4 }, T0, o);
    const r = finish(t, [], finishKey(t), T0 + 15 * MIN, o);
    expect(r.timer).toMatchObject({ phase: 'work', done: 0, status: 'finished' });
    expect(r.history).toHaveLength(0);
  });
});

describe('historial (PM9)', () => {
  const entry = (d: Date, minutes = 25): HistoryEntry => ({ end: d.toISOString(), minutes });

  it('conserva 14 días y lee lo de hoy en orden', () => {
    const today = '2026-10-30';
    const h = [
      entry(new Date(2026, 9, 16, 12)), // 15 días antes: fuera
      entry(new Date(2026, 9, 17, 12)),
      entry(new Date(2026, 9, 30, 9, 25)),
      entry(new Date(2026, 9, 30, 10, 0)),
    ];
    expect(pruneHistory(h, today)).toHaveLength(3);
    expect(todayEntries(h, today).map((e) => new Date(e.end).getHours())).toEqual([10, 9]);
  });

  it('el bloque cuenta para el día en que termina', () => {
    // 23:50 a 00:15: es de mañana.
    const t = { ...running(), endAt: new Date(2026, 9, 31, 0, 15).getTime() };
    const r = finish(t, [], finishKey(t), t.endAt + 1, o);
    expect(todayEntries(r.history, '2026-10-31')).toHaveLength(1);
    expect(todayEntries(r.history, '2026-10-30')).toHaveLength(0);
  });

  it('descarta lo que viene mal', () => {
    expect(readHistory('x')).toEqual([]);
    expect(readHistory([{ end: 'no', minutes: 25 }, { end: new Date(T0).toISOString(), minutes: 25 }, null])).toHaveLength(1);
  });
});

describe('cambio de día (D6) y estado guardado (PM12)', () => {
  it('reinicia el ciclo si no hay nada corriendo', () => {
    const t: TimerState = { ...initialTimer(T0), phase: 'short', status: 'finished', done: 3 };
    expect(rolloverDay(t, '2026-10-31')).toMatchObject({ phase: 'work', status: 'ready', done: 0, day: '2026-10-31' });
    expect(rolloverDay(t, t.day)).toBe(t);
    const r = { ...running(), done: 2 };
    expect(rolloverDay(r, '2026-10-31')).toBe(r);
  });

  it('lee el estado guardado y descarta lo que no cuadra', () => {
    const t = running({ done: 2, task: { id: 'x', title: 'X', project: 'P' } });
    expect(readTimer(JSON.parse(JSON.stringify(t)), T0)).toEqual(t);
    expect(readTimer({ status: 'running' }, T0).status).toBe('ready');
    expect(readTimer(null, T0)).toEqual(initialTimer(T0));
  });
});

describe('formatos', () => {
  it('m:ss en minutos totales', () => {
    expect(formatClock(25 * MIN)).toBe('25:00');
    expect(formatClock(299_000)).toBe('4:59');
    expect(formatClock(120 * MIN)).toBe('120:00');
    expect(formatClock(200)).toBe('0:01');
    expect(formatClock(-1)).toBe('0:00');
    expect(wholeMinutes(18 * MIN + 42_000)).toBe(18);
  });

  it('hitos de 5 y 1 minutos, solo si la fase dura más', () => {
    expect(milestoneCrossed(5 * MIN + 500, 5 * MIN - 500, 25 * MIN)).toBe(5);
    expect(milestoneCrossed(MIN + 1, MIN, 25 * MIN)).toBe(1);
    expect(milestoneCrossed(MIN + 1, MIN, MIN)).toBeNull();
    expect(milestoneCrossed(4 * MIN, 3 * MIN, 25 * MIN)).toBeNull();
  });
});
