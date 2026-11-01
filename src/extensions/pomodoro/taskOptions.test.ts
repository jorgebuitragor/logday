import { describe, expect, it } from 'vitest';
import type { Task } from '../../types/task';
import { MAX_OPTIONS, groupTasks } from './taskOptions';

const task = (over: Partial<Task>): Task => ({
  id: over.id ?? Math.random().toString(36), title: 'T', status: 'todo', tags: [], project: 'P',
  created: '2026-10-01T12:00:00.000Z', linked_paths: [], content: '', filePath: '', ...over,
});

describe('selector de tarea', () => {
  it('solo pendientes y en curso, en dos grupos y en orden', () => {
    const g = groupTasks([
      task({ id: 'a', title: 'Hecha', status: 'done' }),
      task({ id: 'b', title: 'Sin fecha', created: '2026-10-20T12:00:00.000Z' }),
      task({ id: 'c', title: 'Vence pronto', due: '2026-11-01' }),
      task({ id: 'd', title: 'Vence después', due: '2026-11-20' }),
      task({ id: 'e', title: 'Vieja', created: '2026-09-01' }),
      task({ id: 'f', title: 'En curso', status: 'in-progress' }),
    ], '');
    expect(g.inProgress.map((t) => t.id)).toEqual(['f']);
    expect(g.todo.map((t) => t.id)).toEqual(['c', 'd', 'b', 'e']);
    expect(g.hidden).toBe(0);
  });

  it('busca sin tildes ni mayúsculas en título, código y proyecto', () => {
    const tasks = [
      task({ id: 'a', title: 'Revisión del informe' }),
      task({ id: 'b', title: 'Otra', taskCode: 'FEAT-01' }),
      task({ id: 'c', title: 'Más', project: 'Clientes' }),
    ];
    expect(groupTasks(tasks, 'revision').todo.map((t) => t.id)).toEqual(['a']);
    expect(groupTasks(tasks, 'feat').todo.map((t) => t.id)).toEqual(['b']);
    expect(groupTasks(tasks, 'CLIENTES').todo.map((t) => t.id)).toEqual(['c']);
    expect(groupTasks(tasks, 'nada').total).toBe(0);
  });

  it('dibuja 50 como mucho', () => {
    const many = Array.from({ length: 70 }, (_, i) => task({ id: String(i) }));
    const g = groupTasks(many, '');
    expect(g.todo).toHaveLength(MAX_OPTIONS);
    expect(g.hidden).toBe(20);
  });
});
