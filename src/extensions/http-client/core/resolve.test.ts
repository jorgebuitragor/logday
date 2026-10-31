import { describe, expect, it } from 'vitest';
import { parseHttpBlock } from './parse';
import { checkUrl, resolveRequest, type ResolveContext } from './resolve';
import type { HttpEnvironment } from './environments';

const env: HttpEnvironment = {
  id: 'e_00000001',
  name: 'Staging',
  protected: false,
  insecureTls: false,
  extraHosts: ['auth.example.com'],
  vars: [
    { name: 'baseUrl', secret: false, value: 'https://staging.example.com' },
    { name: 'token', secret: true, key: 'v_ab12cd34', hint: '…a1b2' },
    { name: 'apiUrl', secret: true, key: 'v_00ff00ff', hint: 'secret.example.com …9z9z' },
    { name: 'vacio', secret: true, key: 'v_11111111', hint: null },
    { name: 'anidada', secret: false, value: '{{token}}' },
  ],
};

const ctx = (e: HttpEnvironment | null = env): ResolveContext => ({
  env: e,
  now: () => new Date('2026-10-31T14:05:00.000Z'),
  uuid: () => '11111111-2222-4333-8444-555555555555',
  userAgent: 'Logday/1.1.0',
});

const req = (code: string) => parseHttpBlock(code).requests[0];

describe('resolución de variables (HT15, HT16)', () => {
  it('normales, secretas como marca y del sistema', () => {
    const r = resolveRequest(req('POST {{baseUrl}}/u?id={{$uuid}}&t={{$timestamp}}\nAuthorization: Bearer {{token}}\nX-At: {{$isoTimestamp}}\n\n{"id":"{{$uuid}}"}'), ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wire.url).toBe('https://staging.example.com/u?id=11111111-2222-4333-8444-555555555555&t=1793455500');
    expect(r.wire.headers).toContainEqual(['Authorization', 'Bearer {{$secret:v_ab12cd34}}']);
    expect(r.wire.headers).toContainEqual(['X-At', '2026-10-31T14:05:00.000Z']);
    // El mismo {{$uuid}} en toda la petición.
    expect(r.wire.body).toBe('{"id":"11111111-2222-4333-8444-555555555555"}');
    expect(r.secrets).toEqual(['token']);
    expect(r.host).toBe('staging.example.com');
  });

  it('la vista enmascara los secretos con su pista y marca lo automático', () => {
    const r = resolveRequest(req('POST {{baseUrl}}/u\nAuthorization: Bearer {{token}}\n\n{"a":1}'), ctx());
    if (!r.ok) throw new Error('no resolvió');
    expect(r.preview.headers).toEqual([
      { name: 'Authorization', value: 'Bearer ••••…a1b2', secret: true, auto: false },
      { name: 'Content-Type', value: 'application/json', secret: false, auto: true },
      { name: 'User-Agent', value: 'Logday/1.1.0', secret: false, auto: true },
    ]);
    expect(JSON.stringify(r.preview)).not.toContain('$secret');
  });

  it('Content-Type automático solo con JSON válido y sin Content-Type', () => {
    const types = (code: string) => {
      const r = resolveRequest(req(code), ctx());
      return r.ok ? r.wire.headers.filter(([n]) => n.toLowerCase() === 'content-type').map(([, v]) => v) : null;
    };
    expect(types('POST {{baseUrl}}\n\nno es json')).toEqual([]);
    expect(types('POST {{baseUrl}}\ncontent-type: text/plain\n\n{}')).toEqual(['text/plain']);
    expect(types('POST {{baseUrl}}\n\n[1,2]')).toEqual(['application/json']);
  });

  it('sin anidación: un valor con {{…}} queda como texto', () => {
    const r = resolveRequest(req('GET {{baseUrl}}\nX: {{anidada}}'), ctx());
    if (!r.ok) throw new Error('no resolvió');
    expect(r.wire.headers[0]).toEqual(['X', '{{token}}']);
    expect(r.secrets).toEqual([]);
  });

  it('variables que faltan, secretos sin valor y del sistema desconocidas', () => {
    expect(resolveRequest(req('GET {{baseUrl}}/{{nada}}\nA: {{vacio}}\nB: {{$otra}}'), ctx())).toEqual({
      ok: false, missing: ['nada'], emptySecrets: ['vacio'], unknownSystem: ['$otra'],
    });
    expect(resolveRequest(req('GET {{baseUrl}}'), ctx(null))).toMatchObject({ ok: false, missing: ['baseUrl'] });
    // Sin variables, sin entorno se envía igual.
    expect(resolveRequest(req('GET https://x.com'), ctx(null)).ok).toBe(true);
  });

  it('HEAD no lleva cuerpo', () => {
    const r = resolveRequest(req('HEAD https://x.com\n\nhola'), ctx());
    expect(r.ok && r.wire.body).toBe(null);
  });
});

describe('URL después de poner las variables (HT23)', () => {
  it('solo http y https, sin credenciales', () => {
    expect(checkUrl('https://x.com/a')).toEqual({ host: 'x.com' });
    expect(checkUrl('http://LOCALHOST:8080')).toEqual({ host: 'localhost' });
    expect(checkUrl('ftp://x.com').error).toBe('scheme_not_allowed');
    expect(checkUrl('file:///etc/passwd').error).toBe('scheme_not_allowed');
    expect(checkUrl('https://u:p@x.com').error).toBe('credentials_in_url');
    expect(checkUrl('no es url').error).toBe('invalid_url');
    expect(resolveRequest(req('GET ftp://x.com'), ctx())).toMatchObject({ ok: false, urlError: 'scheme_not_allowed' });
  });

  it('con un secreto en el host, el host lo comprueba Rust', () => {
    expect(checkUrl('{{$secret:v_00ff00ff}}/users')).toEqual({ host: null });
    expect(checkUrl('https://{{$secret:v_00ff00ff}}/users')).toEqual({ host: null });
    expect(checkUrl('https://x.com/{{$secret:v_00ff00ff}}')).toEqual({ host: 'x.com' });
  });
});

describe('confirmaciones (HT20, HT21)', () => {
  it('entorno protegido: solo POST, PUT, PATCH y DELETE', () => {
    const prot = { ...env, protected: true };
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const r = resolveRequest(req(`${m} {{baseUrl}}`), ctx(prot));
      expect(r.ok && r.needsConfirm).toEqual([{ kind: 'protected', env: 'Staging' }]);
    }
    for (const m of ['GET', 'HEAD', 'OPTIONS']) {
      const r = resolveRequest(req(`${m} {{baseUrl}}`), ctx(prot));
      expect(r.ok && r.needsConfirm).toEqual([]);
    }
  });

  it('un secreto a un host que no es de confianza pide confirmar', () => {
    const r = resolveRequest(req('GET https://otro-host.com\nAuthorization: Bearer {{token}}'), ctx());
    expect(r.ok && r.needsConfirm).toEqual([{ kind: 'untrusted_host', host: 'otro-host.com', vars: ['token'] }]);
    // Los de las variables con URL, de las pistas de secretos URL y los agregados a mano, no.
    for (const host of ['staging.example.com', 'secret.example.com', 'auth.example.com']) {
      const ok = resolveRequest(req(`GET https://${host}/x\nAuthorization: Bearer {{token}}`), ctx());
      expect(ok.ok && ok.needsConfirm).toEqual([]);
    }
  });

  it('los dos motivos juntos', () => {
    const r = resolveRequest(req('POST https://otro.com\nA: {{token}}'), ctx({ ...env, protected: true }));
    expect(r.ok && r.needsConfirm.map((c) => c.kind)).toEqual(['protected', 'untrusted_host']);
  });
});
