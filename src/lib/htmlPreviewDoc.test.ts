// La vista previa aislada (specs/devtools D26): el documento que va en el
// `srcdoc`. La CSP tiene que ser lo primero, y nada de lo del usuario puede
// navegar ni salir a la red.
import { describe, expect, it } from 'vitest';
import { buildPreviewDoc, neutralizeLoose, previewCsp, sanitizePreviewHtml } from './htmlPreviewDoc';
import { tokenizeHtml } from './htmlTokenizer';

const CSP_DEFAULT = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; base-uri 'none'; form-action 'none'";
const PREFIX = `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="`;

/** Las etiquetas de apertura que vería el navegador, con sus atributos. */
const openTags = (html: string) =>
  tokenizeHtml(html).flatMap((t) => (t.type === 'open' ? [{ name: t.name, attrs: Object.fromEntries(t.attrs.map((a) => [a.name.toLowerCase(), a.value])) }] : []));

describe('previewCsp', () => {
  it('por defecto, nada de red', () => {
    expect(previewCsp()).toBe(CSP_DEFAULT);
    expect(previewCsp()).not.toMatch(/https?:/);
    expect(previewCsp()).not.toContain('script-src');
  });

  it('con recursos externos, solo https para imágenes, estilos, fuentes y medios', () => {
    const csp = previewCsp(true);
    expect(csp).toContain("style-src 'unsafe-inline' https:");
    expect(csp).toContain('img-src data: blob: https:');
    expect(csp).toContain('font-src data: https:');
    expect(csp).toContain('media-src data: blob: https:');
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('http:');
    expect(csp).not.toContain('script');
  });
});

describe('buildPreviewDoc', () => {
  it('la CSP es lo primero del <head>, antes de cualquier cosa del usuario', () => {
    for (const html of [
      '<p>Hola</p>',
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>x</title></head><body>y</body></html>',
      '<head><meta http-equiv="Content-Security-Policy" content="default-src *"></head>',
      'texto suelto',
      '<img src="https://example.com/a.png">',
    ]) {
      const doc = buildPreviewDoc(html);
      expect(doc.startsWith(`${PREFIX}${CSP_DEFAULT}">`)).toBe(true);
      // La primera etiqueta con atributos es nuestra meta.
      const first = openTags(doc)[2];
      expect(first.name).toBe('meta');
      expect(first.attrs['http-equiv']).toBe('Content-Security-Policy');
    }
  });

  it('con recursos externos cambia solo la política', () => {
    const doc = buildPreviewDoc('<p>x</p>', { allowExternal: true });
    expect(doc.startsWith(`${PREFIX}${previewCsp(true)}">`)).toBe(true);
    expect(doc.endsWith('<p>x</p>')).toBe(true);
  });

  it('el HTML vacío da un documento solo con lo nuestro', () => {
    const doc = buildPreviewDoc('');
    expect(doc).toContain(CSP_DEFAULT);
    expect(doc.endsWith('</style>')).toBe(true);
    expect(openTags(doc).map((t) => t.name)).toEqual(['html', 'head', 'meta', 'meta', 'meta', 'style']);
  });

  it('desactiva la precarga de DNS y el referrer', () => {
    const doc = buildPreviewDoc('<p>x</p>');
    expect(doc).toContain('<meta http-equiv="x-dns-prefetch-control" content="off">');
    expect(doc).toContain('<meta name="referrer" content="no-referrer">');
  });

  it('con y sin <html>/<head>: lo del usuario queda después de lo nuestro, sin su DOCTYPE', () => {
    const full = buildPreviewDoc('<!DOCTYPE html>\n<html lang="es">\n<head><title>T</title></head>\n<body><p>x</p></body>\n</html>');
    expect(full.match(/<!DOCTYPE/gi)).toHaveLength(1);
    expect(full.indexOf('<title>T</title>')).toBeGreaterThan(full.indexOf(CSP_DEFAULT));
    expect(full).toContain('<html lang="es">');
    const bare = buildPreviewDoc('<h1>Hola</h1>');
    expect(bare.endsWith('</style><h1>Hola</h1>')).toBe(true);
  });

  it('una CSP del usuario se conserva: solo puede restringir más', () => {
    const doc = buildPreviewDoc('<meta http-equiv="Content-Security-Policy" content="img-src *">');
    expect(doc.indexOf('img-src *')).toBeGreaterThan(doc.indexOf(CSP_DEFAULT));
  });
});

describe('sanitizePreviewHtml', () => {
  it('quita <base>, se escriba como se escriba', () => {
    expect(sanitizePreviewHtml('<base href="https://evil.example/"><p>x</p>')).toBe('<p>x</p>');
    expect(sanitizePreviewHtml('<BASE HREF=https://evil.example/ target=_top><p>x</p>')).toBe('<p>x</p>');
    expect(sanitizePreviewHtml('<head><base\nhref="//evil.example"></head>')).toBe('<head></head>');
  });

  it('quita <meta http-equiv="refresh"> y los http-equiv que no son inocuos', () => {
    expect(sanitizePreviewHtml('<meta http-equiv="refresh" content="0;url=https://evil.example">x')).toBe('x');
    expect(sanitizePreviewHtml('<meta HTTP-EQUIV=" Refresh " content="1">x')).toBe('x');
    expect(sanitizePreviewHtml('<meta http-equiv="set-cookie" content="a=b">x')).toBe('x');
    expect(sanitizePreviewHtml('<meta http-equiv="Content-Type" content="text/html; charset=utf-8">')).toContain('Content-Type');
    expect(sanitizePreviewHtml('<meta charset="utf-8"><meta name="viewport" content="width=device-width">')).toBe(
      '<meta charset="utf-8"><meta name="viewport" content="width=device-width">',
    );
  });

  it('neutraliza los enlaces: sin href, con el destino en el title', () => {
    const out = sanitizePreviewHtml('<a href="https://example.com/x">ir</a>');
    expect(out).toBe('<a data-logday-href="https://example.com/x" title="https://example.com/x">ir</a>');
    expect(openTags(out)[0].attrs.href).toBeUndefined();
  });

  it('neutraliza todas las formas de href', () => {
    const cases = [
      '<a HREF="https://e.example">x</a>',
      "<a href='https://e.example'>x</a>",
      '<a href=https://e.example>x</a>',
      '<a\nhref = "https://e.example">x</a>',
      '<a/href="https://e.example">x</a>',
      '<a title=">" href="https://e.example">x</a>',
      '<a href="#arriba">x</a>',
      '<a href="">x</a>',
      '<a href>x</a>',
      '<a href="javascript:alert(1)">x</a>',
      '<area shape="rect" coords="0,0,1,1" href="https://e.example">',
      '<svg><a href="https://e.example"><text>x</text></a></svg>',
      '<svg><a xlink:href="https://e.example"><text>x</text></a></svg>',
      '<math><mi href="https://e.example">x</mi></math>',
      '<a href="https://ok.example" href="https://e.example">x</a>',
    ];
    for (const html of cases) {
      const tags = openTags(sanitizePreviewHtml(html));
      for (const tag of tags) {
        for (const name of Object.keys(tag.attrs)) expect(name, html).not.toMatch(/^(?:[^:]+:)?href$/);
      }
    }
  });

  it('neutraliza las animaciones SVG que ponen un href (SMIL corre sin scripts)', () => {
    for (const html of [
      '<svg><a><set attributeName="href" to="https://e.example"/><text>x</text></a></svg>',
      '<svg><a><animate attributeName="xlink:href" values="https://e.example"/></a></svg>',
      '<svg><a><animate ATTRIBUTENAME=" HREF " values="https://e.example"/></a></svg>',
    ]) {
      for (const tag of openTags(sanitizePreviewHtml(html))) expect(tag.attrs.attributename, html).toBeUndefined();
    }
    // Las demás animaciones siguen.
    expect(sanitizePreviewHtml('<svg><animate attributeName="opacity" values="0;1"/></svg>')).toContain('attributeName="opacity"');
  });

  it('el title del enlace no rompe la etiqueta ni pisa el del usuario', () => {
    expect(sanitizePreviewHtml('<a href=a"b>x</a>')).toBe(`<a data-logday-href=a"b title='a"b'>x</a>`);
    expect(sanitizePreviewHtml('<a title="Mío" href="https://e.example">x</a>')).toBe('<a title="Mío" data-logday-href="https://e.example">x</a>');
  });

  it('conserva las referencias internas de SVG (<use href="#…">)', () => {
    expect(sanitizePreviewHtml('<svg><use href="#icono"/></svg>')).toBe('<svg><use href="#icono"/></svg>');
    expect(sanitizePreviewHtml('<svg><use href="https://e.example/s.svg#i"/></svg>')).toBe('<svg><use data-logday-href="https://e.example/s.svg#i"/></svg>');
  });

  it('deja las hojas de estilo y quita las pistas de recursos', () => {
    expect(sanitizePreviewHtml('<link rel="stylesheet" href="https://cdn.example/a.css">')).toBe('<link rel="stylesheet" href="https://cdn.example/a.css">');
    for (const rel of ['dns-prefetch', 'preconnect', 'prefetch', 'prerender', 'preload', 'icon', 'stylesheet preload']) {
      expect(sanitizePreviewHtml(`<link rel="${rel}" href="https://e.example">x`)).toBe('x');
    }
  });

  it('quita srcdoc de los iframes anidados', () => {
    const out = sanitizePreviewHtml('<iframe srcdoc="<a href=https://e.example>x</a>"></iframe>');
    expect(openTags(out)[0].attrs.srcdoc).toBeUndefined();
  });

  it('las etiquetas escondidas en comentarios o texto crudo también quedan sin href', () => {
    // Si el tokenizador y el navegador no coincidieran (SVG, comentarios
    // raros), lo que haya ahí ya no navega.
    expect(sanitizePreviewHtml('<!-- <a href="https://e.example">x</a> -->')).not.toMatch(/\shref=/);
    expect(sanitizePreviewHtml('<svg><desc><style><a href="https://e.example">x</a></style></desc></svg>')).not.toMatch(/\shref=/);
    expect(sanitizePreviewHtml('<style>/* <meta http-equiv="refresh" content="0"> */</style>')).not.toMatch(/\shttp-equiv=/);
    expect(neutralizeLoose('<a/href="x">')).toBe('<a/data-logday-href="x">');
    // Un selector de CSS no se toca.
    expect(neutralizeLoose('a[href^="https"]{color:red}')).toBe('a[href^="https"]{color:red}');
  });

  it('respeta el resto tal como está escrito', () => {
    const html = '<p class="a" data-x=1>Hola &amp; <b>mundo</b></p>\n<img src="data:image/png;base64,AAAA" alt="">';
    expect(sanitizePreviewHtml(html)).toBe(html);
  });

  it('normaliza los finales de línea y quita el BOM', () => {
    expect(sanitizePreviewHtml('\uFEFF<p>a</p>\r\n<p>b</p>\r')).toBe('<p>a</p>\n<p>b</p>\n');
  });

  it('una etiqueta sin cerrar al final se descarta, como en el navegador', () => {
    expect(sanitizePreviewHtml('<p>x</p><a href="https://e.example"')).toBe('<p>x</p>');
  });
});

describe('tokenizeHtml', () => {
  it('lee el texto crudo de style, script, textarea y title', () => {
    const tokens = tokenizeHtml('<style>a<b>c</style ><textarea><p></textarea><script>if (a</b) {}</script>');
    expect(tokens.map((t) => t.type)).toEqual(['open', 'raw', 'close', 'open', 'raw', 'close', 'open', 'raw', 'close']);
  });

  it('dentro de <svg> no hay texto crudo, y sí CDATA', () => {
    const tokens = tokenizeHtml('<svg><style><a href="x"></a></style><![CDATA[ <b> ]]></svg><style><i></style>');
    const types = tokens.map((t) => (t.type === 'open' || t.type === 'close' ? `${t.type}:${t.name}` : t.type));
    expect(types).toEqual(['open:svg', 'open:style', 'open:a', 'close:a', 'close:style', 'comment', 'close:svg', 'open:style', 'raw', 'close:style']);
  });

  it('comentarios: -->, --!>, <!--> y comentarios falsos', () => {
    const types = (s: string) => tokenizeHtml(s).map((t) => t.type);
    expect(types('<!-- a --!><p>')).toEqual(['comment', 'open']);
    expect(types('<!--><p>')).toEqual(['comment', 'open']);
    expect(types('<!---><p>')).toEqual(['comment', 'open']);
    expect(types('<?php x ?><p>')).toEqual(['comment', 'open']);
    expect(types('</ x><p>')).toEqual(['comment', 'open']);
    expect(types('a < b <3')).toEqual(['text']);
  });
});
