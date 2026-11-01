// "Reuniones de hoy" en Inicio (G12, specs/extensiones R27): se dibuja con
// react-dom/server, sin DOM, en cada estado, y `fetchToday` pide solo hoy
// sin tocar el rango del Calendario. La interacción se revisa en la app.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { StateCreator } from 'zustand/vanilla';
import { useExternalEvents, type ExternalEvent } from '../externalEvents';
import { fetchToday, refreshToday, useCalendarSync, useHomeToday } from './sync';
import HomeCard from './HomeCard';
import Settings from './Settings';

const app = vi.hoisted(() => ({
  language: 'es',
  extensions: { 'google-calendar': { enabled: true, settings: {} as Record<string, unknown> } } as Record<string, { enabled: boolean; settings?: Record<string, unknown> }>,
  openExtensionSettings: () => {},
  setSection: async () => {},
  setView: () => {},
  updateExtensionSettings: async () => {},
  showToast: () => '',
}));

const tauri = vi.hoisted(() => ({ calls: [] as { cmd: string; args: unknown }[], events: [] as unknown[], fail: null as unknown }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args: unknown) => {
    tauri.calls.push({ cmd, args });
    if (tauri.fail) throw tauri.fail;
    return tauri.events;
  },
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: async () => null, save: async () => null }));

// react-dom/server lee el estado inicial de los stores (getServerSnapshot):
// con este `create`, lee el actual.
vi.mock('zustand', async (importOriginal) => {
  const z = await importOriginal<typeof import('zustand')>();
  const { createStore } = await import('zustand/vanilla');
  return {
    ...z,
    create: (init: StateCreator<unknown>) => {
      const api = createStore(init);
      api.getInitialState = api.getState;
      return Object.assign((select?: (s: unknown) => unknown) => z.useStore(api, select ?? ((s) => s)), api);
    },
  };
});

vi.mock('../../store/appStore', () => {
  const useAppStore = (select: (s: typeof app) => unknown) => select(app);
  useAppStore.getState = () => app;
  useAppStore.subscribe = () => () => {};
  return { useAppStore };
});


const CONNECTED = { clientId: 'c.apps.googleusercontent.com', secretHint: '…ab', account: 'ana@empresa.com' };
const ev = (id: string, time: string, extra: Partial<ExternalEvent> = {}): ExternalEvent =>
  ({ id, source: 'google-calendar', title: `Reunión ${id}`, date: '2026-10-31', time, ...extra });
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const render = () => renderToStaticMarkup(<HomeCard />);

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 31, 10, 15));
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  app.language = 'es';
  app.extensions['google-calendar'].settings = { ...CONNECTED };
  useExternalEvents.setState({ range: null, bySource: {} });
  useCalendarSync.setState({ status: { state: 'idle' } });
  useHomeToday.setState({ day: null, events: null, loading: false, error: null });
  tauri.calls = [];
  tauri.events = [];
  tauri.fail = null;
});

describe('tarjeta "Reuniones de hoy"', () => {
  it('sin conectar: lo explica y "Conectar" lleva a Opciones', () => {
    app.extensions['google-calendar'].settings = { clientId: 'c' };
    const html = render();
    expect(text(html)).toContain('Reuniones de hoy');
    expect(text(html)).toContain('Google Calendar');
    expect(text(html)).toContain('Conecta tu cuenta de Google para ver aquí tus reuniones de hoy.');
    expect(html).toContain('aria-label="Conectar Google Calendar en Opciones"');
  });

  it('cargando, mientras no hay nada de hoy', () => {
    expect(text(render())).toContain('Trayendo tus reuniones de hoy…');
  });

  it('vacío', () => {
    useHomeToday.setState({ day: '2026-10-31', events: [] });
    expect(text(render())).toContain('No tienes reuniones hoy.');
  });

  it('las de hoy: todo el día primero, hasta 5, "Siguiente" y "+N más"', () => {
    useHomeToday.setState({
      day: '2026-10-31',
      events: [
        ev('a', '09:00', { url: 'https://calendar.google.com/a' }),
        ev('b', '11:00'), ev('todo', ''), ev('c', '12:00'), ev('d', '15:00'), ev('e', '16:00'), ev('f', '17:00'),
      ],
    });
    const html = render();
    const plain = text(html);
    expect(plain).toMatch(/Todo el día Reunión todo .*09:00 Reunión a .*11:00 Reunión b Siguiente .*12:00 Reunión c .*15:00 Reunión d/);
    expect(plain).not.toContain('Reunión e');
    expect(plain).toContain('+2 más');
    expect(html).toContain('aria-label="+2 más en el Calendario"');
    expect(plain.match(/Siguiente/g)).toHaveLength(1);
    // Solo la que tiene enlace es un botón que la abre en Google.
    expect(html).toContain('title="Abrir &quot;Reunión a&quot; en Google Calendar"');
    expect(html.match(/en Google Calendar"/g)).toHaveLength(1);
    expect(plain).toContain('Ver calendario');
    expect(html).toContain('aria-label="Ver calendario de Logday"');
  });

  it('error: "Reintentar" y se quedan las últimas', () => {
    useHomeToday.setState({ day: '2026-10-31', events: [ev('a', '11:00')], error: { code: 'network' } });
    const plain = text(render());
    expect(plain).toContain('No se pudieron actualizar tus reuniones. No se pudo conectar con Google.');
    expect(plain).toContain('Reintentar');
    expect(plain).toContain('Reunión a');
  });

  it('lo de otro día no se muestra como de hoy', () => {
    useHomeToday.setState({ day: '2026-10-30', events: [ev('vieja', '11:00', { date: '2026-10-30' })] });
    const plain = text(render());
    expect(plain).toContain('Trayendo tus reuniones de hoy…');
    expect(plain).not.toContain('Reunión vieja');
  });

  it('si el Calendario tiene hoy a la vista, usa sus eventos y su estado', () => {
    useExternalEvents.setState({
      range: { from: '2026-10-01', to: '2026-11-01' },
      bySource: { 'google-calendar': [ev('mes', '14:00'), ev('otro-dia', '09:00', { date: '2026-10-29' })] },
    });
    useHomeToday.setState({ day: '2026-10-31', events: [ev('propia', '09:00')] });
    let plain = text(render());
    expect(plain).toContain('Reunión mes');
    expect(plain).not.toContain('Reunión propia');
    expect(plain).not.toContain('Reunión otro-dia');
    useCalendarSync.setState({ status: { state: 'error', code: 'rate_limited', status: 429 } });
    plain = text(render());
    expect(plain).toContain('Reintentar');
    expect(plain).toContain('Reunión mes');
  });

  it('con "Mostrar en Inicio" apagado no se dibuja, y el panel tiene el interruptor', () => {
    app.extensions['google-calendar'].settings = { ...CONNECTED, showOnHome: false };
    expect(render()).toBe('');
    const panel = text(renderToStaticMarkup(<Settings />));
    expect(panel).toContain('Mostrar en Inicio');
    expect(panel).toContain('Una tarjeta al final de Inicio con tus reuniones de hoy.');
  });

  it('en inglés', () => {
    app.language = 'en';
    useHomeToday.setState({ day: '2026-10-31', events: [] });
    const plain = text(render());
    expect(plain).toContain('Today’s meetings');
    expect(plain).toContain('No meetings today.');
  });
});

describe('fetchToday y refreshToday', () => {
  it('piden solo el día local, filtran a hoy y no tocan el rango del Calendario', async () => {
    const range = { from: '2026-11-01', to: '2026-12-01' };
    useExternalEvents.setState({ range });
    tauri.events = [
      { id: 'a', summary: 'Hoy', start: { dateTime: '2026-10-31T09:00:00-05:00' } },
      { id: 'b', summary: 'Mañana', start: { dateTime: '2026-11-01T09:00:00-05:00' } },
    ];
    const events = await fetchToday('c', new Date(2026, 9, 31, 21, 0));
    expect(tauri.calls).toEqual([{
      cmd: 'google_calendar_events',
      args: { clientId: 'c', timeMin: '2026-10-31T05:00:00.000Z', timeMax: '2026-11-01T05:00:00.000Z' },
    }]);
    expect(events.map((e) => e.title)).toEqual(['Hoy']);
    expect(useExternalEvents.getState().range).toBe(range);
  });

  it('refreshToday guarda lo de hoy y, si falla, conserva lo anterior', async () => {
    tauri.events = [{ id: 'a', summary: 'Hoy', start: { dateTime: '2026-10-31T09:00:00-05:00' } }];
    await refreshToday('c');
    expect(useHomeToday.getState()).toMatchObject({ day: '2026-10-31', loading: false, error: null });
    expect(useHomeToday.getState().events?.map((e) => e.title)).toEqual(['Hoy']);
    tauri.fail = { code: 'network' };
    await refreshToday('c');
    expect(useHomeToday.getState().error).toEqual({ code: 'network', status: null });
    expect(useHomeToday.getState().events?.map((e) => e.title)).toEqual(['Hoy']);
  });
});
