// Prueba de humo de la vista de DevTools: cada herramienta se dibuja (con
// react-dom/server, sin DOM) con una entrada de ejemplo y muestra su
// resultado. No prueba la interacción, que se revisa en el navegador.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ALL_TOOLS, clearDrafts, draftKey, readDevtoolsSettings, resolveToolList, setDraft, type DevtoolsSettings, type ToolId } from './model';
import { ToolNav, navBlocks } from './ui/ToolNav';
import DevtoolsSettingsPanel from './Settings';
import { DevtoolsContext, type DevtoolsContextValue } from './ui/context';
import { fold, makeTr, shortcutLabel, toolKey } from './ui/text';
import { JsonTool, XmlTool, YamlTool } from './views/FormatTools';
import { Base64Tool, HtmlTool, UrlTool } from './views/EncodeTools';
import ConvertTool from './views/ConvertTool';
import JwtTool from './views/JwtTool';
import UuidTool from './views/UuidTool';
import HashTool from './views/HashTool';
import PasswordTool from './views/PasswordTool';
import LoremTool from './views/LoremTool';
import QrTool from './views/QrTool';
import BarcodeTool from './views/BarcodeTool';
import TimestampTool from './views/TimestampTool';
import CronTool from './views/CronTool';
import RegexTool from './views/RegexTool';
import DiffTool from './views/DiffTool';
import SqlListTool from './views/SqlListTool';
import ListCompareTool from './views/ListCompareTool';

// El store real necesita `window`. Las herramientas solo usan `showToast`;
// la página de Opciones, el idioma y la configuración de la extensión.
const store = vi.hoisted(() => ({
  state: {
    showToast: () => '',
    language: 'es',
    extensions: {} as Record<string, { enabled: boolean; settings?: Record<string, unknown> }>,
    updateExtensionSettings: async () => {},
  },
}));
vi.mock('../../store/appStore', () => ({
  useAppStore: Object.assign((select: (s: typeof store.state) => unknown) => select(store.state), { getState: () => store.state }),
}));

function context(tool: ToolId, settings: DevtoolsSettings): DevtoolsContextValue {
  return {
    tool,
    language: 'es',
    tr: makeTr('es'),
    mac: true,
    settings,
    updateSettings: () => {},
    openSettings: () => {},
    setOptions: () => {},
    announce: () => {},
    copyText: async () => true,
    saveNote: async () => null,
    openNote: () => {},
    openPicker: () => {},
    actionsRef: { current: {} },
    loadedFrom: null,
    clearLoaded: () => {},
    takeFocus: () => false,
    goTo: () => {},
    shortcut: (spec) => shortcutLabel(spec, true),
    switcherOpen: false,
    setSwitcherOpen: () => {},
  };
}

function render(tool: ToolId, View: ComponentType, options: Record<string, string | number | boolean> = {}) {
  const ctx = context(tool, { lastTool: tool, options: { [tool]: options }, layout: 'groups' });
  return renderToStaticMarkup(
    <DevtoolsContext.Provider value={ctx}>
      <View />
    </DevtoolsContext.Provider>,
  );
}

/** El texto visible, sin etiquetas ni entidades, para buscar en él. */
const text = (html: string) =>
  html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

afterEach(() => clearDrafts());

describe('vista de DevTools: cada herramienta se dibuja', () => {
  it('vacías, con el estado vacío y el ejemplo', () => {
    for (const [tool, View] of [['json', JsonTool], ['convert', ConvertTool], ['jwt', JwtTool], ['regex', RegexTool], ['diff', DiffTool]] as const) {
      expect(text(render(tool, View))).toContain('Probar con un ejemplo');
    }
  });

  it('formatos, con el resultado y el estado', () => {
    setDraft(draftKey('json'), '{"a":[1,2]}');
    const json = text(render('json', JsonTool));
    expect(json).toContain('"a": [');
    expect(json).toContain('JSON válido');
    setDraft(draftKey('json'), '{"a":}');
    expect(text(render('json', JsonTool))).toContain('Línea 1, columna 6');
    setDraft(draftKey('yaml'), 'a: 1 # nota');
    expect(text(render('yaml', YamlTool))).toContain('se pierden los comentarios');
    setDraft(draftKey('xml'), '<a><b>x</b></a>');
    expect(text(render('xml', XmlTool))).toContain('<b>x</b>');
    setDraft(draftKey('convert'), '[{"id":1,"n":"a;b"}]');
    const csv = text(render('convert', ConvertTool, { conversion: 'json-csv', separator: 'semicolon' }));
    expect(csv).toContain('id;n');
    expect(csv).toContain('1 fila · 2 columnas');
  });

  it('codificación', () => {
    setDraft(draftKey('base64'), 'SG9s*');
    expect(text(render('base64', Base64Tool, { direction: 'decode' }))).toContain('el carácter «*» de la posición 5');
    setDraft(draftKey('url'), 'a b');
    expect(text(render('url', UrlTool))).toContain('a%20b');
    setDraft(draftKey('html'), 'é<', );
    expect(text(render('html', HtmlTool, { flag: true }))).toContain('&#233;&lt;');
    setDraft(draftKey('jwt'), 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjF9.c2ln');
    const jwt = text(render('jwt', JwtTool));
    expect(jwt).toContain('Vencido');
    expect(jwt).toContain('HS256 · 4 caracteres');
    setDraft(draftKey('jwt'), 'a.b.c.d.e');
    expect(text(render('jwt', JwtTool))).toContain('JWE');
  });

  it('generadores, QR y códigos de barras', () => {
    for (const [tool, View] of [['uuid', UuidTool], ['password', PasswordTool], ['lorem', LoremTool]] as const) {
      expect(render(tool, View)).toContain('Generar');
    }
    expect(text(render('password', PasswordTool, { lower: false, upper: false, digits: false, symbols: false }))).toContain('Elige al menos');
    setDraft(draftKey('hash'), 'abc');
    expect(text(render('hash', HashTool))).toContain('MD5');
    setDraft(draftKey('qr'), 'https://logday.app');
    const qr = render('qr', QrTool);
    expect(qr).toContain('<svg aria-hidden="true"');
    expect(text(qr)).toContain('Versión 2 · 25×25 módulos');
    setDraft(draftKey('barcode'), '5901234123450');
    expect(text(render('barcode', BarcodeTool, { format: 'EAN13' }))).toContain('debería ser 7, no 0');
    setDraft(draftKey('barcode'), '590123412345');
    expect(text(render('barcode', BarcodeTool, { format: 'EAN13' }))).toContain('Dígito de control: 7');
  });

  it('fechas', () => {
    setDraft(draftKey('timestamp'), '1767225600');
    const ts = text(render('timestamp', TimestampTool));
    expect(ts).toContain('2026-01-01 00:00:00 UTC');
    expect(ts).toContain('2025-12-31T19:00:00-05:00');
    expect(ts).toContain('Timestamp en segundos');
    setDraft(draftKey('cron'), '0 9 * * 1-5');
    const cron = text(render('cron', CronTool));
    expect(cron).toContain('5 campos (estándar)');
    expect(cron).toContain('Próximas ejecuciones');
  });

  it('texto y listas', () => {
    setDraft(draftKey('diff'), 'a\nb');
    setDraft(draftKey('diff', 'modified'), 'a\nc');
    expect(text(render('diff', DiffTool))).toContain('+1 −1 líneas');
    setDraft(draftKey('regex', 'pattern'), '\\d+');
    setDraft(draftKey('regex'), 'a1b22');
    expect(render('regex', RegexTool)).toContain('Patrón');
    setDraft(draftKey('sql-list'), "1\nO'Brien\n1");
    const sql = text(render('sql-list', SqlListTool));
    expect(sql).toContain("IN ('1', 'O''Brien')");
    expect(sql).toContain('2 valores · 1 duplicado quitado');
    setDraft(draftKey('sql-list'), "'a', 'b");
    expect(text(render('sql-list', SqlListTool, { direction: 'toList' }))).toContain('comilla sin cerrar en la posición 6');
    setDraft(draftKey('list-compare'), 'a\nb\na');
    setDraft(draftKey('list-compare', 'b'), 'b\nc');
    const lc = text(render('list-compare', ListCompareTool));
    expect(lc).toContain('A 2 · B 2 · en las dos 1');
    expect(lc).toContain('1 duplicado');
  });
});

// ── La lista y la página de Opciones (D17–D22, design Adenda G) ──────

const nav = (active: ToolId, raw: Record<string, unknown>) =>
  renderToStaticMarkup(
    <DevtoolsContext.Provider value={context(active, readDevtoolsSettings(raw))}>
      <ToolNav active={active} idPrefix="t" onSelect={() => {}} />
    </DevtoolsContext.Provider>,
  );

describe('sin Cliente HTTP dentro (specs/cliente-http HT33, D11)', () => {
  it('con la extensión Cliente HTTP activa y una config vieja con lastTool "http": JSON, sin Red, y el pie de siempre', async () => {
    store.state.extensions = {
      devtools: { enabled: true, settings: { lastTool: 'http', hidden: ['http'], collapsed: ['network'] } },
      'http-client': { enabled: true },
    };
    const { default: DevtoolsView } = await import('./View');
    const html = renderToStaticMarkup(<DevtoolsView />);
    const t = text(html);
    expect(html).toMatch(/aria-current="page"[^>]*>.*?JSON/);
    expect(t).not.toContain('Cliente HTTP');
    expect(t).not.toMatch(/\bRed\b/);
    expect(t).toContain(makeTr('es')('privacyNote'));
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(6);
    store.state.extensions = {};
  });

  it('Opciones → DevTools no la ofrece', () => {
    store.state.extensions = { devtools: { enabled: true }, 'http-client': { enabled: true } };
    const t = text(renderToStaticMarkup(<DevtoolsSettingsPanel />));
    expect(t).not.toContain('Cliente HTTP');
    expect(t).not.toMatch(/\bRed\b/);
    store.state.extensions = {};
  });
});

describe('columna de herramientas', () => {
  it('sin nada guardado se ve como antes, con los encabezados desplegados', () => {
    const html = nav('json', { lastTool: 'json', options: {} });
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(6);
    expect(html).not.toContain('aria-expanded="false"');
    for (const tool of ALL_TOOLS) expect(text(html)).toContain(makeTr('es')(toolKey(tool, 'name')));
    expect(html).toContain('aria-label="Abrir las opciones de DevTools"');
  });

  it('un grupo plegado: aria-expanded, contador y la activa se sigue viendo', () => {
    const html = nav('yaml', { collapsed: ['formats', 'time'] });
    expect(html).toMatch(/<button[^>]*id="t-group-formats"[^>]*aria-expanded="false"[^>]*aria-controls="t-items-formats"/);
    expect(html).toContain('<span class="sr-only">, 4 herramientas</span>');
    expect(html).toMatch(/aria-current="page"[^>]*>.*?YAML/);
    const t = text(html);
    expect(t).not.toContain('JSON');
    expect(t).not.toContain('Timestamp');
    expect(t).toContain('Base64');
  });

  it('la activa oculta va en "Ocultas"', () => {
    const html = nav('jwt', { hidden: ['jwt', 'regex'] });
    expect(text(html)).toMatch(/Ocultas.*JWT/);
    expect(text(html)).not.toContain('Expresiones regulares');
  });

  it('al buscar, las ocultas que coinciden van al final y los plegados no esconden nada', () => {
    const settings = readDevtoolsSettings({ hidden: ['xml'], collapsed: ['formats'] });
    const resolved = resolveToolList(settings, (tool) => makeTr('es')(toolKey(tool, 'name')), 'es-CO');
    const tr = makeTr('es');
    const matches = (q: string) => (tool: ToolId) => fold([tr(toolKey(tool, 'name')), tr(toolKey(tool, 'keywords'))].join(' ')).includes(q);
    const blocks = navBlocks(resolved, settings, 'base64', matches('json'));
    expect(blocks.every((b) => !b.collapsible)).toBe(true);
    expect(blocks[0]).toMatchObject({ group: 'formats', collapsed: false });
    expect(blocks[0].tools).toContain('json');
    const xml = navBlocks(resolved, settings, 'base64', matches('xml'));
    expect(xml[xml.length - 1]).toMatchObject({ group: 'hidden', tools: ['xml'] });
    // Sin buscar, el grupo plegado sin la activa no muestra herramientas.
    expect(navBlocks(resolved, settings, 'base64')[0]).toMatchObject({ group: 'formats', collapsed: true, tools: [] });
  });

  it('A-Z: sin encabezados, en orden alfabético', () => {
    const html = nav('json', { layout: 'az' });
    expect(html).not.toContain('aria-expanded');
    const t = text(html);
    expect(t.indexOf('Base64')).toBeLessThan(t.indexOf('Cron'));
    expect(t.indexOf('Expresiones regulares')).toBeLessThan(t.indexOf('Hashes'));
  });
});

describe('Opciones → DevTools', () => {
  const page = (settings: Record<string, unknown>) => {
    store.state.extensions = { devtools: { enabled: true, settings } };
    return renderToStaticMarkup(<DevtoolsSettingsPanel />);
  };
  afterEach(() => {
    store.state.extensions = {};
  });

  it('por defecto: Por grupos, sin restablecer, y las flechas de los extremos con aria-disabled', () => {
    const html = page({ lastTool: 'json', options: {} });
    const t = text(html);
    expect(t).toContain('Lista de herramientas');
    expect(t).toContain('Arrastra para ordenar');
    expect(t).not.toContain('Restablecer orden');
    expect(t).not.toContain('Restablecer las opciones');
    expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*aria-label="Mover el grupo Formatos arriba"/);
    expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*aria-label="Mover JSON arriba"/);
    expect(html).not.toMatch(/aria-label="Mover YAML arriba"[^>]*disabled/);
    // Ninguna flecha usa `disabled` (el foco caería al body).
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""[^>]*aria-label="Mover/);
    expect(html.match(/<ul[^>]*data-group-row/g)).toHaveLength(6);
  });

  it('con cambios aparecen los botones de restablecer', () => {
    const t = text(page({ hidden: ['jwt'], options: { json: { indent: 4 } } }));
    expect(t).toContain('Restablecer orden');
    expect(t).toContain('Restablecer las opciones de las herramientas');
  });

  it('A-Z: sin asas ni flechas, con la ayuda del orden alfabético', () => {
    const html = page({ layout: 'az' });
    expect(html).not.toContain('Mover JSON arriba');
    expect(html).not.toContain('Arrastrar JSON');
    expect(text(html)).toContain('En la lista A-Z el orden es alfabético');
  });

  it('la última visible no se puede ocultar', () => {
    const html = page({ hidden: ALL_TOOLS.filter((tool) => tool !== 'cron') });
    expect(text(html)).toContain('Deja al menos una herramienta visible.');
  });
});
