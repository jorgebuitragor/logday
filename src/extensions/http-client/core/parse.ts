// El bloque ```http de una nota → peticiones y problemas (specs/cliente-http
// HT5–HT7, design A4). Sintaxis de REST Client de VS Code y de Bruno. Puro:
// sin React ni DOM. Un bloque mal escrito nunca lanza: devuelve problemas.
//
// v2 (HT41, HT42, HT45, design §14.3): además de lo que se envía, cada
// petición trae sus filas (los parámetros y las cabeceras, también las
// desactivadas, que son comentarios) y dónde está cada zona, para que las
// tablas de la pantalla puedan reescribir solo sus líneas (`requestEdit.ts`).

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

/** Una cabecera de la tabla: las activas y las desactivadas (`# Nombre: valor`). */
export interface HeaderRow extends ParsedHeader {
  enabled: boolean;
}

/** Un parámetro de la query, como está escrito (sin decodificar). */
export interface QueryRow {
  name: string;
  /** `''` si no lleva `=`. */
  value: string;
  /** Si lleva `=` (`a=` y `a` son distintos). */
  hasValue: boolean;
  /** Los desactivados son líneas `# &k=v`. */
  enabled: boolean;
  /** `url`: en la línea de la petición; `line`: en una línea `?`/`&` propia. */
  place: 'url' | 'line';
  /** Línea del bloque (desde 1). */
  line: number;
  /** Su posición entre los pares de esa línea (separados por `&`). */
  pos: number;
}

/** El tipo de cuerpo que se deduce del texto (HT45). */
export type BodyKind = 'none' | 'json' | 'form' | 'multipart' | 'text' | 'file';

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
  /** La URL tal como está en la línea de la petición, sin las líneas `?`/`&`. */
  urlLine: string;
  /** Los parámetros, en el orden del texto: los de la URL y los de las
   *  líneas `?`/`&`, activos y desactivados. */
  query: QueryRow[];
  /** Todas las cabeceras, en orden, activas y desactivadas. */
  headerRows: HeaderRow[];
  disabledHeaders: ParsedHeader[];
  /** Primera línea (desde 1) de la zona de las cabeceras, justo después de
   *  la última línea de la query (o de la línea de la petición). */
  headerStart: number;
  /** La línea (desde 1) donde termina la zona de las cabeceras, sin
   *  incluirla: la línea en blanco antes del cuerpo, o `endLine + 1`. */
  headerEnd: number;
  bodyKind: BodyKind;
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

/** Una línea de la query: `?a=1`, `&b=2` o, desactivada, `# &c=3`. */
const QUERY_LINE_RE = /^(\s*)(#\s*)?([?&])(.*)$/;

export const isQueryLine = (line: string) => QUERY_LINE_RE.test(line);

/** `# Nombre: valor`: un comentario con forma de cabecera (HT42). `##…`
 *  y `//` no cuentan. */
export function disabledHeaderOf(line: string): { name: string; value: string } | null {
  const m = /^\s*#(?!#)\s*(.*)$/.exec(line);
  if (!m) return null;
  const h = HEADER_RE.exec(m[1].trim());
  return h ? { name: h[1], value: h[2].trim() } : null;
}

/** Los pares `a=1&b=2` de un trozo de query, con su posición. Los vacíos
 *  (`a=1&&b=2`) se saltan, pero cuentan para la posición. */
export function queryPairs(text: string): { name: string; value: string; hasValue: boolean; pos: number }[] {
  const out: { name: string; value: string; hasValue: boolean; pos: number }[] = [];
  if (text === '') return out;
  text.split('&').forEach((piece, pos) => {
    if (piece === '') return;
    const eq = piece.indexOf('=');
    if (eq < 0) out.push({ name: piece, value: '', hasValue: false, pos });
    else out.push({ name: piece.slice(0, eq), value: piece.slice(eq + 1), hasValue: true, pos });
  });
  return out;
}

/** Dónde está la query en una URL: entre el primer `?` y el `#`. */
export function splitUrlQuery(url: string): { base: string; query: string | null; hash: string } {
  const q = url.indexOf('?');
  if (q < 0) {
    return { base: url, query: null, hash: '' };
  }
  const h = url.indexOf('#', q);
  return h < 0
    ? { base: url.slice(0, q), query: url.slice(q + 1), hash: '' }
    : { base: url.slice(0, q), query: url.slice(q + 1, h), hash: url.slice(h) };
}

const headerValue = (headers: readonly ParsedHeader[], name: string) =>
  headers.find((h) => h.name.toLowerCase() === name)?.value.toLowerCase() ?? '';

/** HT45: el tipo de cuerpo, en este orden: un archivo, multipart, form,
 *  JSON y, si no, texto. */
export function bodyKindOf(body: string | null, headers: readonly ParsedHeader[]): BodyKind {
  if (body === null) return 'none';
  if (/^<@?\s+\S/.test(body.trim()) && !body.trim().includes('\n')) return 'file';
  const ct = headerValue(headers, 'content-type');
  if (ct.startsWith('multipart/') && /boundary=/.test(ct)) return 'multipart';
  if (ct.startsWith('application/x-www-form-urlencoded')) return 'form';
  if (/[/+]json\b/.test(ct) || (!ct && /^\s*[[{]/.test(body))) return 'json';
  return 'text';
}

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
  const urlLine = url;
  const query: QueryRow[] = [];
  const fromUrl = splitUrlQuery(urlLine).query;
  if (fromUrl !== null) {
    for (const p of queryPairs(fromUrl)) query.push({ ...p, enabled: true, place: 'url', line: lineNo(i) });
  }
  i += 1;

  // La zona de la query (HT41): las líneas ?/&, los parámetros
  // desactivados (`# &k=v`) y los comentarios entre ellas. Termina en la
  // última con un parámetro: un comentario detrás ya es de las cabeceras.
  let queryEnd = i;
  for (let j = i; j < section.end && !isBlank(lines[j]) && (isQueryLine(lines[j]) || isComment(lines[j])); j += 1) {
    if (isQueryLine(lines[j])) queryEnd = j + 1;
  }
  for (let j = i; j < queryEnd; j += 1) {
    const m = QUERY_LINE_RE.exec(lines[j]);
    if (!m) continue;
    const enabled = !m[2];
    for (const p of queryPairs(m[4].trim())) {
      query.push({ ...p, enabled, place: 'line', line: lineNo(j) });
      // La URL se arma con `?` o `&` según haga falta, no pegando el texto:
      // así un `&b=2` sin `?` antes (porque se desactivó el primero) no
      // da una URL rota.
      if (enabled) url += `${url.includes('?') ? '&' : '?'}${p.hasValue ? `${p.name}=${p.value}` : p.name}`;
    }
  }
  i = queryEnd;
  const headerStart = i;

  const headers: ParsedHeader[] = [];
  const headerRows: HeaderRow[] = [];
  const disabledHeaders: ParsedHeader[] = [];
  while (i < section.end && !isBlank(lines[i])) {
    const line = lines[i];
    if (isComment(line)) {
      // HT42: un comentario con forma de cabecera es una fila desactivada.
      const off = disabledHeaderOf(line);
      if (off) {
        disabledHeaders.push({ ...off, line: lineNo(i) });
        headerRows.push({ ...off, line: lineNo(i), enabled: false });
      }
      i += 1;
      continue;
    }
    const m = HEADER_RE.exec(line.trim());
    if (m) {
      headers.push({ name: m[1], value: m[2].trim(), line: lineNo(i) });
      headerRows.push({ name: m[1], value: m[2].trim(), line: lineNo(i), enabled: true });
    } else issues.push({ code: 'invalid_header', line: lineNo(i), severity: 'error' });
    i += 1;
  }
  const headerEndIdx = i;

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
  const endLine = Math.max(lineNo(section.start), last);

  return {
    name: section.name,
    method,
    url,
    headers,
    body,
    startLine: lineNo(section.start),
    endLine,
    requestLine: lineNo(requestLineIdx),
    source,
    firstLine,
    issues: issues.sort((a, b) => a.line - b.line),
    urlLine,
    query,
    headerRows,
    disabledHeaders,
    headerStart: lineNo(headerStart),
    headerEnd: headerEndIdx < section.end && isBlank(lines[headerEndIdx]) ? lineNo(headerEndIdx) : endLine + 1,
    bodyKind: bodyKindOf(body, headers),
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
