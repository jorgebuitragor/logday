import { useState, useEffect, useReducer } from 'react';
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
import { ImageLinkModal } from './ImageLinkModal';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';

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

function normalizeEditorMarkdown(raw: string): string {
  if (!raw) return raw;

  const lines = raw.split('\n');
  let inFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }

    if (inFence || i === lines.length - 1) continue;

    const match = line.match(/(\\+)$/);
    if (!match) continue;
    const trailing = match[1];
    if (trailing.length % 2 === 1) {
      lines[i] = line.slice(0, -1);
    }
  }

  const normalized = lines.join('\n');
  return normalized.replace(/<((?:https?:\/\/)[^\s<>]+)>/g, '[$1]($1)');
}

export function RichTextEditor({ value, onChange, placeholder, minHeight = '200px' }: Props) {
  const language = useAppStore((s) => s.language);
  const resolvedPlaceholder = placeholder ?? t(language, 'notes', 'richTextPlaceholder');
  const [viewMode, setViewMode] = useState<'wysiwyg' | 'source'>('wysiwyg');
  const [mdContent, setMdContent] = useState(value);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [showCaseMenu, setShowCaseMenu] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [urlInputMode, setUrlInputMode] = useState<'link' | 'image' | null>(null);
  const [urlInputValue, setUrlInputValue] = useState('');
  const [showImageModal, setShowImageModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

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
      Placeholder.configure({ placeholder: resolvedPlaceholder }),
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
        breaks: true,
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
      if (ed.isDestroyed) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const markdownStorage = (ed.storage as any).markdown;
      if (!markdownStorage) return;
      const md = normalizeEditorMarkdown(markdownStorage.getMarkdown() as string);
      setMdContent(md);
      onChange(md);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      // Fuerza refresco del toolbar para que estados activos sigan la seleccion/cursor.
      forceUpdate();
    };
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor]);

  // Sync content when value changes externally (e.g. task switch)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const markdownStorage = (editor.storage as any).markdown;
    if (!markdownStorage) return;
    const current = markdownStorage.getMarkdown() as string;
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

  const switchToSource = () => {
    if (editor) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const md = normalizeEditorMarkdown((editor.storage as any).markdown.getMarkdown() as string);
        setMdContent(md);
      } catch {
        // Si el editor aun no esta listo, mantenemos el markdown actual.
      }
    }
    setViewMode('source');
  };

  return (
    <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
      {/* Toolbar */}
      <div className={`relative flex flex-wrap items-center gap-0.5 border-b border-[var(--border)] bg-[var(--bg-panel)] px-2 py-1 ${viewMode === 'source' ? 'invisible pointer-events-none' : ''}`}>

        {urlInputMode ? (
          <>
            <span className="text-[11px] text-[var(--text-hint)] mr-1">
              {urlInputMode === 'link' ? `${t(language, 'extras', 'linkUrlLabel')}:` : `${t(language, 'extras', 'imageUrlLabel')}:`}
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
              placeholder={t(language, 'extras', 'linkUrlPlaceholder')}
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
              const labels: Record<string, string> = { '0': t(language, 'notes', 'blockParagraph'), '1': 'T1', '2': 'T2', '3': 'T3', '4': 'T4', '5': 'T5' };
              const options = [
                { v: '0', label: t(language, 'notes', 'blockParagraph') }, { v: '1', label: t(language, 'notes', 'blockH1') }, { v: '2', label: t(language, 'notes', 'blockH2') },
                { v: '3', label: t(language, 'notes', 'blockH3') }, { v: '4', label: t(language, 'notes', 'blockH4') }, { v: '5', label: t(language, 'notes', 'blockH5') },
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

            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBlockquote().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('blockquote') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={t(language, 'notes', 'tipQuote')}><Quote size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleCodeBlock().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('codeBlock') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={t(language, 'notes', 'tipCodeBlock')}><Braces size={13} /></button>

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBold().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('bold') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={t(language, 'notes', 'tipBold')}><Bold size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleItalic().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('italic') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={t(language, 'notes', 'tipItalic')}><Italic size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleUnderline().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('underline') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={t(language, 'notes', 'tipUnderline')}><Underline size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleStrike().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('strike') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={t(language, 'notes', 'tipStrike')}><Strikethrough size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleCode().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('code') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={t(language, 'notes', 'tipCode')}><Code size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleHighlight().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('highlight') ? 'text-amber-400 bg-amber-400/10' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={t(language, 'notes', 'tipHighlight')}><Highlighter size={13} /></button>

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('bulletList') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={t(language, 'notes', 'tipBulletList')}><List size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleOrderedList().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('orderedList') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={t(language, 'notes', 'tipOrderedList')}><ListOrdered size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleTaskList().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('taskList') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={t(language, 'notes', 'tipTaskList')}><CheckSquare size={13} /></button>

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setTextAlign('left').run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive({ textAlign: 'left' }) ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={t(language, 'notes', 'tipAlignLeft')}><AlignLeft size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setTextAlign('center').run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive({ textAlign: 'center' }) ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={t(language, 'notes', 'tipAlignCenter')}><AlignCenter size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setTextAlign('right').run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive({ textAlign: 'right' }) ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={t(language, 'notes', 'tipAlignRight')}><AlignRight size={13} /></button>

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            {/* Capitalización */}
            <div className="relative">
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowCaseMenu(v => !v); }}
                className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
                title={t(language, 'notes', 'tipCase')}
              ><CaseSensitive size={14} /></button>
              {showCaseMenu && (
                <div className="absolute top-full right-0 mt-1 z-50 min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] py-1 shadow-lg" onMouseDown={(e) => e.preventDefault()}>
                  {([
                    { mode: 'upper', label: t(language, 'notes', 'caseUpper') },
                    { mode: 'lower', label: t(language, 'notes', 'caseLower') },
                    { mode: 'sentence', label: t(language, 'notes', 'caseSentence') },
                    { mode: 'title', label: t(language, 'notes', 'caseTitle') },
                  ] as const).map(({ mode, label }) => (
                    <button key={mode} onMouseDown={(e) => { e.preventDefault(); applyCase(mode); setShowCaseMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">{label}</button>
                  ))}
                </div>
              )}
            </div>

            <button
              onMouseDown={(e) => {
                e.preventDefault();
                setUrlInputMode(null);
                setUrlInputValue('');
                setShowLinkModal(true);
              }}
              className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('link') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`}
              title={t(language, 'notes', 'tipLink')}
            ><Link size={13} /></button>
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                setUrlInputMode(null);
                setUrlInputValue('');
                setShowImageModal(true);
              }}
              className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
              title={t(language, 'notes', 'tipImage')}
            ><ImageIcon size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setHorizontalRule().run(); }} className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition" title={t(language, 'notes', 'tipSeparator')}><Minus size={13} /></button>

            {/* Tabla */}
            <div className="relative">
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowTableMenu(v => !v); }}
                className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('table') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`}
                title={t(language, 'notes', 'tipTable')}
              ><TableIcon size={13} /></button>
              {showTableMenu && (
                <div className="absolute top-full right-0 mt-1 z-50 min-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] py-1 shadow-lg" onMouseDown={(e) => e.preventDefault()}>
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">{t(language, 'notes', 'tableInsert')}</button>
                  <div className="my-1 border-t border-[var(--border)]" />
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addColumnBefore().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">{t(language, 'notes', 'tableAddColBefore')}</button>
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addColumnAfter().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">{t(language, 'notes', 'tableAddColAfter')}</button>
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteColumn().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">{t(language, 'notes', 'tableDeleteCol')}</button>
                  <div className="my-1 border-t border-[var(--border)]" />
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addRowBefore().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">{t(language, 'notes', 'tableAddRowBefore')}</button>
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addRowAfter().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">{t(language, 'notes', 'tableAddRowAfter')}</button>
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteRow().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">{t(language, 'notes', 'tableDeleteRow')}</button>
                  <div className="my-1 border-t border-[var(--border)]" />
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleHeaderRow().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">{t(language, 'notes', 'tableToggleHeader')}</button>
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteTable().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-red-400 hover:bg-[var(--bg-hover)] transition">{t(language, 'notes', 'tableDelete')}</button>
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
            title={t(language, 'notes', 'viewWysiwyg')}
          ><Eye size={12} /></button>
          <button
            onMouseDown={(e) => { e.preventDefault(); switchToSource(); }}
            className={`rounded px-1.5 py-1 text-[11px] transition ${viewMode === 'source' ? 'text-[var(--text-primary)] bg-[var(--bg-tertiary)] shadow-sm' : 'text-[var(--text-faint)] hover:text-[var(--text-secondary)]'}`}
            title={t(language, 'notes', 'viewSource')}
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
            placeholder={resolvedPlaceholder}
            style={{ minHeight }}
            className="w-full resize-none bg-transparent px-4 py-3 font-mono text-sm text-[var(--text-secondary)] outline-none leading-relaxed placeholder-[var(--text-faint)]"
            spellCheck={false}
          />
        )}
      </div>

      {/* Close dropdowns on outside click */}
      {(showBlockMenu || showCaseMenu || showTableMenu || urlInputMode) && (
        <div
          className="fixed inset-0 z-40"
          onMouseDown={() => {
            setShowBlockMenu(false);
            setShowCaseMenu(false);
            setShowTableMenu(false);
            setUrlInputMode(null);
            setUrlInputValue('');
          }}
        />
      )}

      {showImageModal && (
        <ImageLinkModal
          mode="image"
          onInsert={(src, alt) => {
            editor?.chain().focus().setImage({ src, alt: alt ?? '' }).run();
            setShowImageModal(false);
          }}
          onClose={() => setShowImageModal(false)}
        />
      )}

      {showLinkModal && (
        <ImageLinkModal
          mode="link"
          selectedText={(() => {
            if (!editor) return '';
            const { from, to } = editor.state.selection;
            if (from === to) return '';
            return editor.state.doc.textBetween(from, to, ' ');
          })()}
          currentHref={String(editor?.getAttributes('link').href || '') || undefined}
          onInsert={(href, text) => {
            if (!editor) return;
            const { from, to } = editor.state.selection;
            if (from === to) {
              const visibleText = (text || href).trim();
              editor.chain().focus().setLink({ href }).insertContent(visibleText).unsetLink().run();
            } else {
              editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
            }
            setShowLinkModal(false);
          }}
          onClose={() => setShowLinkModal(false)}
        />
      )}
    </div>
  );
}
