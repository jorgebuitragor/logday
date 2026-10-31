import { useMemo, useState } from 'react';
import { FilePlus, FileText, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { buildFolderTree } from '../../lib/folderTree';
import { sortNotes } from '../../lib/noteSort';
import { useConfirmDelete } from '../../hooks/useConfirmDelete';
import { usePositionedMenu } from '../../hooks/usePositionedMenu';
import { ConfirmDeleteModal } from '../shared/ConfirmDeleteModal';
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

const ESTIMATED_NOTE_MENU = { width: 180, height: 90 };

export function NoteTree(props: FolderTreeProps) {
  const {
    language, notes, noteFolders, activeNote, activeNoteFolder, noteSortBy, noteSortDir,
    confirmDestructiveActions, setActiveNote, deleteNote, toggleNotePin, selectNoteFolder, setTreeNoteFolder, createNote,
  } = useAppStore();
  const confirmDelete = useConfirmDelete<Note>(confirmDestructiveActions);
  const [menu, setMenu] = useState<{ x: number; y: number; note: Note } | null>(null);
  const menuLayout = usePositionedMenu(menu ? { x: menu.x, y: menu.y } : null, {
    estimatedSize: ESTIMATED_NOTE_MENU,
    onClose: () => setMenu(null),
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
    return (
      <button
        key={note.id}
        data-tree-note={note.id}
        onClick={() => openNote(note)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({ x: e.clientX, y: e.clientY, note });
        }}
        className={`flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-xs transition ${
          isActive
            ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
            : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
        }`}
        style={{ paddingLeft: `${28 + depth * 12}px` }}
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

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setMenu(null)} />
          <div
            ref={menuLayout.ref}
            className="fixed z-50 min-w-[160px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-xl"
            style={menuLayout.style}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { const folder = menu.note.folder; setMenu(null); void createNote(folder); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
            >
              <FilePlus size={13} />
              {t(language, 'sidebar', 'newNoteInFolder')}
            </button>
            <button
              onClick={() => { void toggleNotePin(menu.note); setMenu(null); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
            >
              {menu.note.pinned ? <PinOff size={13} /> : <Pin size={13} />}
              {menu.note.pinned ? t(language, 'notes', 'unpin') : t(language, 'notes', 'pin')}
            </button>
            <button
              onClick={() => {
                const note = menu.note;
                setMenu(null);
                confirmDelete.request(note, (n) => void deleteNote(n));
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-red-400 transition hover:bg-red-500/10"
            >
              <Trash2 size={13} />
              {t(language, 'notes', 'delete')}
            </button>
          </div>
        </>
      )}

      {confirmDelete.isOpen && confirmDelete.pending && (
        <ConfirmDeleteModal
          title={t(language, 'notes', 'confirmDeleteTitle')}
          message={
            <>
              {t(language, 'notes', 'confirmDeleteMsg')}{' '}
              <span className="font-medium text-[var(--text-primary)]">
                &quot;{confirmDelete.pending.title || t(language, 'notes', 'untitled')}&quot;
              </span>
              ? {t(language, 'notes', 'confirmDeleteDesc')}
            </>
          }
          cancelLabel={t(language, 'notes', 'cancel')}
          confirmLabel={t(language, 'notes', 'delete')}
          onCancel={confirmDelete.cancel}
          onConfirm={() => { void deleteNote(confirmDelete.pending!); confirmDelete.cancel(); }}
        />
      )}
    </div>
  );
}
