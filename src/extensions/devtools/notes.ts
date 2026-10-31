// Puente de DevTools con las notas (specs/devtools D10). Escribe con las
// acciones del store (R18), como el resto de extensiones.
import type { Note } from '../../types/note';
import { useAppStore } from '../../store/appStore';
import { formatFence } from '../../lib/fencedBlocks';

export { readAllNotes } from '../../lib/allNotes';

/** Crea una nota en la raíz con la salida en un bloque de código. Una
 *  línea que empiece por comillas invertidas cerraría la cerca, así que
 *  lleva una más que la más larga (`formatFence`). */
export function saveOutputAsNote(title: string, language: string, output: string): Promise<Note> {
  return useAppStore.getState().createNoteWith({ title, content: formatFence(language, output) });
}

export async function openNote(note: Note) {
  const s = useAppStore.getState();
  s.setActiveNote(note);
  await s.setSection('notes');
}
