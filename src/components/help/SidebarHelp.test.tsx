// El botón "Ayuda" del menú lateral (specs/ayuda-contextual AY23–AY29),
// dibujado con react-dom/server: los dos estilos, qué ayuda va en cada
// sección, la ayuda general, ⌘/ y los eventos. Abrirla, el foco y la
// posición en la ventana se revisan en el navegador.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { t } from '../../lib/i18n';

const app = vi.hoisted(() => ({
  language: 'es' as 'es' | 'en',
  activeSection: 'tasks' as string,
  sidebarStyle: 'icons' as 'icons' | 'list',
  sidebarSections: undefined,
  extensions: {} as Record<string, { enabled: boolean; settings?: Record<string, unknown> }>,
  animationsEnabled: true,
  helpButtonsEnabled: true,
  shortcuts: { newNote: 'n', newTask: 't', search: 'f', newDaily: 'd', markAbsence: 'a' },
  showToast: () => '',
  setShortcut: () => {},
}));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select?: (s: typeof app) => unknown) => (select ? select(app) : app);
  useAppStore.getState = () => app;
  useAppStore.subscribe = () => () => {};
  return { useAppStore };
});
// Sin portal: react-dom/server no los dibuja.
vi.mock('../shared/ModalOverlay', () => ({
  ModalOverlay: ({ children }: { children: ReactNode }) => <div data-overlay="">{children}</div>,
}));

const { helpAnchor, isHelpShortcut, passesToApp } = await import('../shared/helpKeyboard');
const { ScreenHelpBody, useSectionHelp, GENERAL_HELP_ITEMS } = await import('./ScreenHelp');
const { generalHelpKeys, helpShortcutLabel } = await import('./helpKeys');
const { helpTopicFor } = await import('./helpTopics');
const { SidebarHelpButton, requestHelpToggle, HELP_TOGGLE_EVENT } = await import('./SidebarHelp');
const { requestTaskShortcuts, onTaskShortcutsRequest, TASK_SHORTCUTS_EVENT } = await import('../tasks/taskShortcutsRequest');
const { ShortcutsSettingsTab } = await import('../settings/ShortcutsSettingsTab');
const { HELP_SHORTCUTS } = await import('../../extensions/devtools/ui/meta');

const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (path: URL, encoding: 'utf8') => string };

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

beforeEach(() => {
  app.language = 'es';
  app.activeSection = 'tasks';
  app.extensions = {};
  app.helpButtonsEnabled = true;
  app.shortcuts = { newNote: 'n', newTask: 't', search: 'f', newDaily: 'd', markAbsence: 'a' };
});

// ── El botón del menú lateral ───────────────────────────────

const ROW_CLS = 'relative flex w-full items-center gap-2 rounded-lg px-3 py-2';
const COL_CLS = 'rounded-lg p-2 text-[var(--text-hint)]';

describe('el botón "Ayuda" del menú lateral (AY1, AY11, AY24)', () => {
  const row = () => renderToStaticMarkup(<SidebarHelpButton variant="row" className={ROW_CLS} />);
  const column = () => renderToStaticMarkup(<SidebarHelpButton variant="column" className={COL_CLS} />);

  it('Lista con nombres: una fila "Ayuda" con el estilo de sus vecinas', () => {
    const out = row();
    expect(out).toMatch(/^<button type="button" aria-label="Ayuda: Tareas" aria-haspopup="dialog" aria-expanded="false" aria-controls="[^"]+help"/);
    expect(out).toMatch(/aria-keyshortcuts="(Meta|Control)\+\/"/);
    expect(out).toContain(ROW_CLS);
    expect(out).toContain('focus-visible:ring-2');
    expect(out).toContain('aria-expanded:bg-[var(--bg-hover)]');
    expect(out).not.toMatch(/bg-indigo/);
    // El ícono es CircleHelp (lucide lo marca con su clase) y no se lee.
    expect(out).toMatch(/<svg[^>]*lucide-circle-question-mark[^>]*aria-hidden="true"|<svg[^>]*aria-hidden="true"[^>]*lucide-circle/);
    // El nombre y, al pasar el puntero, el atajo, como en las secciones.
    expect(text(out)).toBe(`Ayuda ${helpShortcutLabel(true)}`);
  });

  it('Barra de íconos y colapsado: solo el ícono, con el estilo de Buscar y sin title (usa el tooltip de la columna)', () => {
    const out = column();
    expect(out).toMatch(/^<button type="button" aria-label="Ayuda: Tareas" aria-haspopup="dialog" aria-expanded="false"/);
    expect(out).toContain(COL_CLS);
    expect(out).not.toContain('title=');
    expect(text(out)).toBe('');
    expect(out).toMatch(/<svg[^>]*width="18"/);
  });

  it('cerrado, no dibuja la ayuda', () => {
    expect(row()).not.toContain('role="dialog"');
    expect(column()).not.toContain('role="dialog"');
  });

  it('el nombre dice la pantalla activa, en es y en', () => {
    app.activeSection = 'dailys';
    expect(row()).toContain('aria-label="Ayuda: Dailys"');
    app.activeSection = 'dashboard';
    expect(row()).toContain('aria-label="Ayuda: Inicio"');
    app.language = 'en';
    expect(row()).toContain('aria-label="Help: Home"');
    expect(text(row())).toContain('Help');
  });
});

describe('Opción para ocultar la ayuda (AY23)', () => {
  it('sin dibujar con el botón de ayuda apagado, en los dos estilos', () => {
    app.helpButtonsEnabled = false;
    expect(renderToStaticMarkup(<SidebarHelpButton variant="row" className={ROW_CLS} />)).toBe('');
    expect(renderToStaticMarkup(<SidebarHelpButton variant="column" className={COL_CLS} />)).toBe('');
  });

  it('los textos de la opción hablan del menú lateral, en es y en', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const key of ['helpSection', 'helpButtonsTitle', 'helpButtonsDesc'] as const) {
        expect(t(lang, 'settings', key)).toBeTruthy();
      }
    }
    expect(t('es', 'settings', 'helpButtonsTitle')).toBe('Botón de ayuda');
    expect(t('es', 'settings', 'helpButtonsDesc')).toBe('Muestra «Ayuda» en el menú lateral, con la ayuda de la pantalla en la que estás.');
    expect(t('en', 'settings', 'helpButtonsTitle')).toBe('Help button');
    expect(t('es', 'settings', 'helpButtonsDesc')).toContain(`«${t('es', 'help', 'menuLabel')}»`);
    expect(t('en', 'settings', 'helpButtonsDesc')).toContain(`"${t('en', 'help', 'menuLabel')}"`);
  });
});

// ── Qué ayuda va en cada sección ────────────────────────────

/** Lo que el botón mostraría en la sección activa. */
function Probe() {
  const c = useSectionHelp();
  return (
    <div data-screen={c.screen} data-title={c.title} data-tour={c.tourScene ?? 'none'} data-actions={(c.actions ?? []).map((a) => a.label).join('|')}>
      {c.body}
    </div>
  );
}
const probe = () => {
  const out = renderToStaticMarkup(<Probe />);
  const attr = (name: string) => out.match(new RegExp(`data-${name}="([^"]*)"`))![1];
  return { screen: attr('screen'), title: attr('title'), tour: attr('tour'), actions: attr('actions'), body: text(out) };
};

describe('qué ayuda corresponde a cada sección (AY25, AY26)', () => {
  it('helpTopicFor: la propia en Tareas, Dailys, Horas extra, DevTools, Pomodoro y Cliente HTTP; la general en las demás', () => {
    expect(helpTopicFor('tasks')).toBe('tasks');
    expect(helpTopicFor('dailys')).toBe('dailys');
    expect(helpTopicFor('overtime')).toBe('overtime');
    expect(helpTopicFor('ext:devtools')).toBe('devtools');
    expect(helpTopicFor('ext:pomodoro')).toBe('pomodoro');
    expect(helpTopicFor('ext:http-client')).toBe('http-client');
    for (const section of ['dashboard', 'notes', 'ext:excalidraw', 'ext:google-calendar', 'ext:team-chat'] as const) {
      expect([section, helpTopicFor(section)]).toEqual([section, 'general']);
    }
  });

  it('Tareas: "Ver todos los atajos" y el recorrido en su escena', () => {
    app.activeSection = 'tasks';
    expect(probe()).toMatchObject({ screen: 'Tareas', title: 'Cómo funcionan las tareas', tour: '1', actions: 'Ver todos los atajos' });
  });

  it('Dailys y Horas extra, con el recorrido en Tu día', () => {
    app.activeSection = 'dailys';
    expect(probe()).toMatchObject({ screen: 'Dailys', title: 'Cómo funcionan los dailys', tour: '0', actions: '' });
    app.activeSection = 'overtime';
    expect(probe()).toMatchObject({ screen: 'Horas extra', title: 'Cómo funcionan las horas extra', tour: '0', actions: '' });
  });

  it('DevTools y Pomodoro: sus títulos, sin recorrido', () => {
    app.activeSection = 'ext:devtools';
    expect(probe()).toMatchObject({ screen: 'DevTools', title: t('es', 'devtools', 'help.title'), tour: 'none' });
    app.activeSection = 'ext:pomodoro';
    expect(probe()).toMatchObject({ screen: 'Pomodoro', title: t('es', 'pomodoro', 'helpTitle'), tour: 'none' });
  });

  it('Cliente HTTP: su pantalla tiene su ayuda (specs/cliente-http HT35)', () => {
    app.activeSection = 'ext:http-client';
    expect(probe()).toMatchObject({ screen: 'Cliente HTTP', title: 'Cómo funciona el Cliente HTTP', tour: 'none' });
    app.language = 'en';
    expect(probe()).toMatchObject({ screen: 'HTTP client', title: 'How HTTP client works' });
  });

  it('las demás: la general, con el nombre de la sección en el botón', () => {
    app.activeSection = 'notes';
    expect(probe()).toMatchObject({ screen: 'Notas', title: 'Cómo funciona Logday', tour: '0', actions: '' });
    app.activeSection = 'dashboard';
    expect(probe()).toMatchObject({ screen: 'Inicio', title: 'Cómo funciona Logday' });
    app.language = 'en';
    expect(probe()).toMatchObject({ screen: 'Home', title: 'How Logday works' });
  });
});

describe('la ayuda general (AY26)', () => {
  const shortcuts = { newNote: 'k', newTask: 'j', search: 'g', newDaily: 'y', markAbsence: 'b' };

  it('moverse, buscar, el menú, crear y ⌘/, con las teclas de la config', () => {
    const out = renderToStaticMarkup(<ScreenHelpBody items={GENERAL_HELP_ITEMS} keys={generalHelpKeys(shortcuts, true)} />);
    expect(out).toMatch(/<kbd class="[^"]*">⌘0<\/kbd> va a Inicio y <kbd class="[^"]*">⌘1<\/kbd>…<kbd class="[^"]*">⌘9<\/kbd>/);
    expect(out).toMatch(/<kbd class="[^"]*">⌘G<\/kbd> abre Buscar/);
    expect(out).toMatch(/<kbd class="[^"]*">⌘J<\/kbd> crea una tarea, <kbd class="[^"]*">⌘K<\/kbd> una nota y <kbd class="[^"]*">⌘Y<\/kbd> el daily de hoy/);
    expect(out).toMatch(/<kbd class="[^"]*">⌘\/<\/kbd> abre o cierra esta ayuda/);
  });

  it('Ctrl fuera de macOS', () => {
    expect(generalHelpKeys(shortcuts, false)).toEqual({
      general1: { home: 'Ctrl+0', first: 'Ctrl+1', last: 'Ctrl+9' },
      general2: { search: 'Ctrl+G' },
      general4: { newTask: 'Ctrl+J', newNote: 'Ctrl+K', newDaily: 'Ctrl+Y' },
      general5: { help: 'Ctrl+/' },
    });
  });

  it('de 2 a 5 puntos, y lo que nombra existe con ese nombre', () => {
    expect(GENERAL_HELP_ITEMS.length).toBeGreaterThanOrEqual(2);
    expect(GENERAL_HELP_ITEMS.length).toBeLessThanOrEqual(5);
    for (const [lang, q] of [['es', ['«', '»']], ['en', ['"', '"']]] as const) {
      const quote = (s: string) => `${q[0]}${s}${q[1]}`;
      expect(t(lang, 'help', 'general1')).toContain(t(lang, 'sectionNav', 'home'));
      expect(t(lang, 'help', 'general2')).toContain(t(lang, 'sectionNav', 'search'));
      expect(t(lang, 'help', 'general2')).toContain(quote(t(lang, 'sectionNav', 'goToGroup')));
      expect(t(lang, 'help', 'general2')).toContain(quote(t(lang, 'sectionNav', 'more')));
      expect(t(lang, 'help', 'general3')).toContain(quote(t(lang, 'sectionNav', 'more')));
      expect(t(lang, 'help', 'general4')).toContain(`${t(lang, 'settings', 'title')} → ${t(lang, 'settings', 'tabShortcuts')}`);
      for (const name of [t(lang, 'help', 'tasksScreen'), t(lang, 'dailys', 'title'), t(lang, 'sectionNav', 'overtime'), 'DevTools', 'Pomodoro']) {
        expect([lang, name, t(lang, 'help', 'general5').includes(name)]).toEqual([lang, name, true]);
      }
    }
  });
});

// ── ⌘/ y los eventos ────────────────────────────────────────

describe('el atajo ⌘/ (AY27)', () => {
  const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
    key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods,
  });

  it('⌘/ y Ctrl+/; también con ⇧ si la tecla escribe "/" (teclado en español)', () => {
    expect(isHelpShortcut(key('/', { metaKey: true }))).toBe(true);
    expect(isHelpShortcut(key('/', { ctrlKey: true }))).toBe(true);
    expect(isHelpShortcut(key('/', { metaKey: true, shiftKey: true }))).toBe(true);
  });

  it('no: "/" solo, ⌘? (la ayuda del sistema en macOS), con ⌥, ni otras teclas', () => {
    for (const e of [
      key('/'), key('?', { metaKey: true, shiftKey: true }), key('/', { metaKey: true, altKey: true }),
      key('7', { metaKey: true, shiftKey: true }), key('-', { metaKey: true }), key('f', { metaKey: true }),
    ]) expect([e, isHelpShortcut(e)]).toEqual([e, false]);
  });

  it('sale de la ayuda abierta, para poder cerrarla con el mismo atajo', () => {
    expect(passesToApp(key('/', { metaKey: true }))).toBe(true);
    expect(passesToApp(key('/', { metaKey: true, shiftKey: true }))).toBe(true);
  });

  it('no choca con un atajo de la app ni de DevTools', () => {
    expect(Object.values({ newNote: 'n', newTask: 't', search: 'f', newDaily: 'd', markAbsence: 'a' })).not.toContain('/');
    expect(HELP_SHORTCUTS.flatMap((r) => r.keys).some((spec) => spec.split('+').pop() === '/')).toBe(false);
  });

  it('"⌘/" en macOS y "Ctrl+/" fuera', () => {
    expect(helpShortcutLabel(true)).toBe('⌘/');
    expect(helpShortcutLabel(false)).toBe('Ctrl+/');
  });

  it('Opciones → Atajos lo muestra, fijo, junto a "Ir a una sección"', () => {
    const out = text(renderToStaticMarkup(<ShortcutsSettingsTab />));
    expect(out).toContain(`Ir a una sección ⌘0…⌘9 Ayuda de la pantalla ${helpShortcutLabel(true)}`);
    expect(t('en', 'settings', 'shortcutHelp')).toBe('Help for this screen');
  });

  it('requestHelpToggle avisa al botón del menú', () => {
    const target = new EventTarget();
    const seen: string[] = [];
    target.addEventListener(HELP_TOGGLE_EVENT, (e) => seen.push(e.type));
    requestHelpToggle(target);
    expect(seen).toEqual(['logday:toggle-help']);
  });
});

describe('"Ver todos los atajos" desde el menú lateral (AY17)', () => {
  it('el evento llega a quien escucha, y deja de llegar al soltarlo', () => {
    const target = new EventTarget();
    let shown = 0;
    const stop = onTaskShortcutsRequest(() => { shown += 1; }, target);
    requestTaskShortcuts(target);
    expect(shown).toBe(1);
    stop();
    requestTaskShortcuts(target);
    expect(shown).toBe(1);
    expect(TASK_SHORTCUTS_EVENT).toBe('logday:show-task-shortcuts');
  });

  it('Lista, Kanban y Calendario lo escuchan solo con su vista activa, y ya no tienen botón de ayuda', () => {
    for (const [file, view] of [
      ['../tasks/TaskList.tsx', 'list'], ['../tasks/KanbanBoard.tsx', 'kanban'], ['../calendar/CalendarView.tsx', 'calendar'],
    ] as const) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect([file, src.includes(`useTaskShortcutsRequest(currentView === '${view}', () => setShowShortcuts(true))`)]).toEqual([file, true]);
      expect([file, /TasksHelp|HelpButton/.test(src)]).toEqual([file, false]);
    }
  });
});

describe('la posición (AY28)', () => {
  it('a la derecha del menú, a la altura del botón', () => {
    expect(helpAnchor({ left: 4, right: 40, top: 500, bottom: 536 }, 268, 800)).toEqual({ left: 268, right: 268, top: 500, bottom: 536 });
    // Sin borde marcado, a la derecha del botón.
    expect(helpAnchor({ left: 4, right: 40, top: 500, bottom: 536 }, null, 800)).toEqual({ left: 40, right: 40, top: 500, bottom: 536 });
  });

  it('sin botón visible, en la esquina inferior izquierda', () => {
    expect(helpAnchor(null, 268, 800)).toEqual({ left: 0, right: 0, top: 800, bottom: 800 });
    expect(helpAnchor({ left: 0, right: 0, top: 0, bottom: 0 }, null, 600)).toEqual({ left: 0, right: 0, top: 600, bottom: 600 });
  });
});

describe('ninguna pantalla tiene ya su botón junto al título (AY2)', () => {
  it('ni las vistas de la app ni las extensiones', () => {
    for (const file of [
      '../daily/DailyList.tsx', '../overtime/OvertimeList.tsx',
      '../../extensions/devtools/ui/ToolFrame.tsx', '../../extensions/pomodoro/View.tsx',
    ]) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect([file, /Help\b|HelpButton|ScreenHelp/.test(src)]).toEqual([file, false]);
    }
  });
});

describe('el nombre de cada pantalla (AY11)', () => {
  it('Tareas, Dailys y Horas extra', () => {
    const label = () => renderToStaticMarkup(<SidebarHelpButton variant="column" className={COL_CLS} />).match(/aria-label="([^"]+)"/)![1];
    for (const [section, es, en] of [['tasks', 'Ayuda: Tareas', 'Help: Tasks'], ['dailys', 'Ayuda: Dailys', 'Help: Dailys'], ['overtime', 'Ayuda: Horas extra', 'Help: Overtime']]) {
      app.activeSection = section;
      app.language = 'es';
      expect(label()).toBe(es);
      app.language = 'en';
      expect(label()).toBe(en);
    }
  });

});
