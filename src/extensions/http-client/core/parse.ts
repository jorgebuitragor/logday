// El bloque ```http de una nota → peticiones y problemas (specs/cliente-http
// HT5–HT7, design A4). Sintaxis de REST Client de VS Code y de Bruno. Puro:
// sin React ni DOM. Un bloque mal escrito nunca lanza: devuelve problemas.

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export const HTTP_METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/** Máximo de peticiones por bloque (HT6). */
export const MAX_REQUESTS = 20;

export type ParseIssueCode =
  | 'empty_block' | 'missing_request_line' | 'unsupported_method' | 'invalid_header'
  | 'too_many_requests' | 'reserved_syntax' | 'get_with_body' | 'head_with_body';

export interface ParseIssue {
  code: ParseIssueCode;
  /** Línea del bloque, desde 1. */
  line: number;
  severity: 'error' | 'warn';
  detail?: string;
}

export interface ParsedHeader {
  name: string;
  value: string;
  line: number;
}

export interface ParsedRequest {
  /** De "### nombre". */
  name: string | null;
  method: HttpMethod;
  /** Con las {{variables}} sin resolver y las líneas ?/& ya unidas. */
  url: string;
  headers: ParsedHeader[];
  body: string | null;
  /** Líneas del bloque (desde 1) que ocupa la sección: para ⌘↵ según el
   *  cursor y para la caché. */
  startLine: number;
  endLine: number;
  /** Línea del bloque (desde 1) con el método y la URL: la que reescribe
   *  el selector de método (`setRequestMethod`). */
  requestLine: number;
  /** El texto de la sección, sin espacios al final de cada línea ni
   *  líneas en blanco al final, para saber si cambió. */
  source: string;
  /** Método y URL sin resolver: si no coincide, una respuesta guardada es
   *  de otra petición (design A8). */
  firstLine: string;
  /** Si hay alguno de tipo error, no se puede enviar. */
  issues: ParseIssue[];
}

export interface ParseResult {
  requests: ParsedRequest[];
  /** Problemas del bloque entero (vacío, demasiadas peticiones). */
  issues: ParseIssue[];
}

const SECTION_RE = /^###(.*)$/;
const REQUEST_LINE_RE = /^([A-Za-z]+)\s+(\S.*?)(?:\s+HTTP\/\d(?:\.\d)?)?\s*$/;
const HEADER_RE = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+)\s*:\s*(.*)$/;
const VARIABLE_RE = /\{\{\s*([A-Za-z_$][A-Za-z0-9_.-]*)\s*\}\}/g;
const RESERVED = '{{$secret:';

const isComment = (line: string) => {
  const t = line.trimStart();
  return (t.startsWith('#') && !t.startsWith('###')) || t.startsWith('//');
};
const isBlank = (line: string) => line.trim() === '';

interface Section {
  name: string | null;
  /** Índice (desde 0) de la primera línea de la sección (la de ### o la 1). */
  start: number;
  /** Índice de la primera línea con contenido, tras el ###. */
  contentStart: number;
  end: number; // exclusivo
}

function splitSections(lines: string[]): Section[] {
  const sections: Section[] = [];
  let current: Section = { name: null, start: 0, contentStart: 0, end: lines.length };
  lines.forEach((line, i) => {
    const m = SECTION_RE.exec(line);
    if (!m) return;
    current.end = i;
    sections.push(current);
    const name = m[1].trim();
    current = { name: name || null, start: i, contentStart: i + 1, end: lines.length };
  });
  sections.push(current);
  return sections;
}

function parseSection(lines: string[], section: Section): ParsedRequest | null {
  const issues: ParseIssue[] = [];
  let i = section.contentStart;
  while (i < section.end && (isBlank(lines[i]) || isComment(lines[i]))) i += 1;
  // Una sección sin nada más se ignora (p. ej. "###" al final).
  if (i >= section.end) return null;

  const lineNo = (idx: number) => idx + 1;
  for (let k = section.contentStart; k < section.end; k += 1) {
    if (lines[k].includes(RESERVED)) issues.push({ code: 'reserved_syntax', line: lineNo(k), severity: 'error' });
  }

  const requestLineIdx = i;
  const requestLine = lines[i].trim();
  let method: HttpMethod = 'GET';
  let url = '';
  if (/^(https?:\/\/|\{\{)/i.test(requestLine)) {
    url = requestLine.replace(/\s+HTTP\/\d(?:\.\d)?\s*$/, '');
  } else {
    const m = REQUEST_LINE_RE.exec(requestLine);
    if (!m) {
      issues.push({ code: 'missing_request_line', line: lineNo(i), severity: 'error' });
    } else {
      const upper = m[1].toUpperCase();
      if ((HTTP_METHODS as readonly string[]).includes(upper)) {
        method = upper as HttpMethod;
      } else {
        issues.push({ code: 'unsupported_method', line: lineNo(i), severity: 'error', detail: m[1] });
      }
      url = m[2];
    }
  }
  const firstLine = `${method} ${url}`;
  i += 1;

  // Las líneas ? y & siguen la query de la URL.
  while (i < section.end && /^\s*[?&]/.test(lines[i])) {
    url += lines[i].trim();
    i += 1;
  }

  const headers: ParsedHeader[] = [];
  while (i < section.end && !isBlank(lines[i])) {
    const line = lines[i];
    if (isComment(line)) {
      i += 1;
      continue;
    }
    const m = HEADER_RE.exec(line.trim());
    if (m) headers.push({ name: m[1], value: m[2].trim(), line: lineNo(i) });
    else issues.push({ code: 'invalid_header', line: lineNo(i), severity: 'error' });
    i += 1;
  }

  let body: string | null = null;
  if (i < section.end) {
    const bodyLines = lines.slice(i + 1, section.end);
    while (bodyLines.length > 0 && isBlank(bodyLines[bodyLines.length - 1])) bodyLines.pop();
    // Las líneas en blanco del principio también sobran.
    while (bodyLines.length > 0 && isBlank(bodyLines[0])) bodyLines.shift();
    if (bodyLines.length > 0) body = bodyLines.join('\n');
  }
  if (body !== null && method === 'GET') issues.push({ code: 'get_with_body', line: lineNo(i + 1), severity: 'warn' });
  if (body !== null && method === 'HEAD') issues.push({ code: 'head_with_body', line: lineNo(i + 1), severity: 'warn' });

  let last = section.end;
  while (last > section.start + 1 && isBlank(lines[last - 1])) last -= 1;
  const source = lines.slice(section.start, last).map((l) => l.replace(/\s+$/, '')).join('\n');

  return {
    name: section.name,
    method,
    url,
    headers,
    body,
    startLine: lineNo(section.start),
    endLine: Math.max(lineNo(section.start), last),
    requestLine: lineNo(requestLineIdx),
    source,
    firstLine,
    issues: issues.sort((a, b) => a.line - b.line),
  };
}

export function parseHttpBlock(code: string): ParseResult {
  const lines = code.replace(/\r\n?/g, '\n').split('\n');
  const sections = splitSections(lines);
  const issues: ParseIssue[] = [];
  const parsed = sections.map((s) => parseSection(lines, s)).filter((r): r is ParsedRequest => r !== null);
  if (parsed.length === 0) issues.push({ code: 'empty_block', line: 1, severity: 'error' });
  let requests = parsed;
  if (parsed.length > MAX_REQUESTS) {
    issues.push({ code: 'too_many_requests', line: parsed[MAX_REQUESTS].startLine, severity: 'error' });
    requests = parsed.slice(0, MAX_REQUESTS);
  }
  return { requests, issues };
}

export const hasErrors = (issues: readonly ParseIssue[]) => issues.some((i) => i.severity === 'error');

/** La petición que tiene el cursor (`offset` en el texto del bloque). Si
 *  está antes de la primera o entre dos, la más cercana hacia arriba. */
export function requestAtOffset(requests: readonly ParsedRequest[], code: string, offset: number): number {
  if (requests.length === 0) return -1;
  const before = code.replace(/\r\n?/g, '\n').slice(0, Math.max(0, offset));
  const line = before.split('\n').length;
  let found = 0;
  requests.forEach((r, i) => {
    if (r.startLine <= line) found = i;
  });
  return found;
}

/** Los nombres de las variables que usa, sin repetir y en orden. */
export function variablesOf(req: ParsedRequest): string[] {
  const out: string[] = [];
  const texts = [req.url, ...req.headers.map((h) => h.value), req.body ?? ''];
  for (const text of texts) {
    for (const m of text.matchAll(VARIABLE_RE)) if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** Reemplaza cada {{nombre}} con lo que devuelva `fn` (o lo deja si
 *  devuelve `null`). Las llaves sin cerrar quedan como texto. */
export function replaceVariables(text: string, fn: (name: string) => string | null): string {
  return text.replace(VARIABLE_RE, (whole, name: string) => fn(name) ?? whole);
}

/** "GET /users?page=2" o el nombre: lo que muestra el selector de la barra. */
export function requestLabel(req: ParsedRequest): string {
  if (req.name) return req.name;
  const path = req.url.replace(/^(https?:\/\/[^/?#]+|\{\{[^}]*\}\})/i, '') || req.url;
  return `${req.method} ${path}`;
}
