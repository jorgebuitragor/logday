import { useState, useEffect, useRef } from 'react';
import { Plus, Pin, Search, Copy, CopyPlus, Trash2, FolderInput, ChevronRight, Share2, Download, Pencil, Tag, X, ArrowUpDown } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { Note } from '../types';
import { ExportModal } from './ExportModal';

type CtxMenu = { note: Note; x: number; y: number } | null;
type SubMenuPos = { x: number; y: number } | null;

export function NoteList() {
  const {
    notes,
    activeNote,
    noteFolders,
    activeSection,
    basePath,
    setActiveNote,
    createNote,
    deleteNote,
    duplicateNote,
    toggleNotePin,
    moveNote,
    renameNote,
    updateNote,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'title'>('updated');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null);
  const [subMenuPos, setSubMenuPos] = useState<SubMenuPos>(null);
  const [exportModalNote, setExportModalNote] = useState<Note | null>(null);

  // Renombrar nota
  const [renamingNote, setRenamingNote] = useState<Note | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Editar tags
  const [editingTagsNote, setEditingTagsNote] = useState<Note | null>(null);
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Animación de eliminación
  const [removingNoteId] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const subMenuRef = useRef<HTMLDivElement>(null);
  const moveButtonRef = useRef<HTMLButtonElement>(null);

  // Nota vacía recién creada (sin título ni contenido)
  const isNewEmptyNote = !!activeNote && !activeNote.title.trim() && !activeNote.content.trim();

  // id de la nota siendo descartada (animación)
  const [discardingNoteId, setDiscardingNoteId] = useState<string | null>(null);
  const [confirmDeleteNote, setConfirmDeleteNote] = useState<Note | null>(null);

  const doDeleteNote = async (note: Note) => {
    setDiscardingNoteId(note.id);
    setTimeout(async () => {
      await deleteNote(note);
      setDiscardingNoteId(null);
    }, 300);
  };

  // Seleccionar nota descartando la vacía si existe
  const handleSelectNote = async (note: Note) => {
    if (isNewEmptyNote && activeNote && activeNote.id !== note.id) {
      const toDiscard = activeNote;
      setDiscardingNoteId(toDiscard.id);
      setActiveNote(note);
      setTimeout(async () => {
        await deleteNote(toDiscard);
        setDiscardingNoteId(null);
      }, 300);
      return;
    }
    setActiveNote(note);
  };

  // Cerrar menú de ordenación al hacer click fuera
  useEffect(() => {
    if (!showSortMenu) return;
    const handler = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSortMenu]);

  useEffect(() => {
  }, [renamingNote]);

  useEffect(() => {
    if (editingTagsNote) setTimeout(() => tagInputRef.current?.focus(), 50);
  }, [editingTagsNote]);

  // Cerrar menú al hacer click fuera
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: MouseEvent) => {
      const inMain = menuRef.current?.contains(e.target as Node);
      const inSub = subMenuRef.current?.contains(e.target as Node);
      if (!inMain && !inSub) {
        setCtxMenu(null);
        setSubMenuPos(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ctxMenu]);

  // Cerrar menú con Escape
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setCtxMenu(null); setSubMenuPos(null); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [ctxMenu]);

  const closeMenu = () => { setCtxMenu(null); setSubMenuPos(null); };

  const handleContextMenu = (e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    e.stopPropagation();
    setSubMenuPos(null);
    setCtxMenu({ note, x: e.clientX, y: e.clientY });
  };

  const handleToggleMoveSubmenu = () => {
    if (subMenuPos) { setSubMenuPos(null); return; }
    const btn = moveButtonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setSubMenuPos({ x: rect.right + 4, y: rect.top });
  };

  const handleCopy = () => {
    if (!ctxMenu) return;
    const { title, content } = ctxMenu.note;
    const text = title ? `# ${title}\n\n${content}`.trim() : content.trim();
    navigator.clipboard.writeText(text).catch(() => {});
    closeMenu();
  };

  const handleDuplicate = async () => {
    if (!ctxMenu) return;
    closeMenu();
    await duplicateNote(ctxMenu.note);
  };

  const handleDelete = () => {
    if (!ctxMenu) return;
    const note = ctxMenu.note;
    closeMenu();
    setConfirmDeleteNote(note);
  };

  const handlePin = async () => {
    if (!ctxMenu) return;
    const note = ctxMenu.note;
    closeMenu();
    await toggleNotePin(note);
  };

  const handleMove = async (toFolder: string) => {
    if (!ctxMenu) return;
    const note = ctxMenu.note;
    closeMenu();
    await moveNote(note, toFolder);
  };

  const handleOpenInSystem = () => {
    if (!ctxMenu || !basePath) return;
    const note = ctxMenu.note;
    closeMenu();
    const folder = note.folder || '';
    const path = folder
      ? `${basePath}/notes/${folder}`
      : `${basePath}/notes`;
    import('../lib/invoke').then(({ fs }) => fs.openInSystem(path));
  };

  const handleStartRename = () => {
    if (!ctxMenu) return;
    const note = ctxMenu.note;
    closeMenu();
    setRenameValue(note.title);
    setRenamingNote(note);
  };

  const handleRenameConfirm = async () => {
    if (!renamingNote) return;
    const newTitle = renameValue.trim();
    if (newTitle && newTitle !== renamingNote.title) {
      await renameNote(renamingNote, newTitle);
    }
    setRenamingNote(null);
  };

  const handleStartEditTags = () => {
    if (!ctxMenu) return;
    const note = ctxMenu.note;
    closeMenu();
    setTagInput('');
    setEditingTagsNote(note);
  };

  const handleAddTag = async () => {
    if (!editingTagsNote || !tagInput.trim()) return;
    const tag = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (editingTagsNote.tags.includes(tag)) { setTagInput(''); return; }
    const updated = { ...editingTagsNote, tags: [...editingTagsNote.tags, tag] };
    await updateNote(updated);
    setEditingTagsNote(updated);
    setTagInput('');
  };

  const handleRemoveTag = async (tag: string) => {
    if (!editingTagsNote) return;
    const updated = { ...editingTagsNote, tags: editingTagsNote.tags.filter(t => t !== tag) };
    await updateNote(updated);
    setEditingTagsNote(updated);
  };

  if (activeSection !== 'notes') return null;

  const sortLabels: Record<typeof sortBy, string> = {
    updated: 'Modificación',
    created: 'Creación',
    title: 'Título',
  };

  const filtered = search.trim()
    ? notes.filter(
        (n) =>
          n.title.toLowerCase().includes(search.toLowerCase()) ||
          n.content.toLowerCase().includes(search.toLowerCase())
      )
    : notes;

  const sorted = [...filtered].sort((a, b) => {
    // Pinned siempre primero
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sortBy === 'title') return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
    if (sortBy === 'created') return b.created.localeCompare(a.created);
    return b.updated.localeCompare(a.updated); // 'updated'
  });

  // Carpetas destino (excluir la carpeta actual de la nota del menú)
  const moveFolders = ctxMenu
    ? ['', ...noteFolders].filter((f) => f !== ctxMenu.note.folder)
    : [];

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Notas</h2>
        <button
          onClick={() => createNote()}
          disabled={isNewEmptyNote}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-indigo-400 transition hover:bg-indigo-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Nueva nota"
        >
          <Plus size={14} />
          Nueva
        </button>
      </div>

      {/* Search + Sort */}
      <div className="border-b border-[var(--border)] px-3 py-2 flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-lg bg-[var(--bg-surface)] px-3 py-1.5">
          <Search size={12} className="text-[var(--text-hint)] shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar notas…"
            className="flex-1 bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder-[var(--text-hint)]"
          />
        </div>
        <div className="relative flex justify-end" ref={sortMenuRef}>
          <button
            onClick={() => setShowSortMenu(v => !v)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-surface)] transition"
          >
            <ArrowUpDown size={10} />
            {sortLabels[sortBy]}
          </button>
          {showSortMenu && (
            <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl py-1">
              {(['updated', 'created', 'title'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={() => { setSortBy(opt); setShowSortMenu(false); }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition ${
                    sortBy === opt
                      ? 'text-indigo-400 bg-indigo-500/10'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {sortLabels[opt]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <p className="text-sm text-[var(--text-hint)]">Sin notas</p>
            <p className="mt-1 text-xs text-[var(--text-faint)]">
              Pulsa "Nueva" para crear tu primera nota
            </p>
          </div>
        ) : (
          sorted.map((note) => {
            const isActive = activeNote?.id === note.id;
            const preview = note.content.replace(/#{1,6}\s/g, '').slice(0, 100);
            const isRenaming = renamingNote?.id === note.id;

            return (
              <div
                key={note.id}
                onContextMenu={(e) => handleContextMenu(e, note)}
                className={`animate-in w-full border-b border-[var(--border)] last:border-0 ${
                  discardingNoteId === note.id ? 'animate-discard' :
                  removingNoteId === note.id ? 'animate-out' : ''
                } ${
                  isActive ? 'bg-indigo-500/10' : 'hover:bg-[var(--bg-hover)]'
                }`}
              >
                {isRenaming ? (
                  <div className="px-4 py-3">
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameConfirm();
                        if (e.key === 'Escape') setRenamingNote(null);
                      }}
                      onBlur={handleRenameConfirm}
                      className="w-full rounded border border-indigo-500/40 bg-[var(--bg-surface)] px-2 py-1 text-sm text-[var(--text-primary)] outline-none"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => handleSelectNote(note)}
                    className="w-full px-4 py-3 text-left transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium leading-snug truncate ${isActive ? 'text-indigo-400' : 'text-[var(--text-primary)]'}`}>
                        {note.title || 'Sin título'}
                      </p>
                      {note.pinned && (
                        <Pin size={10} className="mt-0.5 shrink-0 text-amber-400" />
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-hint)]">{note.updated}</span>
                      {note.folder && (
                        <span className="text-[10px] text-[var(--text-hint)] truncate">{note.folder}</span>
                      )}
                    </div>
                    {note.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {note.tags.map(tag => (
                          <span key={tag} className="rounded px-1.5 py-0.5 text-[10px] bg-indigo-500/10 text-indigo-400">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {preview && (
                      <p className="mt-1 text-xs text-[var(--text-hint)] line-clamp-2 leading-relaxed">
                        {preview}
                      </p>
                    )}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={closeMenu} />
          <div
            ref={menuRef}
            className="fixed z-50 min-w-[180px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl py-1"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleStartRename}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Pencil size={13} />
              Renombrar
            </button>
            <button
              onClick={handleStartEditTags}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Tag size={13} />
              Editar tags
            </button>

            <div className="my-1 h-px bg-[var(--border)]" />

            <button
              onClick={handleCopy}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Copy size={13} />
              Copiar
            </button>
            <button
              onClick={handleDuplicate}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <CopyPlus size={13} />
              Duplicar
            </button>

            <div className="my-1 h-px bg-[var(--border)]" />

            <button
              onClick={handlePin}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Pin size={13} className={ctxMenu.note.pinned ? 'text-amber-400' : ''} />
              {ctxMenu.note.pinned ? 'Quitar destacado' : 'Destacar'}
            </button>

            {moveFolders.length > 0 && (
              <button
                ref={moveButtonRef}
                onClick={handleToggleMoveSubmenu}
                className={`flex w-full items-center justify-between px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition ${subMenuPos ? 'bg-[var(--bg-hover)]' : ''}`}
              >
                <span className="flex items-center gap-2.5">
                  <FolderInput size={13} />
                  Mover a…
                </span>
                <ChevronRight size={11} />
              </button>
            )}

            <button
              onClick={handleOpenInSystem}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Share2 size={13} />
              {navigator.userAgent.includes('Windows') ? 'Mostrar en Explorador' : 'Mostrar en Finder'}
            </button>

            <button
              onClick={() => {
                if (!ctxMenu) return;
                const note = ctxMenu.note;
                closeMenu();
                setExportModalNote(note);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Download size={13} />
              Exportar
            </button>

            <div className="my-1 h-px bg-[var(--border)]" />

            <button
              onClick={handleDelete}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 transition"
            >
              <Trash2 size={13} />
              Eliminar
            </button>
          </div>

          {/* Submenú Mover a */}
          {subMenuPos && moveFolders.length > 0 && (
            <div
              ref={subMenuRef}
              className="fixed z-50 min-w-[150px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl py-1"
              style={{ left: subMenuPos.x, top: subMenuPos.y }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {moveFolders.map((f) => (
                <button
                  key={f || '__root__'}
                  onClick={() => handleMove(f)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
                >
                  {f || 'Sin carpeta'}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal editar tags */}
      {editingTagsNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onMouseDown={() => setEditingTagsNote(null)}
        >
          <div
            className="w-72 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Tags de la nota</h3>
              <button onClick={() => setEditingTagsNote(null)} className="text-[var(--text-hint)] hover:text-[var(--text-muted)]">
                <X size={14} />
              </button>
            </div>
            {/* Tags actuales */}
            <div className="mb-3 flex flex-wrap gap-1.5 min-h-[24px]">
              {editingTagsNote.tags.length === 0 && (
                <span className="text-xs text-[var(--text-faint)] italic">Sin tags</span>
              )}
              {editingTagsNote.tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-400">
                  {tag}
                  <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-400 transition">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            {/* Input nuevo tag */}
            <div className="flex gap-2">
              <input
                ref={tagInputRef}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTag();
                  if (e.key === 'Escape') setEditingTagsNote(null);
                }}
                placeholder="Nuevo tag…"
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500/60 placeholder-[var(--text-hint)]"
              />
              <button
                onClick={handleAddTag}
                disabled={!tagInput.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                Añadir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmación eliminar */}
      {confirmDeleteNote && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Trash2 size={15} className="text-red-400" />
              Eliminar nota
            </div>
            <p className="mb-4 text-xs text-[var(--text-secondary)]">
              ¿Eliminar <span className="font-medium text-[var(--text-primary)]">"{confirmDeleteNote.title || 'Sin título'}"</span>? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteNote(null)}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              >
                Cancelar
              </button>
              <button
                onClick={() => { doDeleteNote(confirmDeleteNote); setConfirmDeleteNote(null); }}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de exportar */}
      {exportModalNote && (
        <ExportModal note={exportModalNote} onClose={() => setExportModalNote(null)} />
      )}
    </div>
  );
}
