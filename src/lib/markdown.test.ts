import { describe, expect, it } from 'vitest';
import type { Note } from '../types/note';
import type { Task } from '../types/task';
import { parseFrontmatter, parseNote, serializeNote, serializeTask } from './markdown';

// Releer un `.md` no debe cambiar ninguna marca: si cambiara, el siguiente
// guardado la vería como una edición y mandaría un PATCH espurio.

describe('marcas en el frontmatter', () => {
  it('un instante y un legado de tarea sobreviven a escribir y releer', () => {
    const task: Task = {
      id: 't1', title: 'Tarea', status: 'done', tags: [], project: 'inbox',
      created: '2026-10-01', completedAt: '2026-10-28T19:30:00.000Z',
      linked_paths: [], content: 'x', filePath: '/t1.md',
    };
    const parsed = parseFrontmatter(serializeTask(task), task.filePath);
    expect(parsed?.created).toBe('2026-10-01');
    expect(parsed?.completedAt).toBe('2026-10-28T19:30:00.000Z');
    const again = parseFrontmatter(serializeTask({ ...task, created: '2026-10-28T01:02:03.456Z' }), task.filePath);
    expect(again?.created).toBe('2026-10-28T01:02:03.456Z');
  });

  it('un instante de nota sobrevive a escribir y releer', () => {
    const note: Note = {
      id: 'n1', title: 'Nota', folder: '', tags: [], created: '2026-10-01',
      updated: '2026-10-28T19:30:00.000Z', pinned: false, content: 'x', filePath: '/n1.md',
    };
    const parsed = parseNote(serializeNote(note), note.filePath);
    expect(parsed?.created).toBe('2026-10-01');
    expect(parsed?.updated).toBe('2026-10-28T19:30:00.000Z');
  });
});
