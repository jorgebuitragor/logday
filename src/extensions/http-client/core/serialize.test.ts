// El borrador de la pantalla y el texto del bloque (HT33, HT40).
import { describe, expect, it } from 'vitest';
import { formatFence, parseFencedBlocks } from '../../../lib/fencedBlocks';
import { parseHttpBlock } from './parse';
import { draftSplitsRequest, formIssues, isHttpMethod } from './serialize';

describe('el borrador de la pantalla', () => {
  it('sin URL, el bloque vacío no cuenta como problema', () => {
    expect(formIssues(parseHttpBlock('').issues).map((i) => i.code)).not.toContain('empty_block');
    expect(formIssues(parseHttpBlock('GET https://x.com\nmal').requests[0].issues).map((i) => i.code)).toEqual(['invalid_header']);
  });

  it('una línea ### partiría la petición', () => {
    expect(draftSplitsRequest('POST https://x.com\n\na\n### b')).toBe(true);
    expect(draftSplitsRequest('POST https://x.com\n\na ### b')).toBe(false);
    expect(draftSplitsRequest('POST https://x.com\r\n###')).toBe(true);
  });

  it('los métodos', () => {
    expect(isHttpMethod('PATCH')).toBe(true);
    expect(isHttpMethod('patch')).toBe(false);
  });
});

describe('"Nueva nota"', () => {
  it('el bloque lleva el texto tal cual, con los nombres de las variables y nunca sus valores', () => {
    const code = 'GET {{baseUrl}}/me\n# &debug=1\nAuthorization: Bearer {{token}}';
    const note = formatFence('http', code);
    expect(note).toBe('```http\nGET {{baseUrl}}/me\n# &debug=1\nAuthorization: Bearer {{token}}\n```');
    expect(note).not.toMatch(/secret:|••••/);
  });

  it('un cuerpo con una línea ``` va en una cerca más larga, y la nota la lee entera', () => {
    const code = 'POST https://x.com\n\n```\ncódigo\n```';
    const note = formatFence('http', code);
    expect(note.startsWith('````http\n')).toBe(true);
    expect(parseFencedBlocks(note, 'http')[0].code).toBe(code);
  });
});
