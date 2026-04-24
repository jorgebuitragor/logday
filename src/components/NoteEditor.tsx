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
  Quote,
  Braces,
  CaseSensitive,
  Table as TableIcon,
  Columns3,
  Rows3,
  BetweenHorizontalStart,
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  PanelRightClose,
  PanelBottomClose,
  TableProperties,
  Share2,
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
import Dropcursor from '@tiptap/extension-dropcursor';
import { Markdown } from 'tiptap-markdown';
import Paragraph from '@tiptap/extension-paragraph';
import { useAppStore } from '../store/appStore';
import { Note } from '../types';
import { ExportModal } from './ExportModal';
import { MarkdownPreview } from './MarkdownPreview';
import { MermaidEditorModal } from './MermaidEditorModal';
import { MermaidBlock } from './MermaidBlock';
import { formatMermaidFence, parseMermaidBlocks } from '../lib/mermaid';
import { ImageLinkModal } from './ImageLinkModal';

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

    // tiptap-markdown serializa hard breaks como "\\\n".
    // Si hay un numero impar de barras al final de la linea, quitamos una.
    const trailing = match[1];
    if (trailing.length % 2 === 1) {
      lines[i] = line.slice(0, -1);
    }
  }

  return lines.join('\n');
}

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
  const [showDiagramMenu, setShowDiagramMenu] = useState(false);
  const [showDiagramEditor, setShowDiagramEditor] = useState(false);
  const [diagramEditorMode, setDiagramEditorMode] = useState<'create' | 'edit'>('create');
  const [diagramDraft, setDiagramDraft] = useState('');
  const [editingDiagramIndex, setEditingDiagramIndex] = useState<number | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [isDroppingFile, setIsDroppingFile] = useState(false);
  const [blockDropLineY, setBlockDropLineY] = useState<number | null>(null);
  const [blockDropFlashY, setBlockDropFlashY] = useState<number | null>(null);
  const [dragHandlePos, setDragHandlePos] = useState<{ top: number; left: number; visible: boolean }>({
    top: 0,
    left: 0,
    visible: false,
  });
  const savedRangeRef = useRef<{ from: number; to: number } | null>(null);
  const hoverBlockIndexRef = useRef<number | null>(null);
  const isBlockDraggingRef = useRef(false);
  const suppressNextEditorMarkdownSyncRef = useRef(false);
  const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const editorPaneRef = useRef<HTMLDivElement>(null);
  const blockMenuRef = useRef<HTMLDivElement>(null);
  const caseMenuRef = useRef<HTMLDivElement>(null);
  const tableMenuRef = useRef<HTMLDivElement>(null);
  const diagramMenuRef = useRef<HTMLDivElement>(null);
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  const mermaidBlocks = parseMermaidBlocks(mdContent);

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
      Dropcursor.configure({
        color: 'rgba(129, 140, 248, 0.55)',
        width: 2,
        class: 'tiptap-drag-drop-indicator',
      }),
      Markdown.configure({
        html: true,
        breaks: true,
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
      const md = normalizeEditorMarkdown((ed.storage as any).markdown.getMarkdown() as string);
      if (suppressNextEditorMarkdownSyncRef.current) {
        suppressNextEditorMarkdownSyncRef.current = false;
        return;
      }
      setMdContent(md);
      // Cierra menús desplegables al escribir
      setShowBlockMenu(false);
      setShowCaseMenu(false);
      setShowTableMenu(false);
      setShowDiagramMenu(false);
    },
  });

  const topLevelPosAtIndex = useCallback((doc: { child: (i: number) => { nodeSize: number } }, index: number) => {
    let pos = 0;
    for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize;
    return pos;
  }, []);

  const getBlockAtCoords = useCallback((clientX: number, clientY: number, probeOffsetX = 0) => {
    if (!editor) return null;
    const root = editor.view.dom as HTMLElement;
    let blockEl: HTMLElement | null = null;
    const els = document.elementsFromPoint(clientX + probeOffsetX, clientY);
    for (const el of els) {
      let node = el as HTMLElement | null;
      while (node) {
        if (node.parentElement === root) {
          blockEl = node;
          break;
        }
        node = node.parentElement;
      }
      if (blockEl) break;
    }
    if (!blockEl) return null;

    const rawPos = editor.view.posAtDOM(blockEl, 0);
    const resolved = editor.state.doc.resolve(Math.max(0, Math.min(rawPos, editor.state.doc.content.size)));
    const blockIndex = resolved.index(0);
    return { blockEl, blockIndex };
  }, [editor]);

  const startBlockPointerDrag = useCallback((event: React.PointerEvent) => {
    if (!editor) return;
    const sourceIndexValue = hoverBlockIndexRef.current;
    if (sourceIndexValue == null) return;
    const sourceIndex = sourceIndexValue;
    if (sourceIndex < 0 || sourceIndex >= editor.state.doc.childCount) return;

    event.preventDefault();
    event.stopPropagation();
    isBlockDraggingRef.current = true;
    setDragHandlePos((prev) => ({ ...prev, visible: false }));
    document.body.style.cursor = 'grabbing';

    const computeTarget = (clientX: number, clientY: number) => {
      const pane = editorPaneRef.current;
      if (!pane) return null;
      const target = getBlockAtCoords(clientX, clientY, 40);
      if (!target) return null;

      const { blockEl, blockIndex } = target;
      const rect = blockEl.getBoundingClientRect();
      const before = clientY < rect.top + rect.height / 2;
      const targetIndex = before ? blockIndex : blockIndex + 1;

      const paneRect = pane.getBoundingClientRect();
      const lineY = (before ? rect.top : rect.bottom) - paneRect.top + pane.scrollTop;

      return { targetIndex, lineY };
    };

    const onMove = (e: PointerEvent) => {
      const target = computeTarget(e.clientX, e.clientY);
      if (!target) {
        setBlockDropLineY(null);
        return;
      }
      setBlockDropLineY(target.lineY);
    };

    const onUp = (e: PointerEvent) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      isBlockDraggingRef.current = false;
      document.body.style.cursor = '';

      const target = computeTarget(e.clientX, e.clientY);
      if (!target) {
        setBlockDropLineY(null);
        return;
      }

      setBlockDropLineY(null);
      setBlockDropFlashY(target.lineY);
      window.setTimeout(() => setBlockDropFlashY(null), 220);

      let insertionIndex = target.targetIndex;
      if (insertionIndex > sourceIndex) insertionIndex -= 1;
      if (insertionIndex === sourceIndex) return;

      const doc = editor.state.doc;
      const sourceNode = doc.child(sourceIndex);
      const from = topLevelPosAtIndex(doc, sourceIndex);
      const to = from + sourceNode.nodeSize;

      let tr = editor.state.tr.delete(from, to);
      const clampedInsertionIndex = Math.max(0, Math.min(insertionIndex, tr.doc.childCount));
      const insertPos = topLevelPosAtIndex(tr.doc, clampedInsertionIndex);
      tr = tr.insert(insertPos, sourceNode);
      editor.view.dispatch(tr.scrollIntoView());

      requestAnimationFrame(() => {
        const pane = editorPaneRef.current;
        if (!pane) return;
        setDragHandlePos((prev) => ({ ...prev, visible: false }));
      });
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [editor, getBlockAtCoords, topLevelPosAtIndex]);

  const handleEditorPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!editor || isBlockDraggingRef.current) return;
    const pane = editorPaneRef.current;
    if (!pane) return;

    const target = getBlockAtCoords(event.clientX, event.clientY, 40);
    if (!target) {
      // Mantener el handle visible en el gutter para permitir click/drag sin parpadeo.
      return;
    }

    const { blockEl, blockIndex } = target;
    hoverBlockIndexRef.current = blockIndex;

    const rect = blockEl.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const top = rect.top - paneRect.top + pane.scrollTop + Math.max(0, (rect.height - 18) / 2);
    const left = 6;
    setDragHandlePos({ top, left, visible: true });
  }, [editor, getBlockAtCoords]);

  const handleEditorPointerLeave = useCallback(() => {
    if (isBlockDraggingRef.current) return;
    setDragHandlePos((prev) => ({ ...prev, visible: false }));
    hoverBlockIndexRef.current = null;
  }, []);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const normalizedContent = normalizeEditorMarkdown(activeNote.content || '');
    setTitle(activeNote.title);
    setViewMode('wysiwyg');
    suppressNextEditorMarkdownSyncRef.current = true;
    editor.commands.setContent(normalizedContent);
    setMdContent(normalizedContent);
    // Auto-focus el título cuando la nota está vacía (recién creada)
    if (!activeNote.title && !activeNote.content) {
      setTimeout(() => titleRef.current?.focus(), 50);
    }
    setShowDiagramEditor(false);
    setShowDiagramMenu(false);
    setEditingDiagramIndex(null);
  }, [activeNote?.id, editor]);

  useEffect(() => {
    schedulesSave({ content: mdContent });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mdContent]);

  // Suscripción directa al evento transaction del editor para refrescar el toolbar
  // de forma fiable (evita closures estales de useEditor config en TipTap 3)
  useEffect(() => {
    if (!editor) return;
    const handler = () => forceUpdate();
    editor.on('transaction', handler);
    return () => { editor.off('transaction', handler); };
  }, [editor]);

  // Cierra dropdowns al hacer click fuera de ellos
  useEffect(() => {
    if (!showBlockMenu && !showCaseMenu && !showTableMenu && !showDiagramMenu) return;
    const handler = (e: MouseEvent) => {
      if (showBlockMenu && !blockMenuRef.current?.contains(e.target as Node)) setShowBlockMenu(false);
      if (showCaseMenu && !caseMenuRef.current?.contains(e.target as Node)) setShowCaseMenu(false);
      if (showTableMenu && !tableMenuRef.current?.contains(e.target as Node)) setShowTableMenu(false);
      if (showDiagramMenu && !diagramMenuRef.current?.contains(e.target as Node)) setShowDiagramMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showBlockMenu, showCaseMenu, showTableMenu, showDiagramMenu]);

  const syncMarkdownToEditor = useCallback((nextMarkdown: string) => {
    setMdContent(nextMarkdown);
    if (viewMode !== 'source') {
      suppressNextEditorMarkdownSyncRef.current = true;
      editor?.commands.setContent(nextMarkdown || '');
    }
  }, [editor, viewMode]);

  const openDiagramEditor = useCallback((mode: 'create' | 'edit', code: string, index: number | null) => {
    setDiagramEditorMode(mode);
    setDiagramDraft(code);
    setEditingDiagramIndex(index);
    setShowDiagramMenu(false);
    setShowDiagramEditor(true);
  }, []);

  const insertBlockAtSelection = useCallback((markdown: string, block: string) => {
    const textarea = sourceTextareaRef.current;
    if (viewMode !== 'source' || !textarea) {
      const trimmed = markdown.trimEnd();
      return trimmed ? `${trimmed}\n\n${block}` : block;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = markdown.slice(0, start);
    const after = markdown.slice(end);
    const leading = before.length === 0 ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const trailing = after.length === 0 ? '' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    return `${before}${leading}${block}${trailing}${after}`;
  }, [viewMode]);

  const handleSaveDiagram = useCallback((code: string) => {
    const block = formatMermaidFence(code);
    let nextMarkdown = mdContent;

    if (editingDiagramIndex !== null) {
      const currentBlock = mermaidBlocks[editingDiagramIndex];
      if (currentBlock) {
        nextMarkdown = `${mdContent.slice(0, currentBlock.start)}${block}${mdContent.slice(currentBlock.end)}`;
      }
    } else {
      nextMarkdown = insertBlockAtSelection(mdContent, block);
    }

    syncMarkdownToEditor(nextMarkdown);
    setShowDiagramEditor(false);
    setEditingDiagramIndex(null);

    if (viewMode === 'source') {
      requestAnimationFrame(() => {
        sourceTextareaRef.current?.focus();
      });
    }
  }, [editingDiagramIndex, insertBlockAtSelection, mdContent, mermaidBlocks, syncMarkdownToEditor, viewMode]);

  const handleDeleteDiagram = useCallback((index: number) => {
    const currentBlock = mermaidBlocks[index];
    if (!currentBlock) return;

    const before = mdContent.slice(0, currentBlock.start).replace(/\s*$/, '');
    const after = mdContent.slice(currentBlock.end).replace(/^\s*/, '');
    const nextMarkdown = [before, after].filter(Boolean).join('\n\n');

    syncMarkdownToEditor(nextMarkdown);
    setShowDiagramEditor(false);
    setEditingDiagramIndex(null);
  }, [mdContent, mermaidBlocks, syncMarkdownToEditor]);

  const handleDuplicateDiagram = useCallback((index: number) => {
    const currentBlock = mermaidBlocks[index];
    if (!currentBlock) return;

    const block = formatMermaidFence(currentBlock.code);
    const nextMarkdown = `${mdContent.slice(0, currentBlock.end)}\n\n${block}${mdContent.slice(currentBlock.end)}`;

    syncMarkdownToEditor(nextMarkdown);
  }, [mdContent, mermaidBlocks, syncMarkdownToEditor]);

  const handleMoveDiagram = useCallback((index: number, direction: 'up' | 'down') => {
    const blocks = parseMermaidBlocks(mdContent);
    const current = blocks[index];
    if (!current) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const target = blocks[targetIndex];
    if (!target) return;

    let nextMarkdown = mdContent;
    if (direction === 'up') {
      const before = mdContent.slice(0, target.start);
      const targetText = mdContent.slice(target.start, target.end);
      const between = mdContent.slice(target.end, current.start);
      const currentText = mdContent.slice(current.start, current.end);
      const after = mdContent.slice(current.end);
      nextMarkdown = `${before}${currentText}${between}${targetText}${after}`;
    } else {
      const before = mdContent.slice(0, current.start);
      const currentText = mdContent.slice(current.start, current.end);
      const between = mdContent.slice(current.end, target.start);
      const targetText = mdContent.slice(target.start, target.end);
      const after = mdContent.slice(target.end);
      nextMarkdown = `${before}${targetText}${between}${currentText}${after}`;
    }

    syncMarkdownToEditor(nextMarkdown);
  }, [mdContent, syncMarkdownToEditor]);


  const getDiagramLabel = (code: string, index: number) => {
    const firstLine = code.split('\n').map((line) => line.trim()).find(Boolean);
    return firstLine ? `Diagrama ${index + 1}: ${firstLine}` : `Diagrama ${index + 1}`;
  };

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
      suppressNextEditorMarkdownSyncRef.current = true;
      editor.commands.setContent(mdContent || '');
    }
    setViewMode('wysiwyg');
  };

  const switchToSource = () => {
    if (editor) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = normalizeEditorMarkdown((editor.storage as any).markdown.getMarkdown() as string);
      setMdContent(md);
    }
    setViewMode('source');
  };

  const switchToSplit = () => {
    if (viewMode === 'source' && editor) {
      suppressNextEditorMarkdownSyncRef.current = true;
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
              onClick={switchToSource}
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
                <div className="relative mr-1" ref={blockMenuRef}>
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
            <div className="relative" ref={caseMenuRef}>
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
                setShowLinkModal(true);
              }}
              className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('link') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`}
              title="Enlace"
            ><Link size={13} /></button>
            <button
              onMouseDown={(e) => { e.preventDefault(); setShowImageModal(true); }}
              className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
              title="Imagen"
            ><ImageIcon size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setHorizontalRule().run(); }} className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition" title="Separador"><Minus size={13} /></button>

            {/* Tabla */}
            <div className="relative" ref={tableMenuRef}>
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

            <div className="relative" ref={diagramMenuRef}>
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowDiagramMenu(v => !v); }}
                className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${
                  mermaidBlocks.length > 0 ? 'text-indigo-300 bg-indigo-500/14' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'
                }`}
                title="Diagramas Mermaid"
              >
                <Share2 size={13} />
              </button>
              {showDiagramMenu && (
                <div
                  className="absolute top-full right-0 mt-1 z-50 min-w-[250px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] py-1 shadow-lg"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      openDiagramEditor('create', 'flowchart TD\n  A[Inicio] --> B[Fin]', null);
                    }}
                    className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    Nuevo diagrama Mermaid
                  </button>
                  {mermaidBlocks.length > 0 && <div className="my-1 border-t border-[var(--border)]" />}
                  {mermaidBlocks.map((block, index) => (
                    <button
                      key={`${block.start}-${index}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        openDiagramEditor('edit', block.code, index);
                      }}
                      className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                      title={block.code}
                    >
                      {getDiagramLabel(block.code, index)}
                    </button>
                  ))}
                </div>
              )}
            </div>
        </div>

      {/* Barra contextual de tabla — espacio siempre reservado, visible sólo con cursor en tabla */}
      <div className={`flex items-center gap-0.5 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1 ${
        editor?.isActive('table') && viewMode !== 'source' ? '' : 'invisible pointer-events-none'
      }`}>
        {/* Columnas */}
        <span className="text-[10px] text-[var(--text-faint)] mr-0.5 select-none"><Columns3 size={11} /></span>
        <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addColumnBefore().run(); }} className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition" title="Añadir columna a la izquierda"><BetweenHorizontalStart size={13} /></button>
        <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addColumnAfter().run(); }} className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition" title="Añadir columna a la derecha"><BetweenHorizontalEnd size={13} /></button>
        <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteColumn().run(); }} className="rounded p-1.5 text-red-400/60 hover:bg-red-500/10 hover:text-red-400 transition" title="Eliminar columna"><PanelRightClose size={13} /></button>
        <div className="mx-1.5 h-3.5 w-px bg-[var(--border)]" />
        {/* Filas */}
        <span className="text-[10px] text-[var(--text-faint)] mr-0.5 select-none"><Rows3 size={11} /></span>
        <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addRowAfter().run(); }} className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition" title="Añadir fila abajo"><BetweenVerticalEnd size={13} /></button>
        <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteRow().run(); }} className="rounded p-1.5 text-red-400/60 hover:bg-red-500/10 hover:text-red-400 transition" title="Eliminar fila"><PanelBottomClose size={13} /></button>
        <div className="mx-1.5 h-3.5 w-px bg-[var(--border)]" />
        {/* Cabecera */}
        <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleHeaderRow().run(); }} className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition" title="Alternar fila de cabecera"><TableProperties size={13} /></button>
        <div className="mx-1.5 h-3.5 w-px bg-[var(--border)]" />
        {/* Eliminar tabla */}
        <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteTable().run(); }} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition" title="Eliminar tabla"><Trash2 size={11} /> Tabla</button>
      </div>

      {/* Content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Title */}
        <div className="px-8 pt-7 pb-2">
          <textarea
            ref={titleRef}
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            rows={1}
            className="w-full resize-none bg-transparent text-2xl font-bold text-[var(--text-primary)] outline-none placeholder-[var(--text-faint)] leading-tight"
            placeholder="Sin título"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                // Enfocar editor (wysiwyg/split) o textarea source
                if (editor) {
                  editor.commands.focus('start');
                } else {
                  const ta = document.querySelector<HTMLTextAreaElement>('.note-source-textarea');
                  ta?.focus();
                }
              }
            }}
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
            <div
              ref={editorPaneRef}
              className={`relative overflow-y-auto px-8 pb-8 ${
                viewMode === 'split' ? 'flex-1 border-r border-[var(--border)]' : 'flex-1'
              }`}
              onPointerMove={handleEditorPointerMove}
              onPointerLeave={handleEditorPointerLeave}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('Files')) {
                  e.preventDefault();
                  setIsDroppingFile(true);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setIsDroppingFile(false);
                }
              }}
              onDrop={async (e) => {
                setIsDroppingFile(false);
                const file = e.dataTransfer.files[0];
                if (!file || !file.type.startsWith('image/')) return;
                e.preventDefault();
                e.stopPropagation();
                try {
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const src = ev.target?.result as string;
                    editor?.chain().focus().setImage({ src }).run();
                  };
                  reader.readAsDataURL(file);
                } catch (err) {
                  console.error('Error loading dropped image:', err);
                }
              }}
            >
              {/* Drag-and-drop overlay */}
              {isDroppingFile && (
                <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-indigo-400 bg-indigo-500/10 backdrop-blur-[2px]">
                  <ImageIcon size={36} className="text-indigo-400" />
                  <p className="text-sm font-semibold text-indigo-300">Suelta la imagen aquí</p>
                  <p className="text-xs text-indigo-400/70">Se insertará en la posición actual del cursor</p>
                </div>
              )}
              {blockDropLineY !== null && (
                <div
                  className="pointer-events-none absolute left-6 right-6 z-20 h-px bg-indigo-400/60"
                  style={{ top: blockDropLineY }}
                />
              )}
              {blockDropFlashY !== null && (
                <div
                  className="pointer-events-none absolute left-6 right-6 z-20 h-px block-drop-flash"
                  style={{ top: blockDropFlashY }}
                />
              )}
              <button
                type="button"
                aria-label="Mover bloque"
                onPointerDown={startBlockPointerDrag}
                className={`absolute z-30 rounded border border-transparent p-0 transition ${
                  dragHandlePos.visible ? 'opacity-100' : 'pointer-events-none opacity-0'
                } drag-handle`}
                style={{ top: dragHandlePos.top, left: dragHandlePos.left }}
              >
                <span className="drag-handle-grip" aria-hidden="true" />
              </button>
              {mermaidBlocks.map((block, index) => (
                <MermaidBlock
                  key={`${block.start}-${index}`}
                  diagramIndex={index}
                  code={block.code}
                  compact
                  onEdit={() => openDiagramEditor('edit', block.code, index)}
                  onMoveUp={index > 0 ? () => handleMoveDiagram(index, 'up') : undefined}
                  onMoveDown={index < mermaidBlocks.length - 1 ? () => handleMoveDiagram(index, 'down') : undefined}
                  onDuplicate={() => handleDuplicateDiagram(index)}
                  onDelete={() => handleDeleteDiagram(index)}
                />
              ))}
              <EditorContent editor={editor} />
            </div>
          )}
          {/* Source — textarea con Markdown crudo */}
          {viewMode === 'source' && (
            <div className="flex-1 overflow-y-auto px-8 pb-8">
              <textarea
                ref={sourceTextareaRef}
                value={mdContent}
                onChange={(e) => {
                  setMdContent(e.target.value);
                }}
                className="note-source-textarea w-full h-full min-h-[400px] resize-none bg-transparent font-mono text-sm text-[var(--text-secondary)] outline-none leading-relaxed placeholder-[var(--text-faint)]"
                placeholder="# Tu nota en Markdown…"
                spellCheck={false}
              />
            </div>
          )}

          {/* Split — WYSIWYG izquierda, Markdown fuente derecha */}
          {viewMode === 'split' && (
            <div className="flex-1 overflow-y-auto px-8 pb-8">
              <div className="mb-2 text-[10px] text-[var(--text-faint)] uppercase tracking-wider">Vista previa Markdown</div>
              {mdContent.trim() ? (
                <MarkdownPreview
                  markdown={mdContent}
                  onEditMermaid={(index, code) => openDiagramEditor('edit', code, index)}
                  onMoveMermaidUp={(index) => handleMoveDiagram(index, 'up')}
                  onMoveMermaidDown={(index) => handleMoveDiagram(index, 'down')}
                  onDuplicateMermaid={handleDuplicateDiagram}
                  onDeleteMermaid={handleDeleteDiagram}
                />
              ) : (
                <div className="italic text-sm text-[var(--text-faint)]">Sin contenido.</div>
              )}
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

      {showDiagramEditor && (
        <MermaidEditorModal
          initialCode={diagramDraft}
          mode={diagramEditorMode}
          onClose={() => {
            setShowDiagramEditor(false);
            setEditingDiagramIndex(null);
          }}
          onSave={handleSaveDiagram}
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
            const range = savedRangeRef.current;
            if (range && range.from !== range.to && editor) {
              return editor.state.doc.textBetween(range.from, range.to, ' ');
            }
            return undefined;
          })()}
          currentHref={editor?.isActive('link') ? (editor.getAttributes('link').href ?? undefined) : undefined}
          onInsert={(href, text) => {
            if (!href) {
              editor?.chain().focus().extendMarkRange('link').unsetLink().run();
            } else {
              const range = savedRangeRef.current;
              if (range && range.from !== range.to) {
                editor?.chain().focus().setTextSelection(range).setLink({ href }).run();
              } else if (editor?.isActive('link')) {
                editor?.chain().focus().extendMarkRange('link').setLink({ href }).run();
              } else {
                editor?.chain().focus().insertContent({
                  type: 'text',
                  text: text || href,
                  marks: [{ type: 'link', attrs: { href } }],
                }).run();
              }
            }
            savedRangeRef.current = null;
            setShowLinkModal(false);
          }}
          onClose={() => { savedRangeRef.current = null; setShowLinkModal(false); }}
        />
      )}
    </div>
  );
}
