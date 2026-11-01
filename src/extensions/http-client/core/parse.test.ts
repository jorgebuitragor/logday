import { describe, expect, it } from 'vitest';
import { hasErrors, parseHttpBlock, requestAtOffset, requestLabel, variablesOf } from './parse';

const one = (code: string) => {
  const r = parseHttpBlock(code);
  expect(r.requests).toHaveLength(1);
  return r.requests[0];
};

describe('parser del bloque http (HT5–HT7)', () => {
  it('método, URL, cabeceras y cuerpo', () => {
    const req = one('POST https://api.example.com/users\nContent-Type: application/json\nX-Uno:  1 \n\n{ "name": "Ana" }\n');
    expect(req.method).toBe('POST');
    expect(req.url).toBe('https://api.example.com/users');
    expect(req.headers).toEqual([
      { name: 'Content-Type', value: 'application/json', line: 2 },
      { name: 'X-Uno', value: '1', line: 3 },
    ]);
    expect(req.body).toBe('{ "name": "Ana" }');
    expect(req.issues).toEqual([]);
    expect(req.firstLine).toBe('POST https://api.example.com/users');
  });

  it('el método en minúsculas y HTTP/1.1 al final', () => {
    const req = one('get https://x.com/a HTTP/1.1');
    expect(req.method).toBe('GET');
    expect(req.url).toBe('https://x.com/a');
  });

  it('una línea que es solo una URL es un GET', () => {
    expect(one('https://x.com/a').method).toBe('GET');
    const v = one('{{baseUrl}}/users');
    expect([v.method, v.url]).toEqual(['GET', '{{baseUrl}}/users']);
  });

  it('las líneas ? y & siguen la query', () => {
    const req = one('GET https://x.com/search\n  ?q=hola\n  &page=2\nAccept: */*');
    expect(req.url).toBe('https://x.com/search?q=hola&page=2');
    expect(req.headers.map((h) => h.name)).toEqual(['Accept']);
  });

  it('comentarios antes de la petición, entre cabeceras y en el cuerpo', () => {
    const req = one('# un comentario\n// otro\nGET https://x.com\n# entre cabeceras\nAccept: */*\n\n# esto es cuerpo\nhola');
    expect(req.headers).toHaveLength(1);
    expect(req.body).toBe('# esto es cuerpo\nhola');
    expect(req.issues.map((i) => i.code)).toEqual(['get_with_body']);
  });

  it('un cuerpo con líneas en blanco en medio, sin las del final', () => {
    const req = one('POST https://x.com\n\nuno\n\ndos\n\n\n');
    expect(req.body).toBe('uno\n\ndos');
  });

  it('\\r\\n se normaliza', () => {
    const req = one('POST https://x.com\r\nA: 1\r\n\r\ncuerpo\r\n');
    expect(req.headers[0]).toEqual({ name: 'A', value: '1', line: 2 });
    expect(req.body).toBe('cuerpo');
  });

  it('varias peticiones con ###, con y sin nombre, y secciones vacías', () => {
    const r = parseHttpBlock('GET https://x.com/a\n\n### Crear usuario\nPOST https://x.com/u\n\n{}\n###\n\n### \n');
    expect(r.requests.map((q) => [q.name, q.method, q.startLine, q.endLine])).toEqual([
      [null, 'GET', 1, 1],
      ['Crear usuario', 'POST', 3, 6],
    ]);
    expect(r.issues).toEqual([]);
    expect(requestLabel(r.requests[0])).toBe('GET /a');
    expect(requestLabel(r.requests[1])).toBe('Crear usuario');
  });

  it('un bloque vacío o solo con comentarios', () => {
    expect(parseHttpBlock('').issues).toEqual([{ code: 'empty_block', line: 1, severity: 'error' }]);
    expect(parseHttpBlock('# nada\n\n###\n').issues.map((i) => i.code)).toEqual(['empty_block']);
  });

  it('errores con su línea: método, línea de petición y cabecera', () => {
    expect(one('FETCH https://x.com').issues).toEqual([{ code: 'unsupported_method', line: 1, severity: 'error', detail: 'FETCH' }]);
    expect(one('\n\nhola').issues).toEqual([{ code: 'missing_request_line', line: 3, severity: 'error' }]);
    const bad = one('GET https://x.com\nAccept */*\nOk: 1');
    expect(bad.issues).toEqual([{ code: 'invalid_header', line: 2, severity: 'error' }]);
    expect(hasErrors(bad.issues)).toBe(true);
  });

  it('GET y HEAD con cuerpo son avisos, no errores', () => {
    const get = one('GET https://x.com\n\nhola');
    expect(get.issues).toEqual([{ code: 'get_with_body', line: 3, severity: 'warn' }]);
    expect(hasErrors(get.issues)).toBe(false);
    expect(one('HEAD https://x.com\n\nhola').issues.map((i) => i.code)).toEqual(['head_with_body']);
  });

  it('más de 20 peticiones: se analizan las 20 primeras', () => {
    const code = Array.from({ length: 22 }, (_, i) => `### p${i}\nGET https://x.com/${i}`).join('\n');
    const r = parseHttpBlock(code);
    expect(r.requests).toHaveLength(20);
    expect(r.issues).toEqual([{ code: 'too_many_requests', line: 41, severity: 'error' }]);
  });

  it('{{$secret: escrito a mano es de uso interno', () => {
    expect(one('GET https://x.com\nAuthorization: {{$secret:v_ab12cd34}}').issues).toEqual([
      { code: 'reserved_syntax', line: 2, severity: 'error' },
    ]);
  });

  it('variables: sin repetir, en orden; las llaves sin cerrar quedan como texto', () => {
    const req = one('POST {{baseUrl}}/u/{{ id }}?x={{$uuid}}\nAuthorization: Bearer {{token}}\n\n{"a":"{{id}}","b":"{{sin cerrar"}');
    expect(variablesOf(req)).toEqual(['baseUrl', 'id', '$uuid', 'token']);
    expect(variablesOf(one('GET https://x.com/{{a b}}'))).toEqual([]);
  });

  it('requestAtOffset en los bordes de cada sección', () => {
    const code = 'GET https://x.com/a\n\n### dos\nGET https://x.com/b\n### tres\nGET https://x.com/c';
    const { requests } = parseHttpBlock(code);
    const at = (needle: string) => code.indexOf(needle);
    expect(requestAtOffset(requests, code, 0)).toBe(0);
    expect(requestAtOffset(requests, code, at('### dos') - 1)).toBe(0);
    expect(requestAtOffset(requests, code, at('### dos'))).toBe(1);
    expect(requestAtOffset(requests, code, at('GET https://x.com/b') + 3)).toBe(1);
    expect(requestAtOffset(requests, code, at('### tres'))).toBe(2);
    expect(requestAtOffset(requests, code, code.length)).toBe(2);
    expect(requestAtOffset([], '', 0)).toBe(-1);
  });

  it('source cambia si cambia la petición, no por espacios al final', () => {
    const a = one('GET https://x.com\nA: 1');
    const b = one('GET https://x.com   \nA: 1\n\n');
    const c = one('GET https://x.com\nA: 2');
    expect(a.source).toBe(b.source);
    expect(a.source).not.toBe(c.source);
    expect(a.firstLine).toBe(c.firstLine);
  });
});
