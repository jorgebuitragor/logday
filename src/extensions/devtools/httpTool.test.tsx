// La herramienta "Cliente HTTP" de DevTools (specs/cliente-http HT27, HT28):
// aparece y desaparece con su extensión (lista, búsqueda, Opciones, pie),
// se dibuja en cada estado (con react-dom/server, sin DOM) y envía con el
// motor del Cliente HTTP y el comando de Rust simulado. La interacción se
// revisa en el navegador.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { sectionKeys, t } from '../../lib/i18n';
import type { SendInput, SendOutput } from '../http-client/core/api';
import type { HttpEnvironment } from '../http-client/core/environments';
import { serializeForm, type HttpForm } from '../http-client/core/serialize';

const app = vi.hoisted(() => ({
  language: 'es' as 'es' | 'en',
  extensions: {} as Record<string, { enabled: boolean; settings?: Record<string, unknown> }>,
  confirmDestructiveActions: true,
  basePath: '/datos',
  noteFolders: [] as string[],
  updateExtensionSettings: async () => {},
  openExtensionSettings: () => {},
  showToast: () => '',
  createNoteWith: vi.fn(async (input: { title: string; content: string }) => ({ id: 'n9', title: input.title, content: input.content })),
}));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select?: (s: typeof app) => unknown) => (select ? select(app) : app);
  useAppStore.getState = () => app;
  useAppStore.subscribe = () => () => {};
  return { useAppStore, notesDir: () => '', noteFolderDir: () => '', readNoteFromPath: async () => null };
});

const rust = vi.hoisted(() => ({
  calls: [] as SendInput[],
  reply: null as null | ((input: SendInput) => Promise<SendOutput>),
}));

vi.mock('../http-client/core/api', async (orig) => {
  const real = await orig<typeof import('../http-client/core/api')>();
  return {
    ...real,
    sendHttp: (input: SendInput) => {
      rust.calls.push(input);
      return rust.reply ? rust.reply(input) : Promise.reject(real.toSendError({ code: 'connect', host: 'localhost' }));
    },
    cancelHttp: async () => true,
  };
});

const model = await import('./model');
const { availableTools, clearDrafts, draftKey, readDevtoolsSettings, resolveToolList, setDraft } = model;
const { DevtoolsContext } = await import('./ui/context');
const { makeTr, shortcutLabel, toolKey, fold } = await import('./ui/text');
const { ToolNav, navBlocks } = await import('./ui/ToolNav');
const { default: DevtoolsSettingsPanel } = await import('./Settings');
const { default: DevtoolsView } = await import('./View');
const { default: HttpTool } = await import('./views/HttpTool');
const { saveOutputAsNote } = await import('./notes');
const store = await import('../http-client/store');
const { cacheKey } = await import('../http-client/core/cache');
const { parseHttpBlock } = await import('../http-client/core/parse');

store.httpApi.getInitialState = store.httpApi.getState;

type Ctx = import('./ui/context').DevtoolsContextValue;
type ToolId = import('./model').ToolId;

const ON = availableTools(true);
const OFF = availableTools(false);
const tr = makeTr('es');

function context(tool: ToolId, available: readonly ToolId[], over: Partial<Ctx> = {}): Ctx {
  return {
    tool, available, language: 'es', tr, mac: true, settings: readDevtoolsSettings({ lastTool: tool }),
    updateSettings: () => {}, openSettings: () => {}, setOptions: () => {}, announce: () => {},
    copyText: async () => true, saveNote: async () => null, openNote: () => {}, openPicker: () => {},
    actionsRef: { current: {} }, loadedFrom: null, clearLoaded: () => {}, takeFocus: () => false, goTo: () => {},
    shortcut: (spec) => shortcutLabel(spec, true), switcherOpen: false, setSwitcherOpen: () => {}, ...over,
  };
}

const text = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const STAGING: HttpEnvironment = {
  id: 'e_00000001', name: 'Staging', protected: false, insecureTls: false, extraHosts: [],
  vars: [
    { name: 'baseUrl', secret: false, value: 'https://staging.example.com' },
    { name: 'token', secret: true, key: 'v_ab12cd34', hint: '…a1b2' },
  ],
};
const PROD: HttpEnvironment = { ...STAGING, id: 'e_00000002', name: 'Producción', protected: true };

function setHttp(enabled: boolean, envs: HttpEnvironment[] = [], activeEnvId: string | null = null) {
  app.extensions = {
    devtools: { enabled: true, settings: { lastTool: 'http' } },
    'http-client': { enabled, settings: { environments: envs, activeEnvId } },
  };
}

function draft(form: Partial<HttpForm>) {
  if (form.method) setDraft(draftKey('http', 'method'), form.method);
  if (form.url) setDraft(draftKey('http', 'url'), form.url);
  if (form.headers) setDraft(draftKey('http', 'headers'), form.headers);
  if (form.body) setDraft(draftKey('http', 'body'), form.body);
}

const tool = (over: Partial<Ctx> = {}) =>
  renderToStaticMarkup(
    <DevtoolsContext.Provider value={context('http', ON, over)}>
      <HttpTool />
    </DevtoolsContext.Provider>,
  );

const output = (over: Partial<SendOutput> = {}): SendOutput => ({
  status: 200, reason: 'OK', headers: [['content-type', 'application/json']],
  body: { kind: 'text', text: '{"id":42}', lossy: false }, bodyBytes: 9, contentLength: 9, truncated: false,
  elapsedMs: 143, finalUrl: 'https://staging.example.com/users', redirects: [], tlsUnverified: false, droppedHeaders: [], ...over,
});

/** Lo que hace la herramienta al pulsar Enviar: el bloque del formulario. */
const send = (form: Partial<HttpForm>, extra: Partial<Parameters<typeof store.sendRequest>[0]> = {}) =>
  store.sendRequest({
    noteId: store.DEVTOOLS_NOTE_ID, blockIndex: 0, requestIndex: 0,
    code: serializeForm({ method: 'GET', url: '', headers: '', body: '', ...form }).code, ...extra,
  });

beforeEach(() => {
  store.resetAll();
  rust.calls = [];
  rust.reply = null;
  setHttp(true);
});
afterEach(() => clearDrafts());

describe('aparece solo con Cliente HTTP activa (HT27)', () => {
  const nav = (available: readonly ToolId[]) =>
    renderToStaticMarkup(
      <DevtoolsContext.Provider value={context('json', available)}>
        <ToolNav active="json" idPrefix="t" onSelect={() => {}} />
      </DevtoolsContext.Provider>,
    );

  it('la columna: el grupo Red con Cliente HTTP al final, o nada', () => {
    const on = nav(ON);
    expect(on.match(/aria-expanded="true"/g)).toHaveLength(7);
    expect(text(on)).toMatch(/Listas .* Red .*Cliente HTTP/);
    const off = nav(OFF);
    expect(off.match(/aria-expanded="true"/g)).toHaveLength(6);
    expect(text(off)).not.toContain('Cliente HTTP');
    expect(text(off)).not.toContain('Red');
  });

  it('la búsqueda la encuentra solo si está', () => {
    const settings = readDevtoolsSettings({});
    const matches = (tool: ToolId) => fold([tr(toolKey(tool, 'name')), tr(toolKey(tool, 'keywords'))].join(' ')).includes('postman');
    const find = (available: readonly ToolId[]) =>
      navBlocks(resolveToolList(settings, (x) => tr(toolKey(x, 'name')), 'es-CO', available), settings, 'json', matches).flatMap((b) => b.tools);
    expect(find(ON)).toEqual(['http']);
    expect(find(OFF)).toEqual([]);
  });

  it('Opciones → DevTools: su tarjeta y su interruptor, solo con la extensión', () => {
    setHttp(true);
    const on = text(renderToStaticMarkup(<DevtoolsSettingsPanel />));
    expect(on).toContain('Red');
    expect(on).toContain('Cliente HTTP');
    setHttp(false);
    const off = renderToStaticMarkup(<DevtoolsSettingsPanel />);
    expect(text(off)).not.toContain('Cliente HTTP');
    expect(off.match(/<ul[^>]*data-group-row/g)).toHaveLength(6);
  });

  it('el pie dice la verdad (D11) y la última herramienta apagada abre la de por defecto', () => {
    setHttp(true);
    const on = renderToStaticMarkup(<DevtoolsView />);
    expect(text(on)).toContain(tr('privacyNoteWithHttp'));
    expect(on).toMatch(/aria-current="page"[^>]*>.*?Cliente HTTP/);
    setHttp(false);
    const off = renderToStaticMarkup(<DevtoolsView />);
    expect(text(off)).toContain(tr('privacyNote'));
    expect(text(off)).not.toContain('Cliente HTTP');
    expect(off).toMatch(/aria-current="page"[^>]*>.*?JSON/);
  });

  it('"Traer de una nota": un bloque http va a Cliente HTTP solo si está', () => {
    const block = { language: 'http', code: 'GET https://x.com' };
    expect(model.toolForBlock(block, ON)).toBe('http');
    expect(model.toolForBlock(block, OFF)).toBeNull();
  });
});

describe('la herramienta se dibuja', () => {
  it('vacía: el aviso de que envía, el entorno y Enviar con aria-disabled', () => {
    const html = tool();
    const t = text(html);
    expect(t).toContain('Esta herramienta envía la petición a la URL que escribas.');
    expect(t).toContain('Sin entorno');
    expect(t).toContain('Escribe una URL y pulsa Enviar. La respuesta aparece aquí.');
    expect(html).toMatch(/aria-disabled="true"[^>]*title="Enviar \(⌘↵\)"/);
    expect(html).toContain('aria-label="Método"');
    expect(html).toContain('aria-label="URL"');
    expect(t).toContain('Traer de una nota');
    expect(t).toContain('Guardar en una nota');
  });

  it('una cabecera mal escrita dice su línea en el campo, no en el bloque', () => {
    draft({ url: 'https://x.com', headers: 'Accept: */*\n\nmal' });
    const html = tool();
    expect(text(html)).toContain('Línea 3: escribe la cabecera como Nombre: valor.');
    expect(html).toMatch(/<textarea[^>]*aria-invalid="true"/);
  });

  it('una variable que falta, con el acceso a Opciones', () => {
    setHttp(true, [STAGING], STAGING.id);
    draft({ url: '{{baseUrl}}/u', headers: 'X-Id: {{id}}' });
    const t = text(tool());
    expect(t).toContain('Falta la variable {{id}} en Staging.');
    expect(t).toContain('Definir en Opciones');
  });

  it('HEAD: el cuerpo desactivado con su ayuda; GET con cuerpo, el aviso; ### en el cuerpo, el error', () => {
    draft({ method: 'HEAD', url: 'https://x.com', body: '{}' });
    const head = tool();
    expect(head).toMatch(/<textarea[^>]*disabled=""/);
    expect(text(head)).toContain('Con HEAD no se envía el cuerpo.');
    clearDrafts();
    draft({ url: 'https://x.com', body: '{}' });
    expect(text(tool())).toContain('Muchos servidores ignoran el cuerpo de un GET.');
    clearDrafts();
    draft({ method: 'POST', url: 'https://x.com', body: 'a\n### b' });
    expect(text(tool())).toContain('Una línea del cuerpo empieza por ###');
  });

  it('traído de una nota: los campos con la primera petición y cuántas tenía', () => {
    setDraft(draftKey('http'), '### Crear\nPOST https://x.com/u\nContent-Type: application/json\n\n{"a":1}\n\n### Otra\nGET https://y.com');
    const html = tool({ loadedFrom: 'API' });
    expect(html).toContain('value="https://x.com/u"');
    expect(html).toMatch(/<option value="POST" selected="">/);
    expect(text(html)).toContain('Cargado de «API»');
    expect(text(html)).toContain('El bloque tiene 2 peticiones; se cargó la primera.');
  });

  it('con una respuesta: la misma vista que los bloques; vieja si la petición cambió', async () => {
    rust.reply = async () => output();
    expect(await send({ url: 'https://x.com/a' })).toBe('sent');
    draft({ url: 'https://x.com/a' });
    const html = text(tool());
    expect(html).toContain('200 OK');
    expect(html).toContain('Cabeceras 1');
    expect(html).not.toContain('La petición cambió');
    clearDrafts();
    // Limpiar los borradores también olvida la respuesta (A10).
    expect(store.readDevtoolsResult(null)).toBeNull();
    await send({ url: 'https://x.com/a' });
    draft({ url: 'https://x.com/b' });
    expect(text(tool())).toContain('La petición cambió después de esta respuesta.');
  });

  it('la confirmación del entorno protegido, en la herramienta', async () => {
    setHttp(true, [PROD], PROD.id);
    draft({ method: 'DELETE', url: '{{baseUrl}}/u/1' });
    expect(await send({ method: 'DELETE', url: '{{baseUrl}}/u/1' })).toBe('confirm');
    const t = text(tool());
    expect(t).toContain('Vas a enviar DELETE a Producción.');
    expect(t).toContain('No enviar');
    expect(t).toContain('Enviar a Producción');
  });
});

describe('enviar con el mismo motor (HT3, HT20, HT21, HT24)', () => {
  it('dibujar la herramienta no envía nada', () => {
    draft({ method: 'POST', url: 'https://x.com', body: '{}' });
    tool();
    expect(rust.calls).toEqual([]);
  });

  it('lo del formulario llega a Rust con las variables, los secretos como marca y las opciones', async () => {
    setHttp(true, [STAGING], STAGING.id);
    app.extensions['http-client'].settings = { ...app.extensions['http-client'].settings, timeoutSec: 7 };
    rust.reply = async () => output();
    const result = await send({ method: 'POST', url: '{{baseUrl}}/users', headers: 'Authorization: Bearer {{token}}', body: '{"name":"Ana"}' });
    expect(result).toBe('sent');
    const call = rust.calls[0];
    expect([call.method, call.url, call.body, call.timeoutMs]).toEqual(['POST', 'https://staging.example.com/users', '{"name":"Ana"}', 7000]);
    expect(call.headers).toContainEqual(['Authorization', 'Bearer {{$secret:v_ab12cd34}}']);
    expect(call.headers).toContainEqual(['Content-Type', 'application/json']);
    expect(JSON.stringify(call)).not.toContain('a1b2');
    expect(store.readDevtoolsResult(parseHttpBlock(serializeForm({ method: 'POST', url: '{{baseUrl}}/users', headers: 'Authorization: Bearer {{token}}', body: '{"name":"Ana"}' }).code).requests[0].source)).toMatchObject({ stale: false });
    // Va a la caché del Cliente HTTP con la clave de DevTools.
    expect(store.cache.peek(cacheKey('devtools', 0, 0))?.value.response?.output.status).toBe(200);
  });

  it('entorno protegido y secreto a un host ajeno: confirmar antes', async () => {
    setHttp(true, [PROD], PROD.id);
    rust.reply = async () => output();
    expect(await send({ method: 'PATCH', url: '{{baseUrl}}/u' })).toBe('confirm');
    expect(rust.calls).toEqual([]);
    expect(await send({ method: 'PATCH', url: '{{baseUrl}}/u' }, { confirmed: true })).toBe('sent');
    setHttp(true, [STAGING], STAGING.id);
    expect(await send({ url: 'https://otro.com', headers: 'Authorization: Bearer {{token}}' })).toBe('confirm');
    expect(store.blockState(store.httpApi.getState(), store.DEVTOOLS_KEY).confirm?.reasons).toEqual([
      { kind: 'untrusted_host', host: 'otro.com', vars: ['token'] },
    ]);
    expect(await send({ url: 'https://otro.com', headers: 'Authorization: Bearer {{token}}' }, { allowUntrusted: true })).toBe('sent');
    expect(rust.calls[rust.calls.length - 1].allowUntrustedHost).toBe(true);
  });

  it('Limpiar cancela lo que está en curso y olvida la respuesta', async () => {
    rust.reply = async () => output();
    await send({ url: 'https://x.com' });
    store.httpApi.setState({ blocks: { [store.DEVTOOLS_KEY]: { selected: 0, inFlight: { requestId: 'r', requestIndex: 0, startedAt: Date.now() }, confirm: null } } });
    store.resetDevtoolsSlot();
    expect(store.readDevtoolsResult(null)).toBeNull();
    expect(store.blockState(store.httpApi.getState(), store.DEVTOOLS_KEY).inFlight).toBeNull();
  });

  it('apagar Cliente HTTP olvida lo escrito en la herramienta y deja lo de las demás', async () => {
    draft({ url: 'https://x.com' });
    setDraft(draftKey('json'), '{}');
    const { default: httpClient } = await import('../http-client');
    httpClient.start!()();
    expect(model.getDraft(draftKey('http', 'url'))).toBe('');
    expect(model.getDraft(draftKey('json'))).toBe('{}');
  });
});

describe('"Guardar en una nota" (HT28)', () => {
  it('crea una nota con el bloque http, con los nombres de las variables y nunca sus valores', async () => {
    setHttp(true, [STAGING], STAGING.id);
    const { code } = serializeForm({ method: 'GET', url: '{{baseUrl}}/me', headers: 'Authorization: Bearer {{token}}', body: '' });
    await saveOutputAsNote('Cliente HTTP — 31 oct 2026, 14:05', 'http', code);
    const { content } = app.createNoteWith.mock.calls[app.createNoteWith.mock.calls.length - 1][0];
    expect(content).toBe('```http\nGET {{baseUrl}}/me\nAuthorization: Bearer {{token}}\n```');
    expect(content).not.toMatch(/staging\.example\.com|a1b2|\$secret/);
  });

  it('el título de la nota usa el nombre de la herramienta', () => {
    expect(tr('noteTitle', { tool: tr(toolKey('http', 'name')), date: 'hoy' })).toBe('Cliente HTTP — hoy');
  });
});

describe('textos', () => {
  it('las mismas claves en es y en (devtools y httpClient)', () => {
    expect(sectionKeys('en', 'devtools').sort()).toEqual(sectionKeys('es', 'devtools').sort());
    expect(sectionKeys('en', 'httpClient').sort()).toEqual(sectionKeys('es', 'httpClient').sort());
  });

  it('sin voseo en los textos nuevos', () => {
    const keys = [
      ...sectionKeys('es', 'devtools').filter((k) => k.startsWith('http.') || k.includes('Http') || k === 'group.network'),
      ...sectionKeys('es', 'httpClient').filter((k) => k.startsWith('tool')),
    ];
    expect(keys.length).toBeGreaterThan(15);
    const voseo = /\b(querés|podés|tenés|escribí|elegí|usá|pulsá|cambiá|guardá|pegá|probá|definí|mirá|revisá)\b/i;
    for (const key of keys) {
      const section = key.startsWith('tool') ? 'httpClient' : 'devtools';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect([key, voseo.test(t('es', section, key as any))]).toEqual([key, false]);
    }
  });
});
