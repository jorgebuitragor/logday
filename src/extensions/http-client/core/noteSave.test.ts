// "Guardar en la nota" (specs/cliente-http HT50): solo cambia la sección de
// la petición; con un conflicto no escribe; "Guardar como petición nueva"
// agrega una sección al final del bloque.
import { describe, expect, it } from 'vitest';
import { parseFencedBlocks } from '../../../lib/fencedBlocks';
import { parseHttpBlock } from './parse';
import { draftFromBlock, saveRequestInNote, type SaveTarget } from './noteSave';

const NOTE = [
  '# API',
  'Texto antes.',
  '```http',
  '### Crear',
  '# comentario de la sección',
  'POST {{baseUrl}}/users',
  'Content-Type: application/json',
  '',
  '{"name":"Ana"}',
  '',
  '### Listar',
  'GET {{baseUrl}}/users?page=2',
  '```',
  'Y otro bloque:',
  '```http',
  'DELETE https://x.com/u/1',
  '```',
  'Texto después.',
].join('\n');

const blockCode = (md: string, i: number) => parseFencedBlocks(md, 'http')[i].code;
const target = (blockIndex: number, requestIndex: number, md = NOTE): SaveTarget => {
  const req = parseHttpBlock(blockCode(md, blockIndex)).requests[requestIndex];
  return { blockIndex, requestIndex, loadedSource: req.source, name: req.name };
};

describe('el borrador de una petición de la nota', () => {
  it('su texto sin la línea ###, con sus comentarios', () => {
    expect(draftFromBlock(blockCode(NOTE, 0), 0)).toEqual({
      code: '# comentario de la sección\nPOST {{baseUrl}}/users\nContent-Type: application/json\n\n{"name":"Ana"}',
      source: parseHttpBlock(blockCode(NOTE, 0)).requests[0].source,
    });
    expect(draftFromBlock(blockCode(NOTE, 0), 1)?.code).toBe('GET {{baseUrl}}/users?page=2');
    expect(draftFromBlock(blockCode(NOTE, 1), 0)?.code).toBe('DELETE https://x.com/u/1');
    expect(draftFromBlock(blockCode(NOTE, 1), 3)).toBeNull();
  });
});

describe('guardar en la nota (HT50)', () => {
  it('reemplaza solo esa sección; la línea ###, el resto del bloque y de la nota quedan igual', () => {
    const r = saveRequestInNote(NOTE, target(0, 1), 'GET {{baseUrl}}/users?page=3\n# &debug=1\nAccept: */*\n\n', 'replace');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.content).toBe(NOTE.replace('GET {{baseUrl}}/users?page=2', 'GET {{baseUrl}}/users?page=3\n# &debug=1\nAccept: */*'));
    expect(r.requestIndex).toBe(1);
    expect(r.source).toBe('### Listar\nGET {{baseUrl}}/users?page=3\n# &debug=1\nAccept: */*');
    // La primera petición, intacta.
    expect(parseHttpBlock(blockCode(r.content, 0)).requests[0].source).toBe(target(0, 0).loadedSource);
  });

  it('la primera sección sin ###, en otro bloque', () => {
    const r = saveRequestInNote(NOTE, target(1, 0), 'DELETE https://x.com/u/2', 'replace');
    expect(r.ok && r.content).toBe(NOTE.replace('DELETE https://x.com/u/1', 'DELETE https://x.com/u/2'));
  });

  it('si la sección cambió en la nota, no escribe: conflicto', () => {
    const edited = NOTE.replace('page=2', 'page=9');
    expect(saveRequestInNote(edited, target(0, 1), 'GET x', 'replace')).toEqual({ ok: false, reason: 'conflict' });
    // Un cambio en otra sección no es conflicto.
    const other = NOTE.replace('"Ana"', '"Bea"');
    expect(saveRequestInNote(other, target(0, 1), 'GET {{baseUrl}}/users?page=3', 'replace').ok).toBe(true);
    // Ni si la petición ya no está.
    const gone = NOTE.replace('\n### Listar\nGET {{baseUrl}}/users?page=2', '');
    expect(saveRequestInNote(gone, target(0, 1), 'GET x', 'replace')).toEqual({ ok: false, reason: 'conflict' });
    expect(saveRequestInNote('sin bloques', target(0, 1), 'GET x', 'replace')).toEqual({ ok: false, reason: 'missing_block' });
  });

  it('"Reemplazar en la nota" escribe aunque haya cambiado', () => {
    const edited = NOTE.replace('page=2', 'page=9');
    const r = saveRequestInNote(edited, target(0, 1), 'GET {{baseUrl}}/users?page=3', 'force');
    expect(r.ok && r.content).toBe(NOTE.replace('page=2', 'page=3'));
  });

  it('"Guardar como petición nueva": otra sección ### al final del mismo bloque', () => {
    const edited = NOTE.replace('page=2', 'page=9');
    const r = saveRequestInNote(edited, target(0, 1), 'GET {{baseUrl}}/users?page=3', 'append');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.content).toBe(edited.replace('page=9\n```', 'page=9\n\n### Listar (2)\nGET {{baseUrl}}/users?page=3\n```'));
    expect(r.requestIndex).toBe(2);
    expect(parseHttpBlock(blockCode(r.content, 0)).requests.map((q) => q.name)).toEqual(['Crear', 'Listar', 'Listar (2)']);
  });

  it('un bloque con 20 peticiones está lleno: hay que crear una nota nueva', () => {
    const many = '```http\n' + Array.from({ length: 20 }, (_, i) => `### p${i}\nGET https://x.com/${i}`).join('\n') + '\n```';
    const t = { blockIndex: 0, requestIndex: 0, loadedSource: 'otra', name: 'p0' };
    expect(saveRequestInNote(many, t, 'GET y', 'append')).toEqual({ ok: false, reason: 'full' });
  });

  it('una línea ``` en el cuerpo alarga la cerca, para que no se cierre antes', () => {
    const md = '```http\nPOST https://x.com\n\nhola\n```\nfin';
    const r = saveRequestInNote(md, target(0, 0, md), 'POST https://x.com\n\n```\ncódigo\n```', 'replace');
    expect(r.ok && r.content).toBe('````http\nPOST https://x.com\n\n```\ncódigo\n```\n````\nfin');
    expect(r.ok && parseFencedBlocks(r.content, 'http')[0].code).toBe('POST https://x.com\n\n```\ncódigo\n```');
  });
});
