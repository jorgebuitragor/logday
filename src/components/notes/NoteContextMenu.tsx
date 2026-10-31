import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { ChevronRight, Copy, CopyPlus, Download, FilePlus, FolderInput, FolderOpen, Pencil, Pin, Tag, Trash2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import type { Note } from '../../types/note';
import { t } from '../../lib/i18n';
import { useConfirmDelete } from '../../hooks/useConfirmDelete';
import { usePositionedMenu } from '../../hooks/usePositionedMenu';
import { ConfirmDeleteModal } from '../shared/ConfirmDeleteModal';
import { ModalOverlay } from '../shared/ModalOverlay';
import { ModalPanel } from '../shared/ModalPanel';
import { ExportModal } from './ExportModal';

// Menú contextual de una nota, el mismo en la vista de lista (NoteList) y en
// la de árbol (NoteTree): Jorge pidió que el clic derecho en el árbol diera
// las mismas opciones que en la lista (31 oct 2026). Aquí viven las
// acciones, el submenú "Mover a" y los modales (tags, exportar, confirmar
// eliminar); cada vista solo abre el menú y pinta el renombrado en su fila.

type MenuState = { note: Note; x: number; y: number } | null;
type SubMenuAnchor = { left: number; top: number; right: number; bottom: number } | null;

const ESTIMATED_MAIN_MENU = { width: 210, height: 420 };
const ESTIMATED_SUB_MENU = { width: 170, height: 220 };

const ITEM = 'flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition';
const SEPARATOR = <div className="my-1 h-px bg-[var(--border)]" />;

/** Carpetas a las que se puede mover la nota: todas menos la suya. */
export function moveTargets(note: Note, folders: string[]): string[] {
  return ['', ...folders].filter((f) => f !== note.folder);
}

interface NoteContextMenuPanelProps {
  note: Note;
  language: 'es' | 'en';
  canMove: boolean;
  /** Una nota nueva sin escribir: no se crea otra encima (igual que el botón "Nueva"). */
  disableNewNote: boolean;
  isWindows: boolean;
  subMenuOpen: boolean;
  panelRef?: Ref<HTMLDivElement>;
  moveButtonRef?: Ref<HTMLButtonElement>;
  style?: CSSProperties;
  onNewNoteInFolder: () => void;
  onRename: () => void;
  onEditTags: () => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onTogglePin: () => void;
  onToggleMove: () => void;
  onShowInSystem: () => void;
  onExport: () => void;
  onDelete: () => void;
}

/** El panel en sí, sin estado: lo que se ve y en qué orden. */
export function NoteContextMenuPanel(props: NoteContextMenuPanelProps) {
  const { note, language, canMove, disableNewNote, isWindows, subMenuOpen } = props;
  return (
    <div
      ref={props.panelRef}
      className="fixed z-50 min-w-[180px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl py-1"
      style={props.style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={props.onNewNoteInFolder}
        disabled={disableNewNote}
        className={`${ITEM} disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <FilePlus size={13} />
        {t(language, 'sidebar', 'newNoteInFolder')}
      </button>

      {SEPARATOR}

      <button onClick={props.onRename} className={ITEM}>
        <Pencil size={13} />
        {t(language, 'notes', 'rename')}
      </button>
      <button onClick={props.onEditTags} className={ITEM}>
        <Tag size={13} />
        {t(language, 'notes', 'editTags')}
      </button>

      {SEPARATOR}

      <button onClick={props.onCopy} className={ITEM}>
        <Copy size={13} />
        {t(language, 'notes', 'copy')}
      </button>
      <button onClick={props.onDuplicate} className={ITEM}>
        <CopyPlus size={13} />
        {t(language, 'notes', 'duplicate')}
      </button>

      {SEPARATOR}

      <button onClick={props.onTogglePin} className={ITEM}>
        <Pin size={13} className={note.pinned ? 'text-amber-400' : ''} />
        {note.pinned ? t(language, 'notes', 'unpin') : t(language, 'notes', 'pin')}
      </button>

      {canMove && (
        <button
          ref={props.moveButtonRef}
          onClick={props.onToggleMove}
          aria-haspopup="true"
          aria-expanded={subMenuOpen}
          className={`flex w-full items-center justify-between px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition ${subMenuOpen ? 'bg-[var(--bg-hover)]' : ''}`}
        >
          <span className="flex items-center gap-2.5">
            <FolderInput size={13} />
            {t(language, 'notes', 'moveTo')}
          </span>
          <ChevronRight size={11} />
        </button>
      )}

      <button onClick={props.onShowInSystem} className={ITEM}>
        <FolderOpen size={13} />
        {isWindows ? t(language, 'notes', 'showInExplorer') : t(language, 'notes', 'showInFinder')}
      </button>

      <button onClick={props.onExport} className={ITEM}>
        <Download size={13} />
        {t(language, 'notes', 'export')}
      </button>

      {SEPARATOR}

      <button
        onClick={props.onDelete}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 transition"
      >
        <Trash2 size={13} />
        {t(language, 'notes', 'delete')}
      </button>
    </div>
  );
}

function NoteTagsModal({ note, language, onChange, onClose }: {
  note: Note;
  language: 'es' | 'en';
  onChange: (updated: Note) => Promise<void>;
  onClose: () => void;
}) {
  const [tagInput, setTagInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, []);

  const addTag = async () => {
    if (!tagInput.trim()) return;
    const tag = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (note.tags.includes(tag)) { setTagInput(''); return; }
    await onChange({ ...note, tags: [...note.tags, tag] });
    setTagInput('');
  };

  const removeTag = (tag: string) => onChange({ ...note, tags: note.tags.filter((x) => x !== tag) });

  return (
    <ModalOverlay onClose={onClose}>
      <ModalPanel className="w-72 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t(language, 'notes', 'tagsModalTitle')}</h3>
          <button onClick={onClose} className="text-[var(--text-hint)] hover:text-[var(--text-muted)]">
            <X size={14} />
          </button>
        </div>
        {/* Tags actuales */}
        <div className="mb-3 flex flex-wrap gap-1.5 min-h-[24px]">
          {note.tags.length === 0 && (
            <span className="text-xs text-[var(--text-faint)] italic">{t(language, 'notes', 'noTags')}</span>
          )}
          {note.tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-400">
              {tag}
              <button onClick={() => void removeTag(tag)} className="hover:text-red-400 transition">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        {/* Input nuevo tag */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addTag();
              if (e.key === 'Escape') onClose();
            }}
            placeholder={t(language, 'notes', 'newTagPlaceholder')}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500/60 placeholder-[var(--text-hint)]"
          />
          <button
            onClick={() => void addTag()}
            disabled={!tagInput.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white transition hover:bg-indigo-500 disabled:opacity-40"
          >
            {t(language, 'notes', 'addTag')}
          </button>
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}

interface UseNoteContextMenuOptions {
  /** Cómo se borra la nota ya confirmada; la lista la anima antes de borrarla. */
  onDelete?: (note: Note) => void | Promise<void>;
  /** Tras crear una nota desde el menú (el árbol abre su carpeta). */
  onNoteCreated?: (note: Note) => void;
}

export interface NoteContextMenuApi {
  /** Para el `onContextMenu` de la fila de la nota. */
  open: (e: React.MouseEvent, note: Note) => void;
  /** Id de la nota que se está renombrando en su fila, si hay. */
  renamingNoteId: string | null;
  commitRename: (value: string) => Promise<void>;
  cancelRename: () => void;
  /** El menú y sus modales; se pinta una vez en la vista. */
  element: ReactNode;
}

export function useNoteContextMenu({ onDelete, onNoteCreated }: UseNoteContextMenuOptions = {}): NoteContextMenuApi {
  const {
    activeNote, noteFolders, basePath, language, confirmDestructiveActions,
    createNote, deleteNote, duplicateNote, toggleNotePin, moveNote, renameNote, updateNote,
  } = useAppStore(
    useShallow((s) => ({
      activeNote: s.activeNote,
      noteFolders: s.noteFolders,
      basePath: s.basePath,
      language: s.language,
      confirmDestructiveActions: s.confirmDestructiveActions,
      createNote: s.createNote,
      deleteNote: s.deleteNote,
      duplicateNote: s.duplicateNote,
      toggleNotePin: s.toggleNotePin,
      moveNote: s.moveNote,
      renameNote: s.renameNote,
      updateNote: s.updateNote,
    })),
  );

  const [menu, setMenu] = useState<MenuState>(null);
  const [subMenuAnchor, setSubMenuAnchor] = useState<SubMenuAnchor>(null);
  const [renamingNote, setRenamingNote] = useState<Note | null>(null);
  const [editingTagsNote, setEditingTagsNote] = useState<Note | null>(null);
  const [exportNote, setExportNote] = useState<Note | null>(null);
  const moveButtonRef = useRef<HTMLButtonElement>(null);
  const confirmDelete = useConfirmDelete<Note>(confirmDestructiveActions);

  const close = () => {
    setMenu(null);
    setSubMenuAnchor(null);
  };

  const mainMenu = usePositionedMenu(menu, { estimatedSize: ESTIMATED_MAIN_MENU, onClose: close });
  const subMenu = usePositionedMenu(subMenuAnchor, {
    estimatedSize: ESTIMATED_SUB_MENU,
    anchorOptions: { sideX: 'right', alignY: 'start', gap: 4, flip: true },
    onClose: () => setSubMenuAnchor(null),
  });

  const removeNote = (note: Note) => (onDelete ? onDelete(note) : deleteNote(note));

  // Cierra el menú y corre la acción sobre la nota en la que se abrió.
  const run = (action: (note: Note) => unknown) => () => {
    if (!menu) return;
    const note = menu.note;
    close();
    void action(note);
  };

  const open = (e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    e.stopPropagation();
    setSubMenuAnchor(null);
    setMenu({ note, x: e.clientX, y: e.clientY });
  };

  const toggleMove = () => {
    if (subMenuAnchor) {
      setSubMenuAnchor(null);
      return;
    }
    const btn = moveButtonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setSubMenuAnchor({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
  };

  const copy = (note: Note) => {
    const text = note.title ? `# ${note.title}\n\n${note.content}`.trim() : note.content.trim();
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const showInSystem = (note: Note) => {
    if (!basePath) return;
    const path = note.folder ? `${basePath}/notes/${note.folder}` : `${basePath}/notes`;
    import('../../lib/invoke').then(({ fs }) => fs.openInSystem(path));
  };

  const commitRename = async (value: string) => {
    if (!renamingNote) return;
    const newTitle = value.trim();
    if (newTitle && newTitle !== renamingNote.title) await renameNote(renamingNote, newTitle);
    setRenamingNote(null);
  };

  const isNewEmptyNote = !!activeNote && !activeNote.title.trim() && !activeNote.content.trim();
  const folders = menu ? moveTargets(menu.note, noteFolders) : [];

  const element = (
    <>
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={close} />
          <NoteContextMenuPanel
            note={menu.note}
            language={language}
            canMove={folders.length > 0}
            disableNewNote={isNewEmptyNote}
            isWindows={navigator.userAgent.includes('Windows')}
            subMenuOpen={!!subMenuAnchor}
            panelRef={mainMenu.ref}
            moveButtonRef={moveButtonRef}
            style={mainMenu.style}
            onNewNoteInFolder={run(async (note) => {
              const created = await createNote(note.folder);
              onNoteCreated?.(created);
            })}
            onRename={run((note) => setRenamingNote(note))}
            onEditTags={run((note) => setEditingTagsNote(note))}
            onCopy={run(copy)}
            onDuplicate={run(duplicateNote)}
            onTogglePin={run(toggleNotePin)}
            onToggleMove={toggleMove}
            onShowInSystem={run(showInSystem)}
            onExport={run((note) => setExportNote(note))}
            onDelete={run((note) => confirmDelete.request(note, (n) => void removeNote(n)))}
          />

          {/* Submenú Mover a */}
          {subMenuAnchor && folders.length > 0 && (
            <div
              ref={subMenu.ref}
              className="fixed z-50 min-w-[150px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl py-1"
              style={subMenu.style}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {folders.map((f) => (
                <button
                  key={f || '__root__'}
                  onClick={run((note) => moveNote(note, f))}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
                >
                  {f || t(language, 'notes', 'noFolder')}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {editingTagsNote && (
        <NoteTagsModal
          note={editingTagsNote}
          language={language}
          onChange={async (updated) => {
            await updateNote(updated);
            setEditingTagsNote(updated);
          }}
          onClose={() => setEditingTagsNote(null)}
        />
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
          onConfirm={() => { void removeNote(confirmDelete.pending!); confirmDelete.cancel(); }}
        />
      )}

      {exportNote && <ExportModal note={exportNote} onClose={() => setExportNote(null)} />}
    </>
  );

  return {
    open,
    renamingNoteId: renamingNote?.id ?? null,
    commitRename,
    cancelRename: () => setRenamingNote(null),
    element,
  };
}
