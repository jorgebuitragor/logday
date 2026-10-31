// Formatos: JSON, YAML, XML y la conversión a CSV (specs/devtools D1).
import yaml from 'js-yaml';
import { fail, lineColumnAt, ok, type ToolErrorCode, type ToolResult } from './result';

export type Indent = 2 | 4 | 'tab';

const indentString = (indent: Indent) => (indent === 'tab' ? '\t' : ' '.repeat(indent));

// ── JSON ──────────────────────────────────────────────────────────────

/** Dónde y por qué falla un JSON. `JSON.parse` no sirve para esto: el
 *  mensaje cambia con cada motor y WebKit (el WebView de macOS) ni
 *  siquiera da la posición. Recorre el texto con la gramática de JSON y
 *  se detiene en el primer error. */
export function locateJsonError(text: string): { code: ToolErrorCode; index: number } | null {
  let i = 0;
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i])) i++;
  };
  class Stop {
    constructor(readonly code: ToolErrorCode, readonly index: number) {}
  }
  const stop = (code: ToolErrorCode): never => {
    throw new Stop(i >= text.length ? 'json-unexpected-end' : code, i);
  };
  const literal = (word: string) => {
    for (const ch of word) {
      if (text[i] !== ch) stop('json-unexpected-token');
      i++;
    }
  };
  const string = () => {
    i++; // "
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"') {
        i++;
        return;
      }
      if (ch === '\\') {
        i++;
        const esc = text[i];
        if (esc === 'u') {
          for (let k = 1; k <= 4; k++) {
            if (!/[0-9a-fA-F]/.test(text[i + k] ?? '')) {
              i += k;
              stop('json-bad-string');
            }
          }
          i += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(esc ?? '')) stop('json-bad-string');
        i++;
        continue;
      }
      if (ch < ' ') stop('json-bad-string');
      i++;
    }
    stop('json-unexpected-end');
  };
  const number = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m || m[0] === '-') stop('json-bad-number');
    i += m![0].length;
  };
  const value = (): void => {
    ws();
    const ch = text[i];
    if (ch === '{') {
      i++;
      ws();
      if (text[i] === '}') {
        i++;
        return;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') stop('json-unexpected-token');
        string();
        ws();
        if (text[i] !== ':') stop('json-unexpected-token');
        i++;
        value();
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === '}') {
          i++;
          return;
        }
        stop('json-unexpected-token');
      }
    }
    if (ch === '[') {
      i++;
      ws();
      if (text[i] === ']') {
        i++;
        return;
      }
      for (;;) {
        value();
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === ']') {
          i++;
          return;
        }
        stop('json-unexpected-token');
      }
    }
    if (ch === '"') return string();
    if (ch === 't') return literal('true');
    if (ch === 'f') return literal('false');
    if (ch === 'n') return literal('null');
    if (ch === '-' || (ch >= '0' && ch <= '9')) return number();
    stop('json-unexpected-token');
  };
  try {
    value();
    ws();
    if (i < text.length) return { code: 'json-trailing', index: i };
    return null;
  } catch (e) {
    if (e instanceof Stop) return { code: e.code, index: e.index };
    throw e;
  }
}

export function parseJson(text: string): ToolResult<unknown> {
  try {
    return ok(JSON.parse(text));
  } catch (e) {
    const found = locateJsonError(text);
    if (!found) return fail('json-unexpected-token', { detail: (e as Error).message });
    return fail(found.code, lineColumnAt(text, found.index));
  }
}

export function formatJson(text: string, indent: Indent): ToolResult {
  const parsed = parseJson(text);
  return parsed.ok ? ok(JSON.stringify(parsed.value, null, indentString(indent))) : parsed;
}

export function minifyJson(text: string): ToolResult {
  const parsed = parseJson(text);
  return parsed.ok ? ok(JSON.stringify(parsed.value)) : parsed;
}

// ── YAML ──────────────────────────────────────────────────────────────

interface YamlLikeError {
  mark?: { line: number; column: number };
  reason?: string;
  message?: string;
}

export function parseYaml(text: string): ToolResult<unknown> {
  try {
    // safeLoad: sin tipos de JavaScript (!!js/function y similares).
    return ok(yaml.safeLoad(text));
  } catch (e) {
    const err = e as YamlLikeError;
    return fail('yaml-invalid', {
      ...(err.mark ? { line: err.mark.line + 1, column: err.mark.column + 1 } : {}),
      detail: err.reason ?? err.message,
    });
  }
}

const dumpYaml = (value: unknown, indent: Indent) =>
  // YAML no admite tabs para sangrar: con 'tab' se usan 2 espacios.
  yaml.safeDump(value, { indent: indent === 4 ? 4 : 2, lineWidth: -1, noRefs: true }).replace(/\n$/, '');

export function formatYaml(text: string, indent: Indent): ToolResult {
  const parsed = parseYaml(text);
  return parsed.ok ? ok(dumpYaml(parsed.value, indent)) : parsed;
}

export function jsonToYaml(text: string, indent: Indent): ToolResult {
  const parsed = parseJson(text);
  return parsed.ok ? ok(dumpYaml(parsed.value, indent)) : parsed;
}

export function yamlToJson(text: string, indent: Indent): ToolResult {
  const parsed = parseYaml(text);
  return parsed.ok ? ok(JSON.stringify(parsed.value ?? null, null, indentString(indent))) : parsed;
}

// ── CSV ───────────────────────────────────────────────────────────────

const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Un arreglo de objetos a CSV. Las columnas son la unión de las claves,
 *  en el orden en que aparecen; un valor anidado va como JSON. */
export function jsonToCsv(text: string): ToolResult {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  const rows = parsed.value;
  if (!Array.isArray(rows)) return fail('csv-not-array');
  if (rows.some((r) => typeof r !== 'object' || r === null || Array.isArray(r))) return fail('csv-not-objects');
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows as Record<string, unknown>[]) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  const lines = [columns.map(csvCell).join(',')];
  for (const row of rows as Record<string, unknown>[]) lines.push(columns.map((c) => csvCell(row[c])).join(','));
  return ok(lines.join('\n'));
}

// ── XML ───────────────────────────────────────────────────────────────

type XmlNode =
  | { kind: 'element'; name: string; attrs: string; children: XmlNode[] }
  | { kind: 'text'; text: string }
  | { kind: 'raw'; text: string }; // comentario, CDATA, <?…?>, <!DOCTYPE…>

const NAME = /^[A-Za-z_:][\w.:-]*/;

/** Lee un XML y comprueba que esté bien formado (etiquetas balanceadas,
 *  atributos entre comillas). No valida contra un esquema ni resuelve
 *  entidades. Propio, y no `DOMParser`, por lo mismo que el JSON: cada
 *  motor da el error distinto, y así también se prueba sin DOM. */
export function parseXml(text: string): ToolResult<XmlNode[]> {
  let i = 0;
  const err = (detail: string) => fail('xml-invalid', { ...lineColumnAt(text, i), detail });
  const root: XmlNode[] = [];
  const stack: { name: string; children: XmlNode[]; start: number }[] = [];
  const current = () => (stack.length ? stack[stack.length - 1].children : root);
  let rootElements = 0;

  while (i < text.length) {
    if (text[i] !== '<') {
      const end = text.indexOf('<', i);
      const chunk = text.slice(i, end === -1 ? text.length : end);
      if (chunk.trim()) {
        if (!stack.length) return err('text outside the root element');
        current().push({ kind: 'text', text: chunk.trim() });
      }
      i = end === -1 ? text.length : end;
      continue;
    }
    const rawEnd = (open: string, close: string) => {
      if (!text.startsWith(open, i)) return -1;
      const end = text.indexOf(close, i + open.length);
      return end === -1 ? -2 : end + close.length;
    };
    let handledRaw = false;
    for (const [open, close] of [['<!--', '-->'], ['<![CDATA[', ']]>'], ['<?', '?>']] as const) {
      const end = rawEnd(open, close);
      if (end === -2) return err(`unclosed ${open}`);
      if (end > 0) {
        current().push({ kind: 'raw', text: text.slice(i, end) });
        i = end;
        handledRaw = true;
        break;
      }
    }
    if (handledRaw) continue;
    if (text.startsWith('<!', i)) {
      const end = text.indexOf('>', i);
      if (end === -1) return err('unclosed declaration');
      current().push({ kind: 'raw', text: text.slice(i, end + 1) });
      i = end + 1;
      continue;
    }
    if (text[i + 1] === '/') {
      i += 2;
      const m = NAME.exec(text.slice(i));
      const open = stack.pop();
      if (!m || !open || m[0] !== open.name) {
        i -= 2;
        return err(open ? `expected </${open.name}>` : 'closing tag without an opening one');
      }
      i += m[0].length;
      while (/\s/.test(text[i] ?? '')) i++;
      if (text[i] !== '>') return err('expected >');
      i++;
      continue;
    }
    // Etiqueta de apertura.
    const tagStart = i;
    i++;
    const m = NAME.exec(text.slice(i));
    if (!m) return err('invalid tag name');
    const name = m[0];
    i += name.length;
    const attrsStart = i;
    const attrNames = new Set<string>();
    for (;;) {
      while (/\s/.test(text[i] ?? '')) i++;
      if (text[i] === '>' || text.startsWith('/>', i)) break;
      if (i >= text.length) return err(`unclosed <${name}>`);
      const a = NAME.exec(text.slice(i));
      if (!a) return err('invalid attribute');
      if (attrNames.has(a[0])) return err(`duplicate attribute ${a[0]}`);
      attrNames.add(a[0]);
      i += a[0].length;
      while (/\s/.test(text[i] ?? '')) i++;
      if (text[i] !== '=') return err('expected = after the attribute');
      i++;
      while (/\s/.test(text[i] ?? '')) i++;
      const quote = text[i];
      if (quote !== '"' && quote !== "'") return err('attribute value without quotes');
      const close = text.indexOf(quote, i + 1);
      if (close === -1) return err('unclosed attribute value');
      i = close + 1;
    }
    const attrs = text.slice(attrsStart, i).trim().replace(/\s+/g, ' ');
    const selfClosing = text.startsWith('/>', i);
    i += selfClosing ? 2 : 1;
    if (!stack.length) {
      rootElements++;
      if (rootElements > 1) {
        i = tagStart;
        return err('more than one root element');
      }
    }
    const node: XmlNode = { kind: 'element', name, attrs, children: [] };
    current().push(node);
    if (!selfClosing) stack.push({ name, children: node.children, start: tagStart });
  }
  if (stack.length) {
    i = stack[stack.length - 1].start;
    return err(`unclosed <${stack[stack.length - 1].name}>`);
  }
  if (!rootElements) return err('no root element');
  return ok(root);
}

function printXml(nodes: XmlNode[], pad: string, depth: number, out: string[]) {
  const prefix = pad.repeat(depth);
  for (const node of nodes) {
    if (node.kind !== 'element') {
      out.push(prefix + node.text);
      continue;
    }
    const open = `<${node.name}${node.attrs ? ` ${node.attrs}` : ''}`;
    if (!node.children.length) {
      out.push(`${prefix}${open}/>`);
    } else if (node.children.length === 1 && node.children[0].kind === 'text') {
      out.push(`${prefix}${open}>${node.children[0].text}</${node.name}>`);
    } else {
      out.push(`${prefix}${open}>`);
      printXml(node.children, pad, depth + 1, out);
      out.push(`${prefix}</${node.name}>`);
    }
  }
}

export function formatXml(text: string, indent: Indent): ToolResult {
  const parsed = parseXml(text);
  if (!parsed.ok) return parsed;
  const out: string[] = [];
  printXml(parsed.value, indentString(indent), 0, out);
  return ok(out.join('\n'));
}

export function minifyXml(text: string): ToolResult {
  const formatted = formatXml(text, 2);
  return formatted.ok ? ok(formatted.value.split('\n').map((l) => l.trim()).join('')) : formatted;
}
