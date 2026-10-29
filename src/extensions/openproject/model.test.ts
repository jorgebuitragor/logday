import { describe, expect, it } from 'vitest';
import { PAGE_1, PAGE_2 } from './fixtures';
import {
  DEFAULT_PROJECT, UnexpectedFormatError, isEpicType, parseProjectIds, parseWorkPackageRef, parseWorkPackages, placement, projectSlug, readOpenProjectSettings, workPackageToTask,
} from './model';

const texts = { open: 'Abrir en OpenProject', project: 'Proyecto', type: 'Tipo', status: 'Estado', priority: 'Prioridad', untitled: 'Work package' };

describe('configuración de OpenProject', () => {
  it('valores por defecto y lectura defensiva', () => {
    expect(readOpenProjectSettings(undefined)).toEqual({ project: DEFAULT_PROJECT, personFields: [], managed: {}, auto: false, imported: {} });
    expect(readOpenProjectSettings({
      codeField: { id: 'customField2', name: 'Tarea' },
      managed: { 1234: { code: 'T-1', project: 'openproject/app' }, 9: { code: 1 } },
    })).toMatchObject({ codeField: { id: 'customField2', name: 'Tarea' }, managed: { 1234: { code: 'T-1', project: 'openproject/app' } } });
    expect(readOpenProjectSettings({ codeField: { id: 'subject', name: 'x' } }).codeField).toBeUndefined();
    // P4b: solo ids de campos personalizados; el webview no arma otros filtros.
    expect(readOpenProjectSettings({ personFields: [{ id: 'customField12', name: 'Responsable Desarrollo' }, { id: 'author', name: 'x' }, 'y'] }).personFields)
      .toEqual([{ id: 'customField12', name: 'Responsable Desarrollo' }]);
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
      due: '2026-11-04', status: 'In progress', type: 'Task', priority: 'Normal', project: 'SAHI Offline', ancestors: [],
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

describe('código, avance y épica (P5, P5b)', () => {
  const body = (el: Record<string, unknown>) => JSON.stringify({ _type: 'WorkPackageCollection', total: 1, _embedded: { elements: [{ id: 7, subject: 'X', _links: {}, ...el }] } });

  it('el código sale del campo elegido, de texto o formateado', () => {
    expect(parseWorkPackages(body({ customField2: '  TAR-0042 ' }), 'customField2').items[0].code).toBe('TAR-0042');
    expect(parseWorkPackages(body({ customField2: { format: 'plain', raw: 'TAR\n43' } }), 'customField2').items[0].code).toBe('TAR 43');
    expect(parseWorkPackages(body({ customField2: null }), 'customField2').items[0].code).toBeUndefined();
    expect(parseWorkPackages(body({ customField2: 'TAR-1' })).items[0].code).toBeUndefined();
  });

  it('el avance y los ancestros', () => {
    const [wp] = parseWorkPackages(body({
      percentageDone: 40,
      _links: { ancestors: [{ href: '/api/v3/work_packages/100', title: 'Fase' }, { href: '/api/v3/work_packages/200', title: 'APP' }, { href: null }] },
    })).items;
    expect(wp.progress).toBe(40);
    expect(wp.ancestors).toEqual(['100', '200']);
    expect(parseWorkPackages(body({ percentageDone: 140 })).items[0].progress).toBeUndefined();
  });

  it('la tarea va en la carpeta de la épica más cercana', () => {
    const refs: Record<string, { type?: string; subject: string }> = {
      100: { type: 'Epic', subject: 'Programa grande' },
      200: { type: 'Épica', subject: 'APP Circuito Cerrado' },
      300: { type: 'Feature', subject: 'Pantalla' },
    };
    const wp = { id: '7', subject: 'Botón', description: '', ancestors: ['100', '200', '300'] };
    expect(placement(wp, 'openproject', (id) => refs[id])).toBe('openproject/app-circuito-cerrado');
    expect(placement({ ...wp, ancestors: ['300'] }, 'openproject', (id) => refs[id])).toBe('openproject');
    expect(placement({ ...wp, ancestors: [] , type: 'Epic', subject: 'Mi épica' }, 'Trabajo', () => undefined)).toBe('trabajo/mi-épica');
    expect(isEpicType('epic') && isEpicType(' Épica ') && !isEpicType('Feature')).toBe(true);
  });

  it('un work package suelto: tipo y asunto', () => {
    expect(parseWorkPackageRef(JSON.stringify({ _type: 'WorkPackage', subject: ' APP ', _links: { type: { title: 'Epic' } } })))
      .toEqual({ type: 'Epic', subject: 'APP' });
    expect(() => parseWorkPackageRef(JSON.stringify({ _type: 'Error' }))).toThrow(UnexpectedFormatError);
  });

  it('el código de la tarea: el del campo, o OP-número', () => {
    const t = { open: 'Abrir', project: 'P', type: 'T', status: 'S', priority: 'Pr', untitled: 'WP' };
    expect(workPackageToTask({ id: '7', subject: 'X', description: '', ancestors: [], code: 'TAR-1' }, 'https://op', t).taskCode).toBe('TAR-1');
    expect(workPackageToTask({ id: '7', subject: 'X', description: '', ancestors: [] }, 'https://op', t).taskCode).toBe('OP-7');
  });
});

describe('proyectos (P4b)', () => {
  it('lee solo ids enteros positivos', () => {
    const body = JSON.stringify({ _type: 'Collection', total: 3, _embedded: { elements: [{ id: 46 }, { id: '40' }, { id: 37 }, null] } });
    expect(parseProjectIds(body)).toEqual({ ids: [46, 37], total: 3 });
    expect(() => parseProjectIds('<html>')).toThrow(UnexpectedFormatError);
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
    const task = workPackageToTask({ id: '9', subject: '', description: '', ancestors: [] }, 'https://op', texts);
    expect(task.title).toBe('Work package #9');
    expect(task.content).toBe('[Abrir en OpenProject #9](https://op/work_packages/9)');
  });
});
