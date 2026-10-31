// Prueba de humo de la vista, el contador del menú y el panel de Opciones:
// se dibujan (con react-dom/server, sin DOM) en cada estado y muestran lo
// que toca. La interacción se revisa en el navegador.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_OPTIONS, initialTimer, pause, start, type TimerState } from './model';
import { pomodoroApi, usePomodoro } from './store';
import View from './View';
import SidebarStatus from './SidebarStatus';
import Settings from './Settings';

const app = vi.hoisted(() => ({
  language: 'es',
  extensions: { pomodoro: { enabled: true, settings: {} as Record<string, unknown> } },
  notificationsEnabled: true,
  tasks: [],
  activeSection: 'dashboard',
  setSection: async () => {},
  openExtensionSettings: () => {},
  updateExtensionSettings: async () => {},
  setActiveTask: () => {},
  selectProject: () => {},
}));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select: (s: typeof app) => unknown) => select(app);
  useAppStore.getState = () => app;
  useAppStore.subscribe = () => () => {};
  return { useAppStore };
});

// react-dom/server lee el estado inicial del store (getServerSnapshot):
// aquí se lee el actual.
pomodoroApi.getInitialState = pomodoroApi.getState;

const MIN = 60_000;
const T0 = new Date(2026, 9, 30, 9, 0).getTime();
const o = { ...DEFAULT_OPTIONS };

function setTimer(timer: TimerState, now = T0) {
  usePomodoro.setState({ active: true, timer, now, today: '2026-10-30', history: [], notice: null, taskInfo: { state: 'none' } });
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('vista del Pomodoro', () => {
  beforeEach(() => {
    app.extensions.pomodoro.settings = {};
  });

  it('Listo: duración completa, "Iniciar el bloque" y sin contador en el menú', () => {
    setTimer(initialTimer(T0));
    const html = text(renderToStaticMarkup(<View />));
    expect(html).toContain('25:00');
    expect(html).toContain('Iniciar el bloque');
    expect(html).toContain('Bloque 1 de 4');
    expect(html).toContain('Hoy todavía no hay pomodoros terminados.');
    expect(renderToStaticMarkup(<SidebarStatus collapsed={false} />)).toBe('');
  });

  it('corriendo: cuenta atrás, Pausar y el contador en el menú', () => {
    setTimer(start(initialTimer(T0), T0, o), T0 + 6 * MIN + 18_000);
    const html = text(renderToStaticMarkup(<View />));
    expect(html).toContain('18:42');
    expect(html).toContain('18 minutos y 42 segundos');
    expect(html).toContain('Pausar');
    const side = renderToStaticMarkup(<SidebarStatus collapsed={false} />);
    expect(side).toContain('18:42');
    expect(side).toContain('Trabajo, quedan 18 min. Abrir Pomodoro.');
    expect(renderToStaticMarkup(<SidebarStatus collapsed />)).toContain('Pausar el pomodoro');
  });

  it('en pausa y terminado', () => {
    setTimer(pause(start(initialTimer(T0), T0, o), T0 + 10 * MIN), T0 + 20 * MIN);
    let html = text(renderToStaticMarkup(<View />));
    expect(html).toContain('15:00');
    expect(html).toContain('Reanudar');
    expect(html).toMatch(/En pausa desde las 09:10/i);
    setTimer({ ...initialTimer(T0), phase: 'short', status: 'finished', done: 1, lastEnd: { phase: 'work', at: T0, recovered: false, auto: false } });
    html = text(renderToStaticMarkup(<View />));
    expect(html).toContain('Terminó el pomodoro. Toca un descanso de 5 min.');
    expect(html).toContain('Iniciar el descanso');
    expect(html).toContain('Bloque 1 de 4 hecho');
    expect(renderToStaticMarkup(<SidebarStatus collapsed={false} />)).toContain('Descanso listo');
  });

  it('con tarea y con historial de hoy', () => {
    setTimer({ ...initialTimer(T0), task: { id: 'a', title: 'Informe Q3', project: 'Trabajo' } });
    usePomodoro.setState({
      history: [
        { end: new Date(T0 - 30 * MIN).toISOString(), minutes: 25, task: { id: 'a', title: 'Informe Q3', project: 'Trabajo' } },
        { end: new Date(T0 - 60 * MIN).toISOString(), minutes: 25 },
      ],
      taskInfo: { state: 'missing' },
    });
    const html = text(renderToStaticMarkup(<View />));
    expect(html).toContain('Informe Q3');
    expect(html).toContain('Esta tarea ya no existe.');
    expect(html).toContain('2 pomodoros · 50 min de foco');
    expect(html).toContain('Sin tarea');
  });

  it('el panel de Opciones', () => {
    app.extensions.pomodoro.settings = { workMin: 50 };
    setTimer(initialTimer(T0));
    const html = renderToStaticMarkup(<Settings />);
    expect(html).toContain('value="50"');
    expect(text(html)).toContain('Restablecer valores');
    expect(text(html)).toContain('Empezar solos los descansos');
  });
});
