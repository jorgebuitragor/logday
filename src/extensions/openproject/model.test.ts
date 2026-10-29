import { describe, expect, it } from 'vitest';
import { PAGE_1, PAGE_2 } from './fixtures';
import {
  DEFAULT_PROJECT, UnexpectedFormatError, isEpicType, logdayStatus, parseClosedStatuses, parseProjectIds, parseWorkPackageRef, parseWorkPackages, placement, projectSlug, readOpenProjectSettings, workPackageToTask,
} from './model';

const texts = { open: 'Abrir en OpenProject', project: 'Proyecto', type: 'Tipo', status: 'Estado', priority: 'Prioridad', untitled: 'Work package' };

describe('configuración de OpenProject', () => {
  it('valores por defecto y lectura defensiva', () => {
    expect(readOpenProjectSettings(undefined)).toEqual({ project: DEFAULT_PROJECT, personFields: [], managed: {}, includeClosed: false, auto: false, imported: {} });
    expect(readOpenProjectSettings({
      codeField: { id: 'customField2', name: 'Tarea' },
      managed: { 1234: { code: 'T-1', project: 'openproject/app', progress: 40 }, 9: { code: 1 } },
    })).toMatchObject({ codeField: { id: 'customField2', name: 'Tarea' }, managed: { 1234: { code: 'T-1', project: 'openproject/app', progress: 40 } } });
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
    expect(projectSlug('App: X? V.1 - "B"')).toBe('app-x-v.1-b');
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

  it('la tarea va en épica/feature, como en la FCV', () => {
    const refs: Record<string, { type?: string; subject: string }> = {
      100: { type: 'Epic', subject: 'Programa grande' },
      200: { type: 'Epic', subject: 'Medico Asistencial' },
      300: { type: 'Feature', subject: 'App Circuito Cerrado V.X.X.X - Bombas Infusión' },
      400: { type: 'Task', subject: 'Tarea madre' },
    };
    const wp = { id: '7', subject: 'Botón', description: '', type: 'Task', ancestors: ['100', '200', '300'] };
    expect(placement(wp, 'openproject', (id) => refs[id])).toBe('openproject/medico-asistencial/app-circuito-cerrado-v.x.x.x-bombas-infusión');
    // Un hito debajo de una tarea: la Feature más cercana igual.
    expect(placement({ ...wp, type: 'Milestone', ancestors: ['200', '300', '400'] }, 'openproject', (id) => refs[id]))
      .toBe('openproject/medico-asistencial/app-circuito-cerrado-v.x.x.x-bombas-infusión');
    // Solo épica, solo Feature, o nada.
    expect(placement({ ...wp, ancestors: ['200'] }, 'openproject', (id) => refs[id])).toBe('openproject/medico-asistencial');
    expect(placement({ ...wp, ancestors: ['300'] }, 'openproject', (id) => refs[id])).toBe('openproject/app-circuito-cerrado-v.x.x.x-bombas-infusión');
    expect(placement({ ...wp, ancestors: [] }, 'openproject', () => undefined)).toBe('openproject');
    // La épica o la Feature en su propia carpeta.
    expect(placement({ ...wp, type: 'Epic', subject: 'Mi épica', ancestors: [] }, 'Trabajo', () => undefined)).toBe('trabajo/mi-épica');
    expect(placement({ ...wp, type: 'Feature', subject: 'V1', ancestors: ['200'] }, 'openproject', (id) => refs[id])).toBe('openproject/medico-asistencial/v1');
    // Una Feature por encima de la épica no cuenta.
    expect(placement({ ...wp, ancestors: ['300', '200'] }, 'openproject', (id) => refs[id])).toBe('openproject/medico-asistencial');
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

describe('estado de la tarea (P5e)', () => {
  it('cerrados → hecha; "En …" → en progreso; el resto → por hacer', () => {
    const closed = parseClosedStatuses(JSON.stringify({ _embedded: { elements: [
      { name: 'Liberado', isClosed: true }, { name: 'Producción', isClosed: true }, { name: 'En Desarrollo', isClosed: false }, { name: 'x' },
    ] } }));
    expect([...closed]).toEqual(['Liberado', 'Producción']);
    expect(logdayStatus('Liberado', closed)).toBe('done');
    expect(logdayStatus('En Desarrollo', closed)).toBe('in-progress');
    expect(logdayStatus('In progress', closed)).toBe('in-progress');
    expect(logdayStatus('Por Verificar', closed)).toBe('todo');
    expect(logdayStatus('LiberarEspacio(Por verificar)', closed)).toBe('todo');
    expect(logdayStatus(undefined, closed)).toBe('todo');
    expect(() => parseClosedStatuses('<html>')).toThrow(UnexpectedFormatError);
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
