import { describe, expect, it } from 'vitest';
import type { Note } from '../types/note';
import { sortNotes } from './noteSort';

// vitest.config.ts fija TZ=America/Bogota (UTC-5).

function note(id: string, fields: Partial<Note> = {}): Note {
  return {
    id, title: id, folder: '', tags: [], created: '2026-10-01', updated: '2026-10-01',
    pinned: false, content: '', filePath: `/${id}.md`, ...fields,
  };
}

describe('sortNotes con marcas mezcladas', () => {
  const notes = [
    note('legado-27', { updated: '2026-10-27', created: '2026-10-20' }),
    note('noche-27', { updated: '2026-10-28T01:00:00.000Z', created: '2026-10-21T03:00:00.000Z' }), // 27, 8 p. m.
    note('legado-28', { updated: '2026-10-28', created: '2026-10-21' }),
    note('vacia', { updated: '', created: '' }),
  ];

  it('ordena por edición según el momento, no como string', () => {
    expect(sortNotes(notes, 'updated', 'desc').map((n) => n.id)).toEqual(['legado-28', 'noche-27', 'legado-27', 'vacia']);
    expect(sortNotes(notes, 'updated', 'asc').map((n) => n.id)).toEqual(['vacia', 'legado-27', 'noche-27', 'legado-28']);
  });

  it('ordena por creación con formatos mezclados', () => {
    // "2026-10-21T03:00Z" es el 20 a las 10 p. m. aquí: antes que el 21 legado.
    expect(sortNotes(notes, 'created', 'desc').map((n) => n.id)).toEqual(['legado-28', 'noche-27', 'legado-27', 'vacia']);
  });

  it('las fijadas siguen primero', () => {
    const pinned = [...notes, note('fijada', { pinned: true, updated: '2020-01-01' })];
    expect(sortNotes(pinned, 'updated', 'desc')[0].id).toBe('fijada');
  });
});
