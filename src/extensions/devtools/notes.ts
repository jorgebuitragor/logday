// Puente de DevTools con las notas (specs/devtools D10). Escribe con las
// acciones del store (R18), como el resto de extensiones.
import type { Note } from '../../types/note';
import { useAppStore, notesDir, noteFolderDir, readNoteFromPath } from '../../store/appStore';
import { fs } from '../../lib/invoke';
import { formatFence } from '../../lib/fencedBlocks';

async function readNotesIn(dir: string): Promise<Note[]> {
  try {
    const entries = await fs.listDir(dir);
    const files = entries.filter((e) => !e.is_dir && e.name.endsWith('.md'));
    const notes = await Promise.all(files.map((f) => readNoteFromPath(f.path)));
    return notes.filter((n): n is Note => n !== null);
  } catch {
    return [];
  }
}

/** Todas las notas, de todas las carpetas. El store solo tiene las de la
 *  carpeta abierta en la vista de lista, así que se leen de disco. */
export async function readAllNotes(): Promise<Note[]> {
  const { basePath, noteFolders } = useAppStore.getState();
  if (!basePath) return [];
  const lists = await Promise.all([
    readNotesIn(notesDir(basePath)),
    ...noteFolders.map((f) => readNotesIn(noteFolderDir(basePath, f))),
  ]);
  return lists.flat().sort((a, b) => (b.updated || b.created).localeCompare(a.updated || a.created));
}

/** Crea una nota en la raíz con la salida en un bloque de código. Una
 *  línea que empiece por comillas invertidas cerraría la cerca, así que
 *  lleva una más que la más larga (`formatFence`): un cuerpo http con ```
 *  queda en una de 4 (specs/cliente-http, Interfaz §3). */
export function saveOutputAsNote(title: string, language: string, output: string): Promise<Note> {
  return useAppStore.getState().createNoteWith({ title, content: formatFence(language, output) });
}

export async function openNote(note: Note) {
  const s = useAppStore.getState();
  s.setActiveNote(note);
  await s.setSection('notes');
}
