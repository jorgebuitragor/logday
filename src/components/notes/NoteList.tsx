import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Pin, Search, X, ArrowUpDown, Upload, Loader2, Notebook } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { Note } from '../../types/note';
import { useNoteContextMenu } from './NoteContextMenu';
import InlineRenameInput from '../shared/InlineRenameInput';
import { sortNotes } from '../../lib/noteSort';
import { stampToLocalDate } from '../../lib/localDate';
import { usePositionedMenu } from '../../hooks/usePositionedMenu';
import { t as tFn } from '../../lib/i18n';
import { pickMarkdownFiles } from '../../lib/invoke';
import { stripFencedBlocks } from '../../lib/fencedBlocks';
import { EXTENSIONS } from '../../extensions/registry';

// Los bloques propios de las extensiones (R24) no van en el resumen, salvo
// los inline: su texto (una petición HTTP) se lee bien, a diferencia del
// JSON de un dibujo (specs/cliente-http, design A3.5).
const EXTENSION_BLOCK_LANGUAGES = EXTENSIONS.flatMap((def) => (def.noteBlock && !def.noteBlock.inline ? [def.noteBlock.language] : []));

const ESTIMATED_EMPTY_MENU = { width: 170, height: 90 };

export function NoteList() {
  const {
    notes,
    activeNote,
    activeSection,
    language,
    setActiveNote,
    createNote,
    deleteNote,
    importNotesFromPaths,
  } = useAppStore(
    useShallow((s) => ({
      notes: s.notes,
      activeNote: s.activeNote,
      activeSection: s.activeSection,
      language: s.language,
      setActiveNote: s.setActiveNote,
      createNote: s.createNote,
      deleteNote: s.deleteNote,
      importNotesFromPaths: s.importNotesFromPaths,
    }))
  );

  const [search, setSearch] = useState('');
  // El orden vive en el store: lo comparte la vista de árbol y se recuerda.
  const sortBy = useAppStore((s) => s.noteSortBy);
  const sortDir = useAppStore((s) => s.noteSortDir);
  const setNoteSort = useAppStore((s) => s.setNoteSort);
  const setSortBy = (by: typeof sortBy) => setNoteSort(by, sortDir);
  const setSortDir = (dir: typeof sortDir) => setNoteSort(sortBy, dir);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [emptyCtxMenu, setEmptyCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Nota vacía recién creada (sin título ni contenido)
  const isNewEmptyNote = !!activeNote && !activeNote.title.trim() && !activeNote.content.trim();

  // Animación de eliminación
  const [removingNoteId] = useState<string | null>(null);

  // id de la nota siendo descartada (animación)
  const [discardingNoteId, setDiscardingNoteId] = useState<string | null>(null);

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
        await deleteNote(toDiscard, { showToast: false });
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

  const emptyMenu = usePositionedMenu(emptyCtxMenu, {
    estimatedSize: ESTIMATED_EMPTY_MENU,
    onClose: () => setEmptyCtxMenu(null),
  });

  // El menú de una nota es el mismo que el del árbol (NoteContextMenu); la
  // lista solo le pasa su borrado con animación.
  const noteMenu = useNoteContextMenu({ onDelete: (note) => doDeleteNote(note) });

  const handleImportFromDialog = async () => {
    setEmptyCtxMenu(null);
    setIsImporting(true);
    try {
      const paths = await pickMarkdownFiles();
      if (paths && paths.length > 0) {
        await importNotesFromPaths(paths);
      }
    } finally {
      setIsImporting(false);
    }
  };

  // Tauri intercepta el drag de archivos desde el SO antes de que llegue al WebView,
  // por lo que hay que usar onDragDropEvent en lugar de los eventos HTML5.
  useEffect(() => {
    if (activeSection !== 'notes') return;
    let cancelled = false;
    let unlistenFn: (() => void) | undefined;

    import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
      getCurrentWindow().onDragDropEvent((event) => {
        const payload = event.payload as { type: string; paths?: string[] };
        if (payload.type === 'enter') {
          const hasMd = payload.paths?.some((p) => p.endsWith('.md') || p.endsWith('.txt'));
          if (hasMd) setIsDragOver(true);
        } else if (payload.type === 'leave') {
          setIsDragOver(false);
        } else if (payload.type === 'drop') {
          setIsDragOver(false);
          const paths = (payload.paths ?? []).filter(
            (p) => p.endsWith('.md') || p.endsWith('.txt'),
          );
          if (paths.length > 0) {
            setIsImporting(true);
            importNotesFromPaths(paths).finally(() => setIsImporting(false));
          }
        }
      }),
    ).then((fn) => {
      if (cancelled) fn();
      else unlistenFn = fn;
    });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [activeSection, importNotesFromPaths]);

  // Todos los tags disponibles
  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach(n => n.tags.forEach(t => set.add(t)));
    return [...set].sort();
  }, [notes]);

  const filtered = useMemo(
    () => {
      let result = search.trim()
        ? notes.filter(
            (n) =>
              n.title.toLowerCase().includes(search.toLowerCase()) ||
              n.content.toLowerCase().includes(search.toLowerCase())
          )
        : notes;
      if (filterTag) result = result.filter(n => n.tags.includes(filterTag));
      return result;
    },
    [notes, search, filterTag]
  );

  const sorted = useMemo(() => sortNotes(filtered, sortBy, sortDir), [filtered, sortBy, sortDir]);

  if (activeSection !== 'notes') return null;

  const sortLabels: Record<typeof sortBy, string> = {
    updated: tFn(language, 'notes', 'sortUpdated'),
    created: tFn(language, 'notes', 'sortCreated'),
    title: tFn(language, 'notes', 'sortTitle'),
  };

  return (
    <div className="flex h-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]" style={{ width: 'var(--logday-list-w)' }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{tFn(language, 'notes', 'title')}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={handleImportFromDialog}
            disabled={isImporting}
            className="flex items-center gap-1 rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
            title={tFn(language, 'notes', 'importNote')}
          >
            {isImporting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          </button>
          <button
            onClick={() => createNote()}
            disabled={isNewEmptyNote}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-indigo-400 transition hover:bg-indigo-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
            title={tFn(language, 'notes', 'newNote')}
          >
            <Plus size={14} />
            {tFn(language, 'notes', 'newBtn')}
          </button>
        </div>
      </div>

      {/* Search + Sort */}
      <div className="border-b border-[var(--border)] px-3 py-2 flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-lg bg-[var(--bg-surface)] px-3 py-1.5">
          <Search size={12} className="text-[var(--text-hint)] shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tFn(language, 'notes', 'searchPlaceholder')}
            className="flex-1 bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder-[var(--text-hint)]"
          />
        </div>
        <div className="flex items-center justify-between gap-1">
          {/* Tag activo */}
          {filterTag ? (
            <button
              onClick={() => setFilterTag(null)}
              className="flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-400 hover:bg-indigo-500/25 transition"
            >
              #{filterTag} <X size={9} />
            </button>
          ) : <span />}
          <div className="relative flex justify-end" ref={sortMenuRef}>
            <button
              onClick={() => setShowSortMenu(v => !v)}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition ${
                showSortMenu ? 'bg-[var(--bg-surface)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              <ArrowUpDown size={10} />
              {sortLabels[sortBy]}
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[170px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl py-1">
                {/* Ordenar por */}
                <p className="px-3 pt-1.5 pb-1 text-[9px] font-bold uppercase tracking-widest text-[var(--text-faint)]">{tFn(language, 'notes', 'sortLabel')}</p>
                {(['updated', 'created', 'title'] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => { setSortBy(opt); setShowSortMenu(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition ${
                      sortBy === opt
                        ? 'text-indigo-400 bg-indigo-500/10'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {sortLabels[opt]}
                  </button>
                ))}

                <div className="my-1 h-px bg-[var(--border)]" />

                {/* Dirección */}
                <p className="px-3 pt-1.5 pb-1 text-[9px] font-bold uppercase tracking-widest text-[var(--text-faint)]">{tFn(language, 'notes', 'sortDir')}</p>
                {(['desc', 'asc'] as const).map(dir => (
                  <button
                    key={dir}
                    onClick={() => { setSortDir(dir); setShowSortMenu(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition ${
                      sortDir === dir
                        ? 'text-indigo-400 bg-indigo-500/10'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {dir === 'desc' ? tFn(language, 'notes', 'sortDesc') : tFn(language, 'notes', 'sortAsc')}
                  </button>
                ))}

                {allTags.length > 0 && (
                  <>
                    <div className="my-1 h-px bg-[var(--border)]" />
                    <p className="px-3 pt-1.5 pb-1 text-[9px] font-bold uppercase tracking-widest text-[var(--text-faint)]">{tFn(language, 'notes', 'filterByTag')}</p>
                    {filterTag && (
                      <button
                        onClick={() => { setFilterTag(null); setShowSortMenu(false); }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
                      >
                        <X size={11} /> {tFn(language, 'notes', 'removeFilter')}
                      </button>
                    )}
                    {allTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => { setFilterTag(tag === filterTag ? null : tag); setShowSortMenu(false); }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition ${
                          filterTag === tag
                            ? 'text-indigo-400 bg-indigo-500/10'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                        }`}
                      >
                        #{tag}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      <div
        className={`relative flex-1 overflow-y-auto py-1 transition-colors ${isDragOver ? 'bg-indigo-500/10' : ''}`}
        onContextMenu={(e) => {
          // Solo si el click es en el contenedor (espacio vacío), no en un item
          if (e.target === e.currentTarget || (e.target as HTMLElement).closest('[data-note-item]') === null) {
            e.preventDefault();
            setEmptyCtxMenu({ x: e.clientX, y: e.clientY });
          }
        }}
      >
        {/* Drag-over overlay */}
        {isDragOver && !isImporting && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-indigo-400/60">
            <Upload size={24} className="text-indigo-400" />
            <span className="text-xs font-medium text-indigo-400">{tFn(language, 'notes', 'dropToImport')}</span>
          </div>
        )}

        {/* Importing overlay */}
        {isImporting && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[var(--bg-panel)]/80 backdrop-blur-[1px]">
            <Loader2 size={22} className="animate-spin text-indigo-400" />
            <span className="text-xs font-medium text-indigo-400">{tFn(language, 'notes', 'importing')}</span>
          </div>
        )}
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <Notebook size={36} className="mb-3 text-[var(--text-faint)]" strokeWidth={1.5} />
            <p className="text-sm text-[var(--text-hint)]">{tFn(language, 'notes', 'emptyNotes')}</p>
            <p className="mt-1 text-xs text-[var(--text-faint)]">
              {tFn(language, 'notes', 'emptyHint')}
            </p>
          </div>
        ) : (
          sorted.map((note) => {
            const isActive = activeNote?.id === note.id;
            const preview = stripFencedBlocks(note.content, EXTENSION_BLOCK_LANGUAGES).replace(/#{1,6}\s/g, '').trim().slice(0, 100);

            return (
              <div
                key={note.id}
                data-note-item
                onContextMenu={(e) => noteMenu.open(e, note)}
                className={`animate-in w-full border-b border-[var(--border)] last:border-0 ${
                  discardingNoteId === note.id ? 'animate-discard' :
                  removingNoteId === note.id ? 'animate-out' : ''
                } ${
                  isActive ? 'bg-indigo-500/10' : 'hover:bg-[var(--bg-hover)]'
                }`}
              >
                {noteMenu.renamingNoteId === note.id ? (
                  <div className="px-4 py-3">
                    <InlineRenameInput
                      value={note.title}
                      onCommit={noteMenu.commitRename}
                      onCancel={noteMenu.cancelRename}
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
                        {note.title || tFn(language, 'notes', 'untitled')}
                      </p>
                      {note.pinned && (
                        <Pin size={10} className="mt-0.5 shrink-0 text-amber-400" />
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-hint)]">{stampToLocalDate(note.updated)}</span>
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


      {/* Menú contextual espacio vacío */}
      {emptyCtxMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onMouseDown={() => setEmptyCtxMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setEmptyCtxMenu(null);
            }}
          />
          <div
            ref={emptyMenu.ref}
            className="fixed z-50 min-w-[160px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl py-1"
            style={emptyMenu.style}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setEmptyCtxMenu(null);
                createNote();
              }}
              disabled={isNewEmptyNote}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={13} />
              {tFn(language, 'notes', 'newNote')}
            </button>
            <div className="my-1 h-px bg-[var(--border)]" />
            <button
              onClick={handleImportFromDialog}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Upload size={13} />
              {tFn(language, 'notes', 'importNote')}
            </button>
          </div>
        </>
      )}

      {noteMenu.element}
    </div>
  );
}
