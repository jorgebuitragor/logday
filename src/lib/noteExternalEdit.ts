// Reescribir el contenido de una nota desde fuera del editor de notas: lo
// usa "Guardar en la nota" del Cliente HTTP (specs/cliente-http HT50,
// design §14.3). Se escribe igual que lo haría el editor, para que la nota
// abierta después muestre el cambio y el sync lo mande:
//   - el Markdown en disco y en el store, con `updateNote` (sello de
//     `updated`, git, metadatos);
//   - el `Y.Text` del `.ydoc`, con el mismo delta (`applyEditorEdit`) y
//     `syncNoteContent` (lo persiste y lo manda o lo encola).
// Si la nota no tiene `.ydoc` todavía, se siembra desde el Markdown como en
// `NoteEditor`, para no duplicar contenido (ver su hidratación del CRDT).
// No escribe si la nota está abierta en el editor: ese `Y.Doc` vivo es
// el único que puede escribir su `.ydoc` (noteContentSync.ts). Hoy la
// pantalla del Cliente HTTP y el editor no se ven a la vez (App.tsx).
import * as Y from 'yjs';
import { readNoteFromPath, syncNoteContent, useAppStore, waitForNoteSave } from '../store/appStore';
import type { Note } from '../types/note';
import { applyEditorEdit, applyTextEdit, isNoteOpen, loadPersistedYDoc } from './noteContentSync';
import { normalizeEditorMarkdown } from './noteEditorMarkdown';

export type ExternalEditResult =
  | { status: 'saved'; note: Note }
  | { status: 'unchanged' }
  /** `edit` devolvió `null`: no quiso escribir (p. ej. un conflicto). */
  | { status: 'declined' }
  | { status: 'missing' }
  | { status: 'open' };

/** Lee la nota de disco, le pasa su contenido a `edit` y escribe lo que
 *  devuelva. Nunca escribe sin que `edit` lo pida. */
export async function editNoteContent(
  filePath: string,
  noteId: string,
  edit: (content: string) => string | null,
): Promise<ExternalEditResult> {
  if (isNoteOpen(noteId)) return { status: 'open' };
  await waitForNoteSave(noteId);
  const note = await readNoteFromPath(filePath);
  if (!note || note.id !== noteId) return { status: 'missing' };
  const next = edit(note.content);
  if (next === null) return { status: 'declined' };
  if (next === note.content) return { status: 'unchanged' };
  // El editor pudo abrirse mientras se leía.
  if (isNoteOpen(noteId)) return { status: 'open' };

  // Los mismos dos caminos que la hidratación de `NoteEditor`: el `.ydoc`
  // que hay o, si no hay, uno sembrado desde el Markdown.
  let doc = await loadPersistedYDoc(filePath).catch(() => null);
  if (!doc) {
    doc = new Y.Doc();
    const seed = normalizeEditorMarkdown(note.content || '');
    if (seed) applyTextEdit(doc, '', seed);
  }
  // Solo el cambio de `edit`, trasladado a las posiciones del `Y.Text`: lo
  // que otro cliente escribió y el `.md` no refleja igual queda tal cual.
  applyEditorEdit(doc, note.content, next);
  const updated = { ...note, content: next };
  const store = useAppStore.getState();
  await store.updateNote(updated);
  await syncNoteContent(useAppStore.getState, useAppStore.setState, updated, doc);
  doc.destroy();
  return { status: 'saved', note: updated };
}
