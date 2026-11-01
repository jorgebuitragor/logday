// Vista con que abre Tareas (specs/navegacion-secciones NS22).
import { describe, expect, it } from 'vitest';
import { initialTasksView, parseTasksViewDefault } from './viewDefaults';

describe('parseTasksViewDefault', () => {
  it('acepta las tres vistas', () => {
    expect(parseTasksViewDefault('list')).toBe('list');
    expect(parseTasksViewDefault('kanban')).toBe('kanban');
    expect(parseTasksViewDefault('calendar')).toBe('calendar');
  });

  it('sin preferencia o con algo que no es una vista, la lista', () => {
    expect(parseTasksViewDefault(undefined)).toBe('list');
    expect(parseTasksViewDefault('tree')).toBe('list');
    expect(parseTasksViewDefault(3)).toBe('list');
  });
});

describe('initialTasksView: Tareas abre con la vista de Opciones', () => {
  it('lee la preferencia de config.json y abre con ella', () => {
    expect(initialTasksView({ tasksViewDefault: 'calendar' })).toEqual({ tasksViewDefault: 'calendar', currentView: 'calendar' });
    expect(initialTasksView({ tasksViewDefault: 'kanban' }).currentView).toBe('kanban');
  });

  it('una config vieja, sin la preferencia, abre en la lista como antes', () => {
    expect(initialTasksView({})).toEqual({ tasksViewDefault: 'list', currentView: 'list' });
    expect(initialTasksView(null)).toEqual({ tasksViewDefault: 'list', currentView: 'list' });
  });
});
