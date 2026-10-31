// El formulario de DevTools ↔ el texto de un bloque ```http (HT28).
import { describe, expect, it } from 'vitest';
import { formatFence, parseFencedBlocks } from '../../../lib/fencedBlocks';
import { parseHttpBlock } from './parse';
import { bodySplitsRequest, EMPTY_FORM, formFromBlock, formIssues, serializeForm, type HttpForm } from './serialize';

const form = (over: Partial<HttpForm>): HttpForm => ({ ...EMPTY_FORM, ...over });

describe('formulario → bloque', () => {
  it('método, URL, cabeceras y cuerpo, como se escribirían en una nota', () => {
    const { code } = serializeForm(form({
      method: 'POST',
      url: ' {{baseUrl}}/users ',
      headers: 'Content-Type: application/json\n\nAuthorization: Bearer {{token}}\n',
      body: '\n{ "name": "Ana" }\n\n',
    }));
    expect(code).toBe('POST {{baseUrl}}/users\nContent-Type: application/json\nAuthorization: Bearer {{token}}\n\n{ "name": "Ana" }');
    const req = parseHttpBlock(code).requests[0];
    expect([req.method, req.url, req.headers.map((h) => h.name), req.body]).toEqual([
      'POST', '{{baseUrl}}/users', ['Content-Type', 'Authorization'], '{ "name": "Ana" }',
    ]);
  });

  it('sin cabeceras, el cuerpo va tras una línea en blanco; con HEAD no va', () => {
    expect(serializeForm(form({ method: 'PUT', url: 'https://x.com', body: 'hola' })).code).toBe('PUT https://x.com\n\nhola');
    expect(serializeForm(form({ method: 'HEAD', url: 'https://x.com', body: 'hola' })).code).toBe('HEAD https://x.com');
    expect(serializeForm(form({ url: 'https://x.com' })).code).toBe('GET https://x.com');
  });

  it('los problemas dicen la línea de su campo, no la del bloque', () => {
    const s = serializeForm(form({ url: 'https://x.com', headers: 'Accept: */*\n\nmal\n', body: '\n\nuno\n{{$secret:x}}' }));
    const parsed = parseHttpBlock(s.code);
    const header = parsed.requests[0].issues.find((i) => i.code === 'invalid_header')!;
    expect(s.fieldOf(header.line)).toEqual({ field: 'headers', line: 3 });
    const secret = parsed.requests[0].issues.find((i) => i.code === 'reserved_syntax')!;
    expect(s.fieldOf(secret.line)).toEqual({ field: 'body', line: 4 });
    expect(s.fieldOf(1)).toEqual({ field: 'url', line: 1 });
  });

  it('sin URL, el bloque vacío no cuenta como problema', () => {
    const parsed = parseHttpBlock(serializeForm(EMPTY_FORM).code);
    expect(formIssues(parsed.issues).map((i) => i.code)).not.toContain('empty_block');
  });

  it('una línea ### en el cuerpo partiría la petición', () => {
    expect(bodySplitsRequest(form({ body: 'a\n### b' }))).toBe(true);
    expect(bodySplitsRequest(form({ body: 'a ### b' }))).toBe(false);
    expect(bodySplitsRequest(form({ method: 'HEAD', body: '###' }))).toBe(false);
  });
});

describe('"Guardar en una nota"', () => {
  it('el bloque lleva los nombres de las variables, nunca sus valores', () => {
    const { code } = serializeForm(form({ method: 'GET', url: '{{baseUrl}}/me', headers: 'Authorization: Bearer {{token}}' }));
    const note = formatFence('http', code);
    expect(note).toBe('```http\nGET {{baseUrl}}/me\nAuthorization: Bearer {{token}}\n```');
    expect(note).not.toMatch(/secret:|••••/);
  });

  it('un cuerpo con una línea ``` va en una cerca más larga, y la nota la lee entera', () => {
    const { code } = serializeForm(form({ method: 'POST', url: 'https://x.com', body: '```\ncódigo\n```' }));
    const note = formatFence('http', code);
    expect(note.startsWith('````http\n')).toBe(true);
    expect(parseFencedBlocks(note, 'http')[0].code).toBe(code);
  });
});

describe('"Traer de una nota" → formulario', () => {
  it('la primera petición, con la query unida y las cabeceras como están', () => {
    const loaded = formFromBlock('# comentario\n### Crear\npost https://x.com/u\n?page=2\nX-A: 1\nmal\n\n{"a":1}\n\n### Otra\nGET https://y.com');
    expect(loaded?.count).toBe(2);
    expect(loaded?.form).toEqual({ method: 'POST', url: 'https://x.com/u?page=2', headers: 'X-A: 1\nmal', body: '{"a":1}' });
  });

  it('ida y vuelta: lo guardado se vuelve a cargar igual', () => {
    const original = form({ method: 'PATCH', url: 'https://x.com/a', headers: 'A: 1\nB: {{b}}', body: '{\n  "x": 1\n}' });
    expect(formFromBlock(serializeForm(original).code)?.form).toEqual(original);
  });

  it('un bloque vacío no carga nada', () => {
    expect(formFromBlock('\n# solo un comentario\n')).toBeNull();
  });
});
