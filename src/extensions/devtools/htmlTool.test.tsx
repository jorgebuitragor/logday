// Visor HTML (specs/devtools D26): formatear, minificar, los avisos de
// estructura, el iframe aislado y la herramienta dibujada con
// react-dom/server.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { checkHtml, formatHtml, minifyHtml } from './tools/htmlFormat';
import { HtmlPreview, previewScale } from '../../components/shared/HtmlPreview';
import { clearDrafts, draftKey, readDevtoolsSettings, setDraft, toolForBlock, type ToolId } from './model';
import { DevtoolsContext, type DevtoolsContextValue } from './ui/context';
import { makeTr, shortcutLabel } from './ui/text';
import HtmlPreviewTool from './views/HtmlPreviewTool';

vi.mock('../../store/appStore', () => ({
  useAppStore: Object.assign((select: (s: unknown) => unknown) => select({ showToast: () => '' }), { getState: () => ({}) }),
}));

afterEach(() => clearDrafts());

describe('formatHtml', () => {
  it('sangra los bloques y deja en una línea el contenido de línea', () => {
    const src = '<!DOCTYPE html><html><head><title>T</title></head><body><h1>Hola</h1><p>Un <b>texto</b>   con\n espacios</p><ul><li>a</li><li>b</li></ul></body></html>';
    expect(formatHtml(src)).toBe(
      [
        '<!DOCTYPE html>',
        '<html>',
        '  <head>',
        '    <title>T</title>',
        '  </head>',
        '  <body>',
        '    <h1>Hola</h1>',
        '    <p>Un <b>texto</b> con espacios</p>',
        '    <ul>',
        '      <li>a</li>',
        '      <li>b</li>',
        '    </ul>',
        '  </body>',
        '</html>',
      ].join('\n'),
    );
  });

  it('con 4 espacios o tab', () => {
    expect(formatHtml('<div><p>x</p></div>', 4)).toBe('<div>\n    <p>x</p>\n</div>');
    expect(formatHtml('<div><p>x</p></div>', 'tab')).toBe('<div>\n\t<p>x</p>\n</div>');
  });

  it('no toca el contenido de pre ni de textarea', () => {
    const src = '<div><pre>  a\n    b\n</pre><textarea>  x  y </textarea></div>';
    expect(formatHtml(src)).toBe('<div>\n  <pre>  a\n    b\n</pre>\n  <textarea>  x  y </textarea>\n</div>');
  });

  it('vuelve a sangrar style y script', () => {
    const src = '<head><style>\n        body { margin: 0 }\n          p { color: red }\n    </style></head>';
    expect(formatHtml(src)).toBe('<head>\n  <style>\n    body { margin: 0 }\n      p { color: red }\n  </style>\n</head>');
  });

  it('vacíos, comentarios, atributos sin comillas y elementos sin cerrar', () => {
    expect(formatHtml('<div><br><img src=a.png alt=""><!-- nota --></div>')).toBe('<div>\n  <br><img src=a.png alt="">\n  <!-- nota -->\n</div>');
    // `<li>` se cierra solo: no se agrega un cierre que no estaba.
    expect(formatHtml('<ul><li>a<li>b</ul>')).toBe('<ul>\n  <li>a\n  <li>b\n</ul>');
  });

  it('el SVG con <x/>', () => {
    expect(formatHtml('<div><svg viewBox="0 0 1 1"><path d="M0 0"/><g><circle r="1"/></g></svg></div>')).toBe(
      '<div>\n  <svg viewBox="0 0 1 1">\n    <path d="M0 0" />\n    <g>\n      <circle r="1" />\n    </g>\n  </svg>\n</div>',
    );
  });

  it('formatear dos veces da lo mismo', () => {
    const src = '<main><section><h2>A</h2><p>b <a href="#">c</a></p></section></main>';
    expect(formatHtml(formatHtml(src))).toBe(formatHtml(src));
  });

  it('vacío', () => {
    expect(formatHtml('')).toBe('');
    expect(formatHtml('  \n ')).toBe('');
  });
});

describe('minifyHtml', () => {
  it('quita los espacios entre bloques y los comentarios, y deja uno entre palabras', () => {
    const src = '<!DOCTYPE html>\n<html>\n  <body>\n    <!-- nota -->\n    <h1> Hola </h1>\n    <p>Un  <b>texto</b>\n con <i>espacios</i> </p>\n  </body>\n</html>\n';
    expect(minifyHtml(src)).toBe('<!DOCTYPE html><html><body><h1>Hola</h1><p>Un <b>texto</b> con <i>espacios</i></p></body></html>');
  });

  it('conserva pre, textarea y el espacio entre elementos de línea', () => {
    expect(minifyHtml('<div>\n  <pre> a\n b </pre>\n</div>')).toBe('<div><pre> a\n b </pre></div>');
    expect(minifyHtml('<p><b>a</b> <i>b</i></p>')).toBe('<p><b>a</b> <i>b</i></p>');
    expect(minifyHtml('<style>\n  a { b: c }\n</style>')).toBe('<style>a { b: c }</style>');
  });

  it('minificar y formatear se deshacen', () => {
    const src = '<ul>\n  <li>a</li>\n  <li>b <b>c</b></li>\n</ul>';
    expect(formatHtml(minifyHtml(src))).toBe(src);
  });

  it('vacío', () => {
    expect(minifyHtml(' \n ')).toBe('');
  });
});

describe('checkHtml', () => {
  it('sin avisos en HTML correcto, aunque omita cierres opcionales', () => {
    expect(checkHtml('<!DOCTYPE html><html><head><title>a</title><body><p>uno<p>dos<ul><li>a<li>b</ul><table><tr><td>1<td>2</table>')).toEqual([]);
    expect(checkHtml('<img src=x><br/><input>')).toEqual([]);
  });

  it('una etiqueta sin cerrar y un cierre de más, con su línea', () => {
    expect(checkHtml('<div>\n<span>a\n</div>')).toEqual([{ code: 'unclosed', tag: 'span', line: 2 }]);
    expect(checkHtml('<p>a</p>\n</section>')).toEqual([{ code: 'stray', tag: 'section', line: 2 }]);
    expect(checkHtml('<div>\n<div>')).toEqual([
      { code: 'unclosed', tag: 'div', line: 1 },
      { code: 'unclosed', tag: 'div', line: 2 },
    ]);
  });

  it('vacío', () => {
    expect(checkHtml('')).toEqual([]);
  });
});

describe('HtmlPreview', () => {
  it('el iframe tiene sandbox vacío y el documento en srcdoc', () => {
    const html = renderToStaticMarkup(<HtmlPreview html={'<p>Hola</p><script>alert(1)</script>'} title="Vista previa" />);
    const iframe = /<iframe[^>]*>/.exec(html)![0];
    expect(iframe).toMatch(/\ssandbox=""/);
    expect(iframe).not.toMatch(/allow-/);
    expect(iframe).toContain('title="Vista previa"');
    expect(iframe).toMatch(/referrerpolicy="no-referrer"/i);
    expect(iframe).toMatch(/srcDoc="&lt;!DOCTYPE html&gt;&lt;html&gt;&lt;head&gt;&lt;meta http-equiv=&quot;Content-Security-Policy&quot;/i);
  });

  it('con recursos externos, la CSP con https', () => {
    const html = renderToStaticMarkup(<HtmlPreview html="<p>x</p>" allowExternal title="t" />);
    expect(html).toContain('img-src data: blob: https:');
  });

  it('con un ancho simulado, el iframe mide ese ancho', () => {
    const html = renderToStaticMarkup(<HtmlPreview html="<p>x</p>" width={375} title="t" />);
    expect(html).toMatch(/<iframe[^>]*style="width:375px/);
  });

  it('la escala solo achica', () => {
    expect(previewScale(375, 500)).toBe(1);
    expect(previewScale(768, 384)).toBe(0.5);
    expect(previewScale(null, 300)).toBe(1);
    expect(previewScale(768, 0)).toBe(1);
  });
});

function render(options: Record<string, string> = {}) {
  const tool: ToolId = 'html-preview';
  const ctx: DevtoolsContextValue = {
    tool, language: 'es', tr: makeTr('es'), mac: true,
    settings: { ...readDevtoolsSettings({}), lastTool: tool, options: { [tool]: options } },
    updateSettings: () => {}, openSettings: () => {}, setOptions: () => {}, announce: () => {}, copyText: async () => true,
    saveNote: async () => null, openNote: () => {}, openPicker: () => {}, actionsRef: { current: {} }, loadedFrom: null,
    clearLoaded: () => {}, takeFocus: () => false, goTo: () => {}, shortcut: (spec) => shortcutLabel(spec, true),
    switcherOpen: false, setSwitcherOpen: () => {},
  };
  return renderToStaticMarkup(
    <DevtoolsContext.Provider value={ctx}>
      <HtmlPreviewTool />
    </DevtoolsContext.Provider>,
  );
}

describe('Visor HTML', () => {
  it('vacío: el estado vacío con el ejemplo y el aviso de aislamiento', () => {
    const html = render();
    expect(html).toContain('Visor HTML');
    expect(html).toContain('La vista previa aparece aquí.');
    expect(html).toContain('Probar con un ejemplo');
    expect(html).toContain('Vista previa aislada: sin scripts ni recursos externos.');
    expect(html).not.toContain('<iframe');
    // El interruptor de recursos externos empieza apagado.
    expect(html).toMatch(/role="switch"[^>]*aria-checked="false"/);
  });

  it('con HTML: la vista previa aislada, el tamaño y los avisos', () => {
    setDraft(draftKey('html-preview'), '<div>\n<p>Hola <a href="https://example.com">x</a>\n</section>');
    const html = render({ width: 'mobile' });
    expect(html).toMatch(/<iframe[^>]*sandbox=""/);
    expect(html).toContain('data-logday-href=&quot;https://example.com&quot;');
    expect(html).toContain('3 líneas');
    expect(html).toContain('Línea 3: &lt;/section&gt; no cierra ninguna etiqueta abierta.');
    expect(html).toContain('La etiqueta &lt;div&gt; de la línea 1 no se cierra.');
    expect(html).toMatch(/aria-checked="true"[^>]*>Móvil/);
  });

  it('un bloque ```html de una nota se abre aquí; uno ```svg, en XML', () => {
    expect(toolForBlock({ language: 'html', code: '<p>x</p>' })).toBe('html-preview');
    expect(toolForBlock({ language: 'svg', code: '<svg/>' })).toBe('xml');
    expect(toolForBlock({ language: '', code: '<!DOCTYPE html><p>x</p>' })).toBe('html-preview');
    expect(toolForBlock({ language: '', code: '<?xml version="1.0"?><a/>' })).toBe('xml');
  });
});
