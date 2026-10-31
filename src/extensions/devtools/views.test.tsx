// Prueba de humo de la vista de DevTools: cada herramienta se dibuja (con
// react-dom/server, sin DOM) con una entrada de ejemplo y muestra su
// resultado. No prueba la interacción, que se revisa en el navegador.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { clearDrafts, draftKey, setDraft, type ToolId } from './model';
import { DevtoolsContext, type DevtoolsContextValue } from './ui/context';
import { makeTr, shortcutLabel } from './ui/text';
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

// El store real necesita `window`; las herramientas solo usan `showToast`.
vi.mock('../../store/appStore', () => ({
  useAppStore: (select: (s: { showToast: () => string }) => unknown) => select({ showToast: () => '' }),
}));

function render(tool: ToolId, View: ComponentType, options: Record<string, string | number | boolean> = {}) {
  const ctx: DevtoolsContextValue = {
    tool,
    language: 'es',
    tr: makeTr('es'),
    mac: true,
    settings: { lastTool: tool, options: { [tool]: options } },
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
