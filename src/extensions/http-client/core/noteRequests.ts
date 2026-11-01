// La columna "Peticiones" de la pantalla (specs/cliente-http HT34): los
// bloques ```http de las notas, agrupados por nota, con cada petición de
// cada bloque (también las separadas por ###). Puro: recibe los textos de
// las notas ya leídos y no lanza con un bloque mal escrito.
import { parseFencedBlocks } from '../../../lib/fencedBlocks';
import { hasErrors, parseHttpBlock, type HttpMethod } from './parse';

/** Lo que hace falta de una nota (`Note` de `types/note.ts`). */
export interface NoteSource {
  id: string;
  title: string;
  content: string;
  filePath: string;
}

export interface NoteRequest {
  /** El n-ésimo bloque ```http de la nota (el `index` de R24). */
  blockIndex: number;
  /** La petición dentro del bloque. */
  requestIndex: number;
  /** De "### nombre". */
  name: string | null;
  method: HttpMethod;
  /** Como está escrita, con las {{variables}} sin resolver. */
  url: string;
  /** Si tiene un error de sintaxis (no se podría enviar tal cual). */
  hasErrors: boolean;
  /** El texto del bloque entero, para cargarla en el formulario. */
  code: string;
}

export interface NoteRequestGroup {
  note: NoteSource;
  requests: NoteRequest[];
}

/** Las notas con alguna petición, en el orden en que llegan, y en cada
 *  una sus peticiones en el orden del texto. Un bloque vacío no aporta
 *  nada; uno con más de 20 peticiones, las 20 primeras (HT6). */
export function collectNoteRequests(notes: readonly NoteSource[]): NoteRequestGroup[] {
  const out: NoteRequestGroup[] = [];
  for (const note of notes) {
    const requests: NoteRequest[] = [];
    parseFencedBlocks(note.content ?? '', 'http').forEach((block, blockIndex) => {
      const parsed = parseHttpBlock(block.code);
      const blockBroken = hasErrors(parsed.issues.filter((i) => i.code !== 'too_many_requests'));
      parsed.requests.forEach((req, requestIndex) => {
        requests.push({
          blockIndex,
          requestIndex,
          name: req.name,
          method: req.method,
          url: req.url,
          hasErrors: blockBroken || hasErrors(req.issues),
          code: block.code,
        });
      });
    });
    if (requests.length) out.push({ note, requests });
  }
  return out;
}

/** "api.example.com/users?page=2": sin el esquema, que casi siempre es el
 *  mismo. El resto se corta con puntos suspensivos al dibujarla. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '');
}

/** Lo que dice la fila: el nombre de `###` o el método y la URL corta. */
export function requestTitle(req: Pick<NoteRequest, 'name' | 'method' | 'url'>): string {
  return req.name ?? `${req.method} ${shortUrl(req.url)}`.trim();
}

/** Minúsculas y sin tildes, para buscar sin pensar en ellas. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** El buscador de la columna. Si el título de la nota coincide, se ve con
 *  todas sus peticiones; si no, solo las que coinciden por nombre, método
 *  o URL. Las palabras se buscan cada una por su lado. */
export function filterNoteRequests(groups: readonly NoteRequestGroup[], query: string): NoteRequestGroup[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [...groups];
  const matches = (text: string) => words.every((w) => text.includes(w));
  const out: NoteRequestGroup[] = [];
  for (const group of groups) {
    const title = fold(group.note.title);
    const requests = group.requests.filter((r) => matches(`${title} ${fold(`${r.name ?? ''} ${r.method} ${r.url}`)}`));
    if (requests.length) out.push({ note: group.note, requests });
  }
  return out;
}

/** El total de peticiones de la lista. */
export const countRequests = (groups: readonly NoteRequestGroup[]) => groups.reduce((n, g) => n + g.requests.length, 0);
