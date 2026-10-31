// Las notas de todas las carpetas, leídas de disco: el store solo tiene las
// de la carpeta abierta en la vista de lista. Lo usan "Traer de una nota"
// de DevTools y la columna de peticiones del Cliente HTTP
// (specs/cliente-http HT34). Solo lee.
import type { Note } from '../types/note';
import { useAppStore, notesDir, noteFolderDir, readNoteFromPath } from '../store/appStore';
import { fs } from './invoke';

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

/** Todas las notas, de la más reciente a la más vieja. Sin carpeta de
 *  datos, ninguna. */
export async function readAllNotes(): Promise<Note[]> {
  const { basePath, noteFolders } = useAppStore.getState();
  if (!basePath) return [];
  const lists = await Promise.all([
    readNotesIn(notesDir(basePath)),
    ...noteFolders.map((f) => readNotesIn(noteFolderDir(basePath, f))),
  ]);
  return lists.flat().sort((a, b) => (b.updated || b.created).localeCompare(a.updated || a.created));
}
