import { useState, useEffect } from 'react';
import {
  Eye,
  FileText,
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  CheckSquare,
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
  ChevronDown,
  X,
  Link,
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

// Párrafo compacto: serializa con \n simple en lugar de \n\n
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

interface Props {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export function RichTextEditor({ value, onChange, placeholder = 'Escribe aquí…', minHeight = '200px' }: Props) {
  const [viewMode, setViewMode] = useState<'wysiwyg' | 'source'>('wysiwyg');
  const [mdContent, setMdContent] = useState(value);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [showCaseMenu, setShowCaseMenu] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [urlInputMode, setUrlInputMode] = useState<'link' | 'image' | null>(null);
  const [urlInputValue, setUrlInputValue] = useState('');

  const applyCase = (mode: 'upper' | 'lower' | 'sentence' | 'title') => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const text = editor.state.doc.textBetween(from, to, ' ');
    let transformed: string;
    if (mode === 'upper') transformed = text.toUpperCase();
    else if (mode === 'lower') transformed = text.toLowerCase();
    else if (mode === 'sentence') transformed = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    else transformed = text.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
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
      Placeholder.configure({ placeholder }),
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
    content: value,
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
      onChange(md);
    },
  });

  // Sync content when value changes externally (e.g. task switch)
  useEffect(() => {
    if (!editor) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = (editor.storage as any).markdown.getMarkdown() as string;
    if (current !== value) {
      editor.commands.setContent(value || '');
      setMdContent(value || '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const switchToWysiwyg = () => {
    if (viewMode === 'source' && editor) {
      editor.commands.setContent(mdContent || '');
    }
    setViewMode('wysiwyg');
  };

  return (
    <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
      {/* Toolbar */}
      <div className={`relative flex flex-wrap items-center gap-0.5 border-b border-[var(--border)] bg-[var(--bg-panel)] px-2 py-1 ${viewMode === 'source' ? 'invisible pointer-events-none' : ''}`}>

        {urlInputMode ? (
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
                    if (urlInputMode === 'link') editor?.chain().focus().extendMarkRange('link').setLink({ href: urlInputValue.trim() }).run();
                    else editor?.chain().focus().setImage({ src: urlInputValue.trim() }).run();
                  }
                  setUrlInputMode(null); setUrlInputValue('');
                }
                if (e.key === 'Escape') { setUrlInputMode(null); setUrlInputValue(''); }
              }}
              placeholder="https://..."
              className="flex-1 bg-transparent text-[11px] text-[var(--text-primary)] outline-none placeholder-[var(--text-faint)] border-b border-[var(--border)] pb-0.5 min-w-0"
            />
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                if (urlInputValue.trim()) {
                  if (urlInputMode === 'link') editor?.chain().focus().extendMarkRange('link').setLink({ href: urlInputValue.trim() }).run();
                  else editor?.chain().focus().setImage({ src: urlInputValue.trim() }).run();
                }
                setUrlInputMode(null); setUrlInputValue('');
              }}
              className="ml-1 rounded p-1.5 text-indigo-300 hover:bg-indigo-500/20 transition"
            ><Check size={12} /></button>
            <button
              onMouseDown={(e) => { e.preventDefault(); setUrlInputMode(null); setUrlInputValue(''); }}
              className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] transition"
            ><X size={12} /></button>
          </>
        ) : (
          <>
            {/* Bloque / título */}
            {(() => {
              const bv = editor?.isActive('heading', { level: 1 }) ? '1'
                : editor?.isActive('heading', { level: 2 }) ? '2'
                : editor?.isActive('heading', { level: 3 }) ? '3'
                : editor?.isActive('heading', { level: 4 }) ? '4'
                : editor?.isActive('heading', { level: 5 }) ? '5' : '0';
              const labels: Record<string, string> = { '0': 'Párrafo', '1': 'T1', '2': 'T2', '3': 'T3', '4': 'T4', '5': 'T5' };
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
                    <div className="absolute top-full left-0 mt-1 z-50 min-w-[110px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] py-1 shadow-lg" onMouseDown={(e) => e.preventDefault()}>
                      {options.map(({ v, label }) => (
                        <button
                          key={v}
                          onMouseDown={(e) => {
                            e.preventDefault(); setShowBlockMenu(false);
                            if (v === '0') editor?.chain().focus().setParagraph().run();
                            else editor?.chain().focus().toggleHeading({ level: parseInt(v) as 1|2|3|4|5 }).run();
                          }}
                          className={`w-full px-3 py-1 text-left text-[11px] transition hover:bg-[var(--bg-hover)] ${bv === v ? 'text-indigo-300' : 'text-[var(--text-hint)]'}`}
                        >{label}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBlockquote().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('blockquote') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Cita"><Quote size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleCodeBlock().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('codeBlock') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Bloque código"><Braces size={13} /></button>

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBold().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('bold') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Negrita"><Bold size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleItalic().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('italic') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Cursiva"><Italic size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleUnderline().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('underline') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Subrayado"><Underline size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleStrike().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('strike') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Tachado"><Strikethrough size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleCode().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('code') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Código inline"><Code size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleHighlight().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('highlight') ? 'text-amber-400 bg-amber-400/10' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Resaltado"><Highlighter size={13} /></button>

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('bulletList') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Lista"><List size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleOrderedList().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('orderedList') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Lista numerada"><ListOrdered size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleTaskList().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('taskList') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Lista de tareas"><CheckSquare size={13} /></button>

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setTextAlign('left').run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive({ textAlign: 'left' }) ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Izquierda"><AlignLeft size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setTextAlign('center').run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive({ textAlign: 'center' }) ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Centro"><AlignCenter size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setTextAlign('right').run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive({ textAlign: 'right' }) ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Derecha"><AlignRight size={13} /></button>

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            {/* Capitalización */}
            <div className="relative">
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowCaseMenu(v => !v); }}
                className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
                title="Capitalización"
              ><CaseSensitive size={14} /></button>
              {showCaseMenu && (
                <div className="absolute top-full right-0 mt-1 z-50 min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] py-1 shadow-lg" onMouseDown={(e) => e.preventDefault()}>
                  {([
                    { mode: 'upper', label: 'TODO EN MAYÚSCULAS' },
                    { mode: 'lower', label: 'todo en minúsculas' },
                    { mode: 'sentence', label: 'Tipo oración' },
                    { mode: 'title', label: 'Cada Palabra En Mayúscula' },
                  ] as const).map(({ mode, label }) => (
                    <button key={mode} onMouseDown={(e) => { e.preventDefault(); applyCase(mode); setShowCaseMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">{label}</button>
                  ))}
                </div>
              )}
            </div>

            <button onMouseDown={(e) => { e.preventDefault(); setUrlInputMode('link'); setUrlInputValue(''); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('link') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title="Enlace"><Link size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); setUrlInputMode('image'); setUrlInputValue(''); }} className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition" title="Imagen"><ImageIcon size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setHorizontalRule().run(); }} className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition" title="Separador"><Minus size={13} /></button>

            {/* Tabla */}
            <div className="relative">
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowTableMenu(v => !v); }}
                className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('table') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`}
                title="Tabla"
              ><TableIcon size={13} /></button>
              {showTableMenu && (
                <div className="absolute top-full right-0 mt-1 z-50 min-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] py-1 shadow-lg" onMouseDown={(e) => e.preventDefault()}>
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
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleHeaderRow().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">Alternar cabecera</button>
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteTable().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-red-400 hover:bg-[var(--bg-hover)] transition">Eliminar tabla</button>
                </div>
              )}
            </div>
          </>
        )}

        {/* View mode switcher — siempre visible en la toolbar */}
        <div className="ml-auto flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-0.5 py-0.5" style={{ visibility: 'visible', pointerEvents: 'auto' }}>
          <button
            onMouseDown={(e) => { e.preventDefault(); switchToWysiwyg(); }}
            className={`rounded px-1.5 py-1 text-[11px] transition ${viewMode === 'wysiwyg' ? 'text-[var(--text-primary)] bg-[var(--bg-tertiary)] shadow-sm' : 'text-[var(--text-faint)] hover:text-[var(--text-secondary)]'}`}
            title="Visual"
          ><Eye size={12} /></button>
          <button
            onMouseDown={(e) => { e.preventDefault(); setViewMode('source'); }}
            className={`rounded px-1.5 py-1 text-[11px] transition ${viewMode === 'source' ? 'text-[var(--text-primary)] bg-[var(--bg-tertiary)] shadow-sm' : 'text-[var(--text-faint)] hover:text-[var(--text-secondary)]'}`}
            title="Markdown fuente"
          ><FileText size={12} /></button>
        </div>
      </div>

      {/* Editor area */}
      <div style={{ minHeight }}>
        {viewMode === 'wysiwyg' ? (
          <div className="px-4 py-3">
            <EditorContent editor={editor} />
          </div>
        ) : (
          <textarea
            value={mdContent}
            onChange={(e) => {
              setMdContent(e.target.value);
              onChange(e.target.value);
            }}
            placeholder={placeholder}
            style={{ minHeight }}
            className="w-full resize-none bg-transparent px-4 py-3 font-mono text-sm text-[var(--text-secondary)] outline-none leading-relaxed placeholder-[var(--text-faint)]"
            spellCheck={false}
          />
        )}
      </div>

      {/* Close dropdowns on outside click */}
      {(showBlockMenu || showCaseMenu || showTableMenu) && (
        <div className="fixed inset-0 z-40" onMouseDown={() => { setShowBlockMenu(false); setShowCaseMenu(false); setShowTableMenu(false); }} />
      )}
    </div>
  );
}
