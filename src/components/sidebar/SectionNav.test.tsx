// El menú de secciones dibujado (con react-dom/server, sin DOM): los dos
// estilos, el colapsado, "Más", el teclado (un solo tab stop,
// aria-current), Opciones y "Ir a…" en Buscar. La medición de lo que cabe y
// la interacción se revisan en el navegador; aquí la capacidad se fija con
// `initialCapacity`.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SavedSection, SidebarStyle } from './sectionOrder';
import { sectionKeys } from '../../lib/i18n';

const app = vi.hoisted(() => ({
  language: 'es' as 'es' | 'en',
  activeSection: 'dashboard' as string,
  sidebarStyle: 'icons' as SidebarStyle,
  sidebarSections: undefined as SavedSection[] | undefined,
  extensions: {} as Record<string, { enabled: boolean }>,
  isSidebarCollapsed: false,
  currentView: 'list',
  basePath: '/datos',
  projects: [] as string[],
  noteFolders: [] as string[],
  folderTags: {},
  dailyMonths: [] as string[],
  overtimeMonths: [] as string[],
  notesView: 'list',
  updateStatus: 'idle',
  confirmDestructiveActions: true,
  helpButtonsEnabled: true,
  isSearchOpen: true,
  searchQuery: '',
  searchResults: [],
  dailyEntries: {},
  shortcuts: { newNote: 'n', newTask: 't', search: 'f', newDaily: 'd', markAbsence: 'a' },
  setSection: async () => {},
  setSidebarSections: async () => {},
  setSidebarStyle: async () => {},
  setExtensionEnabled: async () => {},
  openSidebarSettings: () => {},
  toggleSidebar: () => {},
  toggleSearch: () => {},
  toggleSettings: () => {},
  setView: () => {},
  runSearch: async () => {},
}));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select?: (s: typeof app) => unknown) => (select ? select(app) : app);
  useAppStore.getState = () => app;
  useAppStore.subscribe = () => () => {};
  return { useAppStore };
});

const { SectionNav } = await import('./SectionNav');
const { Sidebar } = await import('./Sidebar');
const { SidebarSettings } = await import('../settings/SidebarSettings');
const { SearchGoToSections, useSectionHits } = await import('../SearchGoToSections');

function GoTo({ query }: { query: string }) {
  return <SearchGoToSections hits={useSectionHits(query)} onGo={() => {}} />;
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const count = (html: string, needle: string) => html.split(needle).length - 1;

beforeEach(() => {
  app.language = 'es';
  app.activeSection = 'dashboard';
  app.sidebarStyle = 'icons';
  app.sidebarSections = undefined;
  app.extensions = {};
  app.isSidebarCollapsed = false;
  app.searchQuery = '';
  app.helpButtonsEnabled = true;
});

describe('Barra de íconos (NS2, NS14, NS16)', () => {
  it('un <nav> con Inicio y las 4 fijas, con nombre accesible y un solo tab stop', () => {
    const html = renderToStaticMarkup(<SectionNav variant="icons" />);
    expect(html).toContain('<nav aria-label="Secciones"');
    for (const name of ['Inicio', 'Dailys', 'Tareas', 'Notas', 'Horas extra']) {
      expect(html).toContain(`aria-label="${name}"`);
    }
    expect(count(html, 'tabindex="0"')).toBe(1);
    expect(count(html, 'aria-current="page"')).toBe(1);
    // Inicio activa: es la del tab stop.
    expect(html).toMatch(/tabindex="0" aria-current="page"[^>]*aria-label="Inicio"/);
    // Sin "Más" si caben todas.
    expect(html).not.toContain('aria-haspopup="menu"');
    // El tooltip propio reemplaza al title nativo.
    expect(html).not.toMatch(/<button[^>]*title="Tareas"/);
  });

  it('la sección activa lleva aria-current y el tab stop', () => {
    app.activeSection = 'notes';
    const html = renderToStaticMarkup(<SectionNav variant="icons" />);
    expect(html).toMatch(/tabindex="0" aria-current="page"[^>]*aria-label="Notas"/);
  });

  it('las extensiones con vista van después, tras una separadora', () => {
    app.extensions = { pomodoro: { enabled: true } };
    const html = renderToStaticMarkup(<SectionNav variant="icons" />);
    const at = (s: string) => html.indexOf(s);
    expect(at('aria-label="Pomodoro"')).toBeGreaterThan(at('aria-label="Horas extra"'));
    expect(html).toContain('my-1 h-px w-6');
  });

  it('el orden del usuario manda, y sin separadora si están mezcladas', () => {
    app.extensions = { pomodoro: { enabled: true } };
    app.sidebarSections = [{ id: 'ext:pomodoro' }, { id: 'notes' }];
    const html = renderToStaticMarkup(<SectionNav variant="icons" />);
    const order = [...html.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]).slice(1);
    expect(order).toEqual(['Inicio', 'Pomodoro', 'Notas', 'Dailys', 'Tareas', 'Horas extra']);
    expect(html).not.toContain('my-1 h-px w-6');
  });
});

describe('"Más" (NS12, NS13, NS18)', () => {
  it('con una oculta, "Más" aparece al final con su menú', () => {
    app.sidebarSections = [{ id: 'notes', hidden: true }];
    const html = renderToStaticMarkup(<SectionNav variant="icons" />);
    expect(html).not.toContain('aria-label="Notas"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Más secciones"');
  });

  it('si la activa está en "Más", el botón se ve activo y la anuncia', () => {
    app.sidebarSections = [{ id: 'notes', hidden: true }];
    app.activeSection = 'notes';
    const html = renderToStaticMarkup(<SectionNav variant="icons" />);
    expect(html).toContain('aria-label="Más secciones: Notas"');
    // El tab stop es "Más" y ninguna otra lleva aria-current.
    expect(html).toMatch(/data-nav-key="__more__" tabindex="0"/);
    expect(count(html, 'aria-current="page"')).toBe(0);
    expect(html).toMatch(/aria-label="Más secciones: Notas" class="[^"]*bg-indigo-500\/15/);
  });

  it('lo que no cabe pasa a "Más" sin cambiar el orden', () => {
    const html = renderToStaticMarkup(<SectionNav variant="icons" initialCapacity={3} />);
    expect(html).toContain('aria-label="Dailys"');
    expect(html).toContain('aria-label="Tareas"');
    expect(html).not.toContain('aria-label="Notas"');
    expect(html).not.toContain('aria-label="Horas extra"');
    expect(html).toContain('aria-label="Más secciones"');
  });

  it('las 4 fijas ocultas: Inicio y "Más"', () => {
    app.sidebarSections = ['dailys', 'tasks', 'notes', 'overtime'].map((id) => ({ id, hidden: true }));
    const html = text(renderToStaticMarkup(<SectionNav variant="list" />));
    expect(html).toContain('Inicio');
    expect(html).toContain('Más (4)');
    expect(html).not.toContain('Dailys');
  });
});

describe('Lista con nombres (NS3, NS8)', () => {
  it('una fila por sección con ícono, nombre y atajo; Horas extra con su nombre', () => {
    const html = renderToStaticMarkup(<SectionNav variant="list" />);
    const plain = text(html);
    for (const name of ['Inicio', 'Dailys', 'Tareas', 'Notas', 'Horas extra']) expect(plain).toContain(name);
    expect(plain).not.toContain('Extras');
    expect(count(html, 'tabindex="0"')).toBe(1);
    // Atajos ⌘1…⌘4 (o Ctrl) en el orden del menú.
    expect(plain).toMatch(/Dailys (⌘|Ctrl\+)1/);
    expect(plain).toMatch(/Horas extra (⌘|Ctrl\+)4/);
    // Sin tooltip: el nombre está a la vista.
    expect(html).not.toContain('role="tooltip"');
  });

  it('en inglés', () => {
    app.language = 'en';
    const plain = text(renderToStaticMarkup(<SectionNav variant="list" />));
    expect(plain).toContain('Home');
    expect(plain).toContain('Overtime');
  });
});

describe('colapsado (NS4)', () => {
  it('la columna con lo de debajo (las vistas de Tareas) dentro del mismo scroll', () => {
    const html = renderToStaticMarkup(<SectionNav variant="list" collapsed after={<span>VISTAS</span>} />);
    // En el colapsado, también en el estilo Lista, son íconos con nombre accesible.
    expect(html).toContain('aria-label="Tareas"');
    expect(html).toContain('VISTAS');
  });

  it('el menú lateral colapsado sale de la misma lista, con Buscar y Opciones abajo', () => {
    app.isSidebarCollapsed = true;
    app.activeSection = 'tasks';
    app.extensions = { pomodoro: { enabled: true } };
    const html = renderToStaticMarkup(<Sidebar />);
    expect(count(html, '<nav aria-label="Secciones"')).toBe(1);
    expect(html).toContain('aria-label="Pomodoro"');
    expect(html).toContain('aria-label="Mostrar el menú"');
    expect(html).toContain('aria-label="Kanban"');
    expect(html.indexOf('aria-label="Opciones"')).toBeGreaterThan(html.indexOf('aria-label="Kanban"'));
  });
});

describe('el menú lateral expandido', () => {
  it('Barra de íconos: columna, panel con el título de la sección y el botón de ocultar con nombre (NS17)', () => {
    app.activeSection = 'tasks';
    const html = renderToStaticMarkup(<Sidebar />);
    expect(html).toContain('w-11');
    expect(html).toMatch(/<h2[^>]*>Tareas<\/h2>/);
    expect(html).toContain('aria-label="Ocultar el menú"');
    expect(html).toContain('aria-label="Buscar"');
    // Opciones está en la columna, no en el pie.
    expect(text(html)).not.toContain(' Opciones ');
  });

  it('Lista con nombres: cabecera de siempre, la lista y Opciones al pie', () => {
    app.sidebarStyle = 'list';
    const html = renderToStaticMarkup(<Sidebar />);
    expect(html).toContain('brand-wordmark');
    expect(html).not.toContain('w-11');
    expect(text(html)).toContain('Horas extra');
    expect(text(html)).toContain('Opciones');
    expect(html).toContain('aria-label="Ocultar el menú"');
  });
});

describe('el botón "Ayuda" (specs/ayuda-contextual AY24)', () => {
  const at = (html: string, label: string) => html.indexOf(`aria-label="${label}"`);

  it('Barra de íconos: un ícono encima de Buscar, en la columna', () => {
    app.activeSection = 'notes';
    const html = renderToStaticMarkup(<Sidebar />);
    expect(count(html, 'aria-label="Ayuda: Notas"')).toBe(1);
    expect(at(html, 'Ayuda: Notas')).toBeLessThan(at(html, 'Buscar'));
    expect(at(html, 'Buscar')).toBeLessThan(at(html, 'Opciones'));
    // Solo el ícono: el nombre lo da el tooltip de la columna.
    expect(html.match(/aria-label="Ayuda: Notas"[^>]*>([\s\S]*?)<\/button>/)![1]).toMatch(/^<svg[^>]*width="18"[\s\S]*<\/svg>$/);
  });

  it('colapsado: el mismo ícono encima de Buscar', () => {
    app.isSidebarCollapsed = true;
    app.activeSection = 'dailys';
    const html = renderToStaticMarkup(<Sidebar />);
    expect(count(html, 'aria-label="Ayuda: Dailys"')).toBe(1);
    expect(at(html, 'Ayuda: Dailys')).toBeLessThan(at(html, 'Buscar'));
  });

  it('Lista con nombres: una fila "Ayuda" justo encima de Opciones', () => {
    app.sidebarStyle = 'list';
    app.activeSection = 'tasks';
    const html = renderToStaticMarkup(<Sidebar />);
    expect(count(html, 'aria-label="Ayuda: Tareas"')).toBe(1);
    const t = text(html);
    expect(t).toMatch(/ Ayuda ⌘\/ +Opciones /);
  });

  it('se abre a la derecha del menú: el menú marca su borde', () => {
    expect(renderToStaticMarkup(<Sidebar />)).toMatch(/^<div data-help-edge=""/);
    app.isSidebarCollapsed = true;
    expect(renderToStaticMarkup(<Sidebar />)).toMatch(/^<div data-help-edge=""/);
  });

  it('con la opción apagada, no está en ningún estilo', () => {
    app.helpButtonsEnabled = false;
    for (const [style, collapsed] of [['icons', false], ['list', false], ['icons', true]] as const) {
      app.sidebarStyle = style;
      app.isSidebarCollapsed = collapsed;
      expect([style, collapsed, renderToStaticMarkup(<Sidebar />).includes('Ayuda')]).toEqual([style, collapsed, false]);
    }
  });
});

describe('Opciones → Menú lateral (NS9, NS20)', () => {
  it('dos radios con miniatura y la lista de secciones con sus controles', () => {
    app.sidebarSections = [{ id: 'dailys' }, { id: 'tasks' }, { id: 'notes', hidden: true }, { id: 'overtime' }];
    const html = renderToStaticMarkup(<SidebarSettings />);
    const plain = text(html);
    expect(count(html, 'type="radio"')).toBe(2);
    expect(html).toMatch(/checked="" value="icons"/);
    expect(plain).toContain('Barra de íconos');
    expect(plain).toContain('Lista con nombres');
    expect(count(html, 'aria-hidden="true" class="sbp')).toBe(2);
    expect(plain).toContain('Secciones del menú');
    expect(plain).not.toContain('Textos del menú lateral');
    // aria-disabled y no disabled: el botón movido al extremo conserva el foco (specs/devtools §G.3).
    expect(html).toMatch(/aria-disabled="true"[^>]*aria-label="Mover Dailys arriba"/);
    expect(html).toMatch(/aria-disabled="true"[^>]*aria-label="Mover Horas extra abajo"/);
    expect(html).not.toMatch(/disabled=""[^>]*aria-label="Mover/);
    expect(count(html, 'role="switch" aria-checked="true"')).toBe(3);
    expect(count(html, 'role="switch" aria-checked="false"')).toBe(1);
    expect(plain).toContain('Restablecer orden');
    expect(html).toContain('aria-live="polite"');
  });
});

describe('Buscar: "Ir a…" (NS19)', () => {
  it('ofrece ir a las secciones que coinciden, también las de "Más"', () => {
    app.sidebarSections = [{ id: 'tasks', hidden: true }];
    const plain = text(renderToStaticMarkup(<GoTo query="tare" />));
    expect(plain).toContain('Ir a Tareas');
    expect(plain).not.toContain('Ir a Notas');
  });

  it('sin acentos', () => {
    expect(text(renderToStaticMarkup(<GoTo query="ínicio" />))).toContain('Ir a Inicio');
    expect(renderToStaticMarkup(<GoTo query="zzz" />)).toBe('');
  });
});

describe('textos', () => {
  it('es y en tienen las mismas claves en sectionNav', () => {
    expect(sectionKeys('en', 'sectionNav').sort()).toEqual(sectionKeys('es', 'sectionNav').sort());
  });
});
