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

describe('progreso en el frontmatter', () => {
  const base: Task = {
    id: 't1', title: 'Tarea', status: 'todo', tags: [], project: 'inbox',
    created: '2026-10-01', linked_paths: [], content: 'x', filePath: '/t1.md',
  };
  const withFrontmatterLine = (line: string) =>
    serializeTask(base).replace('project: inbox\n', `project: inbox\n${line}\n`);

  it('se escribe como entero y se relee igual, incluido 0', () => {
    const raw = serializeTask({ ...base, progress: 40 });
    expect(raw).toContain('\nprogress: 40\n');
    expect(parseFrontmatter(raw, base.filePath)?.progress).toBe(40);
    expect(parseFrontmatter(serializeTask({ ...base, progress: 0 }), base.filePath)?.progress).toBe(0);
  });

  it('sin progreso no hay clave, ni al escribir ni al leer', () => {
    const raw = serializeTask({ ...base, progress: undefined });
    expect(raw).not.toContain('progress');
    const parsed = parseFrontmatter(raw, base.filePath);
    expect(parsed).not.toBeNull();
    expect('progress' in parsed!).toBe(false);
  });

  it('borrar el progreso quita la clave del archivo', () => {
    const parsed = parseFrontmatter(serializeTask({ ...base, progress: 60 }), base.filePath)!;
    const { progress: _drop, ...cleared } = parsed;
    void _drop;
    expect(serializeTask(cleared)).not.toContain('progress');
  });

  it('lectura tolerante de un .md editado a mano', () => {
    expect(parseFrontmatter(withFrontmatterLine('progress: 40.6'), base.filePath)?.progress).toBe(41);
    expect(parseFrontmatter(withFrontmatterLine('progress: 150'), base.filePath)?.progress).toBe(100);
    expect(parseFrontmatter(withFrontmatterLine('progress: -3'), base.filePath)?.progress).toBe(0);
    expect(parseFrontmatter(withFrontmatterLine('progress: "75%"'), base.filePath)?.progress).toBe(75);
    expect(parseFrontmatter(withFrontmatterLine('progress: mucho'), base.filePath)?.progress).toBeUndefined();
    expect(parseFrontmatter(withFrontmatterLine('progress: null'), base.filePath)?.progress).toBeUndefined();
    expect(parseFrontmatter(withFrontmatterLine('progress:'), base.filePath)?.progress).toBeUndefined();
  });

  it('nunca escribe un valor inválido aunque el objeto lo traiga', () => {
    expect(serializeTask({ ...base, progress: 140 })).toContain('\nprogress: 100\n');
    expect(serializeTask({ ...base, progress: NaN })).not.toContain('progress');
  });
});
