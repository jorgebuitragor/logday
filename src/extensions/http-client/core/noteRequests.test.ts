// La columna "Peticiones" (specs/cliente-http HT34): qué peticiones salen
// de los textos de las notas y cómo se buscan. Puro.
import { describe, expect, it } from 'vitest';
import { collectNoteRequests, countRequests, filterNoteRequests, requestTitle, shortUrl, type NoteSource } from './noteRequests';

const note = (id: string, title: string, content: string): NoteSource => ({ id, title, content, filePath: `/d/notes/${id}.md` });

const fence = (code: string, ticks = '```') => `${ticks}http\n${code}\n${ticks}`;

describe('collectNoteRequests', () => {
  it('varios bloques en una nota, y varias peticiones con ### en un bloque', () => {
    const [g] = collectNoteRequests([
      note('a', 'API', `${fence('GET https://a.com/1\n\n### Dos\nPOST https://a.com/2\n\n{}\n###\n')}\n\ntexto\n\n${fence('https://b.com/x')}`),
    ]);
    expect(g.requests.map((r) => [r.blockIndex, r.requestIndex, r.name, r.method, r.url])).toEqual([
      [0, 0, null, 'GET', 'https://a.com/1'],
      [0, 1, 'Dos', 'POST', 'https://a.com/2'],
      [1, 0, null, 'GET', 'https://b.com/x'],
    ]);
    // Cada una lleva el texto de su bloque, para cargarla.
    expect(g.requests[2].code).toBe('https://b.com/x');
  });

  it('las notas sin bloques http (o con otros lenguajes, o ```https) no salen; el orden es el de entrada', () => {
    const groups = collectNoteRequests([
      note('a', 'Uno', 'sin código'),
      note('b', 'Dos', '```json\n{}\n```\n```https\nGET https://x.com\n```'),
      note('c', 'Tres', fence('GET https://c.com')),
      note('d', 'Cuatro', fence('GET https://d.com')),
    ]);
    expect(groups.map((g) => g.note.id)).toEqual(['c', 'd']);
  });

  it('bloques mal formados: con errores pero en la lista; vacíos o solo comentarios, fuera; sin cerrar, fuera', () => {
    const [g] = collectNoteRequests([
      note('a', 'Rota', [
        fence('hola'),
        fence('FETCH https://x.com'),
        fence('GET https://ok.com\nmal'),
        fence('# solo un comentario'),
        fence(''),
        '```http\nGET https://sin-cerrar.com',
      ].join('\n\n')),
    ]);
    expect(g.requests.map((r) => [r.blockIndex, r.url, r.hasErrors])).toEqual([
      [0, '', true],
      [1, 'https://x.com', true],
      [2, 'https://ok.com', true],
    ]);
  });

  it('una cerca de 4 comillas (un cuerpo con ```) se lee entera', () => {
    const [g] = collectNoteRequests([note('a', 'A', fence('POST https://x.com\n\n```\nhola\n```', '````'))]);
    expect(g.requests).toHaveLength(1);
    expect(g.requests[0].hasErrors).toBe(false);
  });

  it('más de 20 peticiones: las 20 primeras, sin marcarlas por eso', () => {
    const code = Array.from({ length: 22 }, (_, i) => `### R${i + 1}\nGET https://x.com/${i + 1}`).join('\n');
    const [g] = collectNoteRequests([note('a', 'Muchas', fence(code))]);
    expect(g.requests).toHaveLength(20);
    expect(g.requests.some((r) => r.hasErrors)).toBe(false);
  });

  it('una nota sin contenido no rompe', () => {
    expect(collectNoteRequests([{ id: 'x', title: '', content: undefined as unknown as string, filePath: '' }])).toEqual([]);
  });
});

describe('la fila y el buscador', () => {
  const groups = collectNoteRequests([
    note('a', 'Facturación', fence('### Crear factura\nPOST {{baseUrl}}/invoices\n\n### \nGET https://api.example.com/invoices?page=2')),
    note('b', 'Usuarios', fence('DELETE https://api.example.com/users/1')),
  ]);

  it('la URL sin el esquema, y el nombre de ### si lo tiene', () => {
    expect(shortUrl('https://api.example.com/a?b=1')).toBe('api.example.com/a?b=1');
    expect(shortUrl('HTTP://x.com')).toBe('x.com');
    expect(shortUrl('{{baseUrl}}/u')).toBe('{{baseUrl}}/u');
    expect(groups[0].requests.map(requestTitle)).toEqual(['Crear factura', 'GET api.example.com/invoices?page=2']);
    expect(countRequests(groups)).toBe(3);
  });

  it('por el título de la nota (con todas sus peticiones), el nombre, el método o la URL, sin tildes ni mayúsculas', () => {
    const ids = (q: string) => filterNoteRequests(groups, q).map((g) => [g.note.id, g.requests.length]);
    expect(ids('')).toEqual([['a', 2], ['b', 1]]);
    expect(ids('facturacion')).toEqual([['a', 2]]);
    expect(ids('CREAR')).toEqual([['a', 1]]);
    expect(ids('delete')).toEqual([['b', 1]]);
    expect(ids('example.com')).toEqual([['a', 1], ['b', 1]]);
    expect(ids('usuarios users')).toEqual([['b', 1]]);
    expect(ids('zzz')).toEqual([]);
  });
});
