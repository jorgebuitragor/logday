// Cambios al texto de un bloque ```http desde la barra (specs/cliente-http
// HT36): el selector de método. "Copiar como…" (cURL y los demás
// lenguajes) está en `codegen.ts`. Puro: sin React ni DOM, sobre el mismo
// parser que el envío.
import { parseHttpBlock, type HttpMethod } from './parse';

const URL_ONLY_RE = /^(\s*)(?=https?:\/\/|\{\{)/i;
const METHOD_TOKEN_RE = /^(\s*)([A-Za-z]+)(\s+\S)/;

/** El texto del bloque con `method` en la petición `requestIndex` (la de
 *  la barra). Solo cambia el método de su línea: la URL, las cabeceras, el
 *  cuerpo y los comentarios quedan igual, también si con GET o HEAD el
 *  cuerpo ya no se envía (lo avisa el bloque). Una línea que es solo una
 *  URL recibe el método delante. Si no hay nada que cambiar (el método es
 *  el mismo, la petición no existe o su línea no se entiende), devuelve el
 *  mismo texto. */
export function setRequestMethod(code: string, requestIndex: number, method: HttpMethod): string {
  const text = code.replace(/\r\n?/g, '\n');
  const req = parseHttpBlock(text).requests[requestIndex];
  if (!req) return code;
  const lines = text.split('\n');
  const idx = req.requestLine - 1;
  const line = lines[idx];
  if (line === undefined) return code;
  let next: string | null = null;
  const urlOnly = URL_ONLY_RE.exec(line);
  if (urlOnly) {
    // Ya era un GET implícito.
    if (method !== 'GET') next = `${urlOnly[1]}${method} ${line.slice(urlOnly[1].length)}`;
  } else {
    const m = METHOD_TOKEN_RE.exec(line);
    // Mayúsculas o minúsculas: si es el mismo método, no se toca.
    if (m && m[2].toUpperCase() !== method) next = `${m[1]}${method}${line.slice(m[1].length + m[2].length)}`;
  }
  if (next === null) return code;
  lines[idx] = next;
  return lines.join('\n');
}
