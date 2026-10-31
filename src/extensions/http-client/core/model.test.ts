// Entornos, vista del cuerpo, caché y textos del Cliente HTTP.
import { describe, expect, it } from 'vitest';
import { sectionKeys, t } from '../../../lib/i18n';
import {
  DEFAULT_SETTINGS, defaultEnvName, duplicateEnvironment, envNameError, isValidHost, looksSecret, maskOf,
  readHttpSettings, secretKeysOf, trustedHosts, varNameError, type HttpEnvironment,
} from './environments';
import { chooseBodyView, defaultFileName, DISPLAY_LIMIT } from './body';
import { cacheKey, ResponseCache } from './cache';
import { sendErrorMessage, toSendError } from './api';
import { formatElapsed, listVars, makeTr } from './text';

const env = (over: Partial<HttpEnvironment> = {}): HttpEnvironment => ({
  id: 'e_00000001', name: 'Local', protected: false, insecureTls: false, extraHosts: [], vars: [], ...over,
});

describe('ajustes y entornos (HT17–HT22)', () => {
  it('sin ajustes, los de por defecto', () => {
    expect(readHttpSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('descarta lo que no es válido sin romper y ajusta los rangos', () => {
    const s = readHttpSettings({
      activeEnvId: 'e_00000002',
      timeoutSec: 9999,
      maxResponseMb: 0,
      followRedirects: false,
      environments: [
        { id: 'e_00000001', name: 'Local', vars: [
          { name: 'baseUrl', secret: false, value: 'http://localhost:8080' },
          { name: 'baseUrl', secret: false, value: 'repetida' },
          { name: '1mal', secret: false, value: 'x' },
          { name: 'token', secret: true, key: 'v_ab12cd34', hint: '…a1b2' },
          { name: 'otro', secret: true, key: 'malo' },
        ], extraHosts: ['API.example.com', 'https://no', 'api.example.com'] },
        { id: 'e_00000002', name: 'local' },
        { id: 'roto', name: 'X' },
        'basura',
      ],
    });
    expect(s.environments).toHaveLength(1);
    expect(s.environments[0].vars.map((v) => v.name)).toEqual(['baseUrl', 'token']);
    expect(s.environments[0].extraHosts).toEqual(['api.example.com']);
    expect(s.activeEnvId).toBeNull();
    expect([s.timeoutSec, s.maxResponseMb, s.followRedirects]).toEqual([300, 1, false]);
  });

  it('nombres de entornos y variables', () => {
    const envs = [env(), env({ id: 'e_00000002', name: 'Staging' })];
    expect(envNameError(envs, '  ', null)).toBe('empty');
    expect(envNameError(envs, 'STAGING', null)).toBe('duplicate');
    expect(envNameError(envs, 'Staging', 'e_00000002')).toBeNull();
    expect(defaultEnvName(envs, (n) => `Entorno ${n}`)).toBe('Entorno 3');
    const e = env({ vars: [{ name: 'a', secret: false, value: '' }] });
    expect(varNameError(e, 'a', null)).toBe('duplicate');
    expect(varNameError(e, 'a', 0)).toBeNull();
    expect(varNameError(e, '$uuid', null)).toBe('invalid');
    expect(varNameError(e, 'api.key-2', null)).toBeNull();
  });

  it('duplicar copia lo no secreto y deja los secretos sin valor y con otra clave', () => {
    const src = env({ protected: true, vars: [
      { name: 'baseUrl', secret: false, value: 'https://x.com' },
      { name: 'token', secret: true, key: 'v_ab12cd34', hint: '…a1b2' },
    ] });
    const copy = duplicateEnvironment(src, 'Local 2', () => 0.5);
    expect(copy.id).not.toBe(src.id);
    expect(copy.protected).toBe(true);
    expect(copy.vars[0]).toEqual(src.vars[0]);
    expect(copy.vars[1]).toMatchObject({ name: 'token', secret: true, hint: null });
    expect(secretKeysOf(copy)).not.toEqual(secretKeysOf(src));
  });

  it('hosts de confianza: de las URL, de las pistas de secretos y los agregados', () => {
    const e = env({
      extraHosts: ['auth.example.com'],
      vars: [
        { name: 'baseUrl', secret: false, value: 'https://API.example.com:8443/v1' },
        { name: 'nota', secret: false, value: 'no es url' },
        { name: 'hook', secret: true, key: 'v_ab12cd34', hint: 'hooks.example.com …a1b2' },
        { name: 'token', secret: true, key: 'v_00000000', hint: '…zz99' },
      ],
    });
    expect(trustedHosts(e)).toEqual([
      { host: 'api.example.com', from: 'baseUrl' },
      { host: 'hooks.example.com', from: 'hook' },
      { host: 'auth.example.com', from: null },
    ]);
    expect(trustedHosts(null)).toEqual([]);
    expect(isValidHost('api.example.com')).toBe(true);
    expect(isValidHost('https://x.com')).toBe(false);
    expect(isValidHost('x.com/a')).toBe(false);
  });

  it('la pista enmascarada y la sugerencia de secreto', () => {
    expect(maskOf('hooks.example.com …a1b2')).toBe('••••…a1b2');
    expect(maskOf('…a1b2')).toBe('••••…a1b2');
    expect(maskOf(null)).toBe('••••');
    expect(looksSecret('apiKey')).toBe(true);
    expect(looksSecret('baseUrl')).toBe(false);
  });
});

describe('vista del cuerpo (HT10, HT12, HT53)', () => {
  const h = (ct: string): [string, string][] => [['content-type', ct]];

  it('JSON y XML se formatean; si no son válidos, tal cual con aviso', () => {
    expect(chooseBodyView({ kind: 'text', text: '{"a":1}', lossy: false }, h('application/json'))).toMatchObject({ language: 'json', pretty: '{\n  "a": 1\n}', invalid: null });
    expect(chooseBodyView({ kind: 'text', text: '{a', lossy: false }, h('application/json'))).toMatchObject({ pretty: null, invalid: 'json' });
    expect(chooseBodyView({ kind: 'text', text: '<a><b/></a>', lossy: false }, h('application/xml'))).toMatchObject({ language: 'xml', invalid: null });
    expect(chooseBodyView({ kind: 'text', text: '<a>', lossy: false }, h('text/xml'))).toMatchObject({ invalid: 'xml' });
    // Sin tipo, si parece JSON se intenta; si no lo es, sin aviso.
    expect(chooseBodyView({ kind: 'text', text: '[1]', lossy: false }, [])).toMatchObject({ language: 'json' });
    expect(chooseBodyView({ kind: 'text', text: '[1', lossy: false }, [])).toMatchObject({ invalid: null });
  });

  it('HTML por el content-type (HT53): se marca para la vista previa, sin formatear aquí', () => {
    const t = (text: string) => ({ kind: 'text' as const, text, lossy: false });
    expect(chooseBodyView(t('<script>x</script>'), h('text/html; charset=utf-8'))).toMatchObject({ kind: 'text', language: 'xml', pretty: null, invalid: null, html: true });
    // XHTML termina en +xml, pero es una página, no XML que formatear.
    expect(chooseBodyView(t('<html><body/></html>'), h('application/xhtml+xml'))).toMatchObject({ html: true, invalid: null });
    expect(chooseBodyView(t('<a><b/></a>'), h('application/xml'))).toMatchObject({ html: false });
    expect(chooseBodyView(t('{"a":1}'), h('application/json'))).toMatchObject({ html: false });
  });

  it('HTML por el contenido, solo sin content-type', () => {
    const t = (text: string) => ({ kind: 'text' as const, text, lossy: false });
    expect(chooseBodyView(t('<!DOCTYPE html><p>hola'), [])).toMatchObject({ html: true });
    expect(chooseBodyView(t('\uFEFF\n  <html lang="es"><body>x</body></html>'), [])).toMatchObject({ html: true });
    expect(chooseBodyView(t('<!doctype html>'), [])).toMatchObject({ html: true });
    // Con otro tipo declarado manda el tipo; y un fragmento no es una página.
    expect(chooseBodyView(t('<!doctype html><p>x'), h('text/plain'))).toMatchObject({ html: false, language: null });
    expect(chooseBodyView(t('<p>hola</p>'), [])).toMatchObject({ html: false });
    expect(chooseBodyView(t('<htmlx>'), [])).toMatchObject({ html: false });
    expect(chooseBodyView(t('hola <html>'), [])).toMatchObject({ html: false });
  });

  it('HTML de más de 2 MB: se marca igual, con lo que se muestra', () => {
    const v = chooseBodyView({ kind: 'text', text: `<html>${'a'.repeat(DISPLAY_LIMIT)}`, lossy: true }, h('text/html'));
    expect(v).toMatchObject({ kind: 'text', html: true, partial: true, lossy: true });
    expect(v.kind === 'text' && v.raw.length).toBe(DISPLAY_LIMIT);
  });

  it('más de 2 MB: se muestra cortado y sin formatear', () => {
    const v = chooseBodyView({ kind: 'text', text: `[${'1,'.repeat(DISPLAY_LIMIT)}1]`, lossy: false }, h('application/json'));
    expect(v).toMatchObject({ kind: 'text', partial: true, pretty: null, invalid: null });
    expect(v.kind === 'text' && v.raw.length).toBe(DISPLAY_LIMIT);
  });

  it('imágenes hasta 5 MB, y el resto binario', () => {
    expect(chooseBodyView({ kind: 'binary', base64: 'AQID' }, h('image/png'))).toEqual({ kind: 'image', mime: 'image/png', base64: 'AQID', bytes: 3 });
    expect(chooseBodyView({ kind: 'binary', base64: 'AQID' }, h('application/pdf'))).toMatchObject({ kind: 'binary', mime: 'application/pdf' });
    expect(chooseBodyView({ kind: 'binary', base64: 'A'.repeat(8 * 1024 * 1024) }, h('image/png')).kind).toBe('binary');
    expect(chooseBodyView({ kind: 'empty' }, []).kind).toBe('empty');
  });

  it('el nombre del archivo al guardar', () => {
    expect(defaultFileName('https://x.com/files/informe.pdf', 'application/pdf', 'respuesta')).toBe('informe.pdf');
    expect(defaultFileName('https://x.com/users', 'application/json', 'respuesta')).toBe('users.json');
    expect(defaultFileName('https://x.com/', 'image/png', 'respuesta')).toBe('respuesta.png');
    expect(defaultFileName('{{$secret:v_ab12cd34}}', 'text/plain', 'respuesta')).toBe('respuesta.txt');
  });
});

describe('caché de respuestas (HT11, design A8)', () => {
  const entry = (bytes: number, source = 's', firstLine = 'GET /a') => ({ source, firstLine, value: bytes, bytes, at: 0 });

  it('la clave cuenta el bloque y la petición', () => {
    expect(cacheKey('n1', 0, 2)).toBe('n1#0#2');
  });

  it('otra petición en ese lugar no se muestra; la misma con cambios, sí, marcada', () => {
    const c = new ResponseCache<number>();
    c.set('k', entry(1, 'GET /a\nA: 1'));
    expect(c.get('k', 'GET /b', 'x')).toBeNull();
    expect(c.get('k', 'GET /a', 'GET /a\nA: 1')).toMatchObject({ stale: false });
    expect(c.get('k', 'GET /a', 'GET /a\nA: 2')).toMatchObject({ stale: true });
  });

  it('tope de entradas y de bytes: se olvidan las más viejas', () => {
    const c = new ResponseCache<number>(3, 100);
    for (const k of ['a', 'b', 'c', 'd']) c.set(k, entry(10));
    expect(c.get('a', 'GET /a', 's')).toBeNull();
    expect(c.size).toBe(3);
    // Leer una la hace reciente: con la nueva, se van c y d, no b.
    c.get('b', 'GET /a', 's');
    c.set('e', entry(90));
    expect(c.get('c', 'GET /a', 's')).toBeNull();
    expect(c.get('d', 'GET /a', 's')).toBeNull();
    expect(c.get('b', 'GET /a', 's')).not.toBeNull();
    expect(c.bytes).toBeLessThanOrEqual(100);
    expect(c.get('e', 'GET /a', 's')).not.toBeNull();
    // Una sola más grande que el tope se queda, sola.
    c.set('f', entry(500));
    expect(c.size).toBe(1);
    c.delete('f');
    expect([c.size, c.bytes]).toEqual([0, 0]);
    c.set('g', entry(1));
    c.clear();
    expect([c.size, c.bytes]).toEqual([0, 0]);
  });
});

describe('textos (HT26, HT29)', () => {
  it('es y en tienen las mismas claves', () => {
    expect(sectionKeys('en', 'httpClient').sort()).toEqual(sectionKeys('es', 'httpClient').sort());
  });

  it('sin voseo en español', () => {
    for (const key of sectionKeys('es', 'httpClient')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = t('es', 'httpClient', key as any);
      expect(text, key).not.toMatch(/\b(querés|podés|tenés|activá|configurá|pegá|usás|escribí|elegí|revisá|probá|agregá|creá|definí|esperá|volvé|subí)\b/i);
    }
  });

  it('cada código de error de Rust tiene su texto, con el host como único detalle', () => {
    const tr = makeTr('es');
    const codes = ['invalid_method', 'body_too_large', 'invalid_header', 'too_many_in_flight', 'secret_missing', 'keychain_error', 'invalid_url', 'scheme_not_allowed', 'credentials_in_url', 'secret_host_not_allowed', 'timeout', 'dns', 'tls', 'connect', 'network', 'too_many_redirects', 'cancelled'];
    for (const code of codes) {
      const msg = sendErrorMessage(tr, toSendError({ code, host: 'localhost', tlsReason: 'unknown_issuer' }), { envName: 'Staging', timeoutSec: 30 });
      expect(msg, code).not.toMatch(/^err\./);
      expect(msg, code).not.toContain('{');
    }
    expect(sendErrorMessage(tr, toSendError({ code: 'connect', host: 'localhost:8080' }), { envName: 'X', timeoutSec: 30 })).toContain('localhost:8080');
    expect(sendErrorMessage(tr, toSendError({ code: 'tls', host: 'x.com', tlsReason: 'expired' }), { envName: 'X', timeoutSec: 30 })).toBe('El certificado de x.com no es válido: está vencido.');
    // Algo raro del puente es un error de red.
    expect(toSendError('boom').code).toBe('network');
  });

  it('listas de variables, tiempos y plurales', () => {
    const tr = makeTr('es');
    expect(listVars(tr, ['a'])).toBe('{{a}}');
    expect(listVars(tr, ['a', 'b', 'c'])).toBe('{{a}}, {{b}} y {{c}}');
    expect(tr('varMissing', { n: 2, vars: '{{a}} y {{b}}', env: 'Staging' })).toBe('Faltan las variables {{a}} y {{b}} en Staging.');
    expect(makeTr('en')('varMissing', { n: 1, vars: '{{a}}', env: 'Staging' })).toBe('The variable {{a}} is missing in Staging.');
    expect(formatElapsed(143, 'es')).toBe('143 ms');
    expect(formatElapsed(2400, 'es')).toBe('2,4 s');
  });
});
