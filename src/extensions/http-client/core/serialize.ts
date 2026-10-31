// El borrador de la pantalla Cliente HTTP y el texto de un bloque ```http
// (specs/cliente-http HT33, HT34, HT40, design §14.3). Desde el v2, lo que
// se edita en la pantalla ya es el texto de la petición (`Draft.code` del
// store): las pestañas son vistas de ese texto, y la fila del método y la
// URL lo lee y lo cambia con `readRequestLine` y `writeRequestLine`
// (requestEdit.ts). Aquí queda lo que la pantalla necesita para mostrar sus
// problemas. Puro.
import { HTTP_METHODS, type HttpMethod, type ParseIssue } from './parse';

export const isHttpMethod = (value: string): value is HttpMethod => (HTTP_METHODS as readonly string[]).includes(value);

/** Si el texto tiene una línea `###`, el bloque la tomaría como el
 *  comienzo de otra petición y se enviaría (o se guardaría) cortado. */
export function draftSplitsRequest(code: string): boolean {
  return /^###/m.test(code.replace(/\r\n?/g, '\n'));
}

/** Los problemas que muestra la pantalla: los del bloque sin el de "el
 *  bloque está vacío" (sin URL, la pantalla muestra su estado vacío). */
export function formIssues(issues: readonly ParseIssue[]): ParseIssue[] {
  return issues.filter((i) => i.code !== 'empty_block');
}
