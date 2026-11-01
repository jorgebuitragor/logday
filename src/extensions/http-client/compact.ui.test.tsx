// Bloque compacto (specs/cliente-http): la barra en una línea, dibujada con
// react-dom/server como en ui.test.tsx, y la opción de Opciones. Lo que
// pasa al hacer clic (ocultar el código, el cursor) es de la nota y se
// revisa en el navegador.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SendOutput } from './core/api';
import { parseHttpBlock } from './core/parse';
import type { NoteBlockProps } from '../types';

const app = vi.hoisted(() => ({
  language: 'es',
  extensions: {
    'http-client': { enabled: true, settings: {} as Record<string, unknown> },
  } as Record<string, { enabled: boolean; settings?: Record<string, unknown> }>,
  confirmDestructiveActions: true,
  updateExtensionSettings: async () => {},
  openExtensionSettings: () => {},
  showToast: () => '',
}));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select: (s: typeof app) => unknown) => select(app);
  useAppStore.getState = () => app;
  useAppStore.subscribe = () => () => {};
  return { useAppStore };
});

const { default: HttpNoteBlock } = await import('./ui/Block');
const { default: Settings } = await import('./ui/Settings');
const store = await import('./store');
const { cacheKey } = await import('./core/cache');

store.httpApi.getInitialState = store.httpApi.getState;

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const block = (code: string, part: 'header' | 'footer', cursor: number | null = null, extra: Partial<NoteBlockProps> = {}) =>
  renderToStaticMarkup(<HttpNoteBlock code={code} onEdit={() => {}} part={part} noteId="n1" index={0} cursor={cursor} {...extra} />);
const editable = { setLanguage: () => {}, setCode: () => {} };

const output = (over: Partial<SendOutput> = {}): SendOutput => ({
  status: 200, reason: 'OK', headers: [['content-type', 'application/json']],
  body: { kind: 'text', text: '{"id":42}', lossy: false }, bodyBytes: 9, contentLength: 9, truncated: false,
  elapsedMs: 143, finalUrl: 'https://api.ejemplo.test/users', redirects: [], tlsUnverified: false, droppedHeaders: [], ...over,
});

function primeResponse(code: string, out: SendOutput, opts: { error?: boolean; source?: string } = {}) {
  const req = parseHttpBlock(code).requests[0];
  const sent = { preview: { method: req.method, url: req.url, headers: [], body: null }, envName: null, sentAt: Date.now() };
  store.cache.set(cacheKey('n1', 0, 0), {
    source: opts.source ?? req.source,
    firstLine: req.firstLine,
    value: {
      response: { ...sent, output: out },
      error: opts.error ? { ...sent, error: { code: 'connect', host: 'localhost:8080', secretKey: null, tlsReason: null }, timeoutSec: 30 } : null,
      cancelled: false,
    },
    bytes: 1,
    at: Date.now(),
  });
}

beforeEach(() => {
  store.resetAll();
  app.extensions['http-client'].settings = {};
});

describe('bloque compacto: la barra sola', () => {
  const compactProps = { ...editable, compact: true, setCompact: () => {} };
  const URL = 'GET https://api.ejemplo.test/users?limit=2';

  it('expandido: el botón para compactar, con aria-expanded y la pista de ⌥/Alt+clic', () => {
    const html = block(URL, 'header', null, { ...editable, compact: false, setCompact: () => {} });
    expect(html).toMatch(/<button type="button" aria-expanded="true" aria-label="Compactar petición" title="Compactar petición \((⌥|Alt)\+clic: todas las de la nota\)"/);
    // La barra tiene su borde con el código debajo y no repite la URL.
    expect(html).toContain('border-b');
    expect(text(html)).not.toContain('api.ejemplo.test');
  });

  it('compacto: el método, la URL sin https:// (completa en title) y Enviar', () => {
    const html = block(URL, 'header', null, compactProps);
    expect(html).toContain('aria-expanded="false" aria-label="Expandir petición"');
    expect(html).toContain('aria-label="Método: GET"');
    expect(text(html)).toContain('api.ejemplo.test/users?limit=2');
    expect(html).toContain('title="GET https://api.ejemplo.test/users?limit=2"');
    expect(text(html)).toContain('Enviar');
    expect(html).toContain('aria-label="Copiar como…"');
    expect(html).not.toContain('border-b');
  });

  it('sin selector de método (otra vista), el resumen lleva el método', () => {
    const html = block('POST https://x.com/a', 'header', null, { compact: true, setCompact: () => {} });
    expect(html).not.toContain('aria-label="Método');
    expect(text(html)).toContain('POST x.com/a');
  });

  it('sin setCompact no hay botón (la nota no puede compactar)', () => {
    expect(block(URL, 'header', null, editable)).not.toContain('Compactar petición');
  });

  it('la última respuesta: el chip del estado y el tiempo; vieja, atenuada y dicha', () => {
    primeResponse(URL, output());
    let html = block(URL, 'header', null, compactProps);
    expect(text(html)).toContain('200 OK · 143 ms');
    expect(html).not.toContain('opacity-60');
    primeResponse(URL, output(), { source: 'otra cosa' });
    html = block(URL, 'header', null, compactProps);
    expect(html).toContain('opacity-60');
    expect(text(html)).toContain('La petición cambió después de esta respuesta.');
  });

  it('si el último envío falló, "Falló"; mientras se envía, "Enviando…"', () => {
    primeResponse(URL, output(), { error: true });
    expect(text(block(URL, 'header', null, compactProps))).toContain('Falló');
    store.httpApi.setState({ blocks: { 'n1#0': { selected: 0, inFlight: { requestId: 'r', requestIndex: 0, startedAt: Date.now() }, confirm: null } } });
    const html = text(block(URL, 'header', null, compactProps));
    expect(html).toContain('Enviando…');
    expect(html).toContain('Cancelar');
  });

  it('un problema se ve con el ícono y se lee', () => {
    const html = block('GET {{baseUrl}}/users', 'header', null, compactProps);
    expect(text(html)).toContain('{{baseUrl}}/users');
    expect(html).toMatch(/<span class="sr-only">[^<]*baseUrl/);
  });

  it('varias peticiones: la de la barra y "+N", en el botón del selector', () => {
    const code = '### Listar\nGET https://x.com/a\n\n### Crear\nPOST https://x.com/b\n\n### Borrar\nDELETE https://x.com/c';
    const html = block(code, 'header', null, compactProps);
    expect(html).toContain('aria-label="Petición: x.com/a, y 2 peticiones más"');
    expect(text(html)).toContain('+2');
    expect(text(html)).toContain('y 2 peticiones más');
  });

  it('en inglés', () => {
    app.language = 'en';
    try {
      const html = block(URL, 'header', null, compactProps);
      expect(html).toContain('aria-label="Expand request"');
      expect(html).toMatch(/title="Expand request \((⌥|Alt)-click: every request in this note\)"/);
      expect(block(URL, 'header', null, { ...compactProps, compact: false })).toContain('aria-label="Collapse request"');
    } finally {
      app.language = 'es';
    }
  });

  it('⌥/Alt+clic: el pedido de compactar todas las de la nota llega al store', () => {
    store.requestCompactAll('n1', true);
    expect(store.httpApi.getState().compactAll).toEqual({ noteId: 'n1', compact: true });
    store.resetAll();
    expect(store.httpApi.getState().compactAll).toBeNull();
  });
});

describe('Opciones → Cliente HTTP: bloques compactos', () => {
  it('la opción de los bloques compactos, apagada de serie', () => {
    const html = renderToStaticMarkup(<Settings />);
    expect(text(html)).toContain('Bloques compactos al abrir una nota');
    expect(text(html)).toContain('solo en este equipo');
    const on = (h: string) => (h.match(/role="switch" aria-checked="true"/g) ?? []).length;
    app.extensions['http-client'].settings = { compactOnOpen: true };
    expect(on(renderToStaticMarkup(<Settings />))).toBe(on(html) + 1);
  });
});
