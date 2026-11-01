// La pantalla del Cliente HTTP (specs/cliente-http HT33–HT35): registrada
// como vista, la columna de peticiones y el formulario dibujados en cada
// estado (con react-dom/server, sin DOM), el envío con el motor del Cliente
// HTTP y el comando de Rust simulado, "Guardar en una nota" y su ayuda. La
// interacción se revisa en el navegador.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { sectionKeys, t } from '../../lib/i18n';
import type { SendInput, SendOutput } from './core/api';
import type { HttpEnvironment } from './core/environments';
import { collectNoteRequests, type NoteSource } from './core/noteRequests';
import { EMPTY_FORM, formFromBlock, serializeForm, type HttpForm } from './core/serialize';

const app = vi.hoisted(() => ({
  language: 'es' as 'es' | 'en',
  extensions: {} as Record<string, { enabled: boolean; settings?: Record<string, unknown> }>,
  confirmDestructiveActions: true,
  basePath: '/datos',
  noteFolders: [] as string[],
  notes: [],
  updateExtensionSettings: async () => {},
  openExtensionSettings: () => {},
  showToast: () => '',
  createNoteWith: vi.fn(async (input: { title: string; content: string }) => ({ id: 'n9', title: input.title, content: input.content, filePath: '/datos/notes/n9.md' })),
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

vi.mock('./core/api', async (orig) => {
  const real = await orig<typeof import('./core/api')>();
  return {
    ...real,
    sendHttp: (input: SendInput) => {
      rust.calls.push(input);
      return rust.reply ? rust.reply(input) : Promise.reject(real.toSendError({ code: 'connect', host: 'localhost' }));
    },
    cancelHttp: async () => true,
  };
});

const store = await import('./store');
const { cacheKey } = await import('./core/cache');
const { parseHttpBlock } = await import('./core/parse');
const { makeTr } = await import('./core/text');
const { RequestForm, saveRequestAsNote } = await import('./ui/RequestForm');
const { default: HttpClientView, RequestsColumn, originOf, requestErrorText } = await import('./ui/View');
const { HttpClientHelpBody, HTTP_HELP_ITEMS } = await import('./ui/Help');
const { EXTENSIONS, getExtension } = await import('../registry');
const { resolveSection } = await import('../state');
const { helpTopicFor } = await import('../../components/help/helpTopics');

// react-dom/server lee el estado inicial del store (getServerSnapshot).
store.httpApi.getInitialState = store.httpApi.getState;

const tr = makeTr('es');

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

function setHttp(envs: HttpEnvironment[] = [], activeEnvId: string | null = null) {
  app.extensions = { 'http-client': { enabled: true, settings: { environments: envs, activeEnvId } } };
}

const note = (id: string, title: string, content: string): NoteSource => ({ id, title, content, filePath: `/datos/notes/${id}.md` });

const API = note('n1', 'API de usuarios', [
  'Las pruebas de la API.',
  '```http',
  '### Crear',
  'POST {{baseUrl}}/users',
  'Content-Type: application/json',
  '',
  '{"name":"Ana"}',
  '',
  '### Listar',
  'GET https://api.example.com/users?page=2',
  '```',
  'Y otra:',
  '```http',
  'DELETE https://api.example.com/users/1',
  '```',
].join('\n'));
const BROKEN = note('n2', '', '```http\nFETCH https://x.com\nmal cabecera\n```\n\n```http\n```');
const PLAIN = note('n3', 'Sin peticiones', 'Texto y un bloque de otro lenguaje:\n```json\n{"a":1}\n```');

function setForm(form: Partial<HttpForm>, origin: Parameters<typeof store.loadForm>[1] | null = null) {
  store.httpApi.setState({ form: { ...EMPTY_FORM, ...form }, origin });
}

const formHtml = (loadedError: string | null = null) =>
  renderToStaticMarkup(<RequestForm tr={tr} mac loadedError={loadedError} onOpenNote={() => {}} onSaved={() => {}} />);

const column = (groups: ReturnType<typeof collectNoteRequests> | null, query = '', origin: ReturnType<typeof originOf> | null = null) =>
  renderToStaticMarkup(
    <RequestsColumn
      tr={tr}
      groups={groups}
      total={groups ? groups.reduce((n, g) => n + g.requests.length, 0) : 0}
      failed={false}
      refreshing={false}
      query={query}
      onQuery={() => {}}
      onRefresh={() => {}}
      onNew={() => {}}
      onChoose={() => {}}
      origin={origin}
    />,
  );

const output = (over: Partial<SendOutput> = {}): SendOutput => ({
  status: 200, reason: 'OK', headers: [['content-type', 'application/json']],
  body: { kind: 'text', text: '{"id":42}', lossy: false }, bodyBytes: 9, contentLength: 9, truncated: false,
  elapsedMs: 143, finalUrl: 'https://staging.example.com/users', redirects: [], tlsUnverified: false, droppedHeaders: [], ...over,
});

/** Lo que hace el formulario al pulsar Enviar: el bloque con lo escrito. */
const send = (form: Partial<HttpForm>, extra: Partial<Parameters<typeof store.sendRequest>[0]> = {}) =>
  store.sendRequest({
    noteId: store.formNoteId(store.httpApi.getState().origin), blockIndex: 0, requestIndex: 0,
    code: serializeForm({ ...EMPTY_FORM, ...form }).code, ...extra,
  });

beforeEach(() => {
  store.resetAll();
  rust.calls = [];
  rust.reply = null;
  app.language = 'es';
  setHttp();
});

describe('una sección propia en el menú lateral (HT33, R11, NS7)', () => {
  it('el registro la declara como vista, con su ícono Globe', () => {
    const def = getExtension('http-client');
    expect(def?.view).toBe(true);
    expect(def?.icon.displayName ?? def?.icon.name).toMatch(/Globe/);
    expect(EXTENSIONS.filter((d) => d.view).map((d) => d.id)).toEqual(['devtools', 'pomodoro', 'http-client']);
  });

  it('su sección vale con la extensión activa y, apagada, vuelve a Inicio (R13)', () => {
    expect(resolveSection('ext:http-client', { 'http-client': { enabled: true } }, EXTENSIONS)).toBe('ext:http-client');
    expect(resolveSection('ext:http-client', {}, EXTENSIONS)).toBe('dashboard');
  });

  it('la vista se dibuja con la columna (leyendo las notas) y el formulario vacío', () => {
    const t = text(renderToStaticMarkup(<HttpClientView />));
    expect(t).toContain('Peticiones');
    expect(t).toContain('Leyendo tus notas…');
    expect(t).toContain('Nueva petición');
    expect(t).toContain('Petición nueva, sin guardar');
    expect(t).toContain('Escribe una URL y pulsa Enviar. La respuesta aparece aquí.');
    expect(t).not.toContain('DevTools');
  });
});

describe('las peticiones de las notas (HT34)', () => {
  it('agrupadas por nota, cada una con su bloque y su lugar en él; las notas sin bloques no salen', () => {
    const groups = collectNoteRequests([API, PLAIN, BROKEN]);
    expect(groups.map((g) => g.note.id)).toEqual(['n1', 'n2']);
    expect(groups[0].requests.map((r) => [r.blockIndex, r.requestIndex, r.name, r.method, r.url, r.hasErrors])).toEqual([
      [0, 0, 'Crear', 'POST', '{{baseUrl}}/users', false],
      [0, 1, 'Listar', 'GET', 'https://api.example.com/users?page=2', false],
      [1, 0, null, 'DELETE', 'https://api.example.com/users/1', false],
    ]);
  });

  it('un bloque mal escrito no rompe nada: sale marcado con errores, y uno vacío no aporta', () => {
    const [group] = collectNoteRequests([BROKEN]);
    expect(group.requests).toHaveLength(1);
    expect(group.requests[0]).toMatchObject({ method: 'GET', url: 'https://x.com', hasErrors: true });
    expect(requestErrorText(tr, group.requests[0])).toBe('Línea 1: FETCH no es un método admitido. Usa GET, POST, PUT, PATCH, DELETE, HEAD u OPTIONS.');
    expect(collectNoteRequests([note('n4', 'Vacía', '```http\n\n```'), note('n5', 'Nada', '')])).toEqual([]);
  });

  it('la columna: el título de cada nota, el método y la URL sin el esquema, el nombre de ###, y la marca de error', () => {
    const groups = collectNoteRequests([API, BROKEN]);
    const html = column(groups);
    const t = text(html);
    expect(t).toContain('Peticiones · 4 peticiones');
    expect(t).toMatch(/API de usuarios .*POST Crear \{\{baseUrl\}\}\/users .*GET Listar api\.example\.com\/users\?page=2 .*DELETE api\.example\.com\/users\/1/);
    // Una nota sin título se ve como "Sin título".
    expect(t).toContain('Sin título');
    expect(t).toContain('con errores');
    expect(html).toContain('aria-label="Buscar peticiones"');
    expect(html).toContain('aria-label="Actualizar la lista"');
    expect(html).not.toContain('aria-current');
  });

  it('la elegida se marca con aria-current', () => {
    const groups = collectNoteRequests([API]);
    const html = column(groups, '', originOf(groups[0], groups[0].requests[1], tr));
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="true"[^>]*title="GET https:\/\/api\.example\.com\/users\?page=2"/);
  });

  it('sin peticiones, el vacío explica cómo crear una; sin coincidencias, lo dice', () => {
    const empty = text(column([]));
    expect(empty).toContain('Todavía no hay peticiones en tus notas');
    expect(empty).toContain('Escribe un bloque ```http en cualquier nota');
    expect(empty).toContain('Nueva petición');
    const groups = collectNoteRequests([API]);
    const html = renderToStaticMarkup(
      <RequestsColumn tr={tr} groups={[]} total={3} failed={false} refreshing={false} query="zzz" onQuery={() => {}} onRefresh={() => {}} onNew={() => {}} onChoose={() => {}} origin={null} />,
    );
    expect(groups).toHaveLength(1);
    expect(text(html)).toContain('Ninguna petición coincide con «zzz».');
  });

  it('elegir una la carga en el formulario, diciendo de qué nota viene', () => {
    const groups = collectNoteRequests([API]);
    const req = groups[0].requests[0];
    const loaded = formFromBlock(req.code, req.requestIndex)!;
    store.loadForm(loaded.form, originOf(groups[0], req, tr));
    const html = formHtml();
    const t = text(html);
    expect(html).toContain('value="{{baseUrl}}/users"');
    expect(html).toContain('aria-label="Método: POST"');
    expect(t).toContain('Crear');
    expect(t).toContain('De «API de usuarios» · Abrir la nota');
    // La segunda petición del bloque, no la primera.
    const second = formFromBlock(req.code, 1)!;
    expect(second.form).toEqual({ method: 'GET', url: 'https://api.example.com/users?page=2', headers: '', body: '' });
  });

  it('con un error en la nota, el formulario lo avisa', () => {
    const [group] = collectNoteRequests([BROKEN]);
    store.loadForm({ ...EMPTY_FORM, url: 'https://x.com', headers: 'mal cabecera' }, originOf(group, group.requests[0], tr));
    const t = text(formHtml(requestErrorText(tr, group.requests[0])));
    expect(t).toContain('En la nota, esta petición tiene un error: Línea 1: FETCH no es un método admitido.');
    expect(t).toContain('De «Sin título»');
  });
});

describe('el formulario se dibuja', () => {
  it('vacío: el aviso de que envía, el entorno, Guardar desactivado y Enviar con aria-disabled', () => {
    const html = formHtml();
    const t = text(html);
    expect(t).toContain('Enviar manda la petición a la URL que escribas, desde este equipo.');
    expect(t).toContain('Sin entorno');
    expect(html).toMatch(/aria-disabled="true"[^>]*title="Enviar \(⌘↵\)"/);
    // El método es el menú de la app, no un <select> nativo (la lista azul de macOS).
    expect(html).not.toContain('<select');
    expect(html).toMatch(/<button type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Método: GET"[^>]*>.*GET/);
    expect(html).toContain('aria-label="URL"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Guardar en una nota"/);
    expect(t).not.toContain('Traer de una nota');
  });

  it('"Código" y "Copiar como…" en la cabecera de la petición (HT60, HT61)', () => {
    const disabled = /aria-label="Copiar como…" title="Copiar como…" disabled=""/;
    // Sin URL no hay código que copiar.
    let html = formHtml();
    expect(html).toMatch(disabled);
    expect(html).toMatch(/aria-expanded="false"[^>]*aria-label="Código"/);
    // El panel solo se dibuja al abrirlo.
    expect(html).not.toContain('role="tablist" aria-label="Lenguaje del código"');
    setForm({ url: '{{baseUrl}}/me', headers: 'Authorization: Bearer {{token}}' });
    html = formHtml();
    expect(html).not.toMatch(disabled);
    expect(text(html)).toContain('Copiar como…');
    // Con un error de sintaxis, deshabilitado otra vez.
    setForm({ url: 'https://x.com', headers: 'mal' });
    expect(formHtml()).toMatch(disabled);
  });

  it('una cabecera mal escrita dice su línea en el campo, no en el bloque', () => {
    setForm({ url: 'https://x.com', headers: 'Accept: */*\n\nmal' });
    const html = formHtml();
    expect(text(html)).toContain('Línea 3: escribe la cabecera como Nombre: valor.');
    expect(html).toMatch(/<textarea[^>]*aria-invalid="true"/);
  });

  it('una variable que falta, con el acceso a Opciones', () => {
    setHttp([STAGING], STAGING.id);
    setForm({ url: '{{baseUrl}}/u', headers: 'X-Id: {{id}}' });
    const t = text(formHtml());
    expect(t).toContain('Falta la variable {{id}} en Staging.');
    expect(t).toContain('Definir en Opciones');
  });

  it('HEAD: el cuerpo desactivado con su ayuda; GET con cuerpo, el aviso; ### en el cuerpo, el error', () => {
    setForm({ method: 'HEAD', url: 'https://x.com', body: '{}' });
    const head = formHtml();
    expect(head).toMatch(/<textarea[^>]*disabled=""/);
    expect(text(head)).toContain('Con HEAD no se envía el cuerpo.');
    setForm({ url: 'https://x.com', body: '{}' });
    expect(text(formHtml())).toContain('Muchos servidores ignoran el cuerpo de un GET.');
    setForm({ method: 'POST', url: 'https://x.com', body: 'a\n### b' });
    expect(text(formHtml())).toContain('Una línea del cuerpo empieza por ###');
  });

  it('con una respuesta: la misma vista que los bloques; vieja si la petición cambió', async () => {
    rust.reply = async () => output();
    expect(await send({ url: 'https://x.com/a' })).toBe('sent');
    setForm({ url: 'https://x.com/a' });
    const html = text(formHtml());
    expect(html).toContain('200 OK');
    expect(html).toContain('Cabeceras 1');
    expect(html).not.toContain('La petición cambió');
    setForm({ url: 'https://x.com/b' });
    expect(text(formHtml())).toContain('La petición cambió después de esta respuesta.');
  });

  it('la confirmación del entorno protegido, en el formulario', async () => {
    setHttp([PROD], PROD.id);
    setForm({ method: 'DELETE', url: '{{baseUrl}}/u/1' });
    expect(await send({ method: 'DELETE', url: '{{baseUrl}}/u/1' })).toBe('confirm');
    const t = text(formHtml());
    expect(t).toContain('Vas a enviar DELETE a Producción.');
    expect(t).toContain('No enviar');
    expect(t).toContain('Enviar a Producción');
  });
});

describe('enviar con el mismo motor (HT3, HT20, HT21, HT24)', () => {
  it('dibujar la vista o el formulario no envía nada', () => {
    setForm({ method: 'POST', url: 'https://x.com', body: '{}' });
    formHtml();
    renderToStaticMarkup(<HttpClientView />);
    expect(rust.calls).toEqual([]);
  });

  it('lo del formulario llega a Rust con las variables, los secretos como marca y las opciones', async () => {
    setHttp([STAGING], STAGING.id);
    app.extensions['http-client'].settings = { ...app.extensions['http-client'].settings, timeoutSec: 7 };
    rust.reply = async () => output();
    const form = { method: 'POST' as const, url: '{{baseUrl}}/users', headers: 'Authorization: Bearer {{token}}', body: '{"name":"Ana"}' };
    expect(await send(form)).toBe('sent');
    const call = rust.calls[0];
    expect([call.method, call.url, call.body, call.timeoutMs]).toEqual(['POST', 'https://staging.example.com/users', '{"name":"Ana"}', 7000]);
    expect(call.headers).toContainEqual(['Authorization', 'Bearer {{$secret:v_ab12cd34}}']);
    expect(call.headers).toContainEqual(['Content-Type', 'application/json']);
    expect(JSON.stringify(call)).not.toContain('a1b2');
    const source = parseHttpBlock(serializeForm(form).code).requests[0].source;
    expect(store.readFormResult(null, source)).toMatchObject({ stale: false });
    // Va a la caché del Cliente HTTP con la clave de la petición nueva.
    expect(store.cache.peek(cacheKey('view:new', 0, 0))?.value.response?.output.status).toBe(200);
  });

  it('cada petición de una nota tiene su propia respuesta, y ninguna es la del bloque de la nota', async () => {
    const groups = collectNoteRequests([API]);
    rust.reply = async () => output();
    const a = originOf(groups[0], groups[0].requests[0], tr);
    const b = originOf(groups[0], groups[0].requests[1], tr);
    store.loadForm(formFromBlock(groups[0].requests[0].code, 0)!.form, a);
    await send({ url: 'https://x.com/a' });
    store.loadForm(formFromBlock(groups[0].requests[0].code, 1)!.form, b);
    expect(store.readFormResult(b, null)).toBeNull();
    expect(store.readFormResult(a, null)?.entry.response?.output.status).toBe(200);
    expect(store.formNoteId(a)).toBe('view:n1:0:0');
    expect(store.readResult('n1', 0, 0, parseHttpBlock(groups[0].requests[0].code).requests[0])).toBeNull();
  });

  it('entorno protegido y secreto a un host ajeno: confirmar antes', async () => {
    setHttp([PROD], PROD.id);
    rust.reply = async () => output();
    expect(await send({ method: 'PATCH', url: '{{baseUrl}}/u' })).toBe('confirm');
    expect(rust.calls).toEqual([]);
    expect(await send({ method: 'PATCH', url: '{{baseUrl}}/u' }, { confirmed: true })).toBe('sent');
    setHttp([STAGING], STAGING.id);
    expect(await send({ url: 'https://otro.com', headers: 'Authorization: Bearer {{token}}' })).toBe('confirm');
    expect(store.blockState(store.httpApi.getState(), store.formKey(null)).confirm?.reasons).toEqual([
      { kind: 'untrusted_host', host: 'otro.com', vars: ['token'] },
    ]);
    expect(await send({ url: 'https://otro.com', headers: 'Authorization: Bearer {{token}}' }, { allowUntrusted: true })).toBe('sent');
    expect(rust.calls[rust.calls.length - 1].allowUntrustedHost).toBe(true);
  });

  it('"Nueva petición" vacía el formulario, cancela lo que está en curso y olvida su respuesta', async () => {
    rust.reply = async () => output();
    setForm({ url: 'https://x.com' });
    await send({ url: 'https://x.com' });
    store.httpApi.setState({ blocks: { [store.formKey(null)]: { selected: 0, inFlight: { requestId: 'r', requestIndex: 0, startedAt: Date.now() }, confirm: null } } });
    store.newForm();
    expect(store.readFormResult(null, null)).toBeNull();
    expect(store.blockState(store.httpApi.getState(), store.formKey(null)).inFlight).toBeNull();
    expect(store.httpApi.getState().form).toEqual(EMPTY_FORM);
    expect(store.httpApi.getState().origin).toBeNull();
  });

  it('apagar la extensión olvida el formulario y las respuestas (R7, HT11)', async () => {
    const [group] = collectNoteRequests([API]);
    store.loadForm({ ...EMPTY_FORM, url: 'https://x.com' }, originOf(group, group.requests[0], tr));
    const { default: httpClient } = await import('./index');
    httpClient.start!()();
    expect(store.httpApi.getState().form).toEqual(EMPTY_FORM);
    expect(store.httpApi.getState().origin).toBeNull();
  });
});

describe('"Guardar en una nota"', () => {
  it('crea una nota con el bloque http, con los nombres de las variables y nunca sus valores', async () => {
    setHttp([STAGING], STAGING.id);
    const { code } = serializeForm({ method: 'GET', url: '{{baseUrl}}/me', headers: 'Authorization: Bearer {{token}}', body: '' });
    await saveRequestAsNote('Cliente HTTP — 31 oct 2026, 14:05', code);
    const { content, title } = app.createNoteWith.mock.calls[app.createNoteWith.mock.calls.length - 1][0];
    expect(title).toBe('Cliente HTTP — 31 oct 2026, 14:05');
    expect(content).toBe('```http\nGET {{baseUrl}}/me\nAuthorization: Bearer {{token}}\n```');
    expect(content).not.toMatch(/staging\.example\.com|a1b2|\$secret/);
  });

  it('el título de la nota', () => {
    expect(tr('noteTitle', { date: 'hoy' })).toBe('Cliente HTTP — hoy');
    expect(makeTr('en')('noteTitle', { date: 'today' })).toBe('HTTP client — today');
  });
});

describe('su ayuda (HT35, AY25)', () => {
  it('la sección del Cliente HTTP tiene la suya', () => {
    expect(helpTopicFor('ext:http-client')).toBe('http-client');
  });

  it('la columna, el formulario, entornos y secretos, ⌘↵ y los bloques de las notas', () => {
    const t = text(renderToStaticMarkup(<HttpClientHelpBody tr={tr} mac />));
    expect(t).toContain('«Peticiones» reúne los bloques http de todas tus notas');
    expect(t).toContain('«Nueva petición»');
    expect(t).toContain('{{baseUrl}}');
    expect(t).toContain('llavero');
    expect(t).toContain('o ⌘↵ con el cursor dentro del bloque');
    expect(t).toMatch(/Atajos ⌘↵ Enviar la petición Enter Enviar, con el foco en la URL Esc Cancelar el envío en curso/);
    const off = text(renderToStaticMarkup(<HttpClientHelpBody tr={tr} mac={false} />));
    expect(off).toContain('Ctrl+Enter Enviar la petición');
  });

  it('en inglés, con sus textos', () => {
    const en = text(renderToStaticMarkup(<HttpClientHelpBody tr={makeTr('en')} mac />));
    expect(en).toContain('"Requests" gathers the http blocks from all your notes');
    for (const key of HTTP_HELP_ITEMS) expect(t('en', 'httpClient', key)).not.toBe(t('es', 'httpClient', key));
  });
});

describe('textos', () => {
  it('las mismas claves en es y en (httpClient, devtools y extensions)', () => {
    expect(sectionKeys('en', 'httpClient').sort()).toEqual(sectionKeys('es', 'httpClient').sort());
    expect(sectionKeys('en', 'devtools').sort()).toEqual(sectionKeys('es', 'devtools').sort());
    expect(sectionKeys('en', 'extensions').sort()).toEqual(sectionKeys('es', 'extensions').sort());
  });

  it('ya no hablan de DevTools', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const key of sectionKeys(lang, 'httpClient')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect([key, t(lang, 'httpClient', key as any)]).not.toEqual([key, expect.stringContaining('DevTools')]);
      }
      expect(t(lang, 'extensions', 'http-client.consent')).not.toContain('DevTools');
    }
  });

  it('sin voseo en los textos nuevos', () => {
    const keys = sectionKeys('es', 'httpClient').filter((k) => /^(view|help|tool|note|save|a[A-Z])/.test(k));
    expect(keys.length).toBeGreaterThan(40);
    const voseo = /\b(querés|podés|tenés|escribí|elegí|usá|pulsá|cambiá|guardá|pegá|probá|definí|mirá|revisá|empezá|abrí|buscá)\b/i;
    for (const key of keys) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect([key, voseo.test(t('es', 'httpClient', key as any))]).toEqual([key, false]);
    }
  });
});
