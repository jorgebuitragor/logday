// Lo de las extensiones al final de Inicio (specs/extensiones R27): las
// tarjetas de las activas, en su orden y sin huecos, y el aviso cuando no
// hay ninguna activa. Con react-dom/server, sin DOM; las tarjetas se
// cambian por unas de prueba (las reales se prueban en cada extensión).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { sectionKeys, t } from '../../lib/i18n';
import { EXTENSIONS } from '../../extensions/registry';
import { ExtensionHomeCards, ExtensionsHomeHint, HINT_EXTENSIONS, homeCardDefinitions } from './ExtensionHomeCards';

const app = vi.hoisted(() => ({
  language: 'es' as 'es' | 'en',
  extensions: {} as Record<string, { enabled: boolean }>,
  homeExtensionsHintDismissed: false,
  dismissHomeExtensionsHint: async () => {},
  openExtensionsCatalog: () => {},
  setExtensionEnabled: async () => {},
}));
/** Las tarjetas de prueba que no tienen nada que mostrar. */
const empty = vi.hoisted(() => new Set<string>());

vi.mock('../../store/appStore', () => {
  const useAppStore = (select: (s: typeof app) => unknown) => select(app);
  useAppStore.getState = () => app;
  return { useAppStore };
});

vi.mock('../../extensions/ExtensionSlot', () => ({
  ExtensionSlot: ({ id, point }: { id: string; point: string }) =>
    (empty.has(id) ? null : <article data-card={id} data-point={point} />),
}));

const on = (...ids: string[]) => {
  app.extensions = Object.fromEntries(ids.map((id) => [id, { enabled: true }]));
};
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

beforeEach(() => {
  app.language = 'es';
  app.homeExtensionsHintDismissed = false;
  empty.clear();
  on();
});

describe('tarjetas de las extensiones en Inicio', () => {
  it('sin extensiones activas no pinta nada', () => {
    expect(renderToStaticMarkup(<ExtensionHomeCards />)).toBe('');
  });

  it('con activas sin tarjeta tampoco', () => {
    on('devtools', 'excalidraw');
    expect(renderToStaticMarkup(<ExtensionHomeCards />)).toBe('');
  });

  it('una por extensión activa con tarjeta, por su orden y no por el del registro', () => {
    on('google-calendar', 'pomodoro', 'devtools');
    const html = renderToStaticMarkup(<ExtensionHomeCards />);
    expect([...html.matchAll(/data-card="([^"]+)"/g)].map((m) => m[1])).toEqual(['pomodoro', 'google-calendar']);
    expect(html).toContain('data-point="HomeCard"');
    expect(html).toContain('<h2 id="home-extensions-title" class="sr-only">Extensiones</h2>');
    expect(homeCardDefinitions(EXTENSIONS).map((d) => d.id)).toEqual(['pomodoro', 'google-calendar']);
  });

  it('una tarjeta que devuelve null no deja hueco; si ninguna pinta, la rejilla queda vacía y se oculta', () => {
    on('google-calendar', 'pomodoro');
    empty.add('pomodoro');
    let html = renderToStaticMarkup(<ExtensionHomeCards />);
    expect(html).toMatch(/empty:hidden"><article data-card="google-calendar" data-point="HomeCard"><\/article><\/div>/);
    empty.add('google-calendar');
    html = renderToStaticMarkup(<ExtensionHomeCards />);
    // La rejilla sin hijos (`:empty`) y la sección que la contiene se ocultan.
    expect(html).toMatch(/empty:hidden"><\/div><\/section>$/);
    expect(html).toContain('class="has-[&gt;div:empty]:hidden"');
  });
});

describe('aviso "Extensiones"', () => {
  it('sin ninguna activa: texto, cuatro extensiones, "Ver extensiones" y "Ocultar este aviso"', () => {
    const html = renderToStaticMarkup(<ExtensionsHomeHint />);
    const plain = text(html);
    expect(plain).toContain('Extensiones');
    expect(plain).toContain('Suma a Logday lo que uses: un temporizador Pomodoro, tus reuniones de Google Calendar, herramientas para desarrolladores y más. Todas empiezan apagadas.');
    expect(plain).toContain('Pomodoro Google Calendar DevTools Captura rápida');
    // Una lista, no controles.
    expect(html.match(/<li/g)).toHaveLength(4);
    expect(html).toMatch(/<ul aria-label="Algunas de las extensiones"/);
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(plain).toContain('Ver extensiones');
    expect(html).toContain('aria-label="Ocultar este aviso"');
    expect(html).toContain('border-dashed');
  });

  it('las extensiones que nombra existen en el registro', () => {
    for (const id of HINT_EXTENSIONS) expect(EXTENSIONS.some((d) => d.id === id), id).toBe(true);
  });

  it('con una extensión activa, aunque no tenga tarjeta, no se muestra', () => {
    on('devtools');
    expect(renderToStaticMarkup(<ExtensionsHomeHint />)).toBe('');
  });

  it('descartado, no se muestra', () => {
    app.homeExtensionsHintDismissed = true;
    expect(renderToStaticMarkup(<ExtensionsHomeHint />)).toBe('');
  });

  it('en inglés', () => {
    app.language = 'en';
    const plain = text(renderToStaticMarkup(<ExtensionsHomeHint />));
    expect(plain).toContain('Add what you use to Logday: a Pomodoro timer, your Google Calendar meetings, developer tools and more. They all start turned off.');
    expect(plain).toContain('See extensions');
  });
});

describe('textos de R27', () => {
  it('es y en tienen las mismas claves en las secciones que se tocaron', () => {
    for (const section of ['dashboard', 'pomodoro', 'googleCalendar', 'extensions'] as const) {
      expect(sectionKeys('en', section).sort(), section).toEqual(sectionKeys('es', section).sort());
    }
  });

  it('sin voseo en los textos nuevos', () => {
    const keys = {
      dashboard: ['homeExtensionsHeading', 'extHintTitle', 'extHintText', 'extHintListLabel', 'extHintSee', 'extHintHide'],
      pomodoro: ['setShowOnHome', 'setShowOnHomeHint', 'homeOpen', 'homeOpenAria', 'homeTask', 'homeToday', 'homeTodayEmpty'],
      googleCalendar: sectionKeys('es', 'googleCalendar').filter((k) => k.startsWith('home') || k.startsWith('showOnHome')),
    };
    for (const [section, list] of Object.entries(keys)) {
      for (const key of list) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const es = t('es', section as any, key as any);
        expect(es, key).not.toBe(key);
        expect(es, key).not.toMatch(/\b(querés|podés|tenés|activá|conectá|mirá|sumá|usás|hacé|tocá|ocultá)\b/i);
      }
    }
  });
});
