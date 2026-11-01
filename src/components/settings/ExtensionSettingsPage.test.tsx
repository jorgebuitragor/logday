// El apartado de una extensión en Opciones (specs/extensiones R21, R28),
// dibujado con react-dom/server como NavigationSettingsTab.test.tsx. Apagar
// y Deshacer se prueban en src/extensions/actions.test.ts y en el navegador.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { t } from '../../lib/i18n';
import { extensionText } from '../../extensions/text';

const app = vi.hoisted(() => ({
  language: 'es' as 'es' | 'en',
  extensions: { pomodoro: { enabled: true } } as Record<string, { enabled: boolean }>,
  setExtensionEnabled: async () => {},
  showToast: () => '',
  openExtensionSettings: () => {},
  openExtensionsCatalog: () => {},
}));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select?: (s: typeof app) => unknown) => (select ? select(app) : app);
  useAppStore.getState = () => app;
  useAppStore.subscribe = () => () => {};
  return { useAppStore };
});
// El panel propio de la extensión no importa aquí.
vi.mock('../../extensions/ExtensionSlot', () => ({ ExtensionSlot: () => null }));

const { ExtensionSettingsPage } = await import('./SettingsModal');
const { getExtension } = await import('../../extensions/registry');

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('cabecera del apartado de una extensión (R28)', () => {
  const def = getExtension('pomodoro')!;

  it('muestra nombre, descripción y un interruptor encendido con su etiqueta', () => {
    for (const language of ['es', 'en'] as const) {
      app.language = language;
      const html = renderToStaticMarkup(<ExtensionSettingsPage def={def} />);
      const plain = text(html);
      expect(plain).toContain(extensionText(language, 'pomodoro', 'name'));
      expect(plain).toContain(extensionText(language, 'pomodoro', 'description'));
      // Un solo interruptor, encendido y dentro de la etiqueta que lo nombra.
      expect(html.split('role="switch"').length - 1).toBe(1);
      expect(html).toContain('aria-checked="true"');
      expect(html).toMatch(new RegExp(`<label[^>]*>${t(language, 'extensions', 'enabledLabel')}<button[^>]*role="switch"`));
    }
  });

  it('el aviso lleva el nombre de la extensión', () => {
    expect(t('es', 'extensions', 'disabledToast').replace('{name}', 'Pomodoro')).toBe('Pomodoro desactivada');
    expect(t('en', 'extensions', 'disabledToast').replace('{name}', 'Pomodoro')).toBe('Pomodoro turned off');
  });
});
