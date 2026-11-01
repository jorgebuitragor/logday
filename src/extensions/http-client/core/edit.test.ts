import { describe, expect, it } from 'vitest';
import { setRequestMethod, shellQuote, toCurl } from './edit';
import { parseHttpBlock } from './parse';

describe('setRequestMethod (HT36)', () => {
  it('cambia solo el método: la URL, la versión, las cabeceras y el cuerpo quedan', () => {
    const code = 'GET https://x.com/a HTTP/1.1\nAccept: */*\n\n{"a":1}';
    expect(setRequestMethod(code, 0, 'POST')).toBe('POST https://x.com/a HTTP/1.1\nAccept: */*\n\n{"a":1}');
  });

  it('con varias peticiones (###) cambia la indicada, con comentarios antes de su línea', () => {
    const code = [
      '### Listar',
      'GET {{baseUrl}}/users',
      '',
      '### Crear',
      '# un comentario',
      '// otro',
      'post {{baseUrl}}/users',
      'Content-Type: application/json',
      '',
      '{ "name": "Ana" }',
    ].join('\n');
    const out = setRequestMethod(code, 1, 'PUT');
    expect(out.split('\n')[6]).toBe('PUT {{baseUrl}}/users');
    expect(out.split('\n').filter((_l, i) => i !== 6)).toEqual(code.split('\n').filter((_l, i) => i !== 6));
    expect(setRequestMethod(code, 0, 'DELETE').split('\n')[1]).toBe('DELETE {{baseUrl}}/users');
  });

  it('una línea que es solo una URL recibe el método delante, con su sangría', () => {
    expect(setRequestMethod('https://x.com', 0, 'POST')).toBe('POST https://x.com');
    expect(setRequestMethod('  {{baseUrl}}/a', 0, 'PATCH')).toBe('  PATCH {{baseUrl}}/a');
    // Ya era un GET.
    expect(setRequestMethod('https://x.com', 0, 'GET')).toBe('https://x.com');
  });

  it('minúsculas: el mismo método no se toca; otro se escribe en mayúsculas', () => {
    expect(setRequestMethod('get https://x.com', 0, 'GET')).toBe('get https://x.com');
    expect(setRequestMethod('get https://x.com', 0, 'HEAD')).toBe('HEAD https://x.com');
  });

  it('un método no admitido se reemplaza (así se corrige el error)', () => {
    const out = setRequestMethod('FETCH https://x.com', 0, 'GET');
    expect(out).toBe('GET https://x.com');
    expect(parseHttpBlock(out).requests[0].issues).toEqual([]);
  });

  it('a GET o HEAD con cuerpo: el cuerpo se queda y el parser avisa', () => {
    const out = setRequestMethod('POST https://x.com\n\nhola', 0, 'GET');
    expect(out).toBe('GET https://x.com\n\nhola');
    expect(parseHttpBlock(out).requests[0].issues.map((i) => i.code)).toEqual(['get_with_body']);
    expect(parseHttpBlock(setRequestMethod(out, 0, 'HEAD')).requests[0].issues.map((i) => i.code)).toEqual(['head_with_body']);
  });

  it('sin nada que cambiar devuelve el mismo texto', () => {
    expect(setRequestMethod('POST https://x.com', 0, 'POST')).toBe('POST https://x.com');
    expect(setRequestMethod('GET https://x.com', 3, 'POST')).toBe('GET https://x.com');
    expect(setRequestMethod('mal', 0, 'POST')).toBe('mal');
    expect(setRequestMethod('', 0, 'POST')).toBe('');
  });
});

describe('toCurl (HT37)', () => {
  const curl = (code: string, i = 0) => toCurl(parseHttpBlock(code).requests[i]);

  it('método, URL, cabeceras y cuerpo, una opción por línea', () => {
    expect(curl('POST https://x.com/users\nAccept: */*\nContent-Type: application/json\n\n{"name":"Ana"}')).toBe([
      "curl -X POST 'https://x.com/users'",
      "-H 'Accept: */*'",
      "-H 'Content-Type: application/json'",
      `--data-raw '{"name":"Ana"}'`,
    ].join(' \\\n  '));
  });

  it('las variables y los secretos quedan como {{nombre}}, nunca con su valor', () => {
    const out = curl('GET {{baseUrl}}/me\nAuthorization: Bearer {{token}}');
    expect(out).toContain("'{{baseUrl}}/me'");
    expect(out).toContain("-H 'Authorization: Bearer {{token}}'");
  });

  it('escapa las comillas simples y deja los saltos de línea del cuerpo', () => {
    const out = curl("PUT https://x.com/a?q=it's\nX-Note: l'eau\n\nlínea 1\nit's");
    expect(out).toContain(`'https://x.com/a?q=it'\\''s'`);
    expect(out).toContain(`-H 'X-Note: l'\\''eau'`);
    expect(out).toContain(`--data-raw 'línea 1\nit'\\''s'`);
    expect(shellQuote("a'b")).toBe(`'a'\\''b'`);
  });

  it('el Content-Type JSON que agrega Logday, si falta', () => {
    expect(curl('POST https://x.com\n\n{"a":1}')).toContain("-H 'Content-Type: application/json'");
    expect(curl('POST https://x.com\n\nhola')).not.toContain('Content-Type');
  });

  it('HEAD va con --head y sin cuerpo; GET con cuerpo lo lleva', () => {
    expect(curl('HEAD https://x.com\n\nnada')).toBe("curl --head 'https://x.com'");
    expect(curl('GET https://x.com\n\nq')).toContain("--data-raw 'q'");
  });

  it('la petición de un bloque con ###, y la query en líneas ? y &', () => {
    expect(curl('### A\nGET https://x.com/a\n\n### B\nDELETE https://x.com/b\n?id=1\n&force=true', 1))
      .toBe("curl -X DELETE 'https://x.com/b?id=1&force=true'");
  });
});
