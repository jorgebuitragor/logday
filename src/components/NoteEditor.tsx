import { useState, useEffect, useCallback, useReducer, useRef } from 'react';
import {
  Pin,
  Trash2,
  Eye,
  FileText,
  Columns2,
  FolderOpen,
  Tag,
  X,
  Plus,
  ChevronDown,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  List,
  ListOrdered,
  CheckSquare,
  Download,
  Minus,
  Underline,
  Highlighter,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Image as ImageIcon,
  Check,
  Quote,
  Braces,
  CaseSensitive,
  Table as TableIcon,
} from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import ImageExt from '@tiptap/extension-image';
import LinkExt from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Markdown } from 'tiptap-markdown';
import Paragraph from '@tiptap/extension-paragraph';
import { useAppStore } from '../store/appStore';
import { Note } from '../types';
import { ExportModal } from './ExportModal';

// Paragraph personalizado: serializa como \n simple en lugar de \n\n
// tiptap-markdown lee extension.storage.markdown para sobrescribir el serializer
const CompactParagraph = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        serialize(state: any, node: any) {
          state.renderInline(node);
          state.ensureNewLine();
        },
      },
    };
  },
});

export function NoteEditor() {
  const {
    activeNote,
    activeSection,
    noteFolders,
    updateNote,
    deleteNote,
    setActiveNote,
    toggleNotePin,
    moveNote,
  } = useAppStore();

  const [title, setTitle] = useState('');
  const [viewMode, setViewMode] = useState<'wysiwyg' | 'source' | 'split'>('wysiwyg');
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [mdContent, setMdContent] = useState('');
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [showCaseMenu, setShowCaseMenu] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [urlInputMode, setUrlInputMode] = useState<'link' | 'image' | null>(null);
  const [urlInputValue, setUrlInputValue] = useState('');
  const savedRangeRef = useRef<{ from: number; to: number } | null>(null);
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  const applyCase = (mode: 'upper' | 'lower' | 'sentence' | 'title') => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const text = editor.state.doc.textBetween(from, to, ' ');
    let transformed: string;
    if (mode === 'upper') {
      transformed = text.toUpperCase();
    } else if (mode === 'lower') {
      transformed = text.toLowerCase();
    } else if (mode === 'sentence') {
      transformed = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    } else {
      transformed = text.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    }
    editor.chain().focus().insertContentAt({ from, to }, transformed).run();
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: false,
        heading: { levels: [1, 2, 3, 4, 5] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      CompactParagraph,
      UnderlineExt,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Escribe tu nota\u2026' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: false }),
      ImageExt.configure({ inline: false, allowBase64: true }),
      LinkExt.configure({ openOnClick: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: false,
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose-editor focus:outline-none',
        spellcheck: 'false',
      },
    },
    onUpdate({ editor: ed }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = (ed.storage as any).markdown.getMarkdown() as string;
      setMdContent(md);
    },
    onSelectionUpdate() {
      forceUpdate();
    },
    onTransaction() {
      forceUpdate();
    },
  });

  const saveTimeoutRef = { current: null as ReturnType<typeof setTimeout> | null };

  const schedulesSave = useCallback(
    (patch: Partial<Note>) => {
      if (!activeNote) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        updateNote({ ...activeNote, ...patch });
      }, 600);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeNote, updateNote]
  );

  useEffect(() => {
    if (!activeNote || !editor) return;
    setTitle(activeNote.title);
    setViewMode('wysiwyg');
    editor.commands.setContent(activeNote.content || '');
    setMdContent(activeNote.content || '');
  }, [activeNote?.id, editor]);

  useEffect(() => {
    schedulesSave({ content: mdContent });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mdContent]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    schedulesSave({ title: val });
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim() && activeNote) {
      const newTags = [...new Set([...activeNote.tags, tagInput.trim()])];
      updateNote({ ...activeNote, tags: newTags });
      setTagInput('');
      setShowTagInput(false);
    }
    if (e.key === 'Escape') {
      setShowTagInput(false);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    if (!activeNote) return;
    updateNote({ ...activeNote, tags: activeNote.tags.filter((t) => t !== tag) });
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = async () => {
    if (!activeNote) return;
    await deleteNote(activeNote);
  };

  const handleMove = async (toFolder: string) => {
    if (!activeNote) return;
    setShowMoveMenu(false);
    await moveNote(activeNote, toFolder);
  };

  if (activeSection !== 'notes') return null;
  if (!activeNote) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--bg-base)]">
        <div className="text-center">
          <p className="text-sm text-[var(--text-hint)]">Selecciona o crea una nota</p>
        </div>
      </div>
    );
  }

  const moveTargets = ['', ...noteFolders].filter((f) => f !== activeNote.folder);

  const switchToWysiwyg = () => {
    // Sincronizar markdown crudo → TipTap al salir del modo source
    if (viewMode === 'source' && editor) {
      editor.commands.setContent(mdContent || '');
    }
    setViewMode('wysiwyg');
  };

  const switchToSplit = () => {
    if (viewMode === 'source' && editor) {
      editor.commands.setContent(mdContent || '');
    }
    setViewMode('split');
  };

  return (
    <div key={activeNote.id} className="animate-fade-in flex flex-1 flex-col overflow-hidden bg-[var(--bg-base)]">
      {/* Modal confirmación eliminar */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Trash2 size={15} className="text-red-400" />
              Eliminar nota
            </div>
            <p className="mb-4 text-xs text-[var(--text-secondary)]">
              ¿Eliminar <span className="font-medium text-[var(--text-primary)]">"{activeNote.title || 'Sin título'}"</span>? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); handleDelete(); }}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-2.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => toggleNotePin(activeNote)}
            className={`rounded-lg p-1.5 transition ${
              activeNote.pinned
                ? 'text-amber-400 bg-amber-400/10'
                : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'
            }`}
            title={activeNote.pinned ? 'Desanclar' : 'Anclar'}
          >
            <Pin size={14} />
          </button>

          <div className="flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-0.5 py-0.5">
            <button
              onClick={switchToWysiwyg}
              className={`rounded px-1.5 py-1 text-[11px] transition ${
                viewMode === 'wysiwyg'
                  ? 'text-[var(--text-primary)] bg-[var(--bg-tertiary)] shadow-sm'
                  : 'text-[var(--text-faint)] hover:text-[var(--text-secondary)]'
              }`}
              title="Visualizar"
            >
              <Eye size={12} />
            </button>
            <button
              onClick={() => setViewMode('source')}
              className={`rounded px-1.5 py-1 text-[11px] transition ${
                viewMode === 'source'
                  ? 'text-[var(--text-primary)] bg-[var(--bg-tertiary)] shadow-sm'
                  : 'text-[var(--text-faint)] hover:text-[var(--text-secondary)]'
              }`}
              title="Markdown fuente"
            >
              <FileText size={12} />
            </button>
            <button
              onClick={switchToSplit}
              className={`rounded px-1.5 py-1 text-[11px] transition ${
                viewMode === 'split'
                  ? 'text-[var(--text-primary)] bg-[var(--bg-tertiary)] shadow-sm'
                  : 'text-[var(--text-faint)] hover:text-[var(--text-secondary)]'
              }`}
              title="Comparar"
            >
              <Columns2 size={12} />
            </button>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowMoveMenu((v) => !v)}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              title="Mover a carpeta"
            >
              <FolderOpen size={13} />
              <span>{activeNote.folder || 'Sin carpeta'}</span>
              <ChevronDown size={11} />
            </button>
            {showMoveMenu && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-lg overflow-hidden">
                {moveTargets.map((f) => (
                  <button
                    key={f || '__root__'}
                    onClick={() => handleMove(f)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
                  >
                    <FolderOpen size={11} />
                    {f || 'Sin carpeta'}
                  </button>
                ))}
                {moveTargets.length === 0 && (
                  <p className="px-3 py-2 text-xs text-[var(--text-faint)] italic">Sin otras carpetas</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[var(--text-hint)] mr-2">{activeNote.updated}</span>
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            title="Exportar nota"
          >
            <Download size={13} />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:text-red-400 hover:bg-red-400/10"
            title="Eliminar nota"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setActiveNote(null)}
            className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            title="Cerrar"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Formatting toolbar — siempre en DOM para no desplazar contenido al cambiar a source */}
      <div className={`relative flex flex-wrap items-center gap-0.5 border-b border-[var(--border)] px-3 py-1 ${viewMode === 'source' ? 'invisible pointer-events-none' : ''}`}>

        {urlInputMode ? (
          /* Barra de URL inline (no usa window.prompt) */
          <>
            <span className="text-[11px] text-[var(--text-hint)] mr-1">
              {urlInputMode === 'link' ? 'URL enlace:' : 'URL imagen:'}
            </span>
            <input
              autoFocus
              type="text"
              value={urlInputValue}
              onChange={(e) => setUrlInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (urlInputValue.trim()) {
                    if (urlInputMode === 'link') {
                      const href = urlInputValue.trim();
                      const range = savedRangeRef.current;
                      if (range && range.from !== range.to) {
                        // Text was selected: apply link mark to selection
                        editor?.chain().focus().setTextSelection(range).setLink({ href }).run();
                      } else if (editor?.isActive('link')) {
                        // Cursor inside existing link: update it
                        editor?.chain().focus().extendMarkRange('link').setLink({ href }).run();
                      } else {
                        // No selection: insert the URL as link text
                        editor?.chain().focus().insertContent({
                          type: 'text',
                          text: href,
                          marks: [{ type: 'link', attrs: { href } }],
                        }).run();
                      }
                    } else {
                      editor?.chain().focus().setImage({ src: urlInputValue.trim() }).run();
                    }
                  }
                  savedRangeRef.current = null;
                  setUrlInputMode(null);
                  setUrlInputValue('');
                }
                if (e.key === 'Escape') {
                  setUrlInputMode(null);
                  setUrlInputValue('');
                }
              }}
              placeholder={urlInputMode === 'link' ? 'https://...' : 'https://...'}
              className="flex-1 bg-transparent text-[11px] text-[var(--text-primary)] outline-none placeholder-[var(--text-faint)] border-b border-[var(--border)] pb-0.5 min-w-0"
            />
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                if (urlInputValue.trim()) {
                  if (urlInputMode === 'link') {
                    const href = urlInputValue.trim();
                    const range = savedRangeRef.current;
                    if (range && range.from !== range.to) {
                      editor?.chain().focus().setTextSelection(range).setLink({ href }).run();
                    } else if (editor?.isActive('link')) {
                      editor?.chain().focus().extendMarkRange('link').setLink({ href }).run();
                    } else {
                      editor?.chain().focus().insertContent({
                        type: 'text',
                        text: href,
                        marks: [{ type: 'link', attrs: { href } }],
                      }).run();
                    }
                  } else {
                    editor?.chain().focus().setImage({ src: urlInputValue.trim() }).run();
                  }
                }
                savedRangeRef.current = null;
                setUrlInputMode(null);
                setUrlInputValue('');
              }}
              className="ml-1 rounded p-1.5 text-indigo-300 hover:bg-indigo-500/20 transition"
              title="Confirmar"
            ><Check size={12} /></button>
            <button
              onMouseDown={(e) => { e.preventDefault(); setUrlInputMode(null); setUrlInputValue(''); }}
              className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
              title="Cancelar"
            ><X size={12} /></button>
          </>
        ) : (
          /* Botones normales */
          <>
            {/* Selector de bloque/título — dropdown personalizado */}
            {(() => {
              const bv = editor?.isActive('heading', { level: 1 }) ? '1'
                : editor?.isActive('heading', { level: 2 }) ? '2'
                : editor?.isActive('heading', { level: 3 }) ? '3'
                : editor?.isActive('heading', { level: 4 }) ? '4'
                : editor?.isActive('heading', { level: 5 }) ? '5'
                : '0';
              const labels: Record<string, string> = { '0': 'Párrafo', '1': 'Título 1', '2': 'Título 2', '3': 'Título 3', '4': 'Título 4', '5': 'Título 5' };
              const options = [
                { v: '0', label: 'Párrafo' }, { v: '1', label: 'Título 1' }, { v: '2', label: 'Título 2' },
                { v: '3', label: 'Título 3' }, { v: '4', label: 'Título 4' }, { v: '5', label: 'Título 5' },
              ];
              return (
                <div className="relative mr-1">
                  <button
                    onMouseDown={(e) => { e.preventDefault(); setShowBlockMenu(v => !v); }}
                    className="flex items-center gap-1 h-6 rounded px-2 text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition border border-transparent hover:border-[var(--border)]"
                  >
                    {labels[bv]}
                    <ChevronDown size={10} />
                  </button>
                  {showBlockMenu && (
                    <div
                      className="absolute top-full left-0 mt-1 z-50 min-w-[110px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] py-1 shadow-lg"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      {options.map(({ v, label }) => (
                        <button
                          key={v}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setShowBlockMenu(false);
                            if (v === '0') editor?.chain().focus().setParagraph().run();
                            else editor?.chain().focus().toggleHeading({ level: parseInt(v) as 1|2|3|4|5 }).run();
                          }}
                          className={`w-full px-3 py-1 text-left text-[11px] transition hover:bg-[var(--bg-hover)] ${
                            bv === v ? 'text-indigo-300' : 'text-[var(--text-hint)]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            {/* Bloque: cita y código */}
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBlockquote().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('blockquote') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Cita"><Quote size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleCodeBlock().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('codeBlock') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Bloque de código"><Braces size={13} /></button>

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            {/* Inline styles */}
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBold().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('bold') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Negrita"><Bold size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleItalic().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('italic') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Cursiva"><Italic size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleUnderline().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('underline') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Subrayado"><Underline size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleStrike().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('strike') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Tachado"><Strikethrough size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleCode().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('code') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Código inline"><Code size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleHighlight().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('highlight') ? 'text-amber-400 bg-amber-400/10' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Resaltado"><Highlighter size={13} /></button>

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            {/* Listas */}
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('bulletList') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Lista de puntos"><List size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleOrderedList().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('orderedList') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Lista numerada"><ListOrdered size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleTaskList().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('taskList') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Lista de tareas"><CheckSquare size={13} /></button>

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            {/* Alineación */}
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setTextAlign('left').run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive({ textAlign: 'left' }) ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Alinear izquierda"><AlignLeft size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setTextAlign('center').run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive({ textAlign: 'center' }) ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Centrar"><AlignCenter size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setTextAlign('right').run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive({ textAlign: 'right' }) ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Alinear derecha"><AlignRight size={13} /></button>

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            {/* Cambio de capitalización */}
            <div className="relative">
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowCaseMenu(v => !v); }}
                className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
                title="Cambiar capitalización"
              ><CaseSensitive size={14} /></button>
              {showCaseMenu && (
                <div
                  className="absolute top-full right-0 mt-1 z-50 min-w-[160px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] py-1 shadow-lg"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {([
                    { mode: 'upper', label: 'TODO EN MAYÚSCULAS' },
                    { mode: 'lower', label: 'todo en minúsculas' },
                    { mode: 'sentence', label: 'Tipo oración' },
                    { mode: 'title', label: 'Cada Palabra En Mayúscula' },
                  ] as const).map(({ mode, label }) => (
                    <button
                      key={mode}
                      onMouseDown={(e) => { e.preventDefault(); applyCase(mode); setShowCaseMenu(false); }}
                      className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Extras */}
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                const sel = editor?.state.selection;
                savedRangeRef.current = sel ? { from: sel.from, to: sel.to } : null;
                setUrlInputMode('link');
                setUrlInputValue(editor?.isActive('link') ? (editor.getAttributes('link').href ?? '') : '');
              }}
              className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('link') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`}
              title="Enlace"
            ><Link size={13} /></button>
            <button
              onMouseDown={(e) => { e.preventDefault(); setUrlInputMode('image'); setUrlInputValue(''); }}
              className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
              title="Imagen"
            ><ImageIcon size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setHorizontalRule().run(); }} className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition" title="Separador"><Minus size={13} /></button>

            {/* Tabla */}
            <div className="relative">
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowTableMenu(v => !v); }}
                className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${
                  editor?.isActive('table') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'
                }`}
                title="Tabla"
              ><TableIcon size={13} /></button>
              {showTableMenu && (
                <div
                  className="absolute top-full right-0 mt-1 z-50 min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] py-1 shadow-lg"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">Insertar tabla (3×3)</button>
                  <div className="my-1 border-t border-[var(--border)]" />
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addColumnBefore().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">Añadir columna antes</button>
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addColumnAfter().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">Añadir columna después</button>
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteColumn().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">Eliminar columna</button>
                  <div className="my-1 border-t border-[var(--border)]" />
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addRowBefore().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">Añadir fila antes</button>
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addRowAfter().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">Añadir fila después</button>
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteRow().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">Eliminar fila</button>
                  <div className="my-1 border-t border-[var(--border)]" />
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleHeaderRow().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">Alternar fila de cabecera</button>
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteTable().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-red-400 hover:bg-[var(--bg-hover)] transition">Eliminar tabla</button>
                </div>
              )}
            </div>
          </>
        )}
        </div>

      {/* Content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Title */}
        <div className="px-8 pt-7 pb-2">
          <textarea
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            rows={1}
            className="w-full resize-none bg-transparent text-2xl font-bold text-[var(--text-primary)] outline-none placeholder-[var(--text-faint)] leading-tight"
            placeholder="Sin título"
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = el.scrollHeight + 'px';
            }}
          />
        </div>

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5 px-8 pb-3">
          {activeNote.tags.map((tag) => (
            <button
              key={tag}
              onClick={() => handleRemoveTag(tag)}
              className="flex items-center gap-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] text-indigo-400 transition hover:bg-red-500/10 hover:text-red-400 hover:border-red-400/20"
            >
              <Tag size={9} />
              {tag}
              <X size={9} />
            </button>
          ))}
          {showTagInput ? (
            <input
              autoFocus
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              onBlur={() => { setShowTagInput(false); setTagInput(''); }}
              placeholder="tag…"
              className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-300 outline-none w-20"
            />
          ) : (
            <button
              onClick={() => setShowTagInput(true)}
              className="rounded-full border border-[var(--border-card)] px-2 py-0.5 text-[10px] text-[var(--text-hint)] transition hover:text-[var(--text-tertiary)] hover:border-[var(--border-high)]"
            >
              <Plus size={10} className="inline" /> tag
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="mx-8 mb-4 h-px bg-[var(--border)]" />

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* WYSIWYG — TipTap (visualizar con estilos en tiempo real) */}
          {(viewMode === 'wysiwyg' || viewMode === 'split') && (
            <div className={`overflow-y-auto px-8 pb-8 ${
              viewMode === 'split' ? 'flex-1 border-r border-[var(--border)]' : 'flex-1'
            }`}>
              <EditorContent editor={editor} />
            </div>
          )}

          {/* Source — textarea con Markdown crudo */}
          {viewMode === 'source' && (
            <div className="flex-1 overflow-y-auto px-8 pb-8">
              <textarea
                value={mdContent}
                onChange={(e) => {
                  setMdContent(e.target.value);
                }}
                className="w-full h-full min-h-[400px] resize-none bg-transparent font-mono text-sm text-[var(--text-secondary)] outline-none leading-relaxed placeholder-[var(--text-faint)]"
                placeholder="# Tu nota en Markdown…"
                spellCheck={false}
              />
            </div>
          )}

          {/* Split — WYSIWYG izquierda, Markdown fuente derecha */}
          {viewMode === 'split' && (
            <div className="flex-1 overflow-y-auto px-8 pb-8">
              <div className="mb-2 text-[10px] text-[var(--text-faint)] uppercase tracking-wider">Markdown fuente</div>
              <pre className="whitespace-pre-wrap font-mono text-sm text-[var(--text-secondary)] leading-relaxed">{mdContent || <span className="italic text-[var(--text-faint)]">Sin contenido.</span>}</pre>
            </div>
          )}
        </div>
      </div>

      {showMoveMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowMoveMenu(false)} />
      )}

      {showExportModal && (
        <ExportModal note={{ ...activeNote, content: mdContent }} onClose={() => setShowExportModal(false)} />
      )}
    </div>
  );
}
