// La ayuda contextual (specs/ayuda-contextual) dibujada con react-dom/server y
// su teclado en funciones puras. Abrirla, el foco y el popover sobre la
// pantalla se revisan en el navegador; aquí, la estructura, el ARIA, los
// textos, qué ayuda va en cada sección y de dónde salen las teclas.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShieldCheck } from 'lucide-react';
import { sectionKeys, t } from '../../lib/i18n';

const app = vi.hoisted(() => ({
  language: 'es' as 'es' | 'en',
  sidebarStyle: 'icons' as 'icons' | 'list',
  sidebarSections: undefined,
  extensions: {} as Record<string, { enabled: boolean; settings?: Record<string, unknown> }>,
  animationsEnabled: true,
  helpButtonsEnabled: true,
  shortcuts: { newNote: 'n', newTask: 't', search: 'f', newDaily: 'd', markAbsence: 'a' },
  showToast: () => '',
}));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select?: (s: typeof app) => unknown) => (select ? select(app) : app);
  useAppStore.getState = () => app;
  useAppStore.subscribe = () => () => {};
  return { useAppStore };
});
// Sin portal: react-dom/server no los dibuja.
vi.mock('./ModalOverlay', () => ({
  ModalOverlay: ({ children }: { children: ReactNode }) => <div data-overlay="">{children}</div>,
}));

const { HelpPanel, HelpSection, HelpShortcuts, HelpNote, helpFooter } = await import('./HelpPopover');
const { closeOnEscape, nextTrapIndex, passesToApp, scrollCloses } = await import('./helpKeyboard');
const {
  ScreenHelpBody, TASKS_HELP_ITEMS, DAILYS_HELP_ITEMS, OVERTIME_HELP_ITEMS, GENERAL_HELP_ITEMS,
} = await import('../help/ScreenHelp');
const { tasksHelpKeys, dailysHelpKeys, generalHelpKeys, modKey } = await import('../help/helpKeys');
const { shortcutSheet } = await import('../tasks/TaskShortcutsSheet');
const { TourModal } = await import('../tour/TourModal');
const { DevtoolsContext } = await import('../../extensions/devtools/ui/context');
const { default: DevtoolsHelp, DevtoolsHelpBody, GENERAL_HELP } = await import('../../extensions/devtools/ui/Help');
const { ToolFrame } = await import('../../extensions/devtools/ui/ToolFrame');
const { TOOL_HELP, HELP_SHORTCUTS } = await import('../../extensions/devtools/ui/meta');
const { makeTr: makeDevtoolsTr, shortcutLabel: devtoolsShortcut } = await import('../../extensions/devtools/ui/text');
const { MAX_MATCHES } = await import('../../extensions/devtools/tools/regex');
const { REGEX_TIMEOUT_MS } = await import('../../extensions/devtools/tools/regexRunner');
const { PomodoroHelpBody, pomodoroHelpRows } = await import('../../extensions/pomodoro/Help');
const { makeTr: makePomodoroTr } = await import('../../extensions/pomodoro/text');

const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (path: URL, encoding: 'utf8') => string };

import type { DevtoolsContextValue } from '../../extensions/devtools/ui/context';
import type { ToolId } from '../../extensions/devtools/model';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const VOSEO = /\b(querés|podés|tenés|sabés|elegí|empezá|tocá|probá|escribí|activá|pegá|usá|buscá|pulsá|arrastrá|cambiá|mirá|dejá|guardá|abrí)\b/i;
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

beforeEach(() => {
  app.language = 'es';
  app.extensions = {};
  app.shortcuts = { newNote: 'n', newTask: 't', search: 'f', newDaily: 'd', markAbsence: 'a' };
});

// ── El popover ──────────────────────────────────────────────

describe('HelpPanel (AY3, AY4, AY12)', () => {
  const panel = (intro?: string) => renderToStaticMarkup(
    <HelpPanel
      id="h1"
      title="Cómo funcionan las tareas"
      intro={intro}
      closeLabel="Cerrar"
      onClose={() => {}}
      footer={[{ label: 'Ver todos los atajos', onClick: () => {} }, { label: 'Ver el recorrido', onClick: () => {} }]}
    >
      <HelpSection items={['uno', 'dos']} />
    </HelpPanel>,
  );

  it('es un diálogo modal con su título como nombre y el foco en el contenedor', () => {
    const out = panel();
    expect(out).toMatch(/^<div id="h1" role="dialog" aria-modal="true" aria-labelledby="h1-title" tabindex="-1"/);
    expect(out).toContain('<h2 id="h1-title"');
    expect(out).not.toContain('aria-describedby');
  });

  it('la intro, si la hay, es la descripción', () => {
    const out = panel('Una intro');
    expect(out).toContain('aria-describedby="h1-intro"');
    expect(out).toContain('<p id="h1-intro"');
  });

  it('Cerrar, el contenido y el pie en ese orden', () => {
    const out = text(panel());
    expect(out).toBe('Cómo funcionan las tareas uno dos Ver todos los atajos Ver el recorrido');
    expect(panel()).toContain('aria-label="Cerrar"');
  });

  it('solo tokens del tema, salvo el acento de los enlaces, y con animación que se apaga', () => {
    const out = panel();
    expect(out).toContain('bg-[var(--bg-elevated)]');
    expect(out).toContain('border-[var(--border-card)]');
    expect(out).not.toMatch(/bg-indigo|#[0-9a-f]{3,6}\b|(?:text|bg|border)-(?:zinc|gray|slate|neutral|white|black)\b/i);
    // El único color fijo es el de TEXT_LINK, que los temas repintan.
    expect([...out.matchAll(/text-indigo-\d+/g)].map((m) => m[0])).toEqual(['text-indigo-400', 'text-indigo-400']);
    expect(out).toContain('help-popover animate-fade-in');
  });

  it('sin pie si no hay acciones', () => {
    const out = renderToStaticMarkup(<HelpPanel id="h" title="T" closeLabel="Cerrar" onClose={() => {}}><p>x</p></HelpPanel>);
    expect(out).not.toContain('border-t');
  });
});

describe('las piezas del contenido (AY4, AY12)', () => {
  it('HelpSection: puntos en ul y pasos en ol, con título opcional', () => {
    expect(renderToStaticMarkup(<HelpSection items={['a']} />)).toMatch(/^<div><ul class="list-disc[^"]*"><li>a<\/li><\/ul><\/div>$/);
    const steps = renderToStaticMarkup(<HelpSection kind="steps" title="En esta herramienta" items={['a', 'b']} />);
    expect(steps).toContain('<h3 class="text-[10px] font-semibold uppercase');
    expect(steps).toMatch(/<ol class="list-decimal[^"]*"><li>a<\/li><li>b<\/li><\/ol>/);
  });

  it('HelpShortcuts: dl con una kbd por tecla y el separador', () => {
    const out = renderToStaticMarkup(<HelpShortcuts rows={[{ keys: ['⌥⌘↓', '⌥⌘↑'], label: 'Siguiente', sep: '/' }, { keys: ['⌘↵'], label: 'Procesar' }]} />);
    expect(out).toContain('>Atajos</h3>');
    expect(out).toMatch(/<dl class="grid grid-cols-\[auto_1fr\][^"]*">/);
    expect(out).toMatch(/<dt[^>]*><kbd class="[^"]*">⌥⌘↓<\/kbd><span>\/<\/span><kbd class="[^"]*">⌥⌘↑<\/kbd><\/dt><dd[^>]*>Siguiente<\/dd>/);
    expect(out).toMatch(/<dt[^>]*><kbd class="[^"]*">⌘↵<\/kbd><\/dt><dd[^>]*>Procesar<\/dd>/);
  });

  it('HelpNote: el ícono no se lee', () => {
    const out = renderToStaticMarkup(<HelpNote icon={ShieldCheck}>Nota</HelpNote>);
    expect(out).toMatch(/^<p class="flex items-start gap-1.5 text-\[11px\][^"]*"><svg[^>]*aria-hidden="true"/);
    expect(text(out)).toBe('Nota');
  });
});

// ── El pie y el recorrido ───────────────────────────────────

describe('el pie (AY5)', () => {
  it('cada acción cierra antes la ayuda; "Ver el recorrido" va al final', () => {
    const calls: string[] = [];
    const footer = helpFooter(
      [{ label: 'Ver todos los atajos', onClick: () => calls.push('atajos') }],
      'Ver el recorrido',
      () => calls.push('cerrar'),
      () => calls.push('recorrido'),
    );
    expect(footer.map((a) => a.label)).toEqual(['Ver todos los atajos', 'Ver el recorrido']);
    footer[0].onClick();
    footer[1].onClick();
    expect(calls).toEqual(['cerrar', 'atajos', 'cerrar', 'recorrido']);
  });

  it('sin escena, sin "Ver el recorrido"', () => {
    expect(helpFooter([], null, () => {}, () => {})).toEqual([]);
  });

  it('TourModal abre en la escena pedida', () => {
    expect(text(renderToStaticMarkup(<TourModal onClose={() => {}} initialScene={1} />))).toContain(t('es', 'tour', 's2Title'));
    expect(text(renderToStaticMarkup(<TourModal onClose={() => {}} initialScene={0} />))).toContain(t('es', 'tour', 's1Title'));
  });
});

// ── Teclado ─────────────────────────────────────────────────

describe('el teclado (AY7–AY10)', () => {
  const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
    key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods,
  });

  it('Tab recorre los controles en ciclo; desde el contenedor va al primero o al último', () => {
    expect(nextTrapIndex(-1, 3, false)).toBe(0);
    expect(nextTrapIndex(-1, 3, true)).toBe(2);
    expect(nextTrapIndex(0, 3, false)).toBe(1);
    expect(nextTrapIndex(2, 3, false)).toBe(0);
    expect(nextTrapIndex(0, 3, true)).toBe(2);
    expect(nextTrapIndex(0, 1, false)).toBe(0);
    expect(nextTrapIndex(-1, 0, false)).toBe(-1);
  });

  it('las teclas de la pantalla de detrás no salen de la ayuda (Espacio, ⌘⇧C, ⌘↵, ⌥⌘↓, ⌘⇧→)', () => {
    for (const e of [
      key(' '), key('Enter'), key('Tab'), key('x'), key('?'),
      key('c', { metaKey: true, shiftKey: true }), key('C', { ctrlKey: true, shiftKey: true }),
      key('Enter', { metaKey: true }), key('ArrowDown', { metaKey: true, altKey: true }),
      key('ArrowRight', { metaKey: true, shiftKey: true }), key('1', { metaKey: true, altKey: true }),
      key(' ', { metaKey: true }),
    ]) expect([e, passesToApp(e)]).toEqual([e, false]);
  });

  it('los atajos globales de la app sí siguen (⌘N, ⌘T, ⌘F, ⌘1, Ctrl+D)', () => {
    for (const e of [key('n', { metaKey: true }), key('t', { metaKey: true }), key('f', { metaKey: true }), key('1', { metaKey: true }), key('0', { metaKey: true }), key('d', { ctrlKey: true })]) {
      expect([e, passesToApp(e)]).toEqual([e, true]);
    }
  });

  it('Esc cierra solo la ayuda: corta el evento para que no llegue a Opciones', () => {
    const calls: string[] = [];
    const e = { key: 'Escape', preventDefault: () => calls.push('preventDefault'), stopPropagation: () => calls.push('stopPropagation') };
    expect(closeOnEscape(e, () => calls.push('cerrar'))).toBe(true);
    expect(calls).toEqual(['preventDefault', 'stopPropagation', 'cerrar']);
    const other: string[] = [];
    expect(closeOnEscape({ key: 'a', preventDefault: () => other.push('p'), stopPropagation: () => other.push('s') }, () => other.push('cerrar'))).toBe(false);
    expect(other).toEqual([]);
  });

  it('solo la cierra un desplazamiento que mueve el botón; el del popover o el de la pantalla, no', () => {
    const trigger = {} as Node;
    const inside = { contains: () => false };
    const popover = { contains: (n: unknown) => n === inside };
    const page = { contains: (n: unknown) => n === trigger }; // el documento: contiene el botón
    const list = { contains: () => false }; // la lista de tareas: no lo contiene
    expect(scrollCloses(page, popover, trigger)).toBe(true);
    expect(scrollCloses(list, popover, trigger)).toBe(false);
    expect(scrollCloses(inside, popover, trigger)).toBe(false);
    expect(scrollCloses(page, null, trigger)).toBe(false);
    expect(scrollCloses(page, popover, null)).toBe(false);
  });
});

// ── App.css ─────────────────────────────────────────────────

const css = readFileSync(new URL('../../App.css', import.meta.url), 'utf8');

describe('la animación (AY12)', () => {
  it('se apaga con prefers-reduced-motion y con .no-animations', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce) {\n  .help-popover { animation: none; }\n}');
    expect(css).toMatch(/\.no-animations \*,[\s\S]*?animation: none !important;/);
    // Y el fotograma final de fade-in es el estilo normal: opacidad 1.
    expect(css).toMatch(/@keyframes fade-in \{\s*from \{ opacity: 0; \}\s*to\s+\{ opacity: 1; \}/);
  });
});

// ── Las teclas de la config (AY13, AY22) ────────────────────

describe('las teclas salen de la config y del sistema (AY13)', () => {
  const shortcuts = { newNote: 'n', newTask: 'k', search: 'f', newDaily: 'j', markAbsence: 'b' };

  it('Tareas: la letra de nueva tarea y ⌘ o Ctrl', () => {
    expect(tasksHelpKeys(shortcuts, true).tasks5).toEqual({ newTask: '⌘K' });
    expect(tasksHelpKeys(shortcuts, false).tasks5).toEqual({ newTask: 'Ctrl+K' });
    expect(tasksHelpKeys(shortcuts, true).tasks3).toEqual({ mod: '⌘' });
    expect(tasksHelpKeys(shortcuts, false).tasks3).toEqual({ mod: 'Ctrl' });
  });

  it('Dailys: las letras del daily de hoy y de la ausencia', () => {
    expect(dailysHelpKeys(shortcuts, true)).toEqual({ dailys1: { newDaily: '⌘J' }, dailys5: { absence: '⌘B' } });
    expect(dailysHelpKeys(shortcuts, false)).toEqual({ dailys1: { newDaily: 'Ctrl+J' }, dailys5: { absence: 'Ctrl+B' } });
  });

  it('la ayuda dibuja como <kbd> la tecla configurada', () => {
    const out = renderToStaticMarkup(<ScreenHelpBody items={TASKS_HELP_ITEMS} keys={tasksHelpKeys(shortcuts, false)} />);
    expect(out).toMatch(/<kbd class="[^"]*">Ctrl\+K<\/kbd> crea una tarea desde cualquier sección/);
    expect(out).toMatch(/Con <kbd class="[^"]*">Ctrl<\/kbd> clic o ⇧ clic/);
    const daily = renderToStaticMarkup(<ScreenHelpBody items={DAILYS_HELP_ITEMS} keys={dailysHelpKeys(shortcuts, true)} />);
    expect(daily).toMatch(/«Hoy» o <kbd class="[^"]*">⌘J<\/kbd> crea el daily de hoy/);
    expect(daily).toMatch(/<kbd class="[^"]*">⌘B<\/kbd> marca un día como no laborado/);
  });

  it('cada hueco de los textos tiene su tecla, en los dos idiomas', () => {
    const cases = [
      [TASKS_HELP_ITEMS, tasksHelpKeys(shortcuts, true)],
      [DAILYS_HELP_ITEMS, dailysHelpKeys(shortcuts, true)],
      [OVERTIME_HELP_ITEMS, {}],
      [GENERAL_HELP_ITEMS, generalHelpKeys(shortcuts, true)],
    ] as const;
    for (const lang of ['es', 'en'] as const) {
      for (const [items, keys] of cases) {
        for (const item of items) {
          const k = (keys as Record<string, Record<string, string>>)[item] ?? {};
          expect([lang, item, holes(t(lang, 'help', item))]).toEqual([lang, item, Object.keys(k).sort()]);
        }
      }
    }
  });

  it('modKey: ⌘ en macOS y Ctrl fuera', () => {
    expect(modKey(true)).toBe('⌘');
    expect(modKey(false)).toBe('Ctrl');
  });
});

describe('TaskShortcutsSheet con ⌘ o Ctrl (AY22)', () => {
  const rows = (lang: 'es' | 'en', mac: boolean) => shortcutSheet(lang, mac).flatMap((s) => s.rows.map(([k]) => k));

  it('fuera de macOS, Ctrl', () => {
    expect(rows('es', false)).toEqual(expect.arrayContaining(['Ctrl clic  ·  ⇧ clic', 'Ctrl Enter']));
    expect(rows('en', false)).toEqual(expect.arrayContaining(['Ctrl click  ·  ⇧ click', 'Ctrl Enter']));
    expect(rows('es', false).join(' ')).not.toContain('⌘');
  });

  it('en macOS, ⌘; y no queda ningún hueco', () => {
    expect(rows('es', true)).toEqual(expect.arrayContaining(['⌘ clic  ·  ⇧ clic', '⌘ Enter']));
    for (const lang of ['es', 'en'] as const) for (const mac of [true, false]) expect(rows(lang, mac).join(' ')).not.toContain('{');
  });
});

// ── Las pantallas ───────────────────────────────────────────

function devtools(tool: ToolId, mac = true, language: 'es' | 'en' = 'es'): DevtoolsContextValue {
  return {
    tool, language, tr: makeDevtoolsTr(language), mac,
    settings: { lastTool: tool, options: {}, layout: 'groups' }, updateSettings: () => {}, openSettings: () => {},
    setOptions: () => {}, announce: () => {}, copyText: async () => true, saveNote: async () => null, openNote: () => {},
    openPicker: () => {}, actionsRef: { current: {} }, loadedFrom: null, clearLoaded: () => {}, takeFocus: () => false,
    goTo: () => {}, shortcut: (spec) => devtoolsShortcut(spec, mac), switcherOpen: false, setSwitcherOpen: () => {},
  };
}
const withDevtools = (ctx: DevtoolsContextValue, node: ReactNode) =>
  renderToStaticMarkup(<DevtoolsContext.Provider value={ctx}>{node}</DevtoolsContext.Provider>);

const body = (tool: ToolId, mac = true, language: 'es' | 'en' = 'es') =>
  renderToStaticMarkup(<DevtoolsHelpBody tool={tool} tr={makeDevtoolsTr(language)} mac={mac} />);

describe('DevTools (AY16, AY25)', () => {
  it('la cabecera de la herramienta ya no tiene botón de ayuda', () => {
    expect(withDevtools(devtools('json'), <ToolFrame>x</ToolFrame>)).not.toContain('Ayuda');
  });

  it('desde el menú lateral, "En esta herramienta" es la de la última herramienta abierta (lastTool)', () => {
    app.extensions = { devtools: { enabled: true, settings: { lastTool: 'regex' } } };
    expect(text(renderToStaticMarkup(<DevtoolsHelp />))).toContain(`En esta herramienta ${t('es', 'devtools', 'regex.help1')}`);
    app.extensions = { devtools: { enabled: true, settings: { lastTool: 'json' } } };
    expect(text(renderToStaticMarkup(<DevtoolsHelp />))).not.toContain('En esta herramienta');
    // Sin nada guardado, la herramienta por defecto.
    app.extensions = {};
    expect(text(renderToStaticMarkup(<DevtoolsHelp />))).toContain('Atajos');
  });

  it('"En esta herramienta" arriba, luego lo general y los atajos', () => {
    const out = text(body('regex'));
    const tr = makeDevtoolsTr('es');
    const inTool = out.indexOf('En esta herramienta');
    expect(inTool).toBe(0);
    expect(out.indexOf(tr('regex.help1'))).toBeGreaterThan(inTool);
    expect(out.indexOf('Elige una herramienta')).toBeGreaterThan(out.indexOf(tr('regex.help3')));
    expect(out.indexOf('Atajos')).toBeGreaterThan(out.indexOf('Vaciar todas las herramientas'));
  });

  it('sin "En esta herramienta" en las que no lo tienen', () => {
    expect(text(body('json'))).not.toContain('En esta herramienta');
  });

  it('las teclas salen de shortcut(spec): ⇧⌘F en macOS, Ctrl+Shift+F fuera', () => {
    const mac = body('json', true);
    expect(mac).toMatch(/búscala con <kbd class="[^"]*">⇧⌘F<\/kbd>/);
    expect(mac).toMatch(/usa <kbd class="[^"]*">⌘↵<\/kbd>/);
    expect(mac).toMatch(/<kbd[^>]*>⌥⌘↓<\/kbd><span>\/<\/span><kbd[^>]*>⌥⌘↑<\/kbd>/);
    expect(mac).toMatch(/<kbd[^>]*>⌥⌘1<\/kbd><span>…<\/span><kbd[^>]*>⌥⌘4<\/kbd>/);
    const win = body('json', false);
    expect(win).toMatch(/búscala con <kbd class="[^"]*">Ctrl\+Shift\+F<\/kbd>/);
    expect(win).toMatch(/<kbd[^>]*>Ctrl\+Shift\+Backspace<\/kbd>/);
    expect(win).not.toMatch(/[⌘⇧⌥]/);
  });

  it('los huecos de lo general son {search} y {run}', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const key of GENERAL_HELP) expect(holes(t(lang, 'devtools', key)).every((h) => h === 'search' || h === 'run')).toBe(true);
    }
  });

  it('las 8 herramientas de "En esta herramienta", con sus textos en es y en', () => {
    expect(Object.keys(TOOL_HELP).sort()).toEqual(['barcode', 'cron', 'diff', 'jwt', 'list-compare', 'qr', 'regex', 'sql-list']);
    for (const [tool, keys] of Object.entries(TOOL_HELP)) {
      expect(keys!.length).toBeGreaterThanOrEqual(2);
      for (const key of keys!) {
        expect(key.startsWith(`${tool}.help`)).toBe(true);
        for (const lang of ['es', 'en'] as const) expect(t(lang, 'devtools', key)).not.toBe(key);
      }
    }
  });

  it('cada atajo de la lista tiene su texto', () => {
    expect(HELP_SHORTCUTS.length).toBe(9);
    for (const row of HELP_SHORTCUTS) for (const lang of ['es', 'en'] as const) expect(t(lang, 'devtools', row.label)).not.toBe(row.label);
  });

  it('los límites que nombran salen del código', () => {
    const tr = makeDevtoolsTr('es');
    expect(t('es', 'devtools', 'regex.help2')).toContain(`hasta ${MAX_MATCHES}`);
    expect(t('en', 'devtools', 'regex.help2')).toContain(`Up to ${MAX_MATCHES}`);
    expect(t('es', 'devtools', 'regex.help3')).toContain(`${REGEX_TIMEOUT_MS / 1000} s`);
    expect(t('es', 'devtools', 'sql-list.help2')).toContain('1000');
    expect(tr('sqlOracleLimit')).toContain('1000');
    // Los nombres de los botones que cita, tal cual.
    for (const [lang, key, button] of [
      ['es', 'help.p2', 'tryExample'], ['es', 'help.p3', 'bringFromNote'], ['es', 'help.p4', 'saveToNote'], ['es', 'help.p5', 'clearAll'],
      ['es', 'sql-list.help2', 'moreOptions'], ['es', 'sql-list.help2', 'splitGroups'], ['es', 'sql-list.help3', 'sqlToList'],
      ['es', 'list-compare.help3', 'sendToSql'], ['es', 'diff.help2', 'diffUnified'], ['es', 'diff.help2', 'diffSplit'], ['es', 'diff.help3', 'diffIgnoreWs'],
      ['en', 'help.p2', 'tryExample'], ['en', 'help.p3', 'bringFromNote'], ['en', 'help.p4', 'saveToNote'], ['en', 'help.p5', 'clearAll'],
      ['en', 'sql-list.help2', 'moreOptions'], ['en', 'sql-list.help2', 'splitGroups'], ['en', 'sql-list.help3', 'sqlToList'],
      ['en', 'list-compare.help3', 'sendToSql'], ['en', 'diff.help2', 'diffUnified'], ['en', 'diff.help2', 'diffSplit'], ['en', 'diff.help3', 'diffIgnoreWs'],
    ] as const) {
      expect([key, t(lang, 'devtools', key).includes(t(lang, 'devtools', button))]).toEqual([key, true]);
    }
  });
});

describe('Tareas, Dailys y Horas extra (AY17–AY19)', () => {
  it('de 2 a 5 puntos por ayuda', () => {
    for (const items of [TASKS_HELP_ITEMS, DAILYS_HELP_ITEMS, OVERTIME_HELP_ITEMS, GENERAL_HELP_ITEMS]) {
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items.length).toBeLessThanOrEqual(5);
    }
  });

  it('los botones que nombran existen con ese nombre', () => {
    expect(t('es', 'help', 'dailys1')).toContain(`«${t('es', 'dailys', 'todayBtn')}»`);
    expect(t('es', 'help', 'dailys1')).toContain(`«${t('es', 'dailys', 'dateBtn')}»`);
    expect(t('es', 'help', 'dailys4')).toContain(`«${t('es', 'dailys', 'previousPanel')}»`);
    expect(t('es', 'help', 'overtime1')).toContain(`«${t('es', 'overtime', 'newBtn')}»`);
    expect(t('en', 'help', 'dailys1')).toContain(`"${t('en', 'dailys', 'todayBtn')}"`);
    expect(t('en', 'help', 'dailys1')).toContain(`"${t('en', 'dailys', 'dateBtn')}"`);
    expect(t('en', 'help', 'dailys4')).toContain(`"${t('en', 'dailys', 'previousPanel')}"`);
    expect(t('en', 'help', 'overtime1')).toContain(`"${t('en', 'overtime', 'newBtn')}"`);
  });

  it('AY21: la cabecera dice "Horas extra", como el menú', () => {
    expect(t('es', 'overtime', 'title')).toBe('Horas extra');
    expect(t('es', 'overtime', 'title')).toBe(t('es', 'sectionNav', 'overtime'));
    expect(t('en', 'overtime', 'title')).toBe('Overtime');
  });
});

describe('Pomodoro (AY20)', () => {
  it('sus atajos con su función de formato', () => {
    const tr = makePomodoroTr('es');
    expect(pomodoroHelpRows(tr, true).map((r) => r.keys[0])).toEqual(['Espacio', '⌘⇧→', '⌘⇧←', '⌘⇧T']);
    expect(pomodoroHelpRows(makePomodoroTr('en'), false).map((r) => r.keys[0])).toEqual(['Space', 'Ctrl+Shift+→', 'Ctrl+Shift+←', 'Ctrl+Shift+T']);
  });

  it('los puntos y los atajos', () => {
    const out = text(renderToStaticMarkup(<PomodoroHelpBody tr={makePomodoroTr('es')} mac />));
    expect(out).toContain('Cambia las duraciones en Opciones.');
    expect(out).toContain('Atajos Espacio Iniciar o pausar');
    // "Opciones" es el nombre del botón de la cabecera.
    expect(t('es', 'pomodoro', 'help1')).toContain(t('es', 'pomodoro', 'options'));
    expect(t('en', 'pomodoro', 'help1')).toContain(t('en', 'pomodoro', 'options'));
  });
});

// ── Textos (AY14) ───────────────────────────────────────────

describe('los textos (AY14)', () => {
  const devtoolsHelp = (lang: 'es' | 'en') => sectionKeys(lang, 'devtools').filter((k) => k.startsWith('help.') || /\.help\d$/.test(k)).sort();
  const pomodoroHelp = (lang: 'es' | 'en') => sectionKeys(lang, 'pomodoro').filter((k) => k.startsWith('help')).sort();

  it('las mismas claves en es y en', () => {
    expect(sectionKeys('en', 'help').sort()).toEqual(sectionKeys('es', 'help').sort());
    expect(sectionKeys('es', 'help').length).toBe(23 + 7);
    expect(devtoolsHelp('en')).toEqual(devtoolsHelp('es'));
    expect(devtoolsHelp('es').length).toBe(17 + 22);
    expect(pomodoroHelp('en')).toEqual(pomodoroHelp('es'));
    expect(pomodoroHelp('es').length).toBe(9);
  });

  it('los mismos huecos en es y en, y sin voseo', () => {
    const all: [section: 'help' | 'devtools' | 'pomodoro', key: string][] = [
      ...sectionKeys('es', 'help').map((k) => ['help', k] as ['help', string]),
      ...devtoolsHelp('es').map((k) => ['devtools', k] as ['devtools', string]),
      ...pomodoroHelp('es').map((k) => ['pomodoro', k] as ['pomodoro', string]),
    ];
    for (const [section, key] of all) {
      const es = t('es', section, key as never);
      const en = t('en', section, key as never);
      expect([key, holes(en)]).toEqual([key, holes(es)]);
      expect([key, VOSEO.test(es)]).toEqual([key, false]);
    }
  });
});
