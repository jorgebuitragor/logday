// El documento de la vista previa aislada de HTML (specs/devtools D26).
// Lo dibuja `HtmlPreview` en un `<iframe sandbox="" srcdoc>`: sin scripts,
// sin formularios, sin ventanas nuevas y con un origen opaco. Este archivo
// arma lo que va en `srcdoc` y es puro, para probarlo sin DOM.
//
// Tres capas, porque ninguna basta sola:
// 1. `sandbox=""` (en el componente): no corre ningún script, no se envía
//    ningún formulario y no se abre ni se navega otra ventana.
// 2. La CSP de `previewCsp`, en una `<meta>` que es lo primero del `<head>`:
//    nada de red (o solo imágenes, estilos y fuentes por https si el usuario
//    lo pide). Va antes de todo lo del usuario, así que rige para todo lo que
//    se carga después. Una CSP del usuario no la puede relajar: con varias
//    políticas, el navegador exige que un recurso las cumpla todas, así que
//    otra `<meta>` solo restringe más. Y sin scripts nadie la puede quitar.
// 3. El saneado (`sanitizePreviewHtml`): la CSP no cubre la navegación (y
//    `navigate-to` no existe en WebKit), así que un clic en
//    `<a href="https://…">` navegaría el propio iframe y saldría a la red.
//    Por eso se quitan los `href` de los enlaces, `<base>`, los `<meta
//    http-equiv>` que no sean inocuos (refresh), los `<link>` que no son
//    hojas de estilo (dns-prefetch, preconnect), `srcdoc` de los iframes
//    anidados y las animaciones SVG que ponen un `href`.

import { serializeAttr, tokenizeHtml, type HtmlAttr } from './htmlTokenizer';

export interface PreviewDocOptions {
  /** "Cargar recursos externos": imágenes, estilos, fuentes y medios por
   *  https. Nunca scripts ni http. */
  allowExternal?: boolean;
}

/** El atributo al que pasa un `href` neutralizado (y `srcdoc`, etc.). */
export const NEUTRALIZED_PREFIX = 'data-logday-';

/** La política de la vista previa. `base-uri` y `form-action` no heredan
 *  de `default-src`, por eso van aparte. */
export function previewCsp(allowExternal = false): string {
  const ext = allowExternal ? ' https:' : '';
  return [
    "default-src 'none'",
    `style-src 'unsafe-inline'${ext}`,
    `img-src data: blob:${ext}`,
    `font-src data:${ext}`,
    `media-src data: blob:${ext}`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** Los `http-equiv` del usuario que se conservan: no navegan ni cargan
 *  nada. Una CSP propia solo puede restringir más (ver arriba). */
const SAFE_HTTP_EQUIV = new Set(['content-security-policy', 'content-type', 'content-language', 'x-ua-compatible']);
/** Pistas de recursos: piden DNS o conexiones que la CSP no siempre frena. */
const RESOURCE_HINTS = new Set(['dns-prefetch', 'preconnect', 'prefetch', 'prerender', 'preload', 'modulepreload']);

const lower = (s: string) => s.toLowerCase();
const attrValue = (attrs: readonly HtmlAttr[], name: string) => attrs.find((a) => lower(a.name) === name)?.value ?? null;

/** `href` con cualquier prefijo (`xlink:href`). */
const isHrefName = (name: string) => /^(?:[^:]+:)?href$/i.test(name);

/** Los atributos de una etiqueta, ya neutralizados. `null`: la etiqueta se
 *  quita entera. */
function cleanTag(name: string, attrs: readonly HtmlAttr[]): HtmlAttr[] | null {
  if (name === 'base') return null;
  if (name === 'meta') {
    const equiv = attrValue(attrs, 'http-equiv');
    if (equiv !== null && !SAFE_HTTP_EQUIV.has(lower(equiv.trim()))) return null;
  }
  if (name === 'link') {
    // Solo hojas de estilo: la CSP decide si se cargan (externos).
    const rel = lower(attrValue(attrs, 'rel') ?? '').split(/[\s]+/).filter(Boolean);
    if (!rel.includes('stylesheet') || rel.some((r) => RESOURCE_HINTS.has(r))) return null;
  }
  const isLink = name === 'a' || name === 'area';
  const out: HtmlAttr[] = [];
  let neutralizedHref: HtmlAttr | null = null;
  for (const attr of attrs) {
    const attrName = lower(attr.name);
    // Una animación SVG (SMIL, que corre sin scripts) puede poner un `href`
    // en un enlace: `<a><set attributeName="href" to="https://…"/></a>`.
    const animatesHref = attrName === 'attributename' && isHrefName((attr.value ?? '').trim());
    if (attrName === 'srcdoc' || attrName === 'ping' || animatesHref) {
      out.push({ ...attr, name: NEUTRALIZED_PREFIX + attrName });
      continue;
    }
    if (name !== 'link' && isHrefName(attr.name)) {
      // Una referencia interna de SVG (`<use href="#icono">`) no sale del
      // documento. En un enlace, `#ancla` sí navegaría: en un `srcdoc` se
      // resuelve contra la URL de la app, no contra el propio documento.
      const internal = !isLink && (attr.value ?? '').trim().startsWith('#');
      if (internal) {
        out.push(attr);
        continue;
      }
      const renamed = { ...attr, name: NEUTRALIZED_PREFIX + attrName.replace(':', '-') };
      out.push(renamed);
      neutralizedHref ??= attr;
      continue;
    }
    out.push(attr);
  }
  // El destino se ve al pasar el ratón, como en un navegador.
  const target = neutralizedHref?.value;
  if (isLink && target && attrValue(attrs, 'title') === null) {
    // Un valor sin comillas puede llevar una de ellas: se elige la otra.
    const quote = neutralizedHref!.quote || (target.includes('"') ? "'" : '"');
    if (!target.includes(quote)) out.push({ name: 'title', value: target, quote });
  }
  return out;
}

/** Segunda pasada sobre lo que no es texto ni una etiqueta leída
 *  (comentarios, contenido de `<style>`/`<script>`/`<textarea>`, CDATA):
 *  si el tokenizador se equivocó y el navegador ve ahí una etiqueta, sus
 *  `href`, `srcdoc`, `http-equiv`, `ping` y `attributeName` ya no valen.
 *  A lo sumo cambia un texto que nadie ve o que no se ejecuta (y, en un
 *  `<textarea>` o `<title>`, uno que sí se ve). */
export function neutralizeLoose(raw: string): string {
  return raw.replace(/(^|[\s"'/=<>`])((?:[\w-]+:)?href|srcdoc|http-equiv|ping|attributename)(?=[\s/>=]|$)/gi, (_m, pre: string, attr: string) =>
    `${pre}${NEUTRALIZED_PREFIX}${attr.replace(':', '-')}`,
  );
}

/** El HTML del usuario, sin lo que podría navegar o salir a la red.
 *  Respeta todo lo demás tal como está escrito. */
export function sanitizePreviewHtml(html: string): string {
  // El navegador convierte CRLF y CR en LF antes de leer.
  const src = html.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let out = '';
  for (const token of tokenizeHtml(src)) {
    switch (token.type) {
      case 'text':
        out += token.raw;
        break;
      case 'doctype':
        // El documento ya empieza con el nuestro; otro más se ignora.
        break;
      case 'comment':
      case 'raw':
        out += neutralizeLoose(token.raw);
        break;
      case 'close':
        out += `</${token.rawName}>`;
        break;
      case 'open': {
        const attrs = cleanTag(token.name, token.attrs);
        // Las que se quitan (base, meta, link) no tienen contenido.
        if (attrs === null) break;
        const parts = [token.rawName, ...attrs.map(serializeAttr)].join(' ');
        out += `<${parts}${token.selfClosing ? '/>' : '>'}`;
        break;
      }
    }
  }
  return out;
}

/** Estilos que van antes de los del usuario (él los puede cambiar): los
 *  enlaces neutralizados siguen pareciendo enlaces. */
const BASE_STYLE = `a[${NEUTRALIZED_PREFIX}href],area[${NEUTRALIZED_PREFIX}href]{color:#0000ee;text-decoration:underline;cursor:not-allowed}`;

/** Lo que va en `srcdoc`. El documento lo abrimos nosotros: el DOCTYPE, el
 *  `<html>` y el `<head>` con la CSP primero. El `<head>` no se cierra, así
 *  que el HTML del usuario sigue ahí:
 *  - si trae `<!DOCTYPE>`, `<html>` o `<head>`, el navegador los ignora (sus
 *    atributos de `<html>`, como `lang`, pasan al nuestro) y lo que hay en su
 *    `<head>` queda en el nuestro, después de la CSP;
 *  - si empieza con contenido (`<p>`, texto), el navegador cierra el
 *    `<head>` y abre el `<body>` solo.
 *  Siempre se dibuja en modo estándar, aunque el HTML no traiga DOCTYPE. */
export function buildPreviewDoc(html: string, { allowExternal = false }: PreviewDocOptions = {}): string {
  return (
    '<!DOCTYPE html><html><head>' +
    `<meta http-equiv="Content-Security-Policy" content="${previewCsp(allowExternal)}">` +
    '<meta http-equiv="x-dns-prefetch-control" content="off">' +
    '<meta name="referrer" content="no-referrer">' +
    `<style>${BASE_STYLE}</style>` +
    sanitizePreviewHtml(html)
  );
}
