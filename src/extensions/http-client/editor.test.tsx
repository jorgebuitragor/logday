// El editor en pestañas y "Guardar en la nota" de la pantalla Cliente HTTP
// (specs/cliente-http HT40–HT43, HT50): cada pestaña dibujada (con
// react-dom/server, sin DOM) y el guardado con la nota simulada en memoria
// (lo real, con el Y.Doc, se prueba en lib/noteExternalEdit.test.ts). La
// interacción (teclado, foco) se revisa en el navegador.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HttpEnvironment } from './core/environments';
import { collectNoteRequests, type NoteSource } from './core/noteRequests';
import { draftFromBlock } from './core/noteSave';
import type { RequestTab } from './ui/RequestForm';

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

// La nota en disco: `editNoteContent` lee y escribe aquí.
const disk = vi.hoisted(() => ({
  notes: new Map<string, { id: string; content: string }>(),
  open: false,
}));

vi.mock('../../lib/noteExternalEdit', () => ({
  editNoteContent: async (filePath: string, noteId: string, edit: (content: string) => string | null) => {
    if (disk.open) return { status: 'open' };
    const note = disk.notes.get(filePath);
    if (!note || note.id !== noteId) return { status: 'missing' };
    const next = edit(note.content);
    if (next === null) return { status: 'declined' };
    if (next === note.content) return { status: 'unchanged' };
    note.content = next;
    return { status: 'saved', note };
  },
}));

vi.mock('./core/api', async (orig) => {
  const real = await orig<typeof import('./core/api')>();
  return { ...real, sendHttp: () => Promise.reject(real.toSendError({ code: 'connect', host: 'localhost' })), cancelHttp: async () => true };
});

const store = await import('./store');
const { makeTr } = await import('./core/text');
const { RequestForm } = await import('./ui/RequestForm');
const { RequestsColumn, originOf } = await import('./ui/View');

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

function setHttp(envs: HttpEnvironment[] = [], activeEnvId: string | null = null) {
  app.extensions = { 'http-client': { enabled: true, settings: { environments: envs, activeEnvId } } };
}

const note = (id: string, title: string, content: string): NoteSource => ({ id, title, content, filePath: `/datos/notes/${id}.md` });

type Origin = Parameters<typeof store.loadDraft>[0];

function setDraft(code: string, origin: Origin | null = null, loadedCode = code) {
  store.httpApi.setState({ drafts: { [store.formNoteId(origin)]: { ...store.EMPTY_DRAFT, code, loadedCode } }, origin });
}

const formHtml = (loadedError: string | null = null, initialTab: RequestTab = 'params') =>
  renderToStaticMarkup(<RequestForm tr={tr} mac loadedError={loadedError} onOpenNote={() => {}} onSaved={() => {}} initialTab={initialTab} />);

const column = (groups: ReturnType<typeof collectNoteRequests>) =>
  renderToStaticMarkup(
    <RequestsColumn
      tr={tr} groups={groups} total={groups.reduce((n, g) => n + g.requests.length, 0)} failed={false} refreshing={false}
      query="" onQuery={() => {}} onRefresh={() => {}} onNew={() => {}} onChoose={() => {}} origin={store.httpApi.getState().origin}
    />,
  );

beforeEach(() => {
  store.resetAll();
  disk.notes.clear();
  disk.open = false;
  app.language = 'es';
  setHttp();
});

describe('el editor en pestañas (HT40–HT43)', () => {
  const CODE = 'POST {{baseUrl}}/users?lang=es\n  &size=large\n  # &debug=true\nAuthorization: Bearer {{token}}\n# Accept-Language: en\nX-Id: {{id}}\n\n{"a":1}';

  it('cada pestaña con su resumen: params y cabeceras activos, el tipo de Auth', () => {
    setHttp([STAGING], STAGING.id);
    setDraft(CODE);
    const t = text(formHtml());
    expect(t).toMatch(/Params 2 Cabeceras 2 Auth · Bearer Cuerpo Texto/);
  });

  it('Params: las filas de la URL y de las líneas, la desactivada sin marcar y "en una línea aparte"', () => {
    setDraft(CODE);
    const html = formHtml();
    expect(html).toContain('<caption class="sr-only">Parámetros de la query</caption>');
    expect(html).toMatch(/aria-label="Enviar lang"[^>]*checked=""/);
    expect(html).toMatch(/aria-label="Enviar debug"(?![^>]*checked)[^>]*\/>/);
    expect(html).toContain('value="large"');
    expect(html.match(/title="en una línea aparte"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Valor de lang"');
    expect(html).toContain('aria-label="Eliminar size"');
    expect(text(html)).toContain('Agregar parámetro');
  });

  it('Cabeceras: activas y desactivadas, la de Auth con su llave, y las que agrega Logday', () => {
    setDraft(CODE);
    const html = formHtml(null, 'headers');
    expect(html).toMatch(/aria-label="Enviar Accept-Language"(?![^>]*checked)[^>]*\/>/);
    expect(text(html)).toContain('de Auth');
    expect(text(html)).toMatch(/Content-Type application\/json · Agregada por Logday/);
    expect(text(html)).toMatch(/User-Agent Logday · Agregada por Logday/);
    expect(text(html)).toContain('Agregar cabecera');
  });

  it('Auth: Bearer con un secreto muestra su pista; con un literal, avisa y ofrece guardarlo', () => {
    setHttp([STAGING], STAGING.id);
    setDraft(CODE);
    const ok = text(formHtml(null, 'auth'));
    expect(ok).toContain('secreto de Staging · ••••…a1b2');
    expect(ok).toContain('Se envía como Authorization: Bearer {{token}}');
    setDraft('GET https://x.com\nAuthorization: Bearer eyJhbGciOi');
    const lit = formHtml(null, 'auth');
    expect(text(lit)).toContain('Este valor quedaría escrito en la nota, que se sincroniza.');
    expect(text(lit)).toContain('Guardar como secreto');
    expect(lit).toMatch(/role="combobox"[^>]*aria-label="Token"/);
    expect(lit).not.toContain('<select');
  });

  it('Auth: Basic con usuario y contraseña, la ayuda de Base64; una variable que falta', () => {
    setHttp([STAGING], STAGING.id);
    setDraft('GET https://x.com\nAuthorization: Basic ana:{{password}}');
    const t = text(formHtml(null, 'auth'));
    expect(t).toContain('Logday lo codifica en Base64 al enviar.');
    expect(t).toContain('no definida en Staging');
    // El usuario literal no se avisa: no es un secreto.
    expect(t).not.toContain('quedaría escrito en la nota');
  });

  it('Auth: una API key en la query y una Authorization que no reconoce', () => {
    setHttp([STAGING], STAGING.id);
    setDraft('GET https://x.com?api_key={{token}}');
    expect(text(formHtml(null, 'auth'))).toContain('Se envía como ?api_key={{token}}');
    expect(text(formHtml())).toContain('Auth · API key');
    setDraft('GET https://x.com\nAuthorization: Digest x=1');
    expect(text(formHtml(null, 'auth'))).toContain('Logday no reconoce este esquema');
  });

  it('Texto: el texto entero del borrador', () => {
    setDraft(CODE);
    const html = formHtml(null, 'text');
    expect(html).toMatch(/<textarea[^>]*aria-label="Texto de la petición"/);
    expect(html).toContain('# &amp;debug=true');
  });

  it('el URL de arriba es el de la línea de la petición, sin las líneas aparte', () => {
    setDraft(CODE);
    expect(formHtml()).toContain('value="{{baseUrl}}/users?lang=es"');
  });
});

describe('Guardar en la nota (HT50)', () => {
  const NOTE_MD = 'Intro\n```http\n### Crear\nPOST {{baseUrl}}/users\n\n{"name":"Ana"}\n\n### Listar\nGET {{baseUrl}}/users?page=2\n```\nFin';
  const NOTE = note('n7', 'API', NOTE_MD);

  const open = (requestIndex: number) => {
    const [group] = collectNoteRequests([NOTE]);
    const req = group.requests[requestIndex];
    store.loadDraft(originOf(group, req, tr), { ...draftFromBlock(req.code, requestIndex)!, name: req.name });
    disk.notes.set(NOTE.filePath, { id: NOTE.id, content: NOTE_MD });
  };

  it('con origen nota y cambios: "● Cambios sin guardar", el botón y el punto en la columna', () => {
    open(1);
    expect(text(formHtml())).not.toContain('Cambios sin guardar');
    store.setDraftCode('GET {{baseUrl}}/users?page=3');
    const t = text(formHtml());
    expect(t).toContain('Cambios sin guardar');
    expect(t).toContain('Guardar en la nota');
    expect(formHtml()).toMatch(/title="Guardar en la nota \(⌘S\)"/);
    const col = column(collectNoteRequests([NOTE]));
    expect(col.match(/cambios sin guardar/g)).toHaveLength(1);
  });

  it('reemplaza solo la sección, y el borrador queda guardado', async () => {
    open(1);
    store.setDraftCode('GET {{baseUrl}}/users?page=3\n# &debug=1');
    expect(await store.saveDraftToNote('replace', 'Nota')).toBe('saved');
    expect(disk.notes.get(NOTE.filePath)?.content).toBe(NOTE_MD.replace('?page=2', '?page=3\n# &debug=1'));
    expect(store.isDirty(store.currentDraft())).toBe(false);
    // Guardar otra vez sin cambios en la nota: no hay conflicto.
    store.setDraftCode('GET {{baseUrl}}/users?page=4');
    expect(await store.saveDraftToNote('replace', 'Nota')).toBe('saved');
  });

  it('si la nota cambió, no escribe y pregunta; "Reemplazar" escribe igual', async () => {
    open(1);
    store.setDraftCode('GET {{baseUrl}}/users?page=3');
    disk.notes.get(NOTE.filePath)!.content = NOTE_MD.replace('page=2', 'page=9');
    expect(await store.saveDraftToNote('replace', 'Nota')).toBe('conflict');
    expect(disk.notes.get(NOTE.filePath)?.content).toContain('page=9');
    const t = text(formHtml());
    expect(t).toContain('La nota cambió desde que abriste esta petición');
    expect(t).toContain('Reemplazar en la nota');
    expect(t).toContain('Guardar como petición nueva');
    expect(await store.saveDraftToNote('force', 'Nota')).toBe('saved');
    expect(disk.notes.get(NOTE.filePath)?.content).toBe(NOTE_MD.replace('page=2', 'page=3'));
    expect(store.currentDraft().conflict).toBe(false);
  });

  it('"Guardar como petición nueva": otra sección al final, y la pantalla pasa a ella', async () => {
    open(1);
    store.setDraftCode('GET {{baseUrl}}/users?page=3');
    disk.notes.get(NOTE.filePath)!.content = NOTE_MD.replace('page=2', 'page=9');
    expect(await store.saveDraftToNote('append', 'Nota')).toBe('saved');
    expect(disk.notes.get(NOTE.filePath)?.content).toContain('page=9\n\n### Listar (2)\nGET {{baseUrl}}/users?page=3\n```');
    expect(store.httpApi.getState().origin).toMatchObject({ noteId: 'n7', requestIndex: 2, label: 'Listar (2)' });
    expect(store.isDirty(store.currentDraft())).toBe(false);
  });

  it('la nota abierta en el editor o que ya no está: no escribe', async () => {
    open(0);
    store.setDraftCode('POST {{baseUrl}}/users');
    disk.open = true;
    expect(await store.saveDraftToNote('replace', 'Nota')).toBe('open');
    disk.open = false;
    disk.notes.clear();
    expect(await store.saveDraftToNote('replace', 'Nota')).toBe('missing');
    expect(store.isDirty(store.currentDraft())).toBe(true);
  });

  it('volver a una petición con cambios sin guardar los conserva; sin cambios, recarga lo de la nota', () => {
    open(1);
    store.setDraftCode('GET {{baseUrl}}/users?page=3');
    open(0);
    open(1);
    expect(store.currentDraft().code).toBe('GET {{baseUrl}}/users?page=3');
    store.setDraftCode(store.currentDraft().loadedCode);
    const [group] = collectNoteRequests([note('n7', 'API', NOTE_MD.replace('page=2', 'page=5'))]);
    store.loadDraft(originOf(group, group.requests[1], tr), { ...draftFromBlock(group.requests[1].code, 1)!, name: 'Listar' });
    expect(store.currentDraft().code).toBe('GET {{baseUrl}}/users?page=5');
  });

  it('un cURL pegado en la URL reemplaza el texto entero del borrador', () => {
    setDraft('GET https://x.com\nA: 1');
    store.setDraftCode('PUT https://y.com\nB: 2');
    expect(store.currentDraft().code).toBe('PUT https://y.com\nB: 2');
  });
});

