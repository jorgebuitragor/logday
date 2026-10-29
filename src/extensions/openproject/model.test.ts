import { describe, expect, it } from 'vitest';
import { PAGE_1, PAGE_2 } from './fixtures';
import {
  DEFAULT_PROJECT, UnexpectedFormatError, parseWorkPackages, projectSlug, readOpenProjectSettings, workPackageToTask,
} from './model';

const texts = { open: 'Abrir en OpenProject', project: 'Proyecto', type: 'Tipo', status: 'Estado', priority: 'Prioridad', untitled: 'Work package' };

describe('configuración de OpenProject', () => {
  it('valores por defecto y lectura defensiva', () => {
    expect(readOpenProjectSettings(undefined)).toEqual({ project: DEFAULT_PROJECT, auto: false, imported: {} });
    const s = readOpenProjectSettings({
      account: 'Ana', baseUrl: 'https://op.fcv.org', project: ' trabajo ', auto: true,
      imported: { 1: 't1', 2: 5 }, last: { at: '2026-10-29T10:00:00Z', status: 'ok', created: 2 },
    });
    expect(s).toMatchObject({ account: 'Ana', baseUrl: 'https://op.fcv.org', project: 'trabajo', auto: true, imported: { 1: 't1' } });
    expect(s.last).toEqual({ at: '2026-10-29T10:00:00Z', status: 'ok', created: 2 });
    expect(readOpenProjectSettings({ baseUrl: 'javascript:alert(1)' }).baseUrl).toBeUndefined();
  });

  it('el proyecto se nombra como lo hace createProject', () => {
    expect(projectSlug(' Trabajo FCV ')).toBe('trabajo-fcv');
    expect(projectSlug('a/b')).toBe('a-b');
    expect(projectSlug('  ')).toBe(DEFAULT_PROJECT);
  });
});

describe('lectura de la API v3 (P9)', () => {
  it('lee los campos que usa, con la fecha de fin o la de un hito', () => {
    const { items, total } = parseWorkPackages(PAGE_1);
    expect(total).toBe(3);
    expect(items[0]).toEqual({
      id: '1234', subject: 'Definir el módulo de admisiones', description: 'Revisar con **Ana** el flujo.\n\n- paso 1\n- paso 2',
      due: '2026-11-04', status: 'In progress', type: 'Task', priority: 'Normal', project: 'SAHI Offline',
    });
    expect(items[1]).toMatchObject({ id: '1240', due: '2026-11-15', type: 'Milestone', status: 'New' });
    expect(parseWorkPackages(PAGE_2).items[0]).toMatchObject({ id: '1251', subject: '', priority: 'High' });
    expect(parseWorkPackages(PAGE_2).items[0].due).toBeUndefined();
  });

  it('una respuesta que no es una colección avisa en vez de seguir', () => {
    expect(() => parseWorkPackages('<html>login</html>')).toThrow(UnexpectedFormatError);
    expect(() => parseWorkPackages(JSON.stringify({ _type: 'Error', message: 'x' }))).toThrow(UnexpectedFormatError);
  });
});

describe('la tarea que se crea (P5)', () => {
  it('título, código, fecha, enlace, datos y descripción', () => {
    const [first] = parseWorkPackages(PAGE_1).items;
    const task = workPackageToTask(first, 'https://op.fcv.org/openproject/', texts);
    expect(task.title).toBe('Definir el módulo de admisiones');
    expect(task.taskCode).toBe('OP-1234');
    expect(task.due).toBe('2026-11-04');
    expect(task.content).toBe(
      '[Abrir en OpenProject #1234](https://op.fcv.org/openproject/work_packages/1234)\n\n' +
      '- **Proyecto:** SAHI Offline\n- **Tipo:** Task\n- **Estado:** In progress\n- **Prioridad:** Normal\n\n' +
      'Revisar con **Ana** el flujo.\n\n- paso 1\n- paso 2',
    );
  });

  it('sin título ni datos, queda un título con el número', () => {
    const task = workPackageToTask({ id: '9', subject: '', description: '' }, 'https://op', texts);
    expect(task.title).toBe('Work package #9');
    expect(task.content).toBe('[Abrir en OpenProject #9](https://op/work_packages/9)');
  });
});
