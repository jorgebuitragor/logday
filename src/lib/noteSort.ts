import type { Note } from '../types/note';
import type { NoteSortBy, NoteSortDir } from '../types/config';
import { stampSortKey } from './localDate';

/** Orden de notas compartido por la lista y la vista de árbol: las
 *  fijadas primero y después el criterio elegido en la lista. */
export function sortNotes(notes: Note[], by: NoteSortBy, dir: NoteSortDir): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    let cmp: number;
    if (by === 'title') cmp = a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
    // Las marcas pueden mezclar instantes y `YYYY-MM-DD` legados: se
    // comparan por el momento que representan, no como strings.
    else if (by === 'created') cmp = stampSortKey(a.created) - stampSortKey(b.created);
    else cmp = stampSortKey(a.updated) - stampSortKey(b.updated);
    return dir === 'desc' ? -cmp : cmp;
  });
}
