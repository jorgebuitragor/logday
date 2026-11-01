// Tokenizador de HTML, pequeño y sin DOM. Lo usan el saneado de la vista
// previa aislada (`htmlPreviewDoc.ts`) y el formateador del Visor HTML de
// DevTools. Sigue los estados del tokenizador del estándar HTML en lo que
// decide qué es una etiqueta: `<` + letra abre una, `</` + letra la cierra,
// los comentarios (`-->`, `--!>`, `<!-->`), los comentarios falsos (`<!x>`,
// `<?x>`, `</ x>`), las comillas solo justo después de `=` y el texto crudo
// de `<style>`, `<script>`, `<textarea>`, `<title>`, etc.
//
// Lo que no imita (el árbol: dónde se cierran las etiquetas, el contenido
// SVG/MathML) se resuelve hacia el lado seguro para el saneado: dentro de
// `<svg>` o `<math>` nunca se pasa a texto crudo, y los trozos que no son
// texto llevan una segunda pasada (`neutralizeLoose` en htmlPreviewDoc.ts).

export interface HtmlAttr {
  /** Tal como está escrito (las mayúsculas se conservan). */
  name: string;
  /** El valor sin las comillas, con sus entidades sin decodificar; `null`
   *  si el atributo no tiene `=`. */
  value: string | null;
  quote: '"' | "'" | '';
}

export type HtmlToken =
  | { type: 'text'; raw: string; start: number }
  /** Comentario, comentario falso (`<!x>`, `<?x>`, `</ x>`) o CDATA. */
  | { type: 'comment'; raw: string; start: number }
  | { type: 'doctype'; raw: string; start: number }
  | {
      type: 'open';
      /** En minúsculas, como lo ve el navegador. */
      name: string;
      rawName: string;
      attrs: HtmlAttr[];
      selfClosing: boolean;
      raw: string;
      start: number;
    }
  | { type: 'close'; name: string; rawName: string; raw: string; start: number }
  /** El contenido de un elemento de texto crudo (style, script, textarea…). */
  | { type: 'raw'; raw: string; start: number; parent: string };

/** Los elementos cuyo contenido el navegador no lee como etiquetas (en el
 *  espacio de nombres HTML). `noscript` no está: sin scripts se lee normal. */
export const RAW_TEXT_ELEMENTS: ReadonlySet<string> = new Set([
  'script', 'style', 'xmp', 'iframe', 'noembed', 'noframes', 'textarea', 'title', 'plaintext',
]);

const isAlpha = (c: string | undefined) => !!c && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'));
/** Espacios del tokenizador: tab, LF, FF, espacio (y CR, que el navegador
 *  convierte antes en LF). */
const isSpace = (c: string | undefined) => c === ' ' || c === '\n' || c === '\t' || c === '\f' || c === '\r';

interface TagParse {
  rawName: string;
  attrs: HtmlAttr[];
  selfClosing: boolean;
  /** Índice justo después del `>`; -1 si el texto se acaba antes (el
   *  navegador descarta esa etiqueta). */
  end: number;
}

/** Lee una etiqueta desde `i`, la primera letra del nombre. */
function parseTag(src: string, i: number): TagParse {
  const n = src.length;
  let j = i;
  while (j < n && !isSpace(src[j]) && src[j] !== '/' && src[j] !== '>') j++;
  const rawName = src.slice(i, j);
  const attrs: HtmlAttr[] = [];
  let selfClosing = false;
  for (;;) {
    // Antes del nombre del atributo: espacios y `/` (que solo marca la
    // etiqueta como autocerrada si va justo antes de `>`).
    while (j < n && (isSpace(src[j]) || src[j] === '/')) {
      if (src[j] === '/' && src[j + 1] === '>') {
        selfClosing = true;
        j++;
        break;
      }
      j++;
    }
    if (j >= n) return { rawName, attrs, selfClosing, end: -1 };
    if (src[j] === '>') return { rawName, attrs, selfClosing, end: j + 1 };
    // Nombre: el primer carácter puede ser `=` (error de sintaxis, pero
    // es parte del nombre); después, hasta espacio, `/`, `>` o `=`.
    const nameStart = j;
    j++;
    while (j < n && !isSpace(src[j]) && src[j] !== '/' && src[j] !== '>' && src[j] !== '=') j++;
    const name = src.slice(nameStart, j);
    let k = j;
    while (k < n && isSpace(src[k])) k++;
    if (src[k] !== '=') {
      attrs.push({ name, value: null, quote: '' });
      j = k;
      continue;
    }
    k++;
    while (k < n && isSpace(src[k])) k++;
    if (k >= n) return { rawName, attrs, selfClosing, end: -1 };
    const q = src[k];
    if (q === '"' || q === "'") {
      const close = src.indexOf(q, k + 1);
      if (close === -1) return { rawName, attrs, selfClosing, end: -1 };
      attrs.push({ name, value: src.slice(k + 1, close), quote: q });
      j = close + 1;
      // Tras las comillas puede venir otro atributo sin espacio: se sigue
      // leyendo como uno nuevo, igual que el navegador.
      continue;
    }
    if (q === '>') {
      attrs.push({ name, value: '', quote: '' });
      return { rawName, attrs, selfClosing, end: k + 1 };
    }
    let e = k;
    while (e < n && !isSpace(src[e]) && src[e] !== '>') e++;
    attrs.push({ name, value: src.slice(k, e), quote: '' });
    j = e;
  }
}

/** Dónde termina el texto crudo de `name` (el índice del `<` de su cierre),
 *  o el final. El cierre es `</name` seguido de espacio, `/` o `>`. */
function rawEnd(src: string, from: number, name: string): number {
  if (name === 'plaintext') return src.length;
  const lower = src.toLowerCase();
  let at = from;
  for (;;) {
    const k = lower.indexOf(`</${name}`, at);
    if (k === -1) return src.length;
    const after = src[k + 2 + name.length];
    if (after === undefined || isSpace(after) || after === '/' || after === '>') return k;
    at = k + 1;
  }
}

/** El final (exclusivo) de un comentario que empieza en `i` (`<!--`). */
function commentEnd(src: string, i: number): number {
  const body = i + 4;
  // `<!-->` y `<!--->` se cierran en el acto.
  if (src[body] === '>') return body + 1;
  if (src[body] === '-' && src[body + 1] === '>') return body + 2;
  let at = body;
  for (;;) {
    const k = src.indexOf('--', at);
    if (k === -1) return src.length;
    if (src[k + 2] === '>') return k + 3;
    if (src[k + 2] === '!' && src[k + 3] === '>') return k + 4;
    at = k + 1;
  }
}

const toEndOf = (src: string, from: number, needle: string) => {
  const k = src.indexOf(needle, from);
  return k === -1 ? src.length : k + needle.length;
};

export function tokenizeHtml(src: string): HtmlToken[] {
  const out: HtmlToken[] = [];
  const n = src.length;
  let i = 0;
  let textStart = 0;
  // Profundidad dentro de <svg> o <math>: ahí `<style>` y compañía no son
  // texto crudo, y `<![CDATA[` sí es una sección CDATA.
  let foreign = 0;
  const flushText = (end: number) => {
    if (end > textStart) out.push({ type: 'text', raw: src.slice(textStart, end), start: textStart });
  };
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt === -1) break;
    const c = src[lt + 1];
    let end = -1;
    let token: HtmlToken | null = null;
    if (isAlpha(c)) {
      const tag = parseTag(src, lt + 1);
      if (tag.end === -1) {
        // EOF dentro de la etiqueta: el navegador la descarta con todo lo
        // que sigue.
        flushText(lt);
        textStart = n;
        break;
      }
      const name = tag.rawName.toLowerCase();
      token = { type: 'open', name, rawName: tag.rawName, attrs: tag.attrs, selfClosing: tag.selfClosing, raw: src.slice(lt, tag.end), start: lt };
      end = tag.end;
      flushText(lt);
      out.push(token);
      if ((name === 'svg' || name === 'math') && !tag.selfClosing) foreign++;
      if (foreign === 0 && RAW_TEXT_ELEMENTS.has(name)) {
        const stop = rawEnd(src, end, name);
        if (stop > end) out.push({ type: 'raw', raw: src.slice(end, stop), start: end, parent: name });
        end = stop;
      }
      i = textStart = end;
      continue;
    }
    if (c === '/' && isAlpha(src[lt + 2])) {
      const tag = parseTag(src, lt + 2);
      if (tag.end === -1) {
        flushText(lt);
        textStart = n;
        break;
      }
      const name = tag.rawName.toLowerCase();
      flushText(lt);
      out.push({ type: 'close', name, rawName: tag.rawName, raw: src.slice(lt, tag.end), start: lt });
      if ((name === 'svg' || name === 'math') && foreign > 0) foreign--;
      i = textStart = tag.end;
      continue;
    }
    if (c === '!' && src.startsWith('--', lt + 2)) {
      end = commentEnd(src, lt);
      token = { type: 'comment', raw: src.slice(lt, end), start: lt };
    } else if (c === '!' && src.slice(lt + 2, lt + 9).toLowerCase() === 'doctype') {
      end = toEndOf(src, lt, '>');
      token = { type: 'doctype', raw: src.slice(lt, end), start: lt };
    } else if (c === '!' && foreign > 0 && src.startsWith('[CDATA[', lt + 2)) {
      end = toEndOf(src, lt, ']]>');
      token = { type: 'comment', raw: src.slice(lt, end), start: lt };
    } else if (c === '!' || c === '?' || (c === '/' && src[lt + 2] !== '>' && lt + 2 < n)) {
      // Comentario falso: hasta el primer `>`.
      end = toEndOf(src, lt + 1, '>');
      token = { type: 'comment', raw: src.slice(lt, end), start: lt };
    } else if (c === '/' && src[lt + 2] === '>') {
      // `</>` no es nada para el navegador.
      end = lt + 3;
      token = { type: 'comment', raw: src.slice(lt, end), start: lt };
    }
    if (!token) {
      // `<` seguido de otra cosa es texto.
      i = lt + 1;
      continue;
    }
    flushText(lt);
    out.push(token);
    i = textStart = end;
  }
  flushText(n);
  return out;
}

/** Atributo con su `=` y sus comillas, como se escribió. */
export function serializeAttr(attr: HtmlAttr): string {
  if (attr.value === null) return attr.name;
  return `${attr.name}=${attr.quote}${attr.value}${attr.quote}`;
}

/** Etiqueta de apertura con los atributos separados por un espacio. */
export function serializeOpen(rawName: string, attrs: readonly HtmlAttr[], selfClosing: boolean, spaceBeforeSlash = true): string {
  const parts = [rawName, ...attrs.map(serializeAttr)].join(' ');
  return `<${parts}${selfClosing ? (spaceBeforeSlash ? ' />' : '/>') : '>'}`;
}

/** Número de línea (desde 1) de cada posición: se arma una vez por texto. */
export function lineFinder(src: string): (index: number) => number {
  const breaks: number[] = [];
  for (let i = src.indexOf('\n'); i !== -1; i = src.indexOf('\n', i + 1)) breaks.push(i);
  return (index) => {
    let lo = 0;
    let hi = breaks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (breaks[mid] < index) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  };
}
