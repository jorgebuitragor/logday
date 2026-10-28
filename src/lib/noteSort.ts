import type { Note } from '../types/note';
import type { NoteSortBy, NoteSortDir } from '../types/config';

/** Orden de notas compartido por la lista y la vista de árbol: las
 *  fijadas primero y después el criterio elegido en la lista. */
export function sortNotes(notes: Note[], by: NoteSortBy, dir: NoteSortDir): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    let cmp: number;
    if (by === 'title') cmp = a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
    else if (by === 'created') cmp = a.created.localeCompare(b.created);
    else cmp = a.updated.localeCompare(b.updated);
    return dir === 'desc' ? -cmp : cmp;
  });
}
