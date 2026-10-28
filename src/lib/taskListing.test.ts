import { describe, expect, it } from 'vitest';
import type { Task } from '../types/task';
import { EMPTY_TASK_FILTER, doneTasks, dueBucket, filterTasks, formatDueLabel, groupOpenTasks, rangeIds, sortColumn } from './taskListing';

const TODAY = '2026-10-27'; // martes

function task(id: string, fields: Partial<Task> = {}): Task {
  return {
    id, title: id, status: 'todo', tags: [], project: 'inbox', created: '2026-10-01',
    linked_paths: [], content: '', filePath: `/${id}.md`, ...fields,
  };
}

describe('dueBucket', () => {
  it('ubica cada fecha en su grupo', () => {
    expect(dueBucket(undefined, TODAY)).toBe('none');
    expect(dueBucket('2026-10-26', TODAY)).toBe('overdue');
    expect(dueBucket('2026-10-27', TODAY)).toBe('today');
    expect(dueBucket('2026-10-28', TODAY)).toBe('tomorrow');
    expect(dueBucket('2026-11-03', TODAY)).toBe('week');
    expect(dueBucket('2026-11-04', TODAY)).toBe('later');
  });
});

describe('groupOpenTasks', () => {
  const tasks = [
    task('sin-fecha'),
    task('hecha', { status: 'done', due: '2026-10-20' }),
    task('manana', { due: '2026-10-28' }),
    task('vencida-2', { due: '2026-10-25' }),
    task('vencida-1', { due: '2026-10-22' }),
    task('hoy-todo', { due: TODAY, created: '2026-10-10' }),
    task('hoy-curso', { due: TODAY, status: 'in-progress', created: '2026-10-02' }),
  ];

  it('por vencimiento: grupos en orden, sin las hechas, en curso primero a igual fecha', () => {
    const groups = groupOpenTasks(tasks, 'due', TODAY);
    expect(groups.map((g) => g.key)).toEqual(['overdue', 'today', 'tomorrow', 'none']);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['vencida-1', 'vencida-2']);
    expect(groups[1].tasks.map((t) => t.id)).toEqual(['hoy-curso', 'hoy-todo']);
  });

  it('por título o creación: un solo grupo de pendientes', () => {
    const byTitle = groupOpenTasks(tasks, 'title', TODAY);
    expect(byTitle).toHaveLength(1);
    expect(byTitle[0].key).toBe('pending');
    expect(byTitle[0].tasks.map((t) => t.id)[0]).toBe('hoy-curso');
    expect(groupOpenTasks([], 'created', TODAY)).toEqual([]);
  });
});

describe('doneTasks', () => {
  it('de la completada más reciente a la más antigua', () => {
    const done = doneTasks([
      task('a', { status: 'done', completedAt: '2026-10-01' }),
      task('b', { status: 'done', completedAt: '2026-10-20' }),
      task('c'),
    ]);
    expect(done.map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('formatDueLabel', () => {
  it('días cercanos con palabras', () => {
    expect(formatDueLabel(TODAY, TODAY, 'es')).toEqual({ label: 'Hoy', tone: 'today' });
    expect(formatDueLabel('2026-10-28', TODAY, 'es')).toEqual({ label: 'Mañana', tone: 'soon' });
    expect(formatDueLabel('2026-10-26', TODAY, 'en')).toEqual({ label: 'Yesterday', tone: 'overdue' });
  });

  it('la semana con el día y lo demás con fecha corta', () => {
    expect(formatDueLabel('2026-10-30', TODAY, 'es').label).toBe('vie 30');
    expect(formatDueLabel('2026-11-15', TODAY, 'es').label).toBe('15 nov');
    expect(formatDueLabel('2026-10-20', TODAY, 'es')).toEqual({ label: '20 oct', tone: 'overdue' });
    expect(formatDueLabel('2027-01-05', TODAY, 'es').label).toMatch(/2027/);
  });
});

describe('sortColumn', () => {
  it('ordena por vencimiento con las que no tienen fecha al final', () => {
    const col = [
      task('sin-fecha', { created: '2026-10-20' }),
      task('viernes', { due: '2026-10-30' }),
      task('hoy', { due: '2026-10-27' }),
      task('hoy-en-curso', { due: '2026-10-27', status: 'in-progress' }),
    ];
    expect(sortColumn(col, 'due').map((t) => t.id)).toEqual(['hoy-en-curso', 'hoy', 'viernes', 'sin-fecha']);
    expect(sortColumn(col, 'title').map((t) => t.id)).toEqual(['hoy', 'hoy-en-curso', 'sin-fecha', 'viernes']);
  });

  it('la columna de hechas va por fecha de completado', () => {
    const col = [
      task('antes', { status: 'done', completedAt: '2026-10-20' }),
      task('ayer', { status: 'done', completedAt: '2026-10-26' }),
    ];
    expect(sortColumn(col, 'title').map((t) => t.id)).toEqual(['ayer', 'antes']);
  });
});

describe('filterTasks', () => {
  const tasks = [
    task('a', { title: 'Revisar migración', tags: ['sync'], project: 'logday' }),
    task('b', { title: 'Llamar al proveedor', taskCode: 'MB-12', status: 'in-progress', project: 'maxibot' }),
    task('c', { title: 'Publicar versión', tags: ['release', 'sync'], status: 'done' }),
  ];
  const ids = (list: Task[]) => list.map((t) => t.id);

  it('busca sin distinguir mayúsculas ni tildes, en título, código, tags y proyecto', () => {
    expect(ids(filterTasks(tasks, { ...EMPTY_TASK_FILTER, query: 'MIGRACION' }))).toEqual(['a']);
    expect(ids(filterTasks(tasks, { ...EMPTY_TASK_FILTER, query: 'mb-12' }))).toEqual(['b']);
    expect(ids(filterTasks(tasks, { ...EMPTY_TASK_FILTER, query: 'sync' }))).toEqual(['a', 'c']);
    expect(ids(filterTasks(tasks, { ...EMPTY_TASK_FILTER, query: 'maxibot llamar' }))).toEqual(['b']);
  });

  it('combina estado y tags; el Kanban puede ignorar el estado', () => {
    const filter = { ...EMPTY_TASK_FILTER, status: 'done' as const, tags: ['sync'] };
    expect(ids(filterTasks(tasks, filter))).toEqual(['c']);
    expect(ids(filterTasks(tasks, filter, { ignoreStatus: true }))).toEqual(['a', 'c']);
  });
});

describe('rangeIds', () => {
  const order = ['a', 'b', 'c', 'd'];
  it('toma el tramo entre las dos, en cualquier dirección', () => {
    expect(rangeIds(order, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(rangeIds(order, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });
  it('sin ancla visible, solo la elegida', () => {
    expect(rangeIds(order, 'z', 'c')).toEqual(['c']);
  });
});
