import { describe, expect, it } from 'vitest';
import { sectionKeys, t } from '../../lib/i18n';
import { DEFAULT_OPTIONS, finishKey, initialTimer, pause, start, type TimerState } from './model';
import { finishTexts, nativeRequest, trayTexts } from './native';
import { makeTr } from './text';

const MIN = 60_000;
const T0 = new Date(2026, 9, 30, 9, 0).getTime();
const o = { ...DEFAULT_OPTIONS };
const tr = makeTr('es');
const running = (over: Partial<TimerState> = {}) => start({ ...initialTimer(T0), ...over }, T0, o);

describe('lo que se le pasa a Rust', () => {
  it('corriendo: el fin, la clave y los textos ya traducidos', () => {
    const t0 = running({ task: { id: 'a', title: 'Informe Q3', project: 'Trabajo' } });
    const req = nativeRequest(t0, o, tr, true);
    expect(req.cmd).toBe('pomodoro_schedule');
    if (req.cmd !== 'pomodoro_schedule') return;
    expect(req.args.endAt).toBe(T0 + 25 * MIN);
    expect(req.args.key).toBe(finishKey(t0));
    expect(req.args.alert).toEqual({
      notify: true, ownSound: true, title: 'Terminó el pomodoro', body: 'Informe Q3. Toca un descanso de 5 min.',
    });
    // Rust rellena {min} y {time}.
    expect(req.args.tray).toEqual({
      status: 'Trabajo · {min} min',
      statusLessThanMin: 'Trabajo · menos de 1 min',
      toggle: 'Pausar',
      skip: 'Saltar',
      tooltip: 'Logday · Trabajo · {time}',
      showTime: true,
      minuteDigits: 2,
    });
  });

  it('sin el tiempo en la bandeja (PM15): lo dice a Rust y el menú sigue', () => {
    const tray = trayTexts(running(), { ...o, showTrayTime: false }, tr);
    expect(tray).toMatchObject({ showTime: false, toggle: 'Pausar', skip: 'Saltar', status: 'Trabajo · {min} min' });
    // Un descanso de 5 min: una cifra, sin relleno.
    const brk = start({ ...initialTimer(T0), phase: 'short', done: 1 }, T0, o);
    expect(trayTexts(brk, o, tr).minuteDigits).toBe(1);
  });

  it('el cuarto bloque avisa del descanso largo, y con arranque solo lo dice', () => {
    expect(finishTexts(running({ done: 3 }), o, tr).body).toBe('Toca un descanso largo de 15 min.');
    expect(finishTexts(running(), { ...o, autoBreaks: true }, tr).body).toBe('Ya empezó un descanso de 5 min.');
    const brk = start({ ...initialTimer(T0), phase: 'short', done: 1 }, T0, o);
    expect(finishTexts(brk, o, tr)).toEqual({ title: 'Terminó el descanso', body: 'Cuando quieras, empieza el siguiente bloque de 25 min.' });
  });

  it('en pausa, terminado y listo', () => {
    const p = nativeRequest(pause(running(), T0 + 6 * MIN), o, tr, true);
    expect(p).toMatchObject({ cmd: 'pomodoro_pause', args: { remaining: 19 * MIN, tray: { toggle: 'Reanudar', status: 'Trabajo · en pausa · {time}' } } });
    const fin: TimerState = { ...initialTimer(T0), phase: 'short', status: 'finished', done: 1 };
    expect(trayTexts(fin, o, tr)).toMatchObject({ status: 'Descanso corto listo · 5 min', toggle: 'Iniciar el descanso', skip: 'Saltar' });
    // D2: sin nada en curso, solo "Iniciar un pomodoro".
    expect(nativeRequest(initialTimer(T0), o, tr, false)).toEqual({
      cmd: 'pomodoro_idle',
      args: {
        tray: {
          status: null, statusLessThanMin: null, toggle: 'Iniciar un pomodoro (25 min)', skip: null, tooltip: null, showTime: true, minuteDigits: 2,
        },
      },
    });
  });

  it('la notificación recorta el título de la tarea a 60 caracteres', () => {
    const long = 'x'.repeat(80);
    const body = finishTexts(running({ task: { id: 'a', title: long, project: 'P' } }), o, tr).body;
    expect(body.startsWith(`${'x'.repeat(59)}…. `)).toBe(true);
  });
});

describe('textos (PM14)', () => {
  it('las mismas claves en es y en, sin voseo ni plurales rotos', () => {
    const es = sectionKeys('es', 'pomodoro');
    expect(es.length).toBeGreaterThan(100);
    expect(sectionKeys('en', 'pomodoro').sort()).toEqual([...es].sort());
    for (const key of es) {
      const text = t('es', 'pomodoro', key as never);
      expect(text, key).not.toMatch(/\b(querés|podés|tenés|elegí|empezá|tocá|probá|escribí|activá)\b/i);
    }
  });

  it('los plurales con {n|uno|varios}', () => {
    expect(tr('todaySummary', { n: 1, focus: '25 min' })).toBe('1 pomodoro · 25 min de foco');
    expect(tr('todaySummary', { n: 4, focus: '1 h 40 min' })).toBe('4 pomodoros · 1 h 40 min de foco');
    expect(tr('livePaused', { min: 1 })).toBe('En pausa. Queda 1 minuto.');
    expect(tr('timeSr', { m: 18, s: 1 })).toBe('18 minutos y 1 segundo');
    expect(makeTr('en')('todaySummary', { n: 1, focus: '25 min' })).toBe('1 pomodoro · 25 min of focus');
  });
});
