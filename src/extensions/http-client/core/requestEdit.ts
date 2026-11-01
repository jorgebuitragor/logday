// Ediciones de las tablas y de Auth de la pantalla sobre el texto de una
// petición (specs/cliente-http HT40–HT43, design §14.3). El texto manda:
// cada función recibe el texto del bloque y devuelve el texto nuevo, y
// toca solo las líneas de su fila o de su zona, como `setRequestMethod`
// (edit.ts). Los comentarios y las demás peticiones quedan igual. Puro.
//
// Va aparte de edit.ts para que "Copiar como…" (PR D1), que saca `toCurl`
// de allí, no choque con esto.
import {
  HTTP_METHODS, parseHttpBlock, splitUrlQuery, type HeaderRow, type HttpMethod, type ParsedRequest, type QueryRow,
} from './parse';
import { SENSITIVE_NAME_RE } from './curl';

const normalize = (code: string) => code.replace(/\r\n?/g, '\n');

interface Located {
  lines: string[];
  req: ParsedRequest;
}

function locate(code: string, requestIndex: number): Located | null {
  const text = normalize(code);
  const req = parseHttpBlock(text).requests[requestIndex];
  return req ? { lines: text.split('\n'), req } : null;
}

// ---------- La línea de la petición ----------

const LINE_RE = /^(\s*)(.*?)(\s+HTTP\/\d(?:\.\d)?)?\s*$/;
const URL_START_RE = /^(https?:\/\/|\{\{)/i;

export interface RequestLineParts {
  /** El método escrito, si es uno de los admitidos; `null` si la línea es
   *  solo una URL o no se entiende. */
  method: string | null;
  /** Lo demás de la línea: la URL, o la línea entera si no se entiende
   *  (así se ve lo que dice la nota y no se envía un GET que no está). */
  url: string;
}

function splitLine(line: string): RequestLineParts & { indent: string; version: string } {
  // Todos los grupos son opcionales: siempre encaja.
  const m = LINE_RE.exec(line)!;
  const indent = m[1];
  const rest = m[2];
  const version = m[3] ?? '';
  if (URL_START_RE.test(rest)) return { indent, version, method: null, url: rest };
  const w = /^(\S+)(?:\s+(.*))?$/.exec(rest);
  if (w && (HTTP_METHODS as readonly string[]).includes(w[1].toUpperCase())) {
    return { indent, version, method: w[1], url: w[2] ?? '' };
  }
  return { indent, version, method: null, url: rest };
}

/** El método y la URL que muestra la fila de arriba de la pantalla. */
export function readRequestLine(code: string, requestIndex = 0): { method: HttpMethod; url: string } {
  const loc = locate(code, requestIndex);
  if (!loc) return { method: 'GET', url: '' };
  const parts = splitLine(loc.lines[loc.req.requestLine - 1] ?? '');
  return { method: (parts.method?.toUpperCase() as HttpMethod | undefined) ?? 'GET', url: parts.url };
}

/** Cambia el método o la URL de la línea de la petición. Conserva la
 *  sangría, el `HTTP/1.1` y el método como estaba escrito si no cambia.
 *  Una línea que es solo una URL sigue así mientras sea un GET. Sin
 *  petición (el texto vacío de una petición nueva), la escribe. */
export function writeRequestLine(code: string, requestIndex: number, change: { method?: HttpMethod; url?: string }): string {
  const loc = locate(code, requestIndex);
  if (!loc) {
    const line = [change.method ?? 'GET', (change.url ?? '').trim()].filter(Boolean).join(' ');
    const text = normalize(code);
    return text.trim() === '' ? line : `${text.replace(/\s+$/, '')}\n${line}`;
  }
  const { lines, req } = loc;
  const idx = req.requestLine - 1;
  const parts = splitLine(lines[idx]);
  const current = parts.method?.toUpperCase() ?? 'GET';
  const method = change.method && change.method !== current ? change.method : parts.method;
  const url = change.url ?? parts.url;
  let next: string;
  if (method === null) {
    next = URL_START_RE.test(url) ? `${parts.indent}${url}${parts.version}` : `${parts.indent}GET${url ? ` ${url}` : ''}${parts.version}`;
  } else {
    next = `${parts.indent}${method}${url ? ` ${url}` : ''}${url ? parts.version : ''}`;
  }
  if (next === lines[idx]) return code;
  lines[idx] = next;
  return lines.join('\n');
}

// ---------- Filas: lo que escribe el usuario ----------

export interface RowInput {
  name: string;
  value: string;
}

const VARIABLE_SPLIT_RE = /(\{\{[^}]*\}\})/;

/** HT41: solo se codifica lo que rompería la query (el espacio, `&`, `#`,
 *  y `=` en el nombre). Lo de dentro de `{{…}}` nunca. */
export function encodeQueryPart(text: string, isName: boolean): string {
  const re = isName ? /[ &#=]/g : /[ &#]/g;
  return text.split(VARIABLE_SPLIT_RE).map((seg, i) => (i % 2 === 1 ? seg : seg.replace(re, (c) => encodeURIComponent(c)))).join('');
}

/** Un nombre de cabecera válido (el `HEADER_RE` del parser). */
export const isHeaderName = (name: string) => /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name);

// ---------- Params ----------

const QUERY_LINE_RE = /^(\s*)(#\s*)?([?&])(.*)$/;

const pairText = (name: string, value: string, hasValue: boolean) => (hasValue || value !== '' ? `${name}=${value}` : name);

/** Los trozos crudos de una línea `?`/`&` (los vacíos incluidos, para que
 *  las posiciones de `QueryRow.pos` valgan). */
function linePieces(line: string): { indent: string; hash: string; sep: string; pieces: string[] } | null {
  const m = QUERY_LINE_RE.exec(line);
  if (!m) return null;
  const rest = m[4].trim();
  return { indent: m[1], hash: m[2] ?? '', sep: m[3], pieces: rest === '' ? [] : rest.split('&') };
}

const joinLine = (p: { indent: string; hash: string; sep: string; pieces: string[] }) => `${p.indent}${p.hash}${p.sep}${p.pieces.join('&')}`;

/** La sangría de las líneas de la query que ya hay, o ninguna. */
function queryIndent(lines: string[], req: ParsedRequest): string {
  const first = req.query.find((r) => r.place === 'line');
  return first ? (linePieces(lines[first.line - 1])?.indent ?? '') : '';
}

/** Los trozos de la query de la URL de la línea de la petición. */
function urlPieces(code: string, requestIndex: number): string[] | null {
  const q = splitUrlQuery(readRequestLine(code, requestIndex).url).query;
  return q === null ? null : q.split('&');
}

function withUrlPieces(code: string, requestIndex: number, pieces: string[] | null): string {
  const { base, hash } = splitUrlQuery(readRequestLine(code, requestIndex).url);
  // Los trozos vacíos (`a=1&&b=2`) se conservan para no cambiar lo demás;
  // sin ningún parámetro, la URL se queda sin `?`.
  const url = pieces && pieces.some((p) => p !== '') ? `${base}?${pieces.join('&')}${hash}` : `${base}${hash}`;
  return writeRequestLine(code, requestIndex, { url });
}

/** La primera línea activa de la query lleva `?` si la URL no tiene uno;
 *  las demás, `&`. REST Client pega las líneas tal cual, así que un `&b=2`
 *  sin `?` antes (porque se desactivó el primero) le daría una URL rota. */
function fixQuerySeparators(code: string, requestIndex: number): string {
  const loc = locate(code, requestIndex);
  if (!loc) return code;
  const { lines, req } = loc;
  let hasQuestion = splitUrlQuery(req.urlLine).query !== null;
  let changed = false;
  const seen = new Set<number>();
  for (const r of req.query) {
    if (r.place !== 'line' || !r.enabled || seen.has(r.line)) continue;
    seen.add(r.line);
    const p = linePieces(lines[r.line - 1]);
    const want = hasQuestion ? '&' : '?';
    if (p && p.sep !== want) {
      lines[r.line - 1] = joinLine({ ...p, sep: want });
      changed = true;
    }
    hasQuestion = true;
  }
  return changed ? lines.join('\n') : code;
}

function insertLine(code: string, index: number, text: string): string {
  const lines = normalize(code).split('\n');
  lines.splice(index, 0, text);
  return lines.join('\n');
}

function replaceLine(code: string, line: number, text: string | null): string {
  const lines = normalize(code).split('\n');
  if (text === null) lines.splice(line - 1, 1);
  else lines[line - 1] = text;
  return lines.join('\n');
}

/** Cambia el nombre y el valor de un parámetro, donde esté. */
export function setQueryRow(code: string, requestIndex: number, row: number, input: RowInput): string {
  const loc = locate(code, requestIndex);
  const r = loc?.req.query[row];
  if (!loc || !r) return code;
  const name = encodeQueryPart(input.name, true);
  const value = encodeQueryPart(input.value, false);
  const text = pairText(name, value, r.hasValue);
  let next: string;
  if (r.place === 'url') {
    const pieces = urlPieces(code, requestIndex) ?? [];
    if (pieces[r.pos] === text) return code;
    pieces[r.pos] = text;
    next = withUrlPieces(code, requestIndex, pieces);
  } else {
    const p = linePieces(loc.lines[r.line - 1]);
    if (!p || p.pieces[r.pos] === text) return code;
    p.pieces[r.pos] = text;
    next = replaceLine(code, r.line, joinLine(p));
  }
  return fixQuerySeparators(next, requestIndex);
}

/** Activa o desactiva un parámetro (HT41). Uno de la URL pasa a su propia
 *  línea `# &k=v`; uno de una línea compartida, también. */
export function toggleQueryRow(code: string, requestIndex: number, row: number): string {
  const loc = locate(code, requestIndex);
  const r = loc?.req.query[row];
  if (!loc || !r) return code;
  const { lines, req } = loc;
  const indent = queryIndent(lines, req);
  let next: string;
  if (r.place === 'url') {
    const pieces = urlPieces(code, requestIndex) ?? [];
    const [piece] = pieces.splice(r.pos, 1);
    next = withUrlPieces(code, requestIndex, pieces);
    // Justo debajo de la línea de la petición: la más cerca de donde estaba.
    next = insertLine(next, req.requestLine, `${indent}# &${piece}`);
  } else {
    const p = linePieces(lines[r.line - 1]);
    if (!p) return code;
    const own = p.pieces.filter((x) => x !== '').length === 1;
    if (own) {
      next = replaceLine(code, r.line, joinLine({ ...p, hash: r.enabled ? '# ' : '' }));
    } else {
      const [piece] = p.pieces.splice(r.pos, 1);
      next = replaceLine(code, r.line, joinLine(p));
      next = insertLine(next, r.line, r.enabled ? `${p.indent}# &${piece}` : `${p.indent}&${piece}`);
    }
  }
  return fixQuerySeparators(next, requestIndex);
}

/** Agrega un parámetro respetando el estilo (HT41): en una línea aparte si
 *  hay parámetros activos en líneas aparte; si no, en la URL. */
export function addQueryRow(code: string, requestIndex: number, input: RowInput): string {
  const text = pairText(encodeQueryPart(input.name, true), encodeQueryPart(input.value, false), false);
  const loc = locate(code, requestIndex);
  if (!loc) return withUrlPieces(writeRequestLine(code, requestIndex, {}), requestIndex, [text]);
  const { lines, req } = loc;
  const onLines = req.query.filter((r) => r.place === 'line');
  let next: string;
  if (onLines.some((r) => r.enabled)) {
    const last = Math.max(...onLines.map((r) => r.line));
    next = insertLine(code, last, `${queryIndent(lines, req)}&${text}`);
  } else {
    const pieces = urlPieces(code, requestIndex) ?? [];
    next = withUrlPieces(code, requestIndex, [...pieces.filter((p) => p !== ''), text]);
  }
  return fixQuerySeparators(next, requestIndex);
}

export function removeQueryRow(code: string, requestIndex: number, row: number): string {
  const loc = locate(code, requestIndex);
  const r = loc?.req.query[row];
  if (!loc || !r) return code;
  let next: string;
  if (r.place === 'url') {
    const pieces = urlPieces(code, requestIndex) ?? [];
    pieces.splice(r.pos, 1);
    next = withUrlPieces(code, requestIndex, pieces);
  } else {
    const p = linePieces(loc.lines[r.line - 1]);
    if (!p) return code;
    p.pieces.splice(r.pos, 1);
    next = replaceLine(code, r.line, p.pieces.some((x) => x !== '') ? joinLine(p) : null);
  }
  return fixQuerySeparators(next, requestIndex);
}

/** Mueve un parámetro un lugar arriba o abajo, si se puede sin cambiar
 *  dónde vive ni si está activo; si no, devuelve el mismo texto. */
export function moveQueryRow(code: string, requestIndex: number, row: number, delta: -1 | 1): string {
  const loc = locate(code, requestIndex);
  const a = loc?.req.query[row];
  const b = loc?.req.query[row + delta];
  if (!loc || !a || !b || a.place !== b.place) return code;
  let next: string;
  if (a.place === 'url') {
    const pieces = urlPieces(code, requestIndex) ?? [];
    [pieces[a.pos], pieces[b.pos]] = [pieces[b.pos], pieces[a.pos]];
    next = withUrlPieces(code, requestIndex, pieces);
  } else if (a.line === b.line) {
    const p = linePieces(loc.lines[a.line - 1]);
    if (!p) return code;
    [p.pieces[a.pos], p.pieces[b.pos]] = [p.pieces[b.pos], p.pieces[a.pos]];
    next = replaceLine(code, a.line, joinLine(p));
  } else {
    const pa = linePieces(loc.lines[a.line - 1]);
    const pb = linePieces(loc.lines[b.line - 1]);
    if (!pa || !pb) return code;
    const alone = (p: { pieces: string[] }) => p.pieces.filter((x) => x !== '').length === 1;
    const lines = [...loc.lines];
    if (alone(pa) && alone(pb)) {
      [lines[a.line - 1], lines[b.line - 1]] = [lines[b.line - 1], lines[a.line - 1]];
    } else if (a.enabled === b.enabled) {
      [pa.pieces[a.pos], pb.pieces[b.pos]] = [pb.pieces[b.pos], pa.pieces[a.pos]];
      lines[a.line - 1] = joinLine(pa);
      lines[b.line - 1] = joinLine(pb);
    } else {
      return code;
    }
    next = lines.join('\n');
  }
  return fixQuerySeparators(next, requestIndex);
}

// ---------- Cabeceras ----------

const HEADER_LINE_RE = /^(\s*)(#\s*)?/;

function headerLine(original: string | null, row: { name: string; value: string; enabled: boolean }): string {
  const m = original === null ? null : HEADER_LINE_RE.exec(original);
  const indent = m?.[1] ?? '';
  const hash = row.enabled ? '' : m?.[2] || '# ';
  return `${indent}${hash}${row.name}:${row.value === '' ? '' : ` ${row.value}`}`;
}

export function setHeaderRow(code: string, requestIndex: number, row: number, input: RowInput): string {
  const loc = locate(code, requestIndex);
  const r = loc?.req.headerRows[row];
  if (!loc || !r || !isHeaderName(input.name)) return code;
  if (r.name === input.name && r.value === input.value.trim()) return code;
  return replaceLine(code, r.line, headerLine(loc.lines[r.line - 1], { name: input.name, value: input.value.trim(), enabled: r.enabled }));
}

/** HT42: `Nombre: valor` ↔ `# Nombre: valor`. */
export function toggleHeaderRow(code: string, requestIndex: number, row: number): string {
  const loc = locate(code, requestIndex);
  const r = loc?.req.headerRows[row];
  if (!loc || !r) return code;
  return replaceLine(code, r.line, headerLine(loc.lines[r.line - 1], { ...r, enabled: !r.enabled }));
}

/** Al final de la zona de las cabeceras, antes de la línea en blanco. */
export function addHeaderRow(code: string, requestIndex: number, input: RowInput, enabled = true): string {
  if (!isHeaderName(input.name)) return code;
  const text = headerLine(null, { name: input.name, value: input.value.trim(), enabled });
  const loc = locate(code, requestIndex);
  if (!loc) return `${writeRequestLine(code, requestIndex, {})}\n${text}`;
  return insertLine(code, loc.req.headerEnd - 1, text);
}

export function removeHeaderRow(code: string, requestIndex: number, row: number): string {
  const loc = locate(code, requestIndex);
  const r = loc?.req.headerRows[row];
  if (!loc || !r) return code;
  return replaceLine(code, r.line, null);
}

/** Cambia de lugar dos filas: el orden importa en las repetidas. */
export function moveHeaderRow(code: string, requestIndex: number, row: number, delta: -1 | 1): string {
  const loc = locate(code, requestIndex);
  const a = loc?.req.headerRows[row];
  const b = loc?.req.headerRows[row + delta];
  if (!loc || !a || !b) return code;
  const lines = [...loc.lines];
  [lines[a.line - 1], lines[b.line - 1]] = [lines[b.line - 1], lines[a.line - 1]];
  return lines.join('\n');
}

// ---------- Cuerpo ----------

/** Reemplaza el cuerpo: lo de después de la línea en blanco. Sin cuerpo,
 *  quita también esa línea; sin línea en blanco, la agrega. Hasta A2 (los
 *  tipos de cuerpo) es el `textarea` de siempre. */
export function setRequestBody(code: string, requestIndex: number, body: string): string {
  const loc = locate(code, requestIndex);
  const next = body.replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '');
  if (!loc) return next ? `${writeRequestLine(code, requestIndex, {})}\n\n${next}` : code;
  const { lines, req } = loc;
  if ((req.body ?? '') === next) return code;
  const hasSeparator = req.headerEnd <= req.endLine;
  const from = hasSeparator ? req.headerEnd - 1 : req.endLine;
  const count = hasSeparator ? req.endLine - from : 0;
  lines.splice(from, count, ...(next ? ['', ...next.split('\n')] : []));
  return lines.join('\n');
}

// ---------- Auth (HT43) ----------

export type AuthKind = 'none' | 'bearer' | 'basic' | 'apikey' | 'other';

export type AuthState =
  | { kind: 'none' }
  | { kind: 'bearer'; token: string; row: number }
  | { kind: 'basic'; user: string; password: string; row: number }
  | { kind: 'apikey'; place: 'header' | 'query'; name: string; value: string; row: number }
  | { kind: 'other'; value: string; row: number };

export type AuthInput =
  | { kind: 'none' }
  | { kind: 'bearer'; token: string }
  | { kind: 'basic'; user: string; password: string }
  | { kind: 'apikey'; place: 'header' | 'query'; name: string; value: string }
  | { kind: 'other'; value: string };

/** Para reconocer una API key: si una variable es un secreto del entorno
 *  activo. Y la fila que la pantalla acaba de escribir como API key, que
 *  se reconoce aunque su valor todavía no sea una variable. */
export interface AuthContext {
  isSecret: (name: string) => boolean;
  apiKey?: { place: 'header' | 'query'; name: string } | null;
}

const ONLY_VARIABLE_RE = /^\{\{\s*([A-Za-z_$][A-Za-z0-9_.-]*)\s*\}\}$/;

/** El valor es exactamente `{{var}}` y `var` es de credencial. */
function looksApiKey(value: string, ctx: AuthContext): boolean {
  const m = ONLY_VARIABLE_RE.exec(value.trim());
  return !!m && (ctx.isSecret(m[1]) || SENSITIVE_NAME_RE.test(m[1]));
}

/** `usuario:contraseña` (el primer `:` fuera de `{{…}}`) o `usuario
 *  contraseña`. `null` si no es ninguna de las dos (un Base64). */
export function splitBasic(creds: string): { user: string; password: string } | null {
  const text = creds.trim();
  if (text === '') return { user: '', password: '' };
  for (let i = 0; i < text.length; i += 1) {
    if (text.startsWith('{{', i)) {
      const close = text.indexOf('}}', i + 2);
      if (close < 0) break;
      i = close + 1;
      continue;
    }
    if (text[i] === ':') return { user: text.slice(0, i), password: text.slice(i + 1) };
  }
  const ws = /\s+/.exec(text);
  return ws ? { user: text.slice(0, ws.index), password: text.slice(ws.index + ws[0].length) } : null;
}

const authRowIndex = (req: ParsedRequest) => req.headerRows.findIndex((h) => h.enabled && h.name.toLowerCase() === 'authorization');

/** Lo que muestra la pestaña Auth, leído del texto. La `Authorization`
 *  activa manda; sin ella, la primera cabecera y después el primer
 *  parámetro que parecen una API key. */
export function readAuth(req: ParsedRequest, ctx: AuthContext): AuthState {
  const row = authRowIndex(req);
  if (row >= 0) {
    const value = req.headerRows[row].value;
    const scheme = /^(\S+)(?:\s+([\s\S]*))?$/.exec(value);
    const kind = scheme?.[1].toLowerCase();
    if (kind === 'bearer') return { kind: 'bearer', token: (scheme?.[2] ?? '').trim(), row };
    if (kind === 'basic') {
      const creds = splitBasic(scheme?.[2] ?? '');
      if (creds) return { kind: 'basic', ...creds, row };
    }
    return { kind: 'other', value, row };
  }
  const pinned = ctx.apiKey;
  const header = req.headerRows.findIndex((h) =>
    h.enabled && (pinned?.place === 'header' && h.name.toLowerCase() === pinned.name.toLowerCase() ? true : looksApiKey(h.value, ctx)));
  if (header >= 0) {
    const h = req.headerRows[header];
    return { kind: 'apikey', place: 'header', name: h.name, value: h.value, row: header };
  }
  const query = req.query.findIndex((q) =>
    q.enabled && (pinned?.place === 'query' && q.name === encodeQueryPart(pinned.name, true) ? true : looksApiKey(q.value, ctx)));
  if (query >= 0) {
    const q = req.query[query];
    return { kind: 'apikey', place: 'query', name: q.name, value: q.value, row: query };
  }
  return { kind: 'none' };
}

const authValue = (input: Exclude<AuthInput, { kind: 'none' } | { kind: 'apikey' }>) => {
  if (input.kind === 'bearer') return input.token ? `Bearer ${input.token}` : 'Bearer';
  if (input.kind === 'basic') return input.user || input.password ? `Basic ${input.user}:${input.password}` : 'Basic';
  return input.value;
};

/** Escribe lo elegido en Auth como una cabecera o un parámetro normal
 *  (HT43): nunca una directiva aparte. Quita lo del tipo anterior. */
export function setAuth(code: string, requestIndex: number, input: AuthInput, ctx: AuthContext): string {
  const loc = locate(code, requestIndex);
  if (!loc) {
    if (input.kind === 'none') return code;
    return setAuth(writeRequestLine(code, requestIndex, {}), requestIndex, input, ctx);
  }
  const current = readAuth(loc.req, ctx);
  let next = code;
  // Lo del tipo anterior que ya no va.
  if (current.kind === 'apikey' && (input.kind !== 'apikey' || input.place !== current.place)) {
    next = current.place === 'header' ? removeHeaderRow(next, requestIndex, current.row) : removeQueryRow(next, requestIndex, current.row);
  }
  if (input.kind === 'none' || input.kind === 'apikey') {
    const req = parseHttpBlock(normalize(next)).requests[requestIndex];
    const row = req ? authRowIndex(req) : -1;
    if (row >= 0) next = removeHeaderRow(next, requestIndex, row);
  }
  if (input.kind === 'none') return next;
  if (input.kind === 'apikey') {
    if (current.kind === 'apikey' && current.place === input.place) {
      return input.place === 'header'
        ? setHeaderRow(next, requestIndex, current.row, { name: input.name, value: input.value })
        : setQueryRow(next, requestIndex, current.row, { name: input.name, value: input.value });
    }
    return input.place === 'header'
      ? addHeaderRow(next, requestIndex, { name: input.name, value: input.value })
      : addQueryRow(next, requestIndex, { name: input.name, value: input.value });
  }
  const value = authValue(input);
  const req = parseHttpBlock(normalize(next)).requests[requestIndex];
  const row = req ? authRowIndex(req) : -1;
  if (row >= 0) return setHeaderRow(next, requestIndex, row, { name: req!.headerRows[row].name, value });
  return addHeaderRow(next, requestIndex, { name: 'Authorization', value });
}

/** La fila de la tabla que escribió Auth (para su marca "de Auth"). */
export function authRow(state: AuthState): { place: 'header' | 'query'; row: number } | null {
  if (state.kind === 'none') return null;
  if (state.kind === 'apikey') return { place: state.place, row: state.row };
  return { place: 'header', row: state.row };
}

/** Un valor que quedaría escrito en la nota tal cual: tiene algo más que
 *  `{{variables}}` y espacios. */
export const isLiteral = (value: string) => value.replace(/\{\{[^}]*\}\}/g, '').trim() !== '';

export type { HeaderRow, QueryRow };
