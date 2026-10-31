// Visor HTML (specs/devtools D26): formatear, minificar y los avisos de
// estructura. Es tolerante, como el navegador: nunca falla, y lo que no
// entiende lo deja como está. El árbol es aproximado (cierra solos `<li>`,
// `<p>`, `<td>`…), suficiente para sangrar y avisar, no para validar.
import { lineFinder, serializeOpen, tokenizeHtml, type HtmlAttr, type HtmlToken } from '../../../lib/htmlTokenizer';
import type { Indent } from './formats';

/** Elementos sin contenido ni cierre. */
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
  'param', 'keygen', 'basefont', 'bgsound', 'frame',
]);

/** Elementos de línea: van dentro del texto sin saltos alrededor. */
const INLINE = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'big', 'br', 'button', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'font', 'i', 'img',
  'input', 'ins', 'kbd', 'label', 'mark', 'meter', 'nobr', 'output', 'picture', 'progress', 'q', 'rp', 'rt', 'ruby', 's',
  'samp', 'select', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'textarea', 'time', 'tt', 'u', 'var', 'wbr',
]);

/** Su contenido se copia tal cual: el espacio importa o no es HTML. */
const VERBATIM = new Set(['pre', 'textarea', 'script', 'style', 'xmp', 'plaintext', 'listing']);
/** De los anteriores, los que se pueden volver a sangrar (no se ven). */
const REINDENT = new Set(['script', 'style']);

/** Etiquetas cuyo cierre es opcional: no se avisa si falta. */
const OPTIONAL_CLOSE = new Set([
  'html', 'head', 'body', 'p', 'li', 'dt', 'dd', 'option', 'optgroup', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot',
  'colgroup', 'caption', 'rb', 'rt', 'rtc', 'rp',
]);

/** Las que cierra solas una etiqueta nueva (`<li>` cierra el `<li>` abierto). */
const CLOSED_BY: Record<string, ReadonlySet<string>> = (() => {
  const blocks = [
    'address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'div', 'dl', 'fieldset', 'figcaption', 'figure',
    'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'menu', 'nav', 'ol', 'p',
    'pre', 'section', 'table', 'ul',
  ];
  const map: Record<string, Set<string>> = {};
  const add = (opener: string, closes: string[]) => {
    for (const c of closes) (map[opener] ??= new Set()).add(c);
  };
  for (const b of blocks) add(b, ['p']);
  add('li', ['li']);
  add('dt', ['dt', 'dd']);
  add('dd', ['dt', 'dd']);
  add('option', ['option']);
  add('optgroup', ['option', 'optgroup']);
  add('tr', ['tr', 'td', 'th']);
  add('td', ['td', 'th']);
  add('th', ['td', 'th']);
  for (const t of ['thead', 'tbody', 'tfoot']) add(t, ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th']);
  add('body', ['head']);
  return map;
})();

/** Los contenedores que frenan el cierre implícito (un `<li>` dentro de un
 *  `<ul>` anidado no cierra el `<li>` de fuera). */
const SCOPE = new Set(['ul', 'ol', 'table', 'select', 'dl', 'div', 'td', 'th', 'html', 'body', 'template', 'svg', 'math']);

interface ElementNode {
  kind: 'element';
  name: string;
  rawName: string;
  attrs: HtmlAttr[];
  selfClosing: boolean;
  /** Se cerró con su etiqueta en el texto. */
  closed: boolean;
  /** El cierre como estaba escrito. */
  closeName: string;
  children: Node[];
  start: number;
}
type Node = ElementNode | { kind: 'text'; raw: string } | { kind: 'comment'; raw: string } | { kind: 'doctype'; raw: string };

export interface HtmlIssue {
  code: 'unclosed' | 'stray';
  tag: string;
  line: number;
}

interface Tree {
  root: Node[];
  issues: HtmlIssue[];
}

function buildTree(src: string): Tree {
  const tokens: HtmlToken[] = tokenizeHtml(src);
  const lineAt = lineFinder(src);
  const root: ElementNode = { kind: 'element', name: '#root', rawName: '', attrs: [], selfClosing: false, closed: true, closeName: '', children: [], start: 0 };
  const stack: ElementNode[] = [root];
  const issues: HtmlIssue[] = [];
  const top = () => stack[stack.length - 1];
  const unclosed = (el: ElementNode) => {
    if (!OPTIONAL_CLOSE.has(el.name)) issues.push({ code: 'unclosed', tag: el.rawName, line: lineAt(el.start) });
  };
  let foreign = 0;
  for (const token of tokens) {
    if (token.type === 'text' || token.type === 'raw') {
      top().children.push({ kind: 'text', raw: token.raw });
    } else if (token.type === 'comment') {
      top().children.push({ kind: 'comment', raw: token.raw });
    } else if (token.type === 'doctype') {
      top().children.push({ kind: 'doctype', raw: token.raw });
    } else if (token.type === 'open') {
      const closes = CLOSED_BY[token.name];
      if (closes && foreign === 0) {
        // Se cierran las abiertas que esta cierra sola, hasta un contenedor.
        for (let i = stack.length - 1; i > 0; i--) {
          const el = stack[i];
          if (closes.has(el.name)) {
            stack.length = i;
            break;
          }
          if (SCOPE.has(el.name) || !OPTIONAL_CLOSE.has(el.name)) break;
        }
      }
      const el: ElementNode = {
        kind: 'element', name: token.name, rawName: token.rawName, attrs: token.attrs, selfClosing: token.selfClosing,
        closed: false, closeName: token.rawName, children: [], start: token.start,
      };
      top().children.push(el);
      // En SVG y MathML `<x/>` sí se cierra; en HTML solo los vacíos.
      const empty = VOID.has(token.name) || (token.selfClosing && (foreign > 0 || token.name === 'svg' || token.name === 'math'));
      if (!empty) {
        stack.push(el);
        if (token.name === 'svg' || token.name === 'math') foreign++;
      }
    } else {
      // Cierre: la abierta más cercana con ese nombre.
      let at = -1;
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === token.name) {
          at = i;
          break;
        }
      }
      if (at === -1) {
        if (!VOID.has(token.name) && !['html', 'head', 'body', 'p', 'br'].includes(token.name)) {
          issues.push({ code: 'stray', tag: token.rawName, line: lineAt(token.start) });
        }
        continue;
      }
      for (let i = stack.length - 1; i > at; i--) unclosed(stack[i]);
      stack[at].closed = true;
      stack[at].closeName = token.rawName;
      if ((token.name === 'svg' || token.name === 'math') && foreign > 0) foreign--;
      stack.length = at;
    }
  }
  for (let i = stack.length - 1; i > 0; i--) unclosed(stack[i]);
  issues.sort((a, b) => a.line - b.line);
  return { root: root.children, issues };
}

/** Los avisos de estructura: etiquetas sin cerrar y cierres de más. */
export const checkHtml = (src: string): HtmlIssue[] => (src.trim() ? buildTree(src).issues : []);

const collapse = (s: string) => s.replace(/[ \t\n\f\r]+/g, ' ');
const isBlank = (s: string) => !/[^ \t\n\f\r]/.test(s);
const openTag = (el: ElementNode, minify = false) => serializeOpen(el.rawName, el.attrs, el.selfClosing, !minify);
const closeTag = (el: ElementNode) => (el.closed ? `</${el.closeName}>` : '');
const innerRaw = (el: ElementNode) => el.children.map((c) => ('raw' in c ? c.raw : '')).join('');

/** ¿Va dentro de la línea? Texto, comentarios y elementos de línea cuyo
 *  contenido también lo es. */
function isInline(node: Node): boolean {
  if (node.kind === 'text') return true;
  if (node.kind !== 'element') return false;
  if (!INLINE.has(node.name)) return false;
  return node.children.every(isInline);
}

/** Un trozo de línea, con los espacios juntados (salvo en `textarea`). */
function inlineHtml(nodes: readonly Node[]): string {
  let out = '';
  for (const node of nodes) {
    if (node.kind === 'text') out += collapse(node.raw);
    else if (node.kind === 'element') {
      if (VERBATIM.has(node.name)) out += openTag(node) + innerRaw(node) + closeTag(node);
      else out += openTag(node) + inlineHtml(node.children) + closeTag(node);
    } else out += node.raw;
  }
  return out;
}

/** Quita la sangría común de un bloque de `<script>` o `<style>`. */
function dedent(text: string): string[] {
  const lines = text.replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)![0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min).replace(/\s+$/, ''));
}

export function formatHtml(src: string, indent: Indent = 2): string {
  const unit = indent === 'tab' ? '\t' : ' '.repeat(indent);
  const out: string[] = [];
  const pad = (depth: number) => unit.repeat(depth);

  const block = (node: Node, depth: number) => {
    if (node.kind === 'text') {
      const t = collapse(node.raw).trim();
      if (t) out.push(pad(depth) + t);
      return;
    }
    if (node.kind !== 'element') {
      out.push(pad(depth) + node.raw.trim());
      return;
    }
    const el = node;
    if (VERBATIM.has(el.name)) {
      const inner = innerRaw(el);
      if (REINDENT.has(el.name) && inner.includes('\n') && inner.trim()) {
        out.push(pad(depth) + openTag(el));
        for (const line of dedent(inner)) out.push(line ? pad(depth + 1) + line : '');
        if (el.closed) out.push(pad(depth) + closeTag(el));
      } else {
        // pre y textarea: el contenido no se toca, ni el salto del final.
        out.push(pad(depth) + openTag(el) + (REINDENT.has(el.name) ? inner.trim() : inner) + closeTag(el));
      }
      return;
    }
    if (VOID.has(el.name) || (el.selfClosing && !el.children.length)) {
      out.push(pad(depth) + openTag(el));
      return;
    }
    if (el.children.every(isInline)) {
      out.push(pad(depth) + openTag(el) + inlineHtml(el.children).trim() + closeTag(el));
      return;
    }
    out.push(pad(depth) + openTag(el));
    children(el.children, depth + 1);
    if (el.closed) out.push(pad(depth) + closeTag(el));
  };

  /** Los hijos de un bloque: los trozos de línea seguidos van juntos. */
  const children = (nodes: readonly Node[], depth: number) => {
    let run: Node[] = [];
    const flush = () => {
      const line = inlineHtml(run).trim();
      if (line) out.push(pad(depth) + line);
      run = [];
    };
    for (const node of nodes) {
      if (isInline(node)) run.push(node);
      else {
        flush();
        block(node, depth);
      }
    }
    flush();
  };

  children(buildTree(src.replace(/\r\n?/g, '\n')).root, 0);
  return out.join('\n');
}

export function minifyHtml(src: string): string {
  const isBlockNode = (node: Node | undefined) => !!node && node.kind === 'element' && !INLINE.has(node.name);
  const walk = (nodes: readonly Node[], inBlock: boolean): string => {
    // Sin comentarios: no se ven.
    const list = nodes.filter((n) => n.kind !== 'comment');
    let out = '';
    list.forEach((node, i) => {
      if (node.kind === 'text') {
        let t = collapse(node.raw);
        // El espacio junto a un bloque (o al borde de uno) no se ve.
        const prevBlock = i === 0 ? inBlock : isBlockNode(list[i - 1]) || list[i - 1].kind === 'doctype';
        const nextBlock = i === list.length - 1 ? inBlock : isBlockNode(list[i + 1]);
        if (prevBlock) t = t.replace(/^ /, '');
        if (nextBlock) t = t.replace(/ $/, '');
        out += t;
      } else if (node.kind === 'doctype') {
        out += collapse(node.raw.trim());
      } else if (node.kind === 'element') {
        const open = openTag(node, true);
        if (VERBATIM.has(node.name)) {
          const inner = innerRaw(node);
          out += open + (REINDENT.has(node.name) ? inner.trim() : inner) + closeTag(node);
        } else {
          out += open + walk(node.children, !INLINE.has(node.name)) + closeTag(node);
        }
      }
    });
    return out;
  };
  const text = walk(buildTree(src.replace(/\r\n?/g, '\n')).root, true);
  return isBlank(text) ? '' : text;
}
