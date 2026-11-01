// Pegar un cURL (specs/cliente-http HT39): lo que aporta la extensión al
// editor de notas (`convertPaste`) y el aviso de los valores ocultos. El
// pegado en el editor (dónde, ⌘Z) se prueba en
// components/notes/extensionPaste.test.ts; en la pantalla, en el navegador.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sectionKeys, t } from '../../lib/i18n';

const app = vi.hoisted(() => ({
  language: 'es' as 'es' | 'en',
  extensions: {} as Record<string, { enabled: boolean; settings?: Record<string, unknown> }>,
  showToast: vi.fn<(toast: { kind: string; title: string; description?: string; durationMs?: number; action?: { label: string; onClick: () => void } }) => string>(() => 'id'),
  openExtensionSettings: vi.fn(),
  updateExtensionSettings: async () => {},
}));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select?: (s: typeof app) => unknown) => (select ? select(app) : app);
  useAppStore.getState = () => app;
  useAppStore.subscribe = () => () => {};
  return { useAppStore };
});

const announced = vi.hoisted(() => [] as string[]);
vi.mock('./announce', () => ({ announce: (m: string) => announced.push(m), mountAnnouncer: () => () => {} }));

const { convertCurlPaste, notifyCurlConverted } = await import('./paste');
const store = await import('./store');

beforeEach(() => {
  app.language = 'es';
  app.extensions = { 'http-client': { enabled: true, settings: { environments: [], activeEnvId: null } } };
  app.showToast.mockClear();
  app.openExtensionSettings.mockClear();
  announced.length = 0;
});

describe('convertPaste', () => {
  it('un cURL da el código del bloque, sin el token; otro texto, null', () => {
    const r = convertCurlPaste("curl -H 'Authorization: Bearer s3cr3t' https://x.com");
    expect(r?.code).toBe('GET https://x.com\nAuthorization: Bearer {{token}}');
    expect(r?.code).not.toContain('s3cr3t');
    expect(convertCurlPaste('hola')).toBeNull();
    expect(convertCurlPaste('curl a && rm -rf b')).toBeNull();
  });

  it('el módulo de la extensión lo aporta', async () => {
    const mod = (await import('./index')).default;
    expect(mod.convertPaste).toBe(convertCurlPaste);
  });

  it('al insertarlo, sin valores ocultos: solo el anuncio', () => {
    convertCurlPaste('curl https://x.com')!.onInserted!();
    expect(announced).toEqual(['El cURL pegado ahora es una petición HTTP. Deshacer lo deja como texto.']);
    expect(app.showToast).not.toHaveBeenCalled();
  });

  it('con valores ocultos: un aviso con las variables y "Abrir Entornos" del entorno activo', () => {
    app.extensions['http-client'].settings = {
      environments: [{ id: 'e_00000001', name: 'Staging', protected: false, insecureTls: false, extraHosts: [], vars: [] }],
      activeEnvId: 'e_00000001',
    };
    convertCurlPaste("curl -H 'Authorization: Bearer s3cr3t' -b 'sid=1' https://x.com")!.onInserted!();
    expect(app.showToast).toHaveBeenCalledTimes(1);
    const toast = app.showToast.mock.calls[0][0];
    expect(toast.title).toBe('Valores ocultos');
    expect(toast.description).toBe('Se cambiaron 2 valores por {{token}} y {{cookie}}. Guárdalos como secretos en Entornos: en la nota solo queda el nombre.');
    expect(JSON.stringify(toast)).not.toContain('s3cr3t');
    toast.action!.onClick();
    expect(app.openExtensionSettings).toHaveBeenCalledWith('http-client');
    expect(store.peekSettingsEnvRequest()).toBe('e_00000001');
    expect(announced[0]).toContain('{{token}}');
  });

  it('uno solo, en singular; con -u, la pista de Base64; en el formulario, sin "Deshacer"', () => {
    notifyCurlConverted(['basic_auth'], 'form');
    const toast = app.showToast.mock.calls[0][0];
    expect(toast.description).toBe('Se cambió un valor por {{basic_auth}}. Guárdalo como secreto en Entornos: en la nota solo queda el nombre. En {{basic_auth}} va usuario:contraseña en Base64.');
    expect(announced[0]).toMatch(/^El cURL pegado rellenó el formulario\. /);
    app.language = 'en';
    notifyCurlConverted(['token']);
    expect(app.showToast.mock.calls[1][0].description).toBe('A value was replaced with {{token}}. Save it as a secret in Environments: the note only keeps the name.');
  });
});

describe('en la URL de la pantalla', () => {
  it('el cURL convertido carga el formulario entero (lo que hace su onPaste)', async () => {
    const { fromCurl } = await import('./core/curl');
    const { formFromBlock } = await import('./core/serialize');
    const r = fromCurl(`curl -X PUT 'https://x.com/a?api_key=k1' -H 'Accept: */*' -H 'X-Api-Key: k2' --data-raw '{"a":1}'`)!;
    expect(formFromBlock(r.code)?.form).toEqual({
      method: 'PUT',
      url: 'https://x.com/a?api_key={{api_key}}',
      headers: 'Accept: */*\nX-Api-Key: {{x_api_key}}',
      body: '{\n  "a": 1\n}',
    });
    expect(r.replaced).toEqual(['api_key', 'x_api_key']);
  });
});

describe('textos', () => {
  it('es y en con las mismas claves, y sin voseo', () => {
    const keys = ['aCurlPasted', 'aCurlFilled', 'curlSecretsTitle', 'curlSecretsBody', 'curlBasicHint', 'curlSecretsAction'];
    for (const lang of ['es', 'en'] as const) for (const k of keys) expect(sectionKeys(lang, 'httpClient')).toContain(k);
    const voseo = /\b(querés|podés|tenés|guardá|pegá|abrí|usá)\b/i;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const k of keys) expect(voseo.test(t('es', 'httpClient', k as any))).toBe(false);
  });
});
