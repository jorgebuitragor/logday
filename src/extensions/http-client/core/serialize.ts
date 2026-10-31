// El formulario de la herramienta de DevTools ↔ el texto de un bloque
// ```http (specs/cliente-http HT28, design A1 y Interfaz §3). El envío usa
// ese texto, así que el formulario pasa por el mismo parser, la misma
// resolución y las mismas confirmaciones que un bloque de una nota. Puro.
import { HTTP_METHODS, parseHttpBlock, type HttpMethod, type ParseIssue } from './parse';

export interface HttpForm {
  method: HttpMethod;
  url: string;
  /** Una cabecera por línea, `Nombre: valor`, como en el bloque. */
  headers: string;
  body: string;
}

export const EMPTY_FORM: HttpForm = { method: 'GET', url: '', headers: '', body: '' };

export const isHttpMethod = (value: string): value is HttpMethod => (HTTP_METHODS as readonly string[]).includes(value);

export type FormField = 'url' | 'headers' | 'body';

export interface Serialized {
  /** El texto del bloque: es lo que se envía y lo que se guarda en una nota. */
  code: string;
  /** De una línea del texto (desde 1) a su campo y su línea en él. */
  fieldOf: (line: number) => { field: FormField; line: number };
}

const isBlank = (line: string) => line.trim() === '';

/** Sin las líneas en blanco del principio y del final. */
function trimBlankLines(lines: string[]): { lines: string[]; skipped: number } {
  let start = 0;
  let end = lines.length;
  while (start < end && isBlank(lines[start])) start += 1;
  while (end > start && isBlank(lines[end - 1])) end -= 1;
  return { lines: lines.slice(start, end), skipped: start };
}

/** El texto del bloque equivalente al formulario. Solo lleva lo que se
 *  escribió: las variables van como `{{nombre}}`, nunca con su valor.
 *  - Las líneas en blanco de las cabeceras se quitan: en el bloque, una
 *    línea en blanco es donde empieza el cuerpo.
 *  - Con HEAD no va el cuerpo (Interfaz §3). */
export function serializeForm(form: HttpForm): Serialized {
  const headerLines: { text: string; line: number }[] = [];
  form.headers.replace(/\r\n?/g, '\n').split('\n').forEach((text, i) => {
    if (!isBlank(text)) headerLines.push({ text: text.trim(), line: i + 1 });
  });
  const body = form.method === 'HEAD' ? { lines: [], skipped: 0 } : trimBlankLines(form.body.replace(/\r\n?/g, '\n').split('\n'));
  const out = [`${form.method} ${form.url.trim()}`, ...headerLines.map((h) => h.text)];
  if (body.lines.length) out.push('', ...body.lines);
  const bodyStart = headerLines.length + 3;
  return {
    code: out.join('\n'),
    fieldOf: (line) => {
      if (line <= 1) return { field: 'url', line: 1 };
      if (line < bodyStart - 1) return { field: 'headers', line: headerLines[line - 2]?.line ?? 1 };
      return { field: 'body', line: Math.max(1, line - bodyStart + 1 + body.skipped) };
    },
  };
}

/** Si el cuerpo tiene una línea `###`, el bloque la tomaría como el
 *  comienzo de otra petición y se enviaría cortado. */
export function bodySplitsRequest(form: HttpForm): boolean {
  return form.method !== 'HEAD' && /^###/m.test(form.body.replace(/\r\n?/g, '\n'));
}

export interface LoadedForm {
  form: HttpForm;
  /** Cuántas peticiones tiene el bloque (se carga la primera). */
  count: number;
}

/** "Traer de una nota": la primera petición del bloque, en el formulario.
 *  Las cabeceras se copian como están escritas (también las mal escritas,
 *  para que se vea el error) y las líneas `?`/`&` ya van en la URL. Sin
 *  ninguna petición, `null`. */
export function formFromBlock(code: string): LoadedForm | null {
  const parsed = parseHttpBlock(code);
  const req = parsed.requests[0];
  if (!req) return null;
  const lines = code.replace(/\r\n?/g, '\n').split('\n');
  // De la línea de la petición (la primera con contenido tras el ### y los
  // comentarios) hasta la primera en blanco, sin las de la query.
  let i = req.startLine - 1;
  if (/^###/.test(lines[i] ?? '')) i += 1;
  while (i < req.endLine && (isBlank(lines[i]) || /^\s*(#(?!##)|\/\/)/.test(lines[i]))) i += 1;
  i += 1;
  while (i < req.endLine && /^\s*[?&]/.test(lines[i])) i += 1;
  const headers: string[] = [];
  while (i < req.endLine && !isBlank(lines[i])) {
    headers.push(lines[i].trim());
    i += 1;
  }
  return {
    form: { method: req.method, url: req.url, headers: headers.join('\n'), body: req.body ?? '' },
    count: parsed.requests.length,
  };
}

/** Los problemas que muestra la herramienta: los del bloque sin el de "el
 *  bloque está vacío" (sin URL, la herramienta muestra su estado vacío). */
export function formIssues(issues: readonly ParseIssue[]): ParseIssue[] {
  return issues.filter((i) => i.code !== 'empty_block');
}
