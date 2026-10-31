// Opciones → Navegación (specs/navegacion-secciones NS21, NS22) y la fila de
// solo lectura de Atajos, dibujadas con react-dom/server como
// SectionNav.test.tsx. La interacción (abrir el selector, Esc) se revisa en
// el navegador.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { sectionKeys, t } from '../../lib/i18n';

const app = vi.hoisted(() => ({
  language: 'es' as 'es' | 'en',
  sidebarStyle: 'icons',
  sidebarSections: undefined,
  extensions: {} as Record<string, { enabled: boolean }>,
  startupScreen: 'dashboard',
  notesViewDefault: 'list',
  tasksViewDefault: 'list' as 'list' | 'kanban' | 'calendar',
  theme: 'system',
  customThemes: [],
  fontSize: 17,
  confirmDestructiveActions: true,
  shortcuts: { newNote: 'n', newTask: 't', search: 'f', newDaily: 'd', markAbsence: 'a' },
  setSidebarStyle: async () => {},
  setSidebarSections: async () => {},
  setExtensionEnabled: async () => {},
  setStartupScreen: async () => {},
  setNotesViewDefault: () => {},
  setTasksViewDefault: () => {},
  setLanguage: () => {},
  setTheme: () => {},
  setFontSize: () => {},
  setShortcut: () => {},
  renameCustomTheme: () => {},
  duplicateCustomTheme: () => {},
  deleteCustomTheme: () => {},
}));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select?: (s: typeof app) => unknown) => (select ? select(app) : app);
  useAppStore.getState = () => app;
  useAppStore.subscribe = () => () => {};
  return { useAppStore };
});

const { NavigationSettingsTab } = await import('./NavigationSettingsTab');
const { GeneralSettingsTab } = await import('./GeneralSettingsTab');
const { WorkSettingsTab } = await import('./WorkSettingsTab');
const { ShortcutsSettingsTab } = await import('./ShortcutsSettingsTab');
const { appTabs } = await import('./SettingsModal');
const { shortcutLabel } = await import('../sidebar/sectionOrder');
const { IS_MAC } = await import('../sidebar/sections');

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

beforeEach(() => {
  app.language = 'es';
  app.tasksViewDefault = 'list';
  app.extensions = {};
});

describe('la entrada Navegación (NS21)', () => {
  it('va segunda en el grupo App, con PanelLeft', () => {
    expect(appTabs('es').map((tab) => tab.label)).toEqual(['General', 'Navegación', 'Preferencias', 'Atajos']);
    expect(appTabs('en')[1].label).toBe('Navigation');
    expect(appTabs('es')[1].icon.displayName).toBe('PanelLeft');
  });

  it('en orden: menú lateral, pantalla de inicio, vista de notas y vista de tareas', () => {
    const plain = text(renderToStaticMarkup(<NavigationSettingsTab />));
    const order = ['Menú lateral', 'Estilo de las secciones', 'Secciones del menú', 'Pantalla de inicio', 'Vista de notas', 'Vista de tareas al abrir']
      .map((title) => plain.indexOf(title));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('el selector de estilo y el de la pantalla de inicio, tal cual', () => {
    const html = renderToStaticMarkup(<NavigationSettingsTab />);
    expect(html.split('type="radio"').length - 1).toBe(2);
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(text(html)).toContain(t('es', 'settings', 'startupDashboard'));
  });

  it('Horas extra con su nombre también en la pantalla de inicio (NS8)', () => {
    // El selector cerrado muestra la opción activa.
    app.startupScreen = 'overtime';
    const plain = text(renderToStaticMarkup(<NavigationSettingsTab />));
    app.startupScreen = 'dashboard';
    expect(plain).toContain('Horas extra');
    expect(plain).not.toContain('Extras');
  });

  it('General queda con idioma, tema y tipografía; Preferencias sin la vista de notas', () => {
    const general = text(renderToStaticMarkup(<GeneralSettingsTab />));
    expect(general).toContain('Idioma');
    expect(general).toContain('Tema');
    expect(general).toContain('Tipografía');
    expect(general).not.toContain('Pantalla de inicio');
    expect(general).not.toContain('Menú lateral');
    const work = text(renderToStaticMarkup(<WorkSettingsTab />));
    expect(work).not.toContain('Vista de notas');
  });
});

describe('vista de tareas al abrir (NS22)', () => {
  it('Lista, Kanban y Calendario, con la elegida marcada', () => {
    app.tasksViewDefault = 'kanban';
    const html = renderToStaticMarkup(<NavigationSettingsTab />);
    const group = html.slice(html.indexOf('aria-label="Vista de tareas al abrir"'));
    expect(text(group)).toMatch(/Lista.*Kanban.*Calendario/);
    expect(group).toMatch(/aria-pressed="true"[^>]*>Kanban</);
    expect(group.split('aria-pressed="false"').length - 1).toBe(2);
  });

  it('en inglés', () => {
    app.language = 'en';
    const plain = text(renderToStaticMarkup(<NavigationSettingsTab />));
    expect(plain).toContain('Tasks view on open');
    expect(plain).toContain('Calendar');
  });
});

describe('Atajos: "Ir a una sección" (NS15)', () => {
  it('una fila de solo lectura con ⌘0…⌘9 (Ctrl fuera de macOS)', () => {
    const html = renderToStaticMarkup(<ShortcutsSettingsTab />);
    const keys = `${shortcutLabel('0', IS_MAC)}…${shortcutLabel('9', IS_MAC)}`;
    expect(text(html)).toContain('Ir a una sección');
    const row = html.slice(html.indexOf('Ir a una sección'));
    expect(row).toContain(keys);
    // No es un botón: no se graba otro atajo.
    expect(row.slice(0, row.indexOf(keys))).not.toContain('<button');
    expect(html.split('<button').length - 1).toBe(5);
  });

  it('en inglés', () => {
    app.language = 'en';
    expect(text(renderToStaticMarkup(<ShortcutsSettingsTab />))).toContain('Go to a section');
  });
});

describe('textos', () => {
  it('es y en tienen las mismas claves en settings', () => {
    expect(sectionKeys('en', 'settings').sort()).toEqual(sectionKeys('es', 'settings').sort());
  });
});
