import { describe, expect, it } from 'vitest';
import type { Task } from '../types/task';
import {
  diffTaskFields,
  taskFieldsToPatchPayload,
  taskFromApiResponse,
  taskToCreatePayload,
  type TaskApiResponse,
} from './syncMapping';

const task: Task = {
  id: 't1', title: 'Tarea', status: 'todo', tags: [], project: 'inbox',
  created: '2026-10-01T10:00:00.000Z', linked_paths: [], content: '', filePath: '/t1.md',
};

const response = (extra: Partial<TaskApiResponse> = {}): TaskApiResponse => ({
  id: 't1', title: 'Tarea', task_code: null, status: 'todo', tags: [], project: 'inbox',
  created: '2026-10-01T10:00:00.000Z', completed_at: null, due: null, content: '',
  updated_at: '2026-10-29T12:00:00.000Z', seq: 1, ...extra,
});

describe('progress en el payload de creación', () => {
  it('manda el valor, o null si no hay (null no es 0)', () => {
    expect(taskToCreatePayload({ ...task, progress: 40 }).progress).toBe(40);
    expect(taskToCreatePayload({ ...task, progress: 0 }).progress).toBe(0);
    expect(taskToCreatePayload(task).progress).toBeNull();
  });

  it('normaliza antes de mandar, para no recibir nunca el 400', () => {
    expect(taskToCreatePayload({ ...task, progress: 120 }).progress).toBe(100);
    expect(taskToCreatePayload({ ...task, progress: 12.6 }).progress).toBe(13);
  });
});

describe('progress en el PATCH', () => {
  it('solo va si el campo está entre los cambiados', () => {
    expect('progress' in taskFieldsToPatchPayload({ title: 'Otra' })).toBe(false);
    expect(taskFieldsToPatchPayload({ progress: 70 }).progress).toBe(70);
  });

  it('borrarlo manda null', () => {
    const payload = taskFieldsToPatchPayload({ progress: undefined });
    expect('progress' in payload).toBe(true);
    expect(payload.progress).toBeNull();
  });

  it('la detección de cambios lo incluye solo si cambió', () => {
    expect(diffTaskFields({ ...task, progress: 40 }, { ...task, progress: 40, title: 'Otra' })).toEqual({ title: 'Otra' });
    expect(diffTaskFields(task, { ...task, progress: 40 })).toEqual({ progress: 40 });
    const cleared = diffTaskFields({ ...task, progress: 40 }, task);
    expect('progress' in cleared).toBe(true);
    expect(taskFieldsToPatchPayload(cleared).progress).toBeNull();
  });
});

describe('progress en lo que llega del servidor', () => {
  it('lee el valor', () => {
    expect(taskFromApiResponse(response({ progress: 55 })).progress).toBe(55);
    expect(taskFromApiResponse(response({ progress: 0 })).progress).toBe(0);
  });

  it('null y clave ausente (servidor anterior) cuentan como sin progreso', () => {
    expect(taskFromApiResponse(response({ progress: null })).progress).toBeUndefined();
    expect(taskFromApiResponse(response()).progress).toBeUndefined();
  });

  it('mezclado sobre la tarea local, un null remoto borra el progreso local', () => {
    // Así mezcla applyRemoteTaskChange: { ...existente, ...remoto }.
    const local: Task = { ...task, progress: 40 };
    const merged = { ...local, ...taskFromApiResponse(response({ progress: null })) };
    expect(merged.progress).toBeUndefined();
    const updated = { ...local, ...taskFromApiResponse(response({ progress: 80 })) };
    expect(updated.progress).toBe(80);
  });
});
