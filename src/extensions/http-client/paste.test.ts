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
  updateExtensionSettings: vi.fn(async (id: string, patch: Record<string, unknown>) => {
    app.extensions[id] = { ...app.extensions[id], settings: { ...app.extensions[id]?.settings, ...patch } };
  }),
}));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select?: (s: typeof app) => unknown) => (select ? select(app) : app);
  useAppStore.getState = () => app;
  useAppStore.subscribe = () => () => {};
  return { useAppStore };
});

const announced = vi.hoisted(() => [] as string[]);
vi.mock('./announce', () => ({ announce: (m: string) => announced.push(m), mountAnnouncer: () => () => {} }));

// El diálogo de HT71, simulado: cada llamada toma la siguiente respuesta.
const dialog = vi.hoisted(() => ({
  answers: [] as ({ choice: 'variables' | 'keep'; remember: boolean } | null)[],
  asked: [] as string[][],
}));
vi.mock('./ui/CurlSecretsDialog', () => ({
  askCurlSecrets: async (_tr: unknown, names: readonly string[]) => {
    dialog.asked.push([...names]);
    return dialog.answers.shift() ?? null;
  },
  closeCurlSecretsDialog: () => {},
}));

const { convertCurlPaste, notifyCurlConverted } = await import('./paste');
const store = await import('./store');

beforeEach(() => {
  app.language = 'es';
  app.extensions = { 'http-client': { enabled: true, settings: { environments: [], activeEnvId: null } } };
  app.showToast.mockClear();
  app.openExtensionSettings.mockClear();
  app.updateExtensionSettings.mockClear();
  announced.length = 0;
  dialog.answers = [];
  dialog.asked = [];
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
    notifyCurlConverted(['username', 'password'], 'form');
    const toast = app.showToast.mock.calls[0][0];
    // Ya no hay que guardar el Base64 a mano: Rust codifica la Basic (HT44).
    expect(toast.description).toBe('Se cambiaron 2 valores por {{username}} y {{password}}. Guárdalos como secretos en Entornos: en la nota solo queda el nombre.');
    expect(announced[0]).toMatch(/^El cURL pegado rellenó el formulario\. /);
    app.language = 'en';
    notifyCurlConverted(['token']);
    expect(app.showToast.mock.calls[1][0].description).toBe('A value was replaced with {{token}}. Save it as a secret in Environments: the note only keeps the name.');
  });
});

describe('qué hacer con los valores sensibles (HT70, HT71)', () => {
  const CURL = "curl -H 'Authorization: Bearer s3cr3t' https://x.com";
  const setMode = (curlPaste: string) => {
    app.extensions['http-client'].settings = { ...app.extensions['http-client'].settings, curlPaste };
  };

  it('"Preguntar" (de serie): el código con variables y `ask`; nada se pregunta todavía', () => {
    const r = convertCurlPaste(CURL)!;
    expect(r.ask).toBeTypeOf('function');
    expect(r.code).toBe('GET https://x.com\nAuthorization: Bearer {{token}}');
    expect(dialog.asked).toEqual([]);
  });

  it('sin valores sensibles no pregunta, en ningún modo', () => {
    expect(convertCurlPaste('curl https://x.com/a')!.ask).toBeUndefined();
    setMode('keep');
    expect(convertCurlPaste('curl https://x.com/a')!.code).toBe('GET https://x.com/a');
  });

  it('"Cambiar por variables": como siempre, sin preguntar', () => {
    setMode('variables');
    const r = convertCurlPaste(CURL)!;
    expect(r.ask).toBeUndefined();
    expect(r.code).not.toContain('s3cr3t');
  });

  it('"Dejar los valores tal cual": el valor queda y no hay aviso de "Valores ocultos"', () => {
    setMode('keep');
    const r = convertCurlPaste(CURL)!;
    expect(r.ask).toBeUndefined();
    expect(r.code).toBe('GET https://x.com\nAuthorization: Bearer s3cr3t');
    r.onInserted!();
    expect(app.showToast).not.toHaveBeenCalled();
    expect(announced).toEqual(['El cURL pegado ahora es una petición HTTP. Deshacer lo deja como texto.']);
  });

  it('al preguntar se ven solo los nombres; cada respuesta da su conversión, y Esc, null', async () => {
    dialog.answers = [{ choice: 'variables', remember: false }, { choice: 'keep', remember: false }, null];
    const ask = convertCurlPaste(CURL)!.ask!;
    const a = await ask();
    expect(dialog.asked[0]).toEqual(['token']);
    expect(JSON.stringify(dialog.asked)).not.toContain('s3cr3t');
    expect(a!.code).toBe('GET https://x.com\nAuthorization: Bearer {{token}}');
    const b = await ask();
    expect(b!.code).toBe('GET https://x.com\nAuthorization: Bearer s3cr3t');
    expect(await ask()).toBeNull();
    // Sin "Recordar", la opción sigue en "Preguntar".
    expect(app.updateExtensionSettings).not.toHaveBeenCalled();
  });

  it('"Recordar mi elección" fija la opción, y el siguiente pegado ya no pregunta', async () => {
    dialog.answers = [{ choice: 'keep', remember: true }];
    await convertCurlPaste(CURL)!.ask!();
    expect(app.updateExtensionSettings).toHaveBeenCalledWith('http-client', { curlPaste: 'keep' });
    expect(convertCurlPaste(CURL)!.ask).toBeUndefined();
    expect(convertCurlPaste(CURL)!.code).toContain('s3cr3t');
  });

  it('el plan de la pantalla: las dos versiones y el modo', async () => {
    const { planCurlPaste, chosen } = await import('./paste');
    const plan = planCurlPaste(CURL, 'ask')!;
    expect(plan.mode).toBe('ask');
    expect(chosen(plan, 'keep').code).toContain('s3cr3t');
    expect(chosen(plan, 'variables').replaced).toEqual(['token']);
    expect(planCurlPaste('curl https://x.com', 'ask')!.mode).toBe('variables');
    expect(planCurlPaste('hola')).toBeNull();
  });
});

describe('en la URL de la pantalla', () => {
  it('el cURL convertido pasa a ser el texto entero de la petición (lo que hace su onPaste)', async () => {
    const { fromCurl } = await import('./core/curl');
    const { parseHttpBlock } = await import('./core/parse');
    const { readRequestLine } = await import('./core/requestEdit');
    const r = fromCurl(`curl -X PUT 'https://x.com/a?api_key=k1' -H 'Accept: */*' -H 'X-Api-Key: k2' --data-raw '{"a":1}'`)!;
    expect(readRequestLine(r.code)).toEqual({ method: 'PUT', url: 'https://x.com/a?api_key={{api_key}}' });
    const req = parseHttpBlock(r.code).requests[0];
    expect(req.headerRows.map((h) => `${h.name}: ${h.value}`)).toEqual(['Accept: */*', 'X-Api-Key: {{x_api_key}}']);
    expect(req.body).toBe('{\n  "a": 1\n}');
    expect(r.replaced).toEqual(['api_key', 'x_api_key']);
  });
});

describe('textos', () => {
  it('es y en con las mismas claves, y sin voseo', () => {
    const keys = [
      'aCurlPasted', 'aCurlFilled', 'curlSecretsTitle', 'curlSecretsBody', 'curlSecretsAction', 'curlAskTitle', 'curlAskBody',
      'curlAskListAria', 'curlAskHelp', 'curlAskRemember', 'curlAskKeep', 'curlAskVariables', 'curlAskEsc', 'curlPasteTitle',
      'curlPasteLabel', 'curlPasteAsk', 'curlPasteVariables', 'curlPasteKeep', 'curlPasteHelp',
    ];
    for (const lang of ['es', 'en'] as const) for (const k of keys) expect(sectionKeys(lang, 'httpClient')).toContain(k);
    const voseo = /\b(querés|podés|tenés|guardá|pegá|abrí|usá)\b/i;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const k of keys) expect(voseo.test(t('es', 'httpClient', k as any))).toBe(false);
  });
});
