import { describe, expect, it } from 'vitest';
import {
  clampSidebarWidth, iconCapacity, listCapacity, matchesSectionQuery, mergeSections, moveSection, moveSectionTo,
  nextRovingIndex, parseSidebarSections, parseSidebarStyle, resolveSections, sectionForDigit, sectionForShortcut, separatorIndex,
  setSectionHidden, shortcutFor, shortcutLabel, shortcutOrder, sidebarMinWidth, splitForCapacity, splitSections,
  CORE_SECTION_IDS,
} from './sectionOrder';

const CORE = [...CORE_SECTION_IDS];
const ids = (list: { id: string }[]) => list.map((s) => s.id);

describe('orden de las secciones (NS7)', () => {
  it('sin nada guardado, el orden por defecto, todas visibles', () => {
    const avail = [...CORE, 'ext:devtools', 'ext:pomodoro'];
    expect(resolveSections(undefined, avail)).toEqual(avail.map((id) => ({ id, hidden: false })));
  });

  it('respeta el orden y lo oculto guardados', () => {
    const r = resolveSections([{ id: 'notes' }, { id: 'tasks', hidden: true }, { id: 'dailys' }, { id: 'overtime' }], CORE);
    expect(r).toEqual([
      { id: 'notes', hidden: false },
      { id: 'tasks', hidden: true },
      { id: 'dailys', hidden: false },
      { id: 'overtime', hidden: false },
    ]);
  });

  it('ignora las guardadas que ya no existen y los repetidos', () => {
    const r = resolveSections([{ id: 'ext:borrada' }, { id: 'tasks' }, { id: 'tasks', hidden: true }], CORE);
    expect(ids(r)).toEqual(['tasks', 'dailys', 'notes', 'overtime']);
    expect(r[0].hidden).toBe(false);
  });

  it('una extensión que se activa va al final, visible', () => {
    const saved = [{ id: 'overtime' }, { id: 'dailys' }, { id: 'tasks' }, { id: 'notes' }];
    const r = resolveSections(saved, [...CORE, 'ext:pomodoro']);
    expect(r[r.length - 1]).toEqual({ id: 'ext:pomodoro', hidden: false });
  });

  it('una extensión desactivada no se ve pero conserva su lugar al volver', () => {
    const saved = [{ id: 'dailys' }, { id: 'ext:pomodoro' }, { id: 'tasks' }, { id: 'notes' }, { id: 'overtime' }];
    expect(ids(resolveSections(saved, CORE))).toEqual(CORE);
    // Mientras está desactivada se reordenan las demás: su lugar no se pierde.
    const moved = moveSection(saved, CORE, 'tasks', -1);
    expect(ids(moved)).toEqual(['tasks', 'ext:pomodoro', 'dailys', 'notes', 'overtime']);
    expect(ids(resolveSections(moved, [...CORE, 'ext:pomodoro']))).toEqual(['tasks', 'ext:pomodoro', 'dailys', 'notes', 'overtime']);
  });

  it('mergeSections guarda todo: lo guardado y, al final, lo nuevo', () => {
    expect(mergeSections([{ id: 'ext:x', hidden: true }, { id: 'notes' }], CORE)).toEqual([
      { id: 'ext:x', hidden: true },
      { id: 'notes' },
      { id: 'dailys' },
      { id: 'tasks' },
      { id: 'overtime' },
    ]);
  });
});

describe('mover y ocultar (NS9, NS10, NS11)', () => {
  it('sube y baja un lugar; en los bordes no cambia nada', () => {
    expect(ids(moveSection(undefined, CORE, 'notes', -1))).toEqual(['dailys', 'notes', 'tasks', 'overtime']);
    expect(ids(moveSection(undefined, CORE, 'notes', 1))).toEqual(['dailys', 'tasks', 'overtime', 'notes']);
    expect(ids(moveSection(undefined, CORE, 'dailys', -1))).toEqual(CORE);
    expect(ids(moveSection(undefined, CORE, 'overtime', 1))).toEqual(CORE);
  });

  it('con `among`, salta las que no cuentan (el clic derecho mueve entre las visibles)', () => {
    const saved = [{ id: 'dailys' }, { id: 'tasks', hidden: true }, { id: 'notes' }, { id: 'overtime' }];
    const visible = ['dailys', 'notes', 'overtime'];
    expect(ids(moveSection(saved, CORE, 'notes', -1, visible))).toEqual(['notes', 'tasks', 'dailys', 'overtime']);
  });

  it('lleva una sección a una posición (arrastrar)', () => {
    expect(ids(moveSectionTo(undefined, CORE, 'dailys', 3))).toEqual(['tasks', 'notes', 'overtime', 'dailys']);
    expect(ids(moveSectionTo(undefined, CORE, 'overtime', 0))).toEqual(['overtime', 'dailys', 'tasks', 'notes']);
    expect(ids(moveSectionTo(undefined, CORE, 'notes', 2))).toEqual(CORE);
  });

  it('oculta y vuelve a mostrar, también las fijas', () => {
    const hidden = setSectionHidden(undefined, CORE, 'tasks', true);
    expect(hidden.find((s) => s.id === 'tasks')).toEqual({ id: 'tasks', hidden: true });
    expect(setSectionHidden(hidden, CORE, 'tasks', false).find((s) => s.id === 'tasks')).toEqual({ id: 'tasks' });
  });
});

describe('atajos ⌘0…⌘9 (NS15)', () => {
  it('cuentan las visibles en su orden (también las de "Más") y después las ocultas', () => {
    const r = resolveSections([{ id: 'dailys', hidden: true }], CORE);
    const order = shortcutOrder(r);
    expect(order).toEqual(['tasks', 'notes', 'overtime', 'dailys']);
    expect(sectionForDigit('1', order)).toBe('tasks');
    expect(sectionForDigit('4', order)).toBe('dailys');
    expect(sectionForDigit('5', order)).toBeUndefined();
  });

  it('⌘0 es Inicio; solo dígitos', () => {
    expect(sectionForDigit('0', [])).toBe('dashboard');
    expect(sectionForDigit('a', CORE)).toBeUndefined();
    expect(sectionForDigit('12', CORE)).toBeUndefined();
  });

  it('con ⌘ o Ctrl, sin Alt ni Mayúsculas', () => {
    const key = (k: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) =>
      ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });
    expect(sectionForShortcut(key('2', { metaKey: true }), CORE)).toBe('tasks');
    expect(sectionForShortcut(key('0', { ctrlKey: true }), CORE)).toBe('dashboard');
    expect(sectionForShortcut(key('2'), CORE)).toBeUndefined();
    expect(sectionForShortcut(key('2', { metaKey: true, altKey: true }), CORE)).toBeUndefined();
    expect(sectionForShortcut(key('2', { metaKey: true, shiftKey: true }), CORE)).toBeUndefined();
    expect(sectionForShortcut(key('n', { metaKey: true }), CORE)).toBeUndefined();
  });

  it('hasta el 9', () => {
    expect(shortcutFor(0)).toBe('1');
    expect(shortcutFor(8)).toBe('9');
    expect(shortcutFor(9)).toBeUndefined();
  });

  it('la etiqueta según el sistema', () => {
    expect(shortcutLabel('2', true)).toBe('⌘2');
    expect(shortcutLabel('2', false)).toBe('Ctrl+2');
    expect(shortcutLabel(undefined, true)).toBe('');
  });
});

describe('lo que cabe y "Más" (NS12, NS13)', () => {
  const items = (n: number, hidden: number[] = []) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, hidden: hidden.includes(i) }));

  it('si caben todas, no hay "Más"', () => {
    expect(splitForCapacity([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], overflow: [] });
    expect(splitSections(items(4), Infinity).more).toEqual([]);
  });

  it('si no caben, "Más" ocupa el último lugar y lo demás pasa ahí, en orden', () => {
    const { shown, more } = splitSections(items(6), 4);
    expect(ids(shown)).toEqual(['s0', 's1', 's2']);
    expect(ids(more)).toEqual(['s3', 's4', 's5']);
  });

  it('con alguna oculta, "Más" siempre está: las que no caben y después las ocultas', () => {
    const all = splitSections(items(4, [1]), Infinity);
    expect(ids(all.shown)).toEqual(['s0', 's2', 's3']);
    expect(ids(all.more)).toEqual(['s1']);
    const tight = splitSections(items(5, [0]), 3);
    expect(ids(tight.shown)).toEqual(['s1', 's2']);
    expect(ids(tight.more)).toEqual(['s3', 's4', 's0']);
  });

  it('las 4 fijas ocultas: solo "Más"', () => {
    const { shown, more } = splitSections(items(4, [0, 1, 2, 3]), 10);
    expect(shown).toEqual([]);
    expect(more).toHaveLength(4);
  });

  it('capacidad de la columna: botones de 36 px con 4 px entre ellos', () => {
    expect(iconCapacity(36, false)).toBe(1);
    expect(iconCapacity(75, false)).toBe(1);
    expect(iconCapacity(76, false)).toBe(2);
    expect(iconCapacity(76, true)).toBe(1);
    expect(iconCapacity(0, false)).toBe(0);
    // 800×600 con la barra: unos 380 px para secciones.
    expect(iconCapacity(380, true)).toBe(9);
  });

  it('capacidad de la Lista: hasta el 40 % del alto, sin contar Inicio', () => {
    // 600 px: 240 px menos el relleno, 7 filas de 30 px; una es Inicio.
    expect(listCapacity(600, false)).toBe(6);
    expect(listCapacity(1000, false)).toBe(11);
    expect(listCapacity(50, false)).toBe(0);
  });

  it('la separadora entre fijas y extensiones, salvo que estén mezcladas', () => {
    expect(separatorIndex([false, false, true, true])).toBe(2);
    expect(separatorIndex([false, false])).toBe(-1);
    expect(separatorIndex([true, true])).toBe(-1);
    expect(separatorIndex([false, true, false])).toBe(-1);
  });
});

describe('teclado (NS14)', () => {
  it('flechas, Inicio y Fin; sin dar la vuelta', () => {
    expect(nextRovingIndex('ArrowDown', 0, 5)).toBe(1);
    expect(nextRovingIndex('ArrowRight', 4, 5)).toBe(4);
    expect(nextRovingIndex('ArrowUp', 0, 5)).toBe(0);
    expect(nextRovingIndex('ArrowLeft', 3, 5)).toBe(2);
    expect(nextRovingIndex('Home', 3, 5)).toBe(0);
    expect(nextRovingIndex('End', 1, 5)).toBe(4);
    expect(nextRovingIndex('a', 1, 5)).toBeNull();
    expect(nextRovingIndex('ArrowDown', 0, 0)).toBeNull();
  });
});

describe('Buscar: "Ir a…" (NS19)', () => {
  it('sin acentos ni mayúsculas', () => {
    expect(matchesSectionQuery('Inicio', 'ini')).toBe(true);
    expect(matchesSectionQuery('Horas extra', 'EXTRA')).toBe(true);
    expect(matchesSectionQuery('Notas', 'nótas')).toBe(true);
    expect(matchesSectionQuery('Tareas', '')).toBe(false);
    expect(matchesSectionQuery('Tareas', 'notas')).toBe(false);
  });
});

describe('config y migración (NS5)', () => {
  it('sin estilo guardado, la Lista; con los textos del menú apagados, la Barra de íconos', () => {
    const oldOn = { basePath: '/x', sidebarLabelsVisible: true } as Record<string, unknown>;
    const oldOff = { basePath: '/x', sidebarLabelsVisible: false } as Record<string, unknown>;
    expect(parseSidebarStyle(undefined)).toBe('list');
    expect(parseSidebarStyle(oldOn.sidebarStyle, oldOn.sidebarLabelsVisible)).toBe('list');
    expect(parseSidebarStyle(oldOff.sidebarStyle, oldOff.sidebarLabelsVisible)).toBe('icons');
    expect(parseSidebarStyle('icons', true)).toBe('icons');
    expect(parseSidebarStyle('list', false)).toBe('list');
    expect(parseSidebarStyle('fila')).toBe('list');
  });

  it('la lista guardada: descarta lo mal formado, Inicio y los repetidos', () => {
    expect(parseSidebarSections(undefined)).toBeUndefined();
    expect(parseSidebarSections('x')).toBeUndefined();
    expect(parseSidebarSections([{ id: 'notes', hidden: true }, { id: 'dashboard' }, { id: 3 }, null, { id: 'notes' }, { id: 'tasks', hidden: 'si' }]))
      .toEqual([{ id: 'notes', hidden: true }, { id: 'tasks' }]);
  });

  it('el ancho: con la Barra de íconos el mínimo sube 44 px; un ancho chico se sube al leerlo', () => {
    expect(sidebarMinWidth('list')).toBe(160);
    expect(sidebarMinWidth('icons')).toBe(204);
    expect(clampSidebarWidth(170, 'icons')).toBe(204);
    expect(clampSidebarWidth(170, 'list')).toBe(170);
    expect(clampSidebarWidth(900, 'list')).toBe(420);
    expect(clampSidebarWidth(Number.NaN, 'icons')).toBe(204);
  });
});
