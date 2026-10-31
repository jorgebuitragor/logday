import { useMemo } from 'react';
import { FileText, Pin, Plus } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { buildFolderTree } from '../../lib/folderTree';
import { sortNotes } from '../../lib/noteSort';
import InlineRenameInput from '../shared/InlineRenameInput';
import { useNoteContextMenu } from '../notes/NoteContextMenu';
import { FolderTreeItem } from './FolderTreeItem';
import type { Note } from '../../types/note';

// Vista de árbol de notas (estilo Obsidian): carpetas y notas en la barra
// lateral, sin la columna de la lista. La alternativa, la vista de lista
// (estilo Notas de Apple), sigue siendo la de siempre; se cambia con el
// botón de la cabecera y la vista por defecto se elige en Opciones.
//
// En esta vista el store carga siempre todas las notas (ver loadNotes), y
// la carpeta seleccionada solo indica dónde se crea una nota nueva.

type FolderTreeProps = Pick<
  React.ComponentProps<typeof FolderTreeItem>,
  | 'renamingFolder'
  | 'setRenamingFolder'
  | 'handleRenameConfirm'
  | 'handleFolderContextMenu'
  | 'folderTags'
  | 'expandedFolders'
  | 'setExpandedFolders'
  | 'moveNoteFolder'
>;

export function NoteTree(props: FolderTreeProps) {
  const {
    language, notes, noteFolders, activeNote, activeNoteFolder, noteSortBy, noteSortDir,
    setActiveNote, deleteNote, selectNoteFolder, setTreeNoteFolder, createNote,
  } = useAppStore();
  const { setExpandedFolders } = props;
  // El mismo menú que la lista (NoteContextMenu). Una nota creada desde él
  // abre su carpeta (y las de arriba) para que se vea en el árbol.
  const noteMenu = useNoteContextMenu({
    onNoteCreated: (note) => {
      if (!note.folder) return;
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        const parts = note.folder.split('/');
        for (let i = 1; i <= parts.length; i += 1) next.add(parts.slice(0, i).join('/'));
        return next;
      });
    },
  });

  const notesByFolder = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const note of sortNotes(notes, noteSortBy, noteSortDir)) {
      const list = map.get(note.folder) ?? [];
      list.push(note);
      map.set(note.folder, list);
    }
    return map;
  }, [notes, noteSortBy, noteSortDir]);
  const rootNotes = notesByFolder.get('') ?? [];

  // Abrir una nota descarta la nota nueva que quedó vacía, igual que la lista.
  const openNote = (note: Note) => {
    if (activeNote && activeNote.id !== note.id && !activeNote.title.trim() && !activeNote.content.trim()) {
      const empty = activeNote;
      setActiveNote(note);
      void deleteNote(empty, { showToast: false });
      return;
    }
    setActiveNote(note);
  };

  const renderNote = (note: Note, depth: number) => {
    const isActive = activeNote?.id === note.id;
    const indent = { paddingLeft: `${28 + depth * 12}px` };
    // Renombrar es en la misma fila, como las carpetas del árbol y la lista.
    if (noteMenu.renamingNoteId === note.id) {
      return (
        <div key={note.id} data-tree-note={note.id} className="flex items-center gap-1.5 py-1 pr-2" style={indent}>
          <FileText size={12} className="shrink-0 opacity-70" />
          <InlineRenameInput
            value={note.title}
            onCommit={noteMenu.commitRename}
            onCancel={noteMenu.cancelRename}
            className="min-w-0 flex-1 rounded border border-indigo-500/40 bg-[var(--bg-surface)] px-1 py-0.5 text-xs text-[var(--text-primary)] outline-none"
          />
        </div>
      );
    }
    return (
      <button
        key={note.id}
        data-tree-note={note.id}
        onClick={() => openNote(note)}
        onContextMenu={(e) => noteMenu.open(e, note)}
        className={`flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-xs transition ${
          isActive
            ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
            : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
        }`}
        style={indent}
        title={note.title || t(language, 'notes', 'untitled')}
      >
        <FileText size={12} className="shrink-0 opacity-70" />
        <span className={`truncate ${note.title ? '' : 'italic text-[var(--text-hint)]'}`}>
          {note.title || t(language, 'notes', 'untitled')}
        </span>
        {note.pinned && <Pin size={10} className="ml-auto shrink-0 text-indigo-400" />}
      </button>
    );
  };

  return (
    <div className="space-y-0.5">
      {buildFolderTree(noteFolders).map((node) => (
        <FolderTreeItem
          key={node.path}
          node={node}
          depth={0}
          activeNoteFolder={activeNoteFolder}
          selectNoteFolder={selectNoteFolder}
          notesByFolder={notesByFolder}
          renderNote={renderNote}
          onTreeFolderClick={setTreeNoteFolder}
          {...props}
        />
      ))}
      {rootNotes.length > 0 && noteFolders.length > 0 && (
        <div className="my-1.5 px-2">
          <div className="h-px bg-[var(--border)]" />
        </div>
      )}
      {rootNotes.map((note) => renderNote(note, -1))}
      {notes.length === 0 && (
        <div className="px-3 py-2 text-[11px]">
          <p className="text-[var(--text-hint)]">{t(language, 'notes', 'noNotesTree')}</p>
          <button
            type="button"
            onClick={() => void createNote()}
            className="mt-1 flex items-center gap-1 rounded text-indigo-400 transition hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <Plus size={11} aria-hidden="true" />
            {t(language, 'notes', 'createFirstNote')}
          </button>
        </div>
      )}

      {noteMenu.element}
    </div>
  );
}
