import { describe, expect, it } from 'vitest';
import { setRequestMethod } from './edit';
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
