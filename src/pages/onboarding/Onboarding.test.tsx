// La bienvenida dibujada con react-dom/server (specs/onboarding OB1–OB18).
// El cambio de paso, el foco y el diálogo se revisan en el navegador; lo que
// se guarda al terminar está en store/onboarding.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { sectionKeys, t } from '../../lib/i18n';
import type { PickedFolder } from '../../lib/onboarding';

const app = vi.hoisted(() => ({
  language: 'es' as 'es' | 'en',
  theme: 'system',
  sidebarStyle: 'icons',
  sidebarSections: undefined,
  startupScreen: 'dashboard',
  extensions: {} as Record<string, { enabled: boolean }>,
  shortcuts: { newNote: 'n', newTask: 't', search: 'f', newDaily: 'd', markAbsence: 'a' },
  setLanguage: async () => {},
  setTheme: () => {},
  setSidebarStyle: async () => {},
  setStartupScreen: async () => {},
  setExtensionEnabled: async () => {},
  pickBaseFolder: async () => null,
  completeOnboarding: async () => {},
}));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select?: (s: typeof app) => unknown) => (select ? select(app) : app);
  useAppStore.getState = () => app;
  useAppStore.subscribe = () => () => {};
  return { useAppStore };
});

const { Onboarding } = await import('./Onboarding');
const { StepFolder } = await import('./StepFolder');
const { IS_MAC } = await import('../../components/sidebar/sections');

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const count = (html: string, needle: string) => html.split(needle).length - 1;
const local: PickedFolder = { path: '/Users/ana/Documents/Logday', isICloud: false, hasData: false };
const render = (step: 1 | 2 | 3 | 4 | 5, folder: PickedFolder | null = local) =>
  renderToStaticMarkup(<Onboarding initialStep={step} initialFolder={folder} />);
const folderStep = (folder: PickedFolder | null, extra: Partial<{ pickError: boolean }> = {}) =>
  renderToStaticMarkup(
    <StepFolder folder={folder} picking={false} pickError={extra.pickError ?? false} onPick={() => {}} onBack={() => {}} onContinue={() => {}} />,
  );

beforeEach(() => {
  app.language = 'es';
  app.startupScreen = 'dashboard';
  app.shortcuts = { newNote: 'n', newTask: 't', search: 'f', newDaily: 'd', markAbsence: 'a' };
});

describe('el marco (OB1, OB17)', () => {
  it('"Paso n de 5", con el actual marcado y un título que recibe el foco', () => {
    const html = render(3);
    expect(html).toContain(`aria-label="${t('es', 'onboarding', 'progress')}"`);
    const progress = html.slice(html.indexOf('<ol'), html.indexOf('</ol>'));
    expect(progress.match(/<li[ >]/g)).toHaveLength(5);
    expect(count(html, 'aria-current="step"')).toBe(1);
    expect(text(html)).toContain('Paso 3 de 5');
    expect(html).toMatch(/<h1 tabindex="-1"[^>]*>Elige cómo se ve<\/h1>/);
  });

  it('Atrás desde el paso 2; en el 1 no hay', () => {
    expect(text(render(1))).not.toContain('Atrás');
    for (const step of [2, 3, 4, 5] as const) expect(text(render(step))).toContain('Atrás');
  });

  it('"Omitir y abrir Logday" solo en los pasos 3 y 4 (OB2)', () => {
    const skip = t('es', 'onboarding', 'skipAll');
    expect([1, 2, 3, 4, 5].map((s) => text(render(s as 1)).includes(skip))).toEqual([false, false, true, true, false]);
  });

  it('sin carpeta no se pasa del paso 2', () => {
    expect(text(render(4, null))).toContain(t('es', 'onboarding', 'folderTitle'));
  });
});

describe('paso 1, idioma (OB5)', () => {
  it('dos radios nativos con el idioma actual elegido, en los dos idiomas', () => {
    const html = render(1);
    expect(count(html, 'name="onboarding-language"')).toBe(2);
    expect(html).toMatch(/checked="" value="es"/);
    expect(text(html)).toContain('Te damos la bienvenida a Logday');
    app.language = 'en';
    const en = render(1);
    expect(en).toMatch(/checked="" value="en"/);
    expect(text(en)).toContain('Welcome to Logday');
    expect(text(en)).toContain('Get started');
  });
});

describe('paso 2, carpeta (OB2, OB6–OB9)', () => {
  it('sin carpeta, Continuar deshabilitado y explicado', () => {
    const html = folderStep(null);
    expect(html).toMatch(/<button type="button" disabled="" aria-describedby="onboarding-need-folder"[^>]*>Continuar/);
    expect(html).toContain('id="onboarding-need-folder"');
    expect(text(html)).toContain('Elegir carpeta…');
  });

  it('con carpeta, la ruta, Cambiar, el anuncio y Continuar habilitado', () => {
    const html = folderStep(local);
    expect(text(html)).toContain(local.path);
    expect(text(html)).toContain('Cambiar');
    expect(html).toContain(`aria-live="polite" class="sr-only">Carpeta elegida: ${local.path}`);
    expect(html).not.toMatch(/disabled=""[^>]*>Continuar/);
    expect(text(html)).not.toContain(t('es', 'onboarding', 'icloudTitle'));
    expect(text(html)).not.toContain(t('es', 'onboarding', 'existing'));
  });

  it('en iCloud, el aviso se ve con "Elegir otra carpeta" y se puede seguir (OB7)', () => {
    const html = folderStep({ ...local, isICloud: true });
    expect(html).toMatch(/role="alert"[^>]*>.*Esta carpeta está en iCloud Drive/);
    expect(text(html)).toContain('Elegir otra carpeta');
    expect(html).not.toMatch(/disabled=""[^>]*>Continuar/);
  });

  it('con datos de Logday, el aviso de que se usarán tal cual (OB8)', () => {
    const html = folderStep({ ...local, hasData: true });
    expect(html).toMatch(/role="status"[^>]*>.*Esta carpeta ya tiene datos de Logday/);
  });

  it('el error al elegir', () => {
    expect(text(folderStep(null, { pickError: true }))).toContain(t('es', 'onboarding', 'folderError'));
  });
});

describe('paso 3, apariencia (OB10, OB11)', () => {
  it('los 8 temas como radios, sin el personalizado, y el selector del menú', () => {
    const html = render(3);
    expect(count(html, 'name="onboarding-theme"')).toBe(8);
    expect(html).toMatch(/name="onboarding-theme" checked=""/);
    expect(text(html)).not.toContain(t('es', 'settings', 'customThemePersonalizedTile'));
    expect(count(html, 'name="sidebar-style"')).toBe(2);
    expect(text(html)).toContain('Menú lateral');
  });
});

describe('paso 4, recorrido provisional (OB12, OB14)', () => {
  it('la primera escena con su texto y la tecla de la config', () => {
    const html = render(4);
    expect(html).toMatch(/<h2 tabindex="-1"[^>]*>Tu día<\/h2>/);
    expect(text(html)).toContain('1 de 5');
    expect(html).toContain(`<kbd class="`);
    expect(html).toContain(`>${IS_MAC ? '⌘D' : 'Ctrl+D'}</kbd>`);
    expect(text(html)).toContain(t('es', 'onboarding', 'skipTour'));
    expect(text(html)).toContain('Siguiente');
  });

  it('la tecla cambia con la config', () => {
    app.shortcuts = { ...app.shortcuts, newDaily: 'j' };
    expect(render(4)).toContain(`>${IS_MAC ? '⌘J' : 'Ctrl+J'}</kbd>`);
  });
});

describe('paso 5, todo listo (OB16)', () => {
  it('5 radios con la pantalla de inicio elegida, dónde quedan los datos y "Abrir Logday"', () => {
    app.startupScreen = 'notes';
    const html = render(5);
    expect(count(html, 'name="onboarding-startup"')).toBe(5);
    expect(html).toMatch(/checked="" value="notes"/);
    expect(count(html, 'checked=""')).toBe(1);
    for (const name of ['Inicio', 'Dailys', 'Tareas', 'Notas', 'Horas extra']) expect(text(html)).toContain(name);
    expect(text(html)).toContain(`Tus datos se guardan en ${local.path} .`);
    expect(text(html)).toContain('Abrir Logday');
  });
});

describe('textos (OB18)', () => {
  it('las mismas claves en es y en', () => {
    expect(sectionKeys('en', 'onboarding')).toEqual(sectionKeys('es', 'onboarding'));
    expect(sectionKeys('en', 'tour')).toEqual(sectionKeys('es', 'tour'));
  });

  it('sin voseo', () => {
    const voseo = /\b(tenés|podés|querés|elegí|empezá|mirá|usá|activá|conectá|escribí|sabés|vos)\b/i;
    for (const section of ['onboarding', 'tour'] as const) {
      for (const key of sectionKeys('es', section)) {
        expect(t('es', section, key as never)).not.toMatch(voseo);
      }
    }
  });

  it('no promete buscar en las notas: Buscar encuentra tareas y dailys', () => {
    expect(t('es', 'tour', 's4a')).toContain('tareas y dailys');
    expect(t('es', 'tour', 's4a')).not.toMatch(/notas/);
  });
});
