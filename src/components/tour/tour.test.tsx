// El recorrido dibujado con react-dom/server y sus animaciones leídas de
// App.css (specs/onboarding OB12–OB15). Que la animación se vea bien se
// revisa en el navegador; aquí, que sin ella quede el fotograma final, que
// solo use transform y opacity, y que las teclas salgan de la config.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { t } from '../../lib/i18n';

const app = vi.hoisted(() => ({
  language: 'es' as 'es' | 'en',
  sidebarStyle: 'icons' as 'icons' | 'list',
  sidebarSections: undefined as { id: string; hidden?: boolean }[] | undefined,
  extensions: {} as Record<string, { enabled: boolean }>,
  animationsEnabled: true,
  shortcuts: { newNote: 'n', newTask: 't', search: 'f', newDaily: 'd', markAbsence: 'a' },
  setExtensionEnabled: async () => {},
  // Acerca de
  updateInfo: null,
  updateStatus: 'idle',
  autoUpdateEnabled: false,
  openReleaseNotes: () => {},
  openCurrentReleaseNotes: async () => true,
  checkForUpdates: async () => false,
  installUpdate: async () => {},
  setAutoUpdateEnabled: () => {},
}));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select?: (s: typeof app) => unknown) => (select ? select(app) : app);
  useAppStore.getState = () => app;
  useAppStore.subscribe = () => () => {};
  return { useAppStore };
});
// Sin portal: react-dom/server no los dibuja.
vi.mock('../shared/ModalOverlay', () => ({
  ModalOverlay: ({ children }: { children: React.ReactNode }) => <div data-overlay="">{children}</div>,
}));

const { TourScenes } = await import('./TourScenes');
const { TourModal } = await import('./TourModal');
const { MiniFrame } = await import('./MiniFrame');
const { AboutSettingsTab } = await import('../settings/AboutSettingsTab');
const { homeItem, IS_MAC } = await import('../sidebar/sections');
const { TOUR_SCENES } = await import('./scenes');

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const key = (k: string) => (IS_MAC ? `⌘${k}` : `Ctrl+${k}`);

beforeEach(() => {
  app.language = 'es';
  app.sidebarStyle = 'icons';
  app.sidebarSections = undefined;
  app.animationsEnabled = true;
  app.shortcuts = { newNote: 'n', newTask: 't', search: 'f', newDaily: 'd', markAbsence: 'a' };
});

// ── App.css ─────────────────────────────────────────────────

// Se lee del disco: un `?raw` de CSS llega vacío en vitest, y el proyecto no
// tiene los tipos de Node, así que `node:fs` se importa sin ellos.
const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (path: URL, encoding: 'utf8') => string };
const css = readFileSync(new URL('../../App.css', import.meta.url), 'utf8');


/** Las declaraciones de un bloque, como `{ propiedad: valor }`. */
function decls(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of block.split(';')) {
    const i = d.indexOf(':');
    if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  }
  return out;
}

/** Cada `@keyframes obd-*` con sus pasos (selector → declaraciones). */
function obdKeyframes(): Map<string, { stops: string; body: Record<string, string> }[]> {
  const out = new Map<string, { stops: string; body: Record<string, string> }[]>();
  for (const m of css.matchAll(/@keyframes (obd-[\w-]+) \{([\s\S]*?)\n\}/g)) {
    const steps = [...m[2].matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((s) => ({ stops: s[1].trim(), body: decls(s[2]) }));
    out.set(m[1], steps);
  }
  return out;
}

/** La regla `.clase { … }` de primer nivel. */
function baseRule(cls: string): Record<string, string> | null {
  const m = css.match(new RegExp(`\\n\\.${cls} \\{([^}]*)\\}`));
  return m ? decls(m[1]) : null;
}

describe('las animaciones (OB13)', () => {
  const frames = obdKeyframes();

  it('hay de sobra, y solo mueven transform y opacity', () => {
    expect(frames.size).toBeGreaterThan(15);
    for (const [name, steps] of frames) {
      for (const step of steps) {
        for (const prop of Object.keys(step.body)) expect([name, prop]).toEqual([name, expect.stringMatching(/^(transform|opacity)$/)]);
      }
    }
  });

  it('el estilo base de cada clase es su fotograma final', () => {
    for (const [name, steps] of frames) {
      if (name === 'obd-step-in') continue; // el cambio de paso termina en el estilo normal
      const last = steps[steps.length - 1];
      expect(last.stops).toMatch(/100%|to/);
      const base = baseRule(name);
      expect(base, name).not.toBeNull();
      expect(base!['animation-name']).toBe(name);
      const { 'animation-name': _, ...rest } = base!;
      void _;
      expect([name, rest]).toEqual([name, last.body]);
    }
  });

  it('una pasada de 4 s que empieza a los 300 ms y se queda en el final', () => {
    const anim = baseRule('obd-anim')!;
    expect(anim).toMatchObject({
      'animation-duration': '4s',
      'animation-delay': '300ms',
      'animation-iteration-count': '1',
      'animation-fill-mode': 'both',
    });
  });

  it('nada se mueve con prefers-reduced-motion ni con .no-animations, y no hay "Ver de nuevo"', () => {
    expect(css).toContain([
      '@media (prefers-reduced-motion: reduce) {',
      '  .obd-anim { animation: none !important; }',
      '  .obd-replay { display: none !important; }',
      '}',
    ].join('\n'));
    expect(css).toContain('.no-animations .obd-replay { display: none !important; }');
    expect(css).toMatch(/\.no-animations \*,[\s\S]*?animation: none !important;/);
  });

  it('cada clase .obd-* de las miniaturas existe en App.css', () => {
    const used = new Set<string>();
    for (let scene = 0; scene < TOUR_SCENES.length; scene++) {
      for (const style of ['icons', 'list'] as const) {
        app.sidebarStyle = style;
        for (const m of renderToStaticMarkup(<TourScenes scene={scene} />).matchAll(/(?<![\w-])obd-[\w-]+/g)) used.add(m[0]);
      }
    }
    for (const cls of used) expect([cls, css.includes(`.${cls}`)]).toEqual([cls, true]);
  });
});

// ── MiniFrame ───────────────────────────────────────────────

describe('MiniFrame (OB13)', () => {
  const rows = [homeItem('es'), ...['dailys', 'tasks', 'notes'].map((id) => ({ ...homeItem('es'), id: id as 'tasks', label: id }))];

  it('dibuja el menú en el estilo elegido', () => {
    expect(renderToStaticMarkup(<MiniFrame variant="icons" rows={rows}>x</MiniFrame>)).toContain('obd-frame-icons');
    expect(renderToStaticMarkup(<MiniFrame variant="list" rows={rows}>x</MiniFrame>)).toContain('obd-frame-list');
  });

  it('el resaltado va a la fila de la sección; se anima solo si cambia', () => {
    const still = renderToStaticMarkup(<MiniFrame variant="icons" rows={rows} to="tasks">x</MiniFrame>);
    expect(still).toContain('data-highlight="tasks"');
    expect(still).toContain('--obd-to:2');
    expect(still).not.toContain('obd-hl-');
    const moving = renderToStaticMarkup(<MiniFrame variant="list" rows={rows} from="dashboard" to="tasks" move="late">x</MiniFrame>);
    expect(moving).toContain('obd-anim obd-hl-late');
    expect(moving).toContain('--obd-from:0;--obd-to:2');
  });

  it('sin sección, sin resaltado; y es decorativo', () => {
    const html = renderToStaticMarkup(<MiniFrame variant="icons" rows={rows}>x</MiniFrame>);
    expect(html).not.toContain('data-highlight');
    expect(html).toMatch(/^<div aria-hidden="true"/);
  });
});

// ── TourScenes ──────────────────────────────────────────────

describe('las escenas (OB12–OB14)', () => {
  it('cada una con su miniatura decorativa, su título con foco y su texto', () => {
    TOUR_SCENES.forEach((scene, i) => {
      const html = renderToStaticMarkup(<TourScenes scene={i} />);
      expect(html).toContain('<div aria-hidden="true" class="obd-frame');
      expect(html).toMatch(new RegExp(`<h2 tabindex="-1"[^>]*>${t('es', 'tour', scene.title)}</h2>`));
      expect(text(html)).toContain(`${i + 1} de 5`);
    });
  });

  it('el menú de la miniatura sigue el estilo elegido', () => {
    app.sidebarStyle = 'list';
    expect(renderToStaticMarkup(<TourScenes scene={0} />)).toContain('obd-frame-list');
  });

  it('"Ver la animación de nuevo", solo con las animaciones encendidas', () => {
    const html = renderToStaticMarkup(<TourScenes scene={1} />);
    expect(html).toContain('aria-label="Ver la animación de nuevo"');
    expect(html).toContain('obd-replay');
    app.animationsEnabled = false;
    expect(renderToStaticMarkup(<TourScenes scene={1} />)).not.toContain('obd-replay');
  });

  it('Muévete rápido: las teclas de Buscar y de Tareas según la config y el orden del menú', () => {
    let html = renderToStaticMarkup(<TourScenes scene={3} />);
    expect(html).toContain(`>${key('F')}</span>`);
    expect(html).toContain(`>${key('2')}</span>`);
    expect(html).toContain('data-highlight="tasks"');
    expect(text(html)).toContain('Ir a Tareas');
    // {home} {first}…{last} del texto: Inicio y las 4 secciones fijas.
    for (const k of ['0', '1', '4']) expect(html).toContain(`>${key(k)}</kbd>`);
    // Con Tareas primera y Buscar en otra letra.
    app.sidebarSections = [{ id: 'tasks' }, { id: 'dailys' }];
    app.shortcuts = { ...app.shortcuts, search: 'k' };
    html = renderToStaticMarkup(<TourScenes scene={3} />);
    expect(html).toContain(`>${key('K')}</span>`);
    expect(html).toContain(`>${key('1')}</span>`);
    expect(html).toContain(`<kbd class="rounded-md border`);
  });

  it('en inglés, la búsqueda escribe el principio de "Tasks"', () => {
    app.language = 'en';
    const html = renderToStaticMarkup(<TourScenes scene={3} />);
    expect(text(html)).toContain(' tas ');
    expect(text(html)).toContain('Go to Tasks');
  });

  it('Tus datos: los archivos reales de la carpeta y lo opcional', () => {
    const plain = text(renderToStaticMarkup(<TourScenes scene={4} />));
    for (const f of ['projects/', 'notes/', 'dailys/']) expect(plain).toContain(f);
    for (const name of ['Sync', 'Git', 'Extensiones']) expect(plain).toContain(`${name} · opcional`);
  });
});

// ── TourModal y Acerca de ───────────────────────────────────

describe('"Ver el recorrido" (OB15)', () => {
  it('Acerca de tiene el botón con su descripción', () => {
    const plain = text(renderToStaticMarkup(<AboutSettingsTab />));
    expect(plain).toContain('Ver el recorrido');
    expect(plain).toContain('Repasa cómo funciona Logday.');
  });

  it('el modal: diálogo con título, Cerrar y Siguiente; en la última escena, Atrás y Terminar', () => {
    const first = renderToStaticMarkup(<TourModal onClose={() => {}} />);
    expect(first).toContain('role="dialog" aria-modal="true" aria-labelledby="tour-modal-title"');
    expect(first).toMatch(/id="tour-modal-title"[^>]*>Cómo funciona</);
    expect(text(first)).toContain('Cerrar');
    expect(text(first)).toContain('Siguiente');
    expect(text(first)).not.toContain('Atrás');
    expect(text(first)).not.toContain('Elige tu carpeta');
    const last = text(renderToStaticMarkup(<TourModal onClose={() => {}} initialScene={4} />));
    expect(last).toContain('Atrás');
    expect(last).toContain('Terminar');
    expect(last).toContain('5 de 5');
  });
});
