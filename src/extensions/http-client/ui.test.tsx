// Prueba de humo del bloque, la respuesta y Opciones: se dibujan (con
// react-dom/server, sin DOM) en cada estado y muestran lo que toca. Y el
// flujo de envío con el comando de Rust simulado: qué se manda, cuándo se
// pide confirmar y qué se guarda en memoria. La interacción se revisa en el
// navegador.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SendInput, SendOutput } from './core/api';
import type { HttpEnvironment } from './core/environments';
import { parseHttpBlock } from './core/parse';

const app = vi.hoisted(() => ({
  language: 'es',
  extensions: {
    'http-client': { enabled: true, settings: {} as Record<string, unknown> },
  } as Record<string, { enabled: boolean; settings?: Record<string, unknown> }>,
  confirmDestructiveActions: true,
  updateExtensionSettings: async (id: string, patch: Record<string, unknown>) => {
    app.extensions[id] = { ...app.extensions[id], settings: { ...app.extensions[id]?.settings, ...patch } };
  },
  openExtensionSettings: () => {},
  showToast: () => '',
}));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select: (s: typeof app) => unknown) => select(app);
  useAppStore.getState = () => app;
  useAppStore.subscribe = () => () => {};
  return { useAppStore };
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

const { default: HttpNoteBlock } = await import('./ui/Block');
const { default: Settings } = await import('./ui/Settings');
const { ResponseView } = await import('./ui/ResponseView');
const store = await import('./store');
const { cacheKey } = await import('./core/cache');

// react-dom/server lee el estado inicial del store (getServerSnapshot).
store.httpApi.getInitialState = store.httpApi.getState;

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const STAGING: HttpEnvironment = {
  id: 'e_00000001', name: 'Staging', protected: false, insecureTls: false, extraHosts: [],
  vars: [
    { name: 'baseUrl', secret: false, value: 'https://staging.example.com' },
    { name: 'token', secret: true, key: 'v_ab12cd34', hint: '…a1b2' },
  ],
};
const PROD: HttpEnvironment = { ...STAGING, id: 'e_00000002', name: 'Producción', protected: true };

function setEnvs(envs: HttpEnvironment[], activeEnvId: string | null) {
  app.extensions['http-client'].settings = { environments: envs, activeEnvId };
}

const block = (code: string, part: 'header' | 'footer', cursor: number | null = null) =>
  renderToStaticMarkup(<HttpNoteBlock code={code} onEdit={() => {}} part={part} noteId="n1" index={0} cursor={cursor} />);

const output = (over: Partial<SendOutput> = {}): SendOutput => ({
  status: 200, reason: 'OK', headers: [['content-type', 'application/json'], ['x-id', '7']],
  body: { kind: 'text', text: '{"id":42}', lossy: false }, bodyBytes: 9, contentLength: 9, truncated: false,
  elapsedMs: 143, finalUrl: 'https://staging.example.com/users', redirects: [], tlsUnverified: false, droppedHeaders: [], ...over,
});

function primeResponse(code: string, out: SendOutput, opts: { error?: boolean; source?: string } = {}) {
  const req = parseHttpBlock(code).requests[0];
  const sent = { preview: { method: req.method, url: req.url, headers: [], body: null }, envName: 'Staging', sentAt: Date.now() };
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
  rust.calls = [];
  rust.reply = null;
  setEnvs([], null);
});

describe('barra del bloque', () => {
  it('una petición: HTTP, el entorno y Enviar; sin selector', () => {
    const html = block('GET https://x.com', 'header');
    expect(html).toContain('role="toolbar"');
    expect(text(html)).toContain('HTTP');
    expect(text(html)).toContain('Sin entorno');
    expect(text(html)).toContain('Enviar');
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).not.toContain('aria-label="Petición"');
  });

  it('varias peticiones: el selector sigue al cursor', () => {
    const code = '### Listar\nGET https://x.com/a\n\n### Crear\nPOST https://x.com/b';
    const html = block(code, 'header', code.indexOf('POST') + 2);
    expect(html).toContain('aria-label="Petición"');
    expect(text(html)).toContain('Crear');
    expect(html).toContain('aria-label="Petición HTTP: Crear"');
    // Con el cursor dentro se ve la pista del atajo.
    expect(html).toContain('<kbd');
  });

  it('con un error o una variable que falta, Enviar queda con aria-disabled (sigue enfocable)', () => {
    expect(block('GET https://x.com\nmal', 'header')).toContain('aria-disabled="true"');
    expect(block('GET {{baseUrl}}', 'header')).toContain('aria-disabled="true"');
  });

  it('el entorno protegido se dice con texto, no solo con el ícono', () => {
    setEnvs([PROD], PROD.id);
    expect(block('GET {{baseUrl}}', 'header')).toContain('aria-label="Entorno: Producción, protegido"');
  });

  it('mientras se envía, Enviar pasa a Cancelar', () => {
    store.httpApi.setState({ blocks: { 'n1#0': { selected: 0, inFlight: { requestId: 'r', requestIndex: 0, startedAt: Date.now() }, confirm: null } } });
    const html = text(block('GET https://x.com', 'header'));
    expect(html).toContain('Cancelar');
    expect(html).not.toContain('Enviar (');
  });
});

describe('franja del bloque', () => {
  it('sin respuesta ni problemas no hay franja', () => {
    expect(block('GET https://x.com', 'footer')).toBe('');
  });

  it('error de sintaxis con su línea y cuántos más', () => {
    const html = text(block('GET https://x.com\nmal\notra mal', 'footer'));
    expect(html).toContain('Línea 2: escribe la cabecera como Nombre: valor.');
    expect(html).toContain('y 1 más');
  });

  it('variables que faltan, con el acceso a Opciones', () => {
    setEnvs([STAGING], STAGING.id);
    const html = text(block('GET {{baseUrl}}/{{id}}', 'footer'));
    expect(html).toContain('Falta la variable {{id}} en Staging.');
    expect(html).toContain('Definir en Opciones');
    setEnvs([], null);
    expect(text(block('GET {{baseUrl}}', 'footer'))).toContain('Falta la variable {{baseUrl}}. Elige un entorno o crea uno.');
  });

  it('GET con cuerpo: un aviso que no bloquea', () => {
    expect(text(block('GET https://x.com\n\nhola', 'footer'))).toContain('Muchos servidores ignoran el cuerpo de un GET.');
    expect(block('GET https://x.com\n\nhola', 'header')).not.toContain('aria-disabled="true"');
  });

  it('la confirmación en el bloque: entorno protegido y host ajeno', () => {
    setEnvs([PROD], PROD.id);
    store.httpApi.setState({
      blocks: {
        'n1#0': {
          selected: 0, inFlight: null,
          confirm: {
            requestIndex: 0, method: 'POST', envName: 'Producción', fromRust: false, returnFocus: null,
            reasons: [{ kind: 'protected', env: 'Producción' }, { kind: 'untrusted_host', host: 'otro-host.com', vars: ['token'] }],
          },
        },
      },
    });
    const html = block('POST {{baseUrl}}', 'footer');
    expect(html).toContain('role="group"');
    expect(text(html)).toContain('Vas a enviar POST a Producción.');
    expect(text(html)).toContain('Esta petición lleva {{token}} y va a otro-host.com, que no es un host de Producción.');
    expect(text(html)).toContain('No enviar');
    expect(text(html)).toContain('Enviar igual');
  });

  it('una respuesta: estado, tiempo, tamaño, pestañas y el JSON formateado', () => {
    const code = 'GET https://staging.example.com/users';
    primeResponse(code, output());
    const html = block(code, 'footer');
    expect(html).toContain('aria-label="Respuesta: 200 OK"');
    expect(text(html)).toContain('200 OK');
    expect(text(html)).toContain('143 ms · 9 B');
    expect(text(html)).toContain('Cabeceras 2');
    expect(html).toContain('role="tablist"');
    expect(text(html)).toContain('Formateado');
    expect(html).toContain('&quot;id&quot;');
    expect(html).toContain('aria-label="Cerrar la respuesta"');
  });

  it('la petición cambió después de la respuesta; otra petición en ese lugar no la muestra', () => {
    const code = 'GET https://staging.example.com/users';
    primeResponse(code, output(), { source: 'otra cosa' });
    expect(text(block(code, 'footer'))).toContain('La petición cambió después de esta respuesta.');
    expect(block('GET https://staging.example.com/otra', 'footer')).toBe('');
  });

  it('un error de red con Reintentar, y la respuesta anterior atenuada', () => {
    const code = 'GET http://localhost:8080';
    primeResponse(code, output(), { error: true });
    const html = text(block(code, 'footer'));
    expect(html).toContain('No se pudo conectar con localhost:8080.');
    expect(html).toContain('Reintentar');
    expect(html).toContain('Respuesta anterior');
  });

  it('respuestas binaria, imagen, cortada y sin verificar', () => {
    const code = 'GET https://x.com/f';
    primeResponse(code, output({ headers: [['content-type', 'application/pdf']], body: { kind: 'binary', base64: 'JVBERg==' }, bodyBytes: 4 }));
    expect(text(block(code, 'footer'))).toContain('Respuesta binaria (application/pdf, 4 B). No se muestra como texto.');
    primeResponse(code, output({ headers: [['content-type', 'image/png']], body: { kind: 'binary', base64: 'AQID' }, bodyBytes: 3 }));
    const img = block(code, 'footer');
    expect(img).toContain('<img src="data:image/png;base64,AQID"');
    expect(img).toContain('alt="Imagen de la respuesta (image/png, 3 B)"');
    primeResponse(code, output({ truncated: true, tlsUnverified: true, bodyBytes: 10 * 1024 * 1024 }));
    const cut = text(block(code, 'footer'));
    expect(cut).toContain('(cortada)');
    expect(cut).toContain('Respuesta cortada en 10 MB');
    expect(cut).toContain('Certificado sin verificar');
  });

  it('el HTML se muestra como texto, nunca como página', () => {
    const code = 'GET https://x.com';
    primeResponse(code, output({ headers: [['content-type', 'text/html']], body: { kind: 'text', text: '<script>alert(1)</script>', lossy: false } }));
    const html = block(code, 'footer');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;');
  });
});

describe('la petición enviada enmascara los secretos', () => {
  it('pista, marcas y redirecciones', () => {
    const html = text(renderToStaticMarkup(
      <ResponseView
        initialTab="request"
        now={Date.now()}
        outcome={{
          envName: 'Staging', sentAt: Date.now(),
          preview: {
            method: 'GET', url: 'https://staging.example.com/u', body: null,
            headers: [{ name: 'Authorization', value: 'Bearer ••••…a1b2', secret: true, auto: false }, { name: 'User-Agent', value: 'Logday/1.1.0', secret: false, auto: true }],
          },
          output: output({ redirects: [{ status: 301, location: 'https://api.example.com/v2/u' }], droppedHeaders: ['Content-Length'] }),
        }}
      />,
    ));
    expect(html).toContain('GET https://staging.example.com/u');
    expect(html).toContain('Authorization: Bearer ••••…a1b2 secreto');
    expect(html).toContain('User-Agent: Logday/1.1.0 Agregada por Logday');
    expect(html).toContain('No enviada: Content-Length (la calcula Logday)');
    expect(html).toContain('Redirección: 301 → https://api.example.com/v2/u');
    expect(html).toContain('Staging · Enviada a las');
  });
});

describe('enviar (HT3, HT16, HT20, HT21)', () => {
  const send = (code: string, extra: Partial<Parameters<typeof store.sendRequest>[0]> = {}) =>
    store.sendRequest({ noteId: 'n1', blockIndex: 0, code, requestIndex: 0, ...extra });

  it('dibujar un bloque no envía nada', () => {
    block('POST https://x.com\n\n{}', 'header');
    block('POST https://x.com\n\n{}', 'footer');
    expect(rust.calls).toEqual([]);
  });

  it('con un error o una variable que falta no llega a Rust', async () => {
    expect(await send('GET https://x.com\nmal')).toBe('blocked');
    expect(await send('GET {{baseUrl}}')).toBe('blocked');
    expect(rust.calls).toEqual([]);
  });

  it('envía con las opciones y guarda la respuesta en memoria', async () => {
    setEnvs([STAGING], STAGING.id);
    app.extensions['http-client'].settings = { ...app.extensions['http-client'].settings, timeoutSec: 5, maxResponseMb: 2, followRedirects: false };
    rust.reply = async () => output();
    expect(await send('GET {{baseUrl}}/users\nAuthorization: Bearer {{token}}')).toBe('sent');
    const call = rust.calls[0];
    expect(call.url).toBe('https://staging.example.com/users');
    expect(call.headers).toContainEqual(['Authorization', 'Bearer {{$secret:v_ab12cd34}}']);
    expect(JSON.stringify(call)).not.toContain('a1b2');
    expect([call.timeoutMs, call.maxResponseBytes, call.followRedirects, call.allowUntrustedHost]).toEqual([5000, 2 * 1024 * 1024, false, false]);
    expect(call.trustedHosts).toEqual(['staging.example.com']);
    const hit = store.readResult('n1', 0, 0, parseHttpBlock('GET {{baseUrl}}/users\nAuthorization: Bearer {{token}}').requests[0]);
    expect(hit?.entry.value.response?.output.status).toBe(200);
    expect(store.blockState(store.httpApi.getState(), 'n1#0').inFlight).toBeNull();
  });

  it('entorno protegido: pide confirmar y solo después envía', async () => {
    setEnvs([PROD], PROD.id);
    rust.reply = async () => output();
    expect(await send('DELETE {{baseUrl}}/u/1')).toBe('confirm');
    expect(rust.calls).toEqual([]);
    expect(store.blockState(store.httpApi.getState(), 'n1#0').confirm?.reasons).toEqual([{ kind: 'protected', env: 'Producción' }]);
    expect(await send('DELETE {{baseUrl}}/u/1', { confirmed: true })).toBe('sent');
    expect(rust.calls).toHaveLength(1);
    expect(store.blockState(store.httpApi.getState(), 'n1#0').confirm).toBeNull();
    // GET en el mismo entorno no pregunta.
    expect(await send('GET {{baseUrl}}/u/1')).toBe('sent');
  });

  it('un secreto a un host ajeno: confirmar, y Rust recibe el permiso', async () => {
    setEnvs([STAGING], STAGING.id);
    rust.reply = async () => output();
    expect(await send('GET https://otro.com\nAuthorization: Bearer {{token}}')).toBe('confirm');
    expect(rust.calls).toEqual([]);
    expect(await send('GET https://otro.com\nAuthorization: Bearer {{token}}', { allowUntrusted: true })).toBe('sent');
    expect(rust.calls[0].allowUntrustedHost).toBe(true);
  });

  it('si Rust rechaza el host de un secreto, se pide la misma confirmación', async () => {
    setEnvs([STAGING], STAGING.id);
    const { toSendError } = await import('./core/api');
    rust.reply = async () => Promise.reject(toSendError({ code: 'secret_host_not_allowed', host: 'malo.com' }));
    expect(await send('GET https://staging.example.com\nX: {{token}}')).toBe('confirm');
    expect(store.blockState(store.httpApi.getState(), 'n1#0').confirm?.reasons).toEqual([{ kind: 'untrusted_host', host: 'malo.com', vars: ['token'] }]);
  });

  it('un error se guarda con la respuesta anterior; cancelar se anota', async () => {
    rust.reply = async () => output();
    await send('GET https://x.com');
    rust.reply = null;
    expect(await send('GET https://x.com')).toBe('failed');
    const req = parseHttpBlock('GET https://x.com').requests[0];
    const v = store.readResult('n1', 0, 0, req)!.entry.value;
    expect([v.response?.output.status, v.error?.error.code]).toEqual([200, 'connect']);
    const { toSendError } = await import('./core/api');
    rust.reply = async () => Promise.reject(toSendError({ code: 'cancelled' }));
    await send('GET https://x.com');
    expect(store.readResult('n1', 0, 0, req)!.entry.value).toMatchObject({ cancelled: true, error: null });
  });

  it('desactivar la extensión olvida las respuestas (R7, HT11)', async () => {
    rust.reply = async () => output();
    await send('GET https://x.com');
    expect(store.cache.size).toBe(1);
    store.resetAll();
    expect(store.cache.size).toBe(0);
  });
});

describe('Opciones → Cliente HTTP', () => {
  it('sin entornos: el vacío con "Crear un entorno"', () => {
    const html = text(renderToStaticMarkup(<Settings />));
    expect(html).toContain('Todavía no tienes entornos.');
    expect(html).toContain('Crear un entorno');
    // El pie lleva a la pantalla propia, no a DevTools (HT33).
    expect(html).toContain('Para probar una petición sin guardarla, usa la pantalla Cliente HTTP del menú lateral.');
    expect(html).toContain('Abrir Cliente HTTP');
    expect(html).not.toContain('DevTools');
    expect(html).toContain('Tiempo límite');
  });

  it('con entornos: pestañas, variables, secretos con su pista y hosts', () => {
    setEnvs([STAGING, { ...PROD, vars: [{ name: 'apiKey', secret: false, value: '' }], extraHosts: ['auth.example.com'] }], STAGING.id);
    const html = renderToStaticMarkup(<Settings />);
    const t = text(html);
    expect(html).toContain('role="tablist"');
    expect(t).toContain('Staging');
    expect(t).toContain('(activo)');
    expect(t).toContain('(protegido)');
    expect(t).toContain('••••…a1b2');
    expect(t).toContain('Cambiar');
    expect(t).toContain('staging.example.com de baseUrl');
    expect(t).toContain('Pedir confirmación antes de enviar POST, PUT, PATCH o DELETE');
    expect(html).toContain('aria-label="Nombre de la variable 1"');
  });
});
