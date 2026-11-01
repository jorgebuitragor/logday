// La lista de herramientas: orden, ocultas, modo A-Z y grupos plegados
// (specs/devtools D18–D24, design §G.4). Funciones puras de `model.ts`.
import { describe, expect, it } from 'vitest';
import { withExtensionSettings } from '../state';
import {
  ALL_GROUPS, ALL_TOOLS, RESET_ORDER_PATCH, TOOL_GROUPS, hasCustomOrder, hasToolOptions, moveGroup, moveGroupTo, moveTool,
  moveToolTo, orderedTools, readDevtoolsSettings, resolveToolList, setLayoutPatch, setToolHidden, toggleGroupCollapsed,
  visibleToolCount, type DevtoolsSettings, type DevtoolsSettingsPatch, type ToolId,
} from './model';
import { makeTr, toolKey } from './ui/text';

const es = makeTr('es');
const en = makeTr('en');
const nameEs = (tool: ToolId) => es(toolKey(tool, 'name'));
const resolve = (s: DevtoolsSettings, nameOf = nameEs, locale = 'es-CO') => resolveToolList(s, nameOf, locale);
const read = (raw: Record<string, unknown>) => readDevtoolsSettings(raw);

/** Aplica un parche como lo guarda la app (un `undefined` borra la clave). */
function apply(raw: Record<string, unknown>, patch: DevtoolsSettingsPatch): Record<string, unknown> {
  return withExtensionSettings({ devtools: { enabled: true, settings: raw } }, 'devtools', patch).devtools!.settings!;
}

const DEFAULT_SECTIONS = TOOL_GROUPS.map((g) => ({ group: g.group, tools: [...g.tools] }));

describe('lo guardado hasta hoy se lee igual que antes', () => {
  it('{ lastTool, options } da la lista por defecto', () => {
    const s = read({ lastTool: 'yaml', options: { json: { indent: 4 } } });
    expect(s).toEqual({ lastTool: 'yaml', options: { json: { indent: 4 } }, layout: 'groups' });
    const list = resolve(s);
    expect(list.sections).toEqual(DEFAULT_SECTIONS);
    expect(list.hidden).toEqual([]);
    expect(list.order).toEqual(ALL_TOOLS);
    expect(hasCustomOrder(s)).toBe(false);
  });

  it('sin nada guardado, también', () => {
    expect(resolve(readDevtoolsSettings(undefined)).order).toEqual(ALL_TOOLS);
  });

  it('lo guardado con la herramienta Cliente HTTP (ya no está, specs/cliente-http HT33) se ignora sin romper', () => {
    // Así quedaba config.json con el grupo Red: última herramienta, orden,
    // oculta y plegado.
    const raw = {
      lastTool: 'http',
      options: { http: { x: 1 }, json: { indent: 4 } },
      groupOrder: ['network', 'formats', 'encoding', 'generators', 'time', 'text', 'lists'],
      toolOrder: { network: ['http'], formats: ['yaml', 'json', 'xml', 'convert', 'http'] },
      hidden: ['http', 'lorem'],
      collapsed: ['network', 'time'],
    };
    const s = read(raw);
    expect(s.lastTool).toBe('json');
    expect(s.groupOrder).toEqual(['formats', 'encoding', 'generators', 'time', 'text', 'lists']);
    expect(s.toolOrder).toEqual({ formats: ['yaml', 'json', 'xml', 'convert'] });
    expect(s.hidden).toEqual(['lorem']);
    expect(s.collapsed).toEqual(['time']);
    const list = resolve(s);
    expect(list.order).not.toContain('http');
    expect(list.sections.map((x) => x.group)).toEqual(['formats', 'encoding', 'generators', 'time', 'text', 'lists']);
    expect(list.hidden).toEqual(['lorem']);
    // Al volver a guardar el orden o las ocultas, desaparece del archivo.
    expect(apply(raw, setToolHidden(s, 'lorem', false))).not.toHaveProperty('hidden');
    expect(apply(raw, moveGroup(s, 'lists', -1)).groupOrder).toEqual(['formats', 'encoding', 'generators', 'time', 'lists', 'text']);
  });
});

describe('sin el grupo Red (specs/cliente-http HT33)', () => {
  it('seis grupos y ninguna herramienta de red', () => {
    expect(ALL_GROUPS).toEqual(['formats', 'encoding', 'generators', 'time', 'text', 'lists']);
    expect(ALL_TOOLS).not.toContain('http' as ToolId);
    expect(visibleToolCount(read({}))).toBe(ALL_TOOLS.length);
  });
});

describe('leer las preferencias (§G.4)', () => {
  it('descarta ids desconocidos, repetidos y de otro grupo', () => {
    const s = read({
      layout: 'raro',
      groupOrder: ['lists', 'nada', 'lists', 'formats', 3],
      toolOrder: { formats: ['xml', 'uuid', 'xml', 'json'], nada: ['json'], time: 'x', lists: [] },
      hidden: ['regex', 'otra', 'regex'],
      collapsed: ['time', 'time', 'fantasma'],
    });
    expect(s.layout).toBe('groups');
    expect(s.groupOrder).toEqual(['lists', 'formats']);
    expect(s.toolOrder).toEqual({ formats: ['xml', 'json'] });
    expect(s.hidden).toEqual(['regex']);
    expect(s.collapsed).toEqual(['time']);
  });

  it('si están todas ocultas (una edición a mano), se ignora', () => {
    expect(read({ hidden: [...ALL_TOOLS] }).hidden).toBeUndefined();
    expect(resolveToolList({ layout: 'groups', hidden: [...ALL_TOOLS] }, nameEs, 'es').order).toEqual(ALL_TOOLS);
  });

  it('el modo A-Z se lee', () => {
    expect(read({ layout: 'az' }).layout).toBe('az');
  });
});

describe('herramientas y grupos nuevos (D24)', () => {
  it('lo que no está guardado va al final, visible y desplegado', () => {
    // Como si `lists` y `list-compare` fueran de una versión posterior.
    const s = read({
      groupOrder: ['text', 'formats', 'encoding', 'generators', 'time'],
      toolOrder: { lists: ['sql-list'] },
      collapsed: ['text'],
    });
    const list = resolve(s);
    expect(list.sections.map((x) => x.group)).toEqual(['text', 'formats', 'encoding', 'generators', 'time', 'lists']);
    expect(list.sections[list.sections.length - 1].tools).toEqual(['sql-list', 'list-compare']);
    expect(s.collapsed).toEqual(['text']);
  });

  it('el orden de un grupo a medias se completa con el de siempre', () => {
    expect(orderedTools(read({ toolOrder: { generators: ['qr', 'uuid'] } }), 'generators')).toEqual(['qr', 'uuid', 'hash', 'password', 'lorem', 'barcode']);
  });
});

describe('ordenar (D19)', () => {
  it('mueve grupos con las flechas y al arrastrar', () => {
    let raw: Record<string, unknown> = {};
    raw = apply(raw, moveGroup(read(raw), 'lists', -1));
    expect(read(raw).groupOrder).toEqual(['formats', 'encoding', 'generators', 'time', 'lists', 'text']);
    raw = apply(raw, moveGroupTo(read(raw), 'lists', 0));
    expect(resolve(read(raw)).sections[0].group).toBe('lists');
    // Volver al orden de siempre borra la clave.
    raw = apply(raw, moveGroupTo(read(raw), 'lists', ALL_GROUPS.length - 1));
    expect(raw.groupOrder).toBeUndefined();
  });

  it('en un extremo no cambia nada', () => {
    expect(moveGroup(read({}), 'formats', -1)).toEqual({});
    expect(moveGroup(read({}), 'lists', 1)).toEqual({});
    expect(moveTool(read({}), 'json', -1)).toEqual({});
    expect(moveTool(read({}), 'convert', 1)).toEqual({});
  });

  it('una herramienta se mueve solo dentro de su grupo', () => {
    let raw: Record<string, unknown> = {};
    raw = apply(raw, moveTool(read(raw), 'convert', -1));
    expect(read(raw).toolOrder).toEqual({ formats: ['json', 'yaml', 'convert', 'xml'] });
    // Al arrastrar más allá del final se queda al final de su grupo.
    raw = apply(raw, moveToolTo(read(raw), 'json', 99));
    expect(orderedTools(read(raw), 'formats')).toEqual(['yaml', 'convert', 'xml', 'json']);
    expect(resolve(read(raw)).sections[1].tools).toEqual(['base64', 'url', 'html', 'jwt']);
    raw = apply(raw, moveToolTo(read(raw), 'json', 0));
    raw = apply(raw, moveToolTo(read(raw), 'xml', 2));
    expect(raw.toolOrder).toBeUndefined();
  });

  it('Restablecer orden vuelve a todo por defecto y conserva el modo y los plegados', () => {
    let raw: Record<string, unknown> = { lastTool: 'cron', layout: 'az', collapsed: ['time'] };
    raw = apply(raw, moveGroup(read(raw), 'time', -1));
    raw = apply(raw, moveTool(read(raw), 'yaml', -1));
    raw = apply(raw, setToolHidden(read(raw), 'jwt', true));
    expect(hasCustomOrder(read(raw))).toBe(true);
    raw = apply(raw, RESET_ORDER_PATCH);
    expect(raw).toEqual({ lastTool: 'cron', layout: 'az', collapsed: ['time'] });
  });
});

describe('ocultar (D20)', () => {
  it('las ocultas salen de la lista y van aparte, en el mismo orden', () => {
    let raw: Record<string, unknown> = {};
    raw = apply(raw, setToolHidden(read(raw), 'jwt', true));
    raw = apply(raw, setToolHidden(read(raw), 'yaml', true));
    const list = resolve(read(raw));
    expect(list.hidden).toEqual(['yaml', 'jwt']);
    expect(list.order).not.toContain('jwt');
    expect(list.order).toHaveLength(ALL_TOOLS.length - 2);
    raw = apply(raw, setToolHidden(read(raw), 'yaml', false));
    raw = apply(raw, setToolHidden(read(raw), 'jwt', false));
    expect(raw.hidden).toBeUndefined();
  });

  it('un grupo con todas ocultas no se muestra', () => {
    let raw: Record<string, unknown> = {};
    for (const tool of ['timestamp', 'cron'] as const) raw = apply(raw, setToolHidden(read(raw), tool, true));
    expect(resolve(read(raw)).sections.map((s) => s.group)).not.toContain('time');
  });

  it('no se pueden ocultar todas', () => {
    let raw: Record<string, unknown> = {};
    for (const tool of ALL_TOOLS) raw = apply(raw, setToolHidden(read(raw), tool, true));
    const s = read(raw);
    expect(visibleToolCount(s)).toBe(1);
    expect(resolve(s).order).toEqual(['list-compare']);
  });
});

describe('modo A-Z (D18)', () => {
  it('una sola lista ordenada por el nombre del idioma, sin las ocultas', () => {
    const s = read({ layout: 'az', hidden: ['regex'] });
    const list = resolve(s);
    expect(list.sections).toHaveLength(1);
    expect(list.sections[0].group).toBeNull();
    const names = list.order.map(nameEs);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es-CO')));
    expect(list.order).not.toContain('regex');
    expect(list.hidden).toEqual(['regex']);
    expect(list.order).toHaveLength(ALL_TOOLS.length - 1);
  });

  it('el orden cambia con el idioma', () => {
    const s = read({ layout: 'az' });
    const inEs = resolve(s).order;
    const inEn = resolve(s, (tool) => en(toolKey(tool, 'name')), 'en-US').order;
    expect(inEs).not.toEqual(inEn);
    // "Expresiones regulares" va con la E; en inglés, "Regular expressions", con la R.
    expect(inEs.indexOf('regex')).toBeLessThan(inEs.indexOf('hash'));
  });

  it('cambiar de modo solo guarda el A-Z', () => {
    expect(setLayoutPatch('az')).toEqual({ layout: 'az' });
    expect(setLayoutPatch('groups')).toEqual({ layout: undefined });
  });
});

describe('grupos plegados (D21)', () => {
  it('plegar y desplegar; con todo desplegado no se guarda nada', () => {
    let raw: Record<string, unknown> = {};
    raw = apply(raw, toggleGroupCollapsed(read(raw), 'time'));
    raw = apply(raw, toggleGroupCollapsed(read(raw), 'formats'));
    expect(raw.collapsed).toEqual(['formats', 'time']);
    raw = apply(raw, toggleGroupCollapsed(read(raw), 'time'));
    raw = apply(raw, toggleGroupCollapsed(read(raw), 'formats'));
    expect(raw.collapsed).toBeUndefined();
  });

  it('⌥⌘↓/↑ recorre también las de los grupos plegados (D22)', () => {
    expect(resolve(read({ collapsed: [...ALL_GROUPS] })).order).toEqual(ALL_TOOLS);
  });
});

describe('opciones de las herramientas (D23)', () => {
  it('solo cuenta si alguna herramienta tiene opciones', () => {
    expect(hasToolOptions(read({}))).toBe(false);
    expect(hasToolOptions(read({ options: { json: {} } }))).toBe(false);
    expect(hasToolOptions(read({ options: { json: { indent: 4 } } }))).toBe(true);
  });
});
