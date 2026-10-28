import { useState, useEffect, useCallback, useReducer, useRef, useMemo } from 'react';
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
  Smile,
} from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import type { Mark } from '@tiptap/pm/model';
import { Extension, createDocument } from '@tiptap/core';
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
import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import plaintext from 'highlight.js/lib/languages/plaintext';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import yaml from 'highlight.js/lib/languages/yaml';
import * as Y from 'yjs';
import {
  readPersistedUpdate, getContentText, applyTextEdit, applyEditorEdit, rebaseText, mapTextIndex,
  registerOpenNoteDoc, persistYDoc, base64ToBytes,
} from '../../lib/noteContentSync';
import { useAppStore, syncNoteContent } from '../../store/appStore';
import { Note } from '../../types/note';
import { ExportModal } from './ExportModal';
import { MarkdownPreview } from './MarkdownPreview';
import { MermaidEditorModal } from './MermaidEditorModal';
import { ConfirmDeleteModal } from '../shared/ConfirmDeleteModal';
import { useConfirmDelete } from '../../hooks/useConfirmDelete';
import { MermaidAwareCodeBlock, type MermaidActions } from './mermaidCodeBlock';
import { dragUnitAtCoords, dropTargetAtCoords, moveListItem, moveTopLevelBlock, type DragUnit, type DropLine } from './noteBlockDrag';
import { formatMermaidFence, parseMermaidBlocks } from '../../lib/mermaid';
import { ImageLinkModal } from '../shared/ImageLinkModal';
import { CODE_LANGUAGE_OPTIONS, normalizeCodeLanguage } from '../../lib/codeHighlight';
import { placeMenuNearAnchor } from '../../lib/menuPosition';
import { t as tFn } from '../../lib/i18n';
import { LinkPreviewCard } from './LinkPreviewCard';
import { fs } from '../../lib/invoke';
import { EMOJI_CATALOG, normalizeEmojiSearchTerm } from '../../lib/emojiCatalog';
import { createTaskCodePlugin, normalizeEditorMarkdown } from '../../lib/noteEditorMarkdown';
import { useLinkPreview } from '../../hooks/useLinkPreview';

// Solo los lenguajes que ofrece CODE_LANGUAGE_OPTIONS (lib/codeHighlight.ts) —
// `common` de lowlight trae 37 lenguajes, la mayoría no seleccionables desde
// la UI. Si un bloque trae un lenguaje no registrado (nota importada, etc.),
// @tiptap/extension-code-block-lowlight cae a highlightAuto() sin romper.
const lowlight = createLowlight({ bash, go, java, javascript, json, plaintext, python, sql, typescript, yaml });
const BLOCK_MENU_ESTIMATED_SIZE = { width: 220, height: 260 };

type BlockMenuType =
  | 'paragraph'
  | 'heading'
  | 'mermaid'
  | 'code'
  | 'blockquote'
  | 'list'
  | 'taskList'
  | 'table'
  | 'horizontalRule'
  | 'other';

interface BlockContextMenuState {
  x: number;
  y: number;
  anchorRect: { left: number; top: number; right: number; bottom: number };
  ready: boolean;
  blockIndex: number;
  type: BlockMenuType;
  headingLevel?: number;
  mermaidIndex?: number;
}

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
    language,
    confirmDestructiveActions,
    updateNote,
    deleteNote,
    setActiveNote,
    toggleNotePin,
    moveNote,
    tasks,
    setSection,
    setActiveTask,
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
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState('');
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [showDiagramMenu, setShowDiagramMenu] = useState(false);
  const [showDiagramEditor, setShowDiagramEditor] = useState(false);
  const [diagramEditorMode, setDiagramEditorMode] = useState<'create' | 'edit'>('create');
  const [diagramDraft, setDiagramDraft] = useState('');
  const [editingDiagramIndex, setEditingDiagramIndex] = useState<number | null>(null);
  const [openCodeLangMenuIndex, setOpenCodeLangMenuIndex] = useState<number | null>(null);
  const [codeLangSearch, setCodeLangSearch] = useState('');
  const [showImageModal, setShowImageModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [isDroppingFile, setIsDroppingFile] = useState(false);

  // ── Task-code reference popup (#code autocomplete) ──────────────────────────
  const [taskRefQuery, setTaskRefQuery] = useState<string | null>(null);
  const [taskRefAnchor, setTaskRefAnchor] = useState<{ top: number; left: number } | null>(null);
  const [taskRefSuggestIdx, setTaskRefSuggestIdx] = useState(0);
  const taskRefPopupRef = useRef<HTMLDivElement>(null);

  const tasksWithCode = useMemo(
    () => tasks.filter((t) => t.taskCode),
    [tasks]
  );
  const taskRefSuggestions = useMemo(() => {
    if (taskRefQuery === null) return [];
    const q = taskRefQuery.toLowerCase();
    return tasksWithCode
      .filter((t) => t.taskCode!.toLowerCase().includes(q))
      .slice(0, 6);
  }, [taskRefQuery, tasksWithCode]);
  const [codeBlockAnchors, setCodeBlockAnchors] = useState<Array<{ top: number; left: number; height: number }>>([]);
  const [blockDropLine, setBlockDropLine] = useState<{ top: number; left: number; width: number } | null>(null);
  const [blockDropFlash, setBlockDropFlash] = useState<{ top: number; left: number; width: number } | null>(null);
  // Capa que atenúa lo que se está arrastrando. No es una clase en el
  // propio elemento porque ProseMirror vigila el DOM y la quita.
  const [dragSourceBox, setDragSourceBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [dragHandlePos, setDragHandlePos] = useState<{ top: number; left: number; visible: boolean }>({
    top: 0,
    left: 0,
    visible: false,
  });
  const [dragHandleBlockIndex, setDragHandleBlockIndex] = useState<number | null>(null);
  const [blockContextMenu, setBlockContextMenu] = useState<BlockContextMenuState | null>(null);
  const [isPointerInsideBlockContextMenu, setIsPointerInsideBlockContextMenu] = useState(false);
  const savedRangeRef = useRef<{ from: number; to: number } | null>(null);
  const hoverBlockIndexRef = useRef<number | null>(null);
  const isBlockDraggingRef = useRef(false);
  const suppressNextEditorMarkdownSyncRef = useRef(false);
  const skipNextContentSaveRef = useRef(false);
  const titleIsPresentRef = useRef(false);
  const promoteTitleHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const editorPaneRef = useRef<HTMLDivElement>(null);
  const { linkPreview, setLinkPreview } = useLinkPreview(editorPaneRef, activeNote?.id);
  const codeLangSelectionRef = useRef<{ from: number; to: number; scrollTop: number } | null>(null);
  const blockMenuRef = useRef<HTMLDivElement>(null);
  const caseMenuRef = useRef<HTMLDivElement>(null);
  const emojiMenuRef = useRef<HTMLDivElement>(null);
  const tableMenuRef = useRef<HTMLDivElement>(null);
  const diagramMenuRef = useRef<HTMLDivElement>(null);
  const blockContextMenuRef = useRef<HTMLDivElement>(null);
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  const filteredEmojis = useMemo(() => {
    const q = normalizeEmojiSearchTerm(emojiQuery);
    if (!q) return EMOJI_CATALOG;
    return EMOJI_CATALOG.filter((item) => {
      const haystack = normalizeEmojiSearchTerm(`${item.nameEs} ${item.nameEn} ${item.keywords.join(' ')}`);
      return haystack.includes(q);
    });
  }, [emojiQuery]);

  const visibleEmojis = useMemo(() => {
    const q = normalizeEmojiSearchTerm(emojiQuery);
    const maxWithoutQuery = 240;
    const maxWithQuery = 400;
    return (q ? filteredEmojis.slice(0, maxWithQuery) : filteredEmojis.slice(0, maxWithoutQuery));
  }, [emojiQuery, filteredEmojis]);

  const mermaidBlocks = parseMermaidBlocks(mdContent);
  const codeBlockLanguages = useMemo(() => {
    const lines = mdContent.split('\n');
    const languages: string[] = [];
    let inFence = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const fenceMatch = line.match(/^```([a-zA-Z0-9_-]+)?(?:\s+.*)?$/);
      if (!fenceMatch) continue;

      if (!inFence) {
        inFence = true;
        const language = normalizeCodeLanguage((fenceMatch[1] || '').toLowerCase() || 'plaintext');
        if (language !== 'mermaid') {
          languages.push(language);
        }
      } else {
        inFence = false;
      }
    }

    return languages;
  }, [mdContent]);

  // ── Task-code decorations ────────────────────────────────────────────────
  const tasksRef = useRef<import('../../types/task').Task[]>(tasks);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  const taskCodeExtension = useMemo(
    () => Extension.create({
      name: 'taskCodeDecorations',
      addProseMirrorPlugins() { return [createTaskCodePlugin(tasksRef)]; },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

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

  // Y.Doc propio de esta nota (canal CRDT de contenido, ver
  // noteContentSync.ts) — vive mientras este componente esté montado.
  // Gracias a `key={activeNote.id}` en App.tsx, este componente se
  // desmonta/remonta completo por nota (mismo patrón que
  // `<OvertimeEditor key={editingEntry?.id}>`), así que no hay que
  // destruir/rebindear un Y.Doc vivo bajo un editor persistente — cada
  // instancia de NoteEditor tiene exactamente un Y.Doc, creado una vez acá.
  // NO está atado al editor Tiptap (no hay `@tiptap/extension-collaboration`
  // acá) — el protocolo real de logday-server/logday-web para
  // `Note.content` es un `Y.Text` plano (ver noteContentSync.ts), no un
  // documento estructurado; el editor sigue siendo el Tiptap normal de
  // siempre, y el contenido se refleja hacia el `Y.Doc` como un diff de
  // texto en cada guardado (`applyEditorEdit`), igual que hace logday-web.
  const ydocRef = useRef<Y.Doc | null>(null);
  if (!ydocRef.current) ydocRef.current = new Y.Doc();
  // Markdown del editor (tal como lo serializa Tiptap) que ya está reflejado
  // en el Y.Doc: el de la carga y luego el de cada guardado. El guardado
  // aplica al Y.Text solo el delta entre esto y el Markdown nuevo, no la
  // diferencia completa contra el Y.Text — ver applyEditorEdit. `null`
  // mientras el editor no cargó la nota.
  const editorBaseMarkdownRef = useRef<string | null>(null);
  // Cuántos updates remotos cambiaron el texto de esta nota (ver
  // applyRemoteContent): pushContentUpdate lo compara para saber si su
  // contenido quedó viejo mientras esperaba.
  const remoteGenerationRef = useRef(0);
  // Llegó contenido remoto desde el último guardado: el guardado pendiente
  // toma el Markdown vivo en vez del acumulado (ver takePendingNote).
  const remoteSinceLastTakeRef = useRef(false);
  // El último cambio de `mdContent` es una edición del usuario (Tiptap, el
  // textarea del modo fuente o un cambio de bloque vía
  // syncMarkdownToEditor). El efecto de `mdContent` solo programa un
  // guardado si es así. Los demás cambios no son ediciones: el estado
  // inicial al montar, la carga de la nota, un update remoto y el cambio a
  // modo fuente. Guardar al abrir cambiaba `updated` y metía en el Y.Text la
  // diferencia de representación entre el contenido cargado y
  // `getMarkdown()` (un `\n` final). Se marca lo que sí es edición, y no lo
  // que no lo es, porque la corrida del efecto al montar (con `''`) no pasa
  // por ninguna llamada a `setMdContent`. Marcarla como "no edición" dejaba
  // pendiente un guardado de `''`, que borraba el Y.Text y lo reinsertaba
  // entero. Si una edición no cambia el valor, la marca queda puesta y, como
  // mucho, el siguiente cambio guarda de más: nunca se pierde un guardado.
  const userEditedMarkdownRef = useRef(false);
  // La nota se desmontó: un update remoto que llegue tarde lo aplica el
  // store en el `.ydoc` en disco, no este editor en el Y.Doc que se libera.
  const disposedRef = useRef(false);
  // Promesa de hidratación del Y.Doc (sidecar local o bootstrap desde el
  // contenido actual) — el guardado espera esto antes de diffear, para no
  // correr contra un Y.Text todavía vacío por una hidratación en curso.
  const ydocReadyRef = useRef<Promise<void> | null>(null);
  // Última nota conocida para esta instancia (misma id durante toda su
  // vida) — el efecto de flush al desmontar la lee de acá en vez de
  // cerrar sobre `activeNote` directamente, para no perder ediciones de
  // metadata (título, tags, etc.) hechas después de que ese efecto se
  // registró la primera vez. Se reasigna en cada render, sin useEffect,
  // mismo patrón que `titleIsPresentRef` más abajo.
  const activeNoteRef = useRef<Note | null>(null);
  activeNoteRef.current = activeNote;
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const mdContentRef = useRef(mdContent);
  mdContentRef.current = mdContent;

  // Acciones de los diagramas Mermaid para su NodeView (mermaidCodeBlock.tsx).
  // Se asigna en cada render, más abajo, para que use los handlers actuales.
  const mermaidActionsRef = useRef<MermaidActions | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: false,
        codeBlock: false,
        heading: { levels: [1, 2, 3, 4, 5] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      MermaidAwareCodeBlock.configure({
        lowlight,
        mermaidActions: mermaidActionsRef,
      }),
      CompactParagraph,
      UnderlineExt,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Escribe tu nota…' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: false }),
      ImageExt.configure({ inline: false, allowBase64: true }),
      LinkExt.configure({ openOnClick: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      // Destino al arrastrar texto seleccionado: más grueso y opaco que
      // antes (2 px al 55 %), que casi no se veía.
      Dropcursor.configure({
        color: 'var(--accent)',
        width: 3,
        class: 'tiptap-drag-drop-indicator',
      }),
      Markdown.configure({
        html: true,
        breaks: true,
        transformPastedText: true,
        transformCopiedText: false,
      }),
      taskCodeExtension,
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose-editor focus:outline-none',
        spellcheck: 'false',
      },
      handleKeyDown(_view, event) {
        // Close task-ref popup on Escape; handle Enter/ArrowDown/ArrowUp via React state
        if (event.key === 'Escape') {
          setTaskRefQuery(null);
          setTaskRefAnchor(null);
        }
      },
      handleClick(_view, _pos, event) {
        const target = (event.target as HTMLElement).closest('[data-task-code]') as HTMLElement | null;
        if (!target) return false;
        const code = target.getAttribute('data-task-code');
        if (!code) return false;
        const task = useAppStore.getState().tasks.find(
          (t) => t.taskCode?.toUpperCase() === code
        );
        if (!task) return false;
        event.preventDefault();
        setSection('tasks');
        setActiveTask(task);
        return true;
      },
    },
    onUpdate({ editor: ed }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = normalizeEditorMarkdown((ed.storage as any).markdown.getMarkdown() as string);
      if (suppressNextEditorMarkdownSyncRef.current) {
        suppressNextEditorMarkdownSyncRef.current = false;
        return;
      }
      userEditedMarkdownRef.current = true;
      setMdContent(md);
      // Cierra menús desplegables al escribir
      setShowBlockMenu(false);
      setShowCaseMenu(false);
      setShowEmojiMenu(false);
      setShowTableMenu(false);
      setShowDiagramMenu(false);

      // ── Detectar patrón #code al escribir ─────────────────────────────
      const { $anchor } = ed.state.selection;
      const blockStart = $anchor.start();
      const cursorPos = $anchor.pos;
      const textBeforeCursor = ed.state.doc.textBetween(blockStart, cursorPos, '\n', '\n');
      const codeMatch = textBeforeCursor.match(/#([a-zA-Z0-9\-_]*)$/);
      if (codeMatch) {
        const query = codeMatch[1];
        setTaskRefQuery(query);
        setTaskRefSuggestIdx(0);
        // Posicionar popup relativo al contenedor del editor
        try {
          const coords = ed.view.coordsAtPos(cursorPos);
          const editorEl = ed.view.dom.closest('.prose-editor-wrapper') as HTMLElement | null;
          if (editorEl) {
            const rect = editorEl.getBoundingClientRect();
            setTaskRefAnchor({
              top: coords.bottom - rect.top + 4,
              left: Math.max(0, coords.left - rect.left - 8),
            });
          } else {
            setTaskRefAnchor({ top: coords.bottom + 4, left: coords.left });
          }
        } catch { /* view not ready */ }
      } else {
        setTaskRefQuery(null);
        setTaskRefAnchor(null);
      }
    },
  });

  const recalcCodeBlockAnchors = useCallback(() => {
    if (viewMode === 'source') {
      setCodeBlockAnchors([]);
      return;
    }

    const pane = editorPaneRef.current;
    let root: HTMLElement | null;
    try {
      root = editor ? (editor.view.dom as HTMLElement) : null;
    } catch {
      root = null;
    }

    if (!pane || !root) {
      setCodeBlockAnchors([]);
      return;
    }

    const paneRect = pane.getBoundingClientRect();
    const anchors = Array.from(root.querySelectorAll('pre'))
      .filter((pre) => !pre.querySelector('code.language-mermaid'))
      .map((pre) => {
        const rect = pre.getBoundingClientRect();
        return {
          top: rect.top - paneRect.top + pane.scrollTop,
          left: rect.left - paneRect.left,
          height: rect.height,
        };
      });

    setCodeBlockAnchors((prev) => {
      if (
        prev.length === anchors.length &&
        prev.every((a, i) =>
          Math.abs(a.top - anchors[i].top) < 0.5 &&
          Math.abs(a.left - anchors[i].left) < 0.5 &&
          Math.abs(a.height - anchors[i].height) < 0.5
        )
      ) {
        return prev;
      }
      return anchors;
    });
  }, [editor, viewMode]);

  useEffect(() => {
    if (viewMode === 'source') return;
    const raf = requestAnimationFrame(() => recalcCodeBlockAnchors());
    return () => cancelAnimationFrame(raf);
  }, [mermaidBlocks.length, recalcCodeBlockAnchors, viewMode]);

  const topLevelPosAtIndex = useCallback((doc: { child: (i: number) => { nodeSize: number } }, index: number) => {
    let pos = 0;
    for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize;
    return pos;
  }, []);

  const getBlockContextMeta = useCallback((blockIndex: number): Omit<BlockContextMenuState, 'x' | 'y' | 'anchorRect' | 'ready'> | null => {
    if (!editor) return null;
    if (blockIndex < 0 || blockIndex >= editor.state.doc.childCount) return null;

    const node = editor.state.doc.child(blockIndex);
    const typeName = node.type.name;

    if (typeName === 'heading') {
      const level = Number((node.attrs as { level?: number })?.level || 1);
      return { blockIndex, type: 'heading', headingLevel: level };
    }

    if (typeName === 'paragraph') {
      return { blockIndex, type: 'paragraph' };
    }

    if (typeName === 'codeBlock') {
      const lang = String((node.attrs as { language?: string })?.language || '').toLowerCase();
      if (lang === 'mermaid') {
        let mermaidIndex = -1;
        for (let i = 0; i <= blockIndex; i += 1) {
          const current = editor.state.doc.child(i);
          if (current.type.name !== 'codeBlock') continue;
          const currentLang = String((current.attrs as { language?: string })?.language || '').toLowerCase();
          if (currentLang === 'mermaid') mermaidIndex += 1;
        }
        return { blockIndex, type: 'mermaid', mermaidIndex: mermaidIndex >= 0 ? mermaidIndex : undefined };
      }
      return { blockIndex, type: 'code' };
    }

    if (typeName === 'blockquote') return { blockIndex, type: 'blockquote' };
    if (typeName === 'taskList') return { blockIndex, type: 'taskList' };
    if (typeName === 'bulletList' || typeName === 'orderedList') return { blockIndex, type: 'list' };
    if (typeName === 'table') return { blockIndex, type: 'table' };
    if (typeName === 'horizontalRule') return { blockIndex, type: 'horizontalRule' };

    return { blockIndex, type: 'other' };
  }, [editor]);

  const closeBlockContextMenu = useCallback(() => {
    setBlockContextMenu(null);
    setIsPointerInsideBlockContextMenu(false);
  }, []);

  const insertEmptyParagraphAroundBlock = useCallback((target: 'above' | 'below') => {
    if (!editor || !blockContextMenu) return;
    const { blockIndex } = blockContextMenu;
    if (blockIndex < 0 || blockIndex >= editor.state.doc.childCount) return;

    const schema = editor.state.doc.type.schema;
    const paragraph = schema.nodes.paragraph?.create();
    if (!paragraph) return;

    const insertIndex = target === 'above' ? blockIndex : blockIndex + 1;
    const tr = editor.state.tr;
    const insertPos = topLevelPosAtIndex(editor.state.doc, insertIndex);
    tr.insert(insertPos, paragraph);
    tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
    closeBlockContextMenu();
  }, [blockContextMenu, closeBlockContextMenu, editor, topLevelPosAtIndex]);

  const deleteBlockFromContextMenu = useCallback(() => {
    if (!editor || !blockContextMenu) return;
    const { blockIndex } = blockContextMenu;
    if (blockIndex < 0 || blockIndex >= editor.state.doc.childCount) return;

    if (editor.state.doc.childCount <= 1) {
      editor.commands.setContent('');
      editor.commands.focus('start');
      closeBlockContextMenu();
      return;
    }

    const doc = editor.state.doc;
    const node = doc.child(blockIndex);
    const from = topLevelPosAtIndex(doc, blockIndex);
    const to = from + node.nodeSize;
    const tr = editor.state.tr.delete(from, to);
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
    closeBlockContextMenu();
  }, [blockContextMenu, closeBlockContextMenu, editor, topLevelPosAtIndex]);

  const copyBlockFromContextMenu = useCallback(() => {
    if (!editor || !blockContextMenu) return;
    const { blockIndex } = blockContextMenu;
    if (blockIndex < 0 || blockIndex >= editor.state.doc.childCount) return;

    const doc = editor.state.doc;
    const node = doc.child(blockIndex);
    const from = topLevelPosAtIndex(doc, blockIndex);
    const to = from + node.nodeSize;
    const typeName = node.type.name;
    let textToCopy = doc.textBetween(from, to, '\n\n').trim();

    if (typeName === 'heading') {
      const level = Number((node.attrs as { level?: number })?.level || 1);
      textToCopy = `${'#'.repeat(Math.min(6, Math.max(1, level)))} ${node.textContent}`.trim();
    } else if (typeName === 'codeBlock') {
      const lang = String((node.attrs as { language?: string })?.language || '').trim();
      const body = node.textContent || '';
      textToCopy = `\`\`\`${lang}\n${body}\n\`\`\``;
    } else if (typeName === 'blockquote') {
      const body = (node.textContent || '').split('\n').map((line) => `> ${line}`).join('\n').trim();
      textToCopy = body;
    } else if (typeName === 'horizontalRule') {
      textToCopy = '---';
    }

    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy).catch(() => {});
    closeBlockContextMenu();
  }, [blockContextMenu, closeBlockContextMenu, editor, topLevelPosAtIndex]);

  const setBlockHeadingLevel = useCallback((level: 0 | 1 | 2 | 3 | 4 | 5) => {
    if (!editor || !blockContextMenu) return;
    const { blockIndex, type } = blockContextMenu;
    if (!(type === 'paragraph' || type === 'heading')) return;
    if (blockIndex < 0 || blockIndex >= editor.state.doc.childCount) return;

    const doc = editor.state.doc;
    const node = doc.child(blockIndex);
    const from = topLevelPosAtIndex(doc, blockIndex);
    const schema = doc.type.schema;
    const textAlign = (node.attrs as { textAlign?: string })?.textAlign;

    const tr = editor.state.tr;
    if (level === 0) {
      tr.setNodeMarkup(from, schema.nodes.paragraph, textAlign ? { textAlign } : {});
    } else {
      tr.setNodeMarkup(from, schema.nodes.heading, textAlign ? { level, textAlign } : { level });
    }
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
    closeBlockContextMenu();
  }, [blockContextMenu, closeBlockContextMenu, editor, topLevelPosAtIndex]);

  const openMermaidEditorFromContextMenu = useCallback(() => {
    if (!blockContextMenu || blockContextMenu.type !== 'mermaid') return;
    const index = blockContextMenu.mermaidIndex;
    if (index == null) return;
    const block = mermaidBlocks[index];
    if (!block) return;
    setDiagramEditorMode('edit');
    setDiagramDraft(block.code);
    setEditingDiagramIndex(index);
    setShowDiagramMenu(false);
    setShowDiagramEditor(true);
    closeBlockContextMenu();
  }, [blockContextMenu, closeBlockContextMenu, mermaidBlocks]);

  const handleDragHandleContextMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const index = dragHandleBlockIndex ?? hoverBlockIndexRef.current;
    if (index == null) return;

    const meta = getBlockContextMeta(index);
    if (!meta) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const anchorRect = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    };
    const point = placeMenuNearAnchor(
      anchorRect,
      BLOCK_MENU_ESTIMATED_SIZE,
      { sideX: 'right', alignY: 'start', gap: 8, padding: 8, flip: true },
    );

    setBlockContextMenu({
      ...meta,
      anchorRect,
      ready: false,
      x: point.x,
      y: point.y,
    });
  }, [dragHandleBlockIndex, getBlockContextMeta]);

  // Lo que arrastraría el handle ahora mismo: un bloque de primer nivel o
  // un ítem de lista (ver noteBlockDrag.ts).
  const dragUnitRef = useRef<DragUnit | null>(null);

  const startBlockPointerDrag = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0 || !editor) return;
    const unit = dragUnitRef.current;
    const pane = editorPaneRef.current;
    if (!unit || !pane) return;
    if (unit.kind === 'block' && (unit.index < 0 || unit.index >= editor.state.doc.childCount)) return;

    event.preventDefault();
    event.stopPropagation();
    setBlockContextMenu(null);
    isBlockDraggingRef.current = true;
    setDragHandlePos((prev) => ({ ...prev, visible: false }));
    document.body.style.cursor = 'grabbing';

    // Fantasma: una copia de lo que se arrastra sigue al cursor (abajo a
    // la derecha, para no tapar la línea de destino), y el original queda
    // atenuado, para que se vea qué se está moviendo.
    const sourceRect = unit.el.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'prose-editor note-drag-ghost';
    ghost.style.width = `${Math.min(sourceRect.width, 420)}px`;
    ghost.appendChild(unit.el.cloneNode(true));
    document.body.appendChild(ghost);
    const placeGhost = (x: number, y: number) => {
      ghost.style.transform = `translate(${x + 16}px, ${y + 12}px)`;
    };
    placeGhost(event.clientX, event.clientY);
    {
      const paneRect = pane.getBoundingClientRect();
      setDragSourceBox({
        top: sourceRect.top - paneRect.top + pane.scrollTop,
        left: sourceRect.left - paneRect.left,
        width: sourceRect.width,
        height: sourceRect.height,
      });
    }

    const toPaneLine = (line: DropLine) => {
      const paneRect = pane.getBoundingClientRect();
      return { top: line.y - paneRect.top + pane.scrollTop, left: line.left - paneRect.left, width: line.right - line.left };
    };

    const finish = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('keydown', onKeyDown, true);
      isBlockDraggingRef.current = false;
      document.body.style.cursor = '';
      ghost.remove();
      setDragSourceBox(null);
      setBlockDropLine(null);
    };

    const onMove = (e: PointerEvent) => {
      placeGhost(e.clientX, e.clientY);
      const target = dropTargetAtCoords(editor.view, unit, e.clientX, e.clientY);
      setBlockDropLine(target ? toPaneLine(target.line) : null);
    };

    const onUp = (e: PointerEvent) => {
      const target = dropTargetAtCoords(editor.view, unit, e.clientX, e.clientY);
      const line = target ? toPaneLine(target.line) : null;
      finish();
      if (!target || !line) return;
      const moved = unit.kind === 'block'
        ? target.kind === 'block' && moveTopLevelBlock(editor.view, unit.index, target.index)
        : moveListItem(editor.view, unit.pos, target);
      if (!moved) return;
      setBlockDropFlash(line);
      window.setTimeout(() => setBlockDropFlash(null), 260);
    };

    // Esc cancela el arrastre sin mover nada.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      finish();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('keydown', onKeyDown, true);
  }, [editor]);

  const handleEditorPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!editor || isBlockDraggingRef.current) return;
    // Sobre el propio handle no se recalcula: si no, al ir hacia el handle
    // de un ítem se podría saltar al de la lista entera.
    if ((event.target as Element | null)?.closest?.('.drag-handle')) return;
    const pane = editorPaneRef.current;
    if (!pane) return;

    const unit = dragUnitAtCoords(editor.view, event.clientX, event.clientY, 40);
    if (!unit) {
      // Mantener el handle visible en el gutter para permitir click/drag sin parpadeo.
      return;
    }
    const blockIndex = unit.kind === 'block' ? unit.index : editor.state.doc.resolve(unit.pos).index(0);

    // Mientras el menu contextual de bloque este abierto, bloqueamos el drawer al bloque origen.
    if (blockContextMenu && blockIndex !== blockContextMenu.blockIndex) {
      return;
    }

    dragUnitRef.current = unit;
    hoverBlockIndexRef.current = blockIndex;
    setDragHandleBlockIndex(blockIndex);

    const rect = unit.el.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    if (unit.kind === 'item') {
      // Junto a la primera línea del ítem: a la izquierda de su viñeta o
      // número (que quedan fuera del <li>) o de su casilla (que va dentro).
      const isTask = unit.el.getAttribute('data-type') === 'taskItem';
      const top = rect.top - paneRect.top + pane.scrollTop + 2;
      const left = Math.max(2, rect.left - paneRect.left - (isTask ? 22 : 40));
      setDragHandlePos({ top, left, visible: true });
      return;
    }
    const top = rect.top - paneRect.top + pane.scrollTop + Math.max(0, (rect.height - 18) / 2);
    setDragHandlePos({ top, left: 6, visible: true });
  }, [blockContextMenu, editor]);

  const handleEditorPointerLeave = useCallback(() => {
    if (isBlockDraggingRef.current) return;
    setDragHandlePos((prev) => ({ ...prev, visible: false }));
    setDragHandleBlockIndex(null);
    hoverBlockIndexRef.current = null;
  }, []);

  useEffect(() => {
    if (!blockContextMenu) return;

    if (!dragHandlePos.visible) {
      closeBlockContextMenu();
      return;
    }

    if (
      dragHandleBlockIndex !== null
      && dragHandleBlockIndex !== blockContextMenu.blockIndex
      && !isPointerInsideBlockContextMenu
    ) {
      closeBlockContextMenu();
    }
  }, [
    blockContextMenu,
    closeBlockContextMenu,
    dragHandleBlockIndex,
    dragHandlePos.visible,
    isPointerInsideBlockContextMenu,
  ]);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refleja `newContent` hacia el Y.Doc de esta nota y lo manda/encola.
  // Solo se aplica lo que cambió el usuario desde el último guardado (ver
  // applyEditorEdit en noteContentSync.ts): diffear el Y.Text contra
  // `getMarkdown()` mete las diferencias de representación de Tiptap como si
  // fueran ediciones. Espera ydocReadyRef primero — diffear contra un Y.Text
  // que todavía no terminó de hidratarse (sidecar local, o bootstrap desde el
  // contenido actual) produciría un diff contra una base incorrecta.
  const pushContentUpdate = useCallback(async (note: Note, newContent: string) => {
    const generation = remoteGenerationRef.current;
    await ydocReadyRef.current;
    const ydoc = ydocRef.current;
    if (!ydoc) return;
    // Si en la espera entró un update remoto, `newContent` es de antes y
    // aplicarlo contra la base nueva revertiría lo remoto. Lo local de ese
    // momento ya está en el Y.Doc (applyRemoteContent lo aplica antes del
    // update), así que basta con lo que muestra el editor ahora.
    if (generation !== remoteGenerationRef.current) {
      newContent = readLocalMarkdown() ?? editorBaseMarkdownRef.current ?? newContent;
    }
    const base = editorBaseMarkdownRef.current;
    if (base === null) applyTextEdit(ydoc, getContentText(ydoc), newContent);
    else applyEditorEdit(ydoc, base, newContent);
    editorBaseMarkdownRef.current = newContent;
    await syncNoteContent(useAppStore.getState, useAppStore.setState, note, ydoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Campos pendientes del debounce, acumulados. Título y contenido
  // comparten un único timer de 600ms; antes cada llamada reemplazaba el
  // patch pendiente en vez de sumarse, así que escribir el título y empezar
  // el cuerpo antes de 600ms descartaba el título — bug real (19 oct 2026):
  // "Titulo rapido" quedó como "Sin título" en disco y en el servidor. Ahora
  // cada cambio se fusiona aquí y el guardado escribe todo lo acumulado.
  const pendingPatchRef = useRef<Partial<Note>>({});
  // El "promote title" (Enter en la primera línea) no conoce el contenido
  // final hasta que el editor propaga la transacción, así que pide leerlo
  // del editor en el momento de guardar en vez de pasarlo en el patch.
  const pendingContentFromEditorRef = useRef(false);
  // Mismo patrón que `activeNoteRef`: el timer puede haberse programado
  // desde un closure con `editor` todavía null (schedulesSave está
  // memoizado), así que se lee el editor vigente al disparar.
  const editorRef = useRef(editor);
  editorRef.current = editor;

  const readEditorMarkdown = (): string | null => {
    const instance = editorRef.current;
    if (!instance) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return normalizeEditorMarkdown((instance.storage as any).markdown.getMarkdown() as string);
    } catch {
      return null; // editor ya destruido
    }
  };

  // Markdown que el usuario tiene en pantalla ahora: el del textarea en el
  // modo fuente (ahí el editor Tiptap no se actualiza hasta salir) y el de
  // Tiptap en los otros dos.
  const readLocalMarkdown = (): string | null => (
    viewModeRef.current === 'source' ? mdContentRef.current : readEditorMarkdown()
  );

  // Vacía lo acumulado y lo aplica sobre la versión más reciente de la nota
  // en el store (no sobre un snapshot de un render viejo, que pisaría tags o
  // pin cambiados mientras tanto). Devuelve null si la nota ya no está en el
  // store: se borró, y guardarla la resucitaría (ver el flush al desmontar).
  const takePendingNote = (): Note | null => {
    const patch = pendingPatchRef.current;
    const contentFromEditor = pendingContentFromEditorRef.current;
    pendingPatchRef.current = {};
    pendingContentFromEditorRef.current = false;
    const noteId = activeNoteRef.current?.id;
    const latest = useAppStore.getState().notes.find((n) => n.id === noteId);
    if (!latest) return null;
    if (contentFromEditor) {
      const md = readEditorMarkdown();
      if (md !== null) patch.content = md;
    }
    // Lo acumulado puede ser de antes de un update remoto (el efecto de
    // `mdContent` corre después del render): se guarda lo que se ve ahora,
    // que ya incluye lo remoto, para no revertirlo.
    if (remoteSinceLastTakeRef.current && 'content' in patch) {
      patch.content = readLocalMarkdown() ?? patch.content;
    }
    remoteSinceLastTakeRef.current = false;
    return { ...latest, ...patch };
  };

  const scheduleFlush = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const hadContent = 'content' in pendingPatchRef.current || pendingContentFromEditorRef.current;
      const updated = takePendingNote();
      if (!updated) return;
      updateNote(updated);
      if (hadContent) void pushContentUpdate(updated, updated.content);
    }, 600);
  };

  const schedulesSave = useCallback(
    (patch: Partial<Note>) => {
      if (!activeNote) return;
      pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
      // Un contenido explícito es posterior al "promote title" que pidió
      // leerlo del editor, así que lo reemplaza.
      if ('content' in patch) pendingContentFromEditorRef.current = false;
      scheduleFlush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeNote, updateNote]
  );

  // ── Promote first line to title on Enter ────────────────────────────────
  // Se asigna en cada render para evitar closures estáticos dentro del useEffect.
  titleIsPresentRef.current = !!title;
  promoteTitleHandlerRef.current = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (titleIsPresentRef.current) return;
    if (!editor) return;

    const { state } = editor;
    const { $from } = state.selection;

    // Solo si estamos dentro del primer bloque de nivel superior
    if ($from.index(0) !== 0) return;
    const firstBlock = state.doc.child(0);
    if (firstBlock.type.name !== 'paragraph') return;

    const cursorPos = $from.pos;
    const firstCharPos = 1; // posición inmediatamente dentro del párrafo
    if (firstCharPos >= cursorPos) return; // cursor al inicio, nada antes

    const textBeforeCursor = state.doc.textBetween(firstCharPos, cursorPos);
    if (!textBeforeCursor.trim()) return;

    e.preventDefault();

    const lastCharPos = firstBlock.nodeSize - 1;
    const textAfterCursor =
      cursorPos < lastCharPos
        ? state.doc.textBetween(cursorPos, lastCharPos)
        : '';

    const newTitle = textBeforeCursor.trim();
    setTitle(newTitle);

    // Reconstruir contenido del editor sin el primer párrafo
    const schema = state.doc.type.schema;
    const tr = state.tr;
    tr.delete(0, firstBlock.nodeSize);

    if (textAfterCursor) {
      const newPara = schema.nodes.paragraph.create(null, schema.text(textAfterCursor));
      tr.insert(0, newPara);
    } else if (tr.doc.content.size === 0) {
      tr.insert(0, schema.nodes.paragraph.create());
    }

    try {
      tr.setSelection(TextSelection.create(tr.doc, 1));
    } catch { /* ignore if doc is in invalid state */ }

    // Evitar que el useEffect de mdContent lance un guardado parcial (solo contenido)
    skipNextContentSaveRef.current = true;
    editor.view.dispatch(tr);

    // Guardar título + contenido juntos tras la propagación del update
    pendingPatchRef.current = { ...pendingPatchRef.current, title: newTitle };
    pendingContentFromEditorRef.current = true;
    scheduleFlush();

    // Redimensionar el textarea del título
    requestAnimationFrame(() => {
      const ta = titleRef.current;
      if (ta) {
        ta.style.height = 'auto';
        ta.style.height = `${ta.scrollHeight}px`;
      }
    });
  };
  // ────────────────────────────────────────────────────────────────────────

  // Lo que se ve en pantalla se resuelve igual que siempre — síncrono,
  // directo desde `activeNote.content` — sin esperar nada del canal CRDT.
  useEffect(() => {
    if (!activeNote || !editor) return;
    const normalizedContent = normalizeEditorMarkdown(activeNote.content || '');
    setTitle(activeNote.title);
    setViewMode('wysiwyg');
    suppressNextEditorMarkdownSyncRef.current = true;
    editor.commands.setContent(normalizedContent);
    setMdContent(normalizedContent);
    // La base del delta es lo que el editor devuelve tras cargar, no
    // `normalizedContent`: Tiptap ya lo reserializa (escapes, `\n` final) y
    // esas diferencias no son ediciones del usuario.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editorBaseMarkdownRef.current = normalizeEditorMarkdown((editor.storage as any).markdown.getMarkdown() as string);
    // Auto-focus el título cuando la nota está vacía (recién creada)
    if (!activeNote.title && !activeNote.content) {
      setTimeout(() => titleRef.current?.focus(), 50);
    }
    setShowDiagramEditor(false);
    setShowDiagramMenu(false);
    setEditingDiagramIndex(null);
  }, [activeNote?.id, editor]);

  // Hidratación del canal CRDT (independiente de lo que se ve en pantalla,
  // resuelto arriba de forma síncrona como siempre) — dos caminos mutuamente
  // excluyentes para no duplicar contenido (Yjs trataría un seed + un
  // applyUpdate del mismo contenido como dos ediciones concurrentes):
  //  - ya existe `.ydoc` local (nota tocada antes por esta feature) →
  //    aplicarlo sobre el Y.Doc recién creado.
  //  - no existe → sembrar el `Y.Text` desde el Markdown actual
  //    (`activeNote.content`) como un diff contra "" — primera vez que
  //    esta nota entra al mundo CRDT, la migra sin perder su contenido
  //    previo (logday-web no necesita este camino: ahí toda nota nace ya
  //    dentro del CRDT, nunca tiene contenido previo que migrar).
  useEffect(() => {
    if (!activeNote) return;
    const ydoc = ydocRef.current!;
    let cancelled = false;
    ydocReadyRef.current = (async () => {
      const persistedUpdate = await readPersistedUpdate(activeNote.filePath).catch(() => null);
      if (cancelled) return;
      if (persistedUpdate) {
        Y.applyUpdate(ydoc, persistedUpdate);
      } else {
        const normalizedContent = normalizeEditorMarkdown(activeNote.content || '');
        if (normalizedContent) applyTextEdit(ydoc, '', normalizedContent);
      }
    })();
    return () => { cancelled = true; };
  }, [activeNote?.id]);

  // Markdown del documento de Tiptap que, al parsearse, vuelve a dar el mismo
  // documento. `getMarkdown()` no sirve para eso: con CompactParagraph cada
  // párrafo sale como una sola línea, así que "<p>A</p><p>B</p>" y
  // "<p>A<br>B</p>" dan casi el mismo texto, y al reparsearlo los párrafos se
  // funden en uno (con `breaks: true`, un `\n` suelto es un salto de línea).
  // Acá cada bloque de primer nivel se serializa por separado y se unen con
  // una línea en blanco, como en Markdown estándar. Un párrafo vacío no
  // sobrevive al parseo como línea vacía, así que va como HTML.
  const serializeBlocksForParse = (instance: NonNullable<typeof editor>): string => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serializer = (instance.storage as any).markdown.serializer;
    const { doc } = instance.state;
    const blocks: string[] = [];
    doc.forEach((block) => {
      if (block.type.name === 'paragraph' && block.content.size === 0) {
        blocks.push('<p></p>');
        return;
      }
      blocks.push((serializer.serialize(doc.type.create(null, block)) as string).replace(/\n+$/, ''));
    });
    return blocks.join('\n\n');
  };

  // Muestra en pantalla el cambio que un update remoto hizo al Y.Text
  // (`before` → `after`). `local` es el Markdown del textarea en el modo
  // fuente; en los otros modos se usa serializeBlocksForParse. Devuelve el
  // Markdown que queda en pantalla, en la representación de
  // `readLocalMarkdown` (la de la base del delta). En Tiptap reemplaza solo
  // el tramo que cambió: el cursor se traslada con el mapeo de la
  // transacción y no se mueve si lo remoto está en otra parte.
  // `addToHistory: false` para que Ctrl+Z no deshaga la edición del otro
  // cliente, y `preventUpdate` porque no es una edición del usuario
  // (onUpdate cerraría menús y programaría un guardado).
  const showRemoteContent = (before: string, after: string, local: string): string => {
    if (viewModeRef.current === 'source') {
      const { text, changes } = rebaseText(before, after, local);
      // El textarea es controlado: si su valor ya es el nuevo cuando React
      // re-renderiza, no lo toca y la selección trasladada se conserva.
      const textarea = sourceTextareaRef.current;
      if (textarea && textarea.value === local) {
        const start = mapTextIndex(changes, textarea.selectionStart);
        const end = mapTextIndex(changes, textarea.selectionEnd);
        textarea.value = text;
        textarea.setSelectionRange(start, end);
      }
      return text;
    }
    const instance = editorRef.current;
    if (!instance) return local;
    const { text } = rebaseText(before, after, serializeBlocksForParse(instance));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = (instance.storage as any).markdown.parser.parse(text) as string;
    const nextDoc = createDocument(html, instance.schema);
    const { doc } = instance.state;
    const start = doc.content.findDiffStart(nextDoc.content);
    if (start !== null) {
      let { a: endA, b: endB } = doc.content.findDiffEnd(nextDoc.content)!;
      // Si el tramo distinto es una repetición (p. ej. "aa" → "aaa"), los
      // finales calculados desde atrás pueden quedar antes del inicio.
      const overlap = start - Math.min(endA, endB);
      if (overlap > 0) {
        endA += overlap;
        endB += overlap;
      }
      const tr = instance.state.tr
        .replace(start, endA, nextDoc.slice(start, endB))
        .setMeta('addToHistory', false)
        .setMeta('preventUpdate', true);
      instance.view.dispatch(tr);
    }
    return readEditorMarkdown() ?? local;
  };

  // Aplica al Y.Doc abierto un `content_state` remoto que entrega el store
  // (ver registerOpenNoteDoc en noteContentSync.ts), lo muestra y persiste
  // el `.ydoc`. Después del await todo es síncrono: ninguna tecla puede
  // quedar entre leer el texto local y actualizar la base del delta.
  const applyRemoteContent = async (contentStateB64: string): Promise<string | null> => {
    await ydocReadyRef.current;
    const note = activeNoteRef.current;
    const ydoc = ydocRef.current;
    // Se desmontó durante la espera: el store lo aplica en disco.
    if (disposedRef.current || !ydoc || !note) return null;
    const base = editorBaseMarkdownRef.current;
    const local = base === null ? null : readLocalMarkdown();
    // Lo que el usuario escribió y todavía no se guardó entra primero al
    // Y.Doc, igual que en un guardado. Así la base queda igual a lo que se
    // ve, y el cambio que produce el update es solo lo remoto.
    const hadLocalEdits = base !== null && local !== null && local !== base;
    if (hadLocalEdits) {
      applyEditorEdit(ydoc, base, local);
      editorBaseMarkdownRef.current = local;
    }
    const before = getContentText(ydoc);
    Y.applyUpdate(ydoc, base64ToBytes(contentStateB64));
    const after = getContentText(ydoc);
    let shown = local;
    if (before !== after && local !== null) {
      shown = showRemoteContent(before, after, local);
      // La base pasa a ser lo que se ve después del cambio: el siguiente
      // guardado aplica solo lo que el usuario cambie de acá en adelante.
      editorBaseMarkdownRef.current = shown;
      remoteGenerationRef.current += 1;
      remoteSinceLastTakeRef.current = true;
      setMdContent(shown);
    }
    // El Y.Doc en memoria tiene texto local que el servidor y el `.md` no
    // tienen todavía: se programa el guardado de siempre para mandarlo.
    if (hadLocalEdits && shown !== null) schedulesSave({ content: shown });
    if (hadLocalEdits || before !== after) await persistYDoc(note.filePath, ydoc);
    return after;
  };
  const applyRemoteContentRef = useRef(applyRemoteContent);
  applyRemoteContentRef.current = applyRemoteContent;

  // Mientras la nota está abierta, el store le entrega a este editor los
  // `content_state` remotos en vez de mezclarlos en el `.ydoc` en disco.
  useEffect(() => {
    if (!activeNote) return;
    return registerOpenNoteDoc(activeNote.id, (b64) => applyRemoteContentRef.current(b64));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNote?.id]);

  // Flush del guardado pendiente + push de contenido + liberar el Y.Doc al
  // desmontar (cambio de nota vía `key`, o salir de la sección Notas). El
  // `setTimeout` de `schedulesSave` no se cancela solo con React — si no se
  // hace flush acá, la última edición dentro de la ventana de debounce de
  // 600ms se perdería del todo al cambiar de nota rápido.
  useEffect(() => {
    return () => {
      disposedRef.current = true;
      const ydoc = ydocRef.current;
      let pending: Promise<void> | null = null;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        // Si la nota se borró (deleteNote ya la sacó de `notes` y puso
        // `activeNote: null`, lo que desmonta este editor), activeNoteRef
        // sigue apuntando a la nota borrada — es un snapshot síncrono que
        // no se limpia solo. takePendingNote la busca en el store en vivo y
        // devuelve null: sin ese chequeo, el flush de abajo reescribe el
        // archivo local de la nota que se acaba de borrar (updateNote hace
        // fs.writeFile incondicional) y la resucita — bug real: no se podía
        // borrar una nota con una edición sin guardar en los últimos 600ms
        // (el caso común: escribes algo y borras antes de que el debounce
        // corra solo). Lo pendiente (p. ej. un título recién escrito) entra
        // en el mismo guardado que el contenido, en vez de perderse.
        const flushedNote = takePendingNote();
        const md = readEditorMarkdown();
        if (flushedNote && md !== null) {
          const flushed = { ...flushedNote, content: md };
          void updateNote(flushed);
          pending = pushContentUpdate(flushed, md);
        }
      }
      // Solo se destruye el Y.Doc después de que el flush pendiente (si lo
      // hay) termine — destruirlo antes rompería el encode/push en curso.
      if (pending) void pending.finally(() => ydoc?.destroy());
      else ydoc?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    if (skipNextContentSaveRef.current) {
      skipNextContentSaveRef.current = false;
      userEditedMarkdownRef.current = false;
      return;
    }
    if (!userEditedMarkdownRef.current) return;
    userEditedMarkdownRef.current = false;
    schedulesSave({ content: mdContent });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mdContent]);

  // El selector de lenguaje de los bloques de código es una capa con
  // posición absoluta: hay que reubicarlo cuando cambia el documento sin
  // una transacción (un diagrama Mermaid que termina de dibujarse, una
  // imagen que carga) o cuando la transacción se dibuja después.
  useEffect(() => {
    if (!editor || viewMode === 'source') return;
    let root: HTMLElement;
    try {
      root = editor.view.dom as HTMLElement;
    } catch {
      return;
    }
    // Un frame después: los NodeView de React (Mermaid) se dibujan después
    // de la transacción, y un cambio que no altera el alto total (mover un
    // diagrama) no dispara el ResizeObserver.
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => recalcCodeBlockAnchors());
    };
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(root);
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(root, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [editor, viewMode, recalcCodeBlockAnchors]);

  // Suscripción directa al evento transaction del editor para refrescar el toolbar
  // de forma fiable (evita closures estales de useEditor config en TipTap 3)
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      forceUpdate();
      recalcCodeBlockAnchors();
    };
    editor.on('transaction', handler);
    return () => { editor.off('transaction', handler); };
  }, [editor, recalcCodeBlockAnchors]);

  // Adjuntar listener de teclado para promover primera línea a título.
  // Se escucha en el pane contenedor (no en editor.view.dom) para evitar
  // el error de TipTap 3 cuando el view aún no está montado.
  // Los eventos de teclado del editor burbujean hasta el pane normalmente.
  // Depende de activeNote?.id para re-adjuntar cuando el pane se monta con la primera nota.
  useEffect(() => {
    const pane = editorPaneRef.current;
    if (!pane) return;
    const handler = (e: KeyboardEvent) => promoteTitleHandlerRef.current(e);
    pane.addEventListener('keydown', handler);
    return () => pane.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNote?.id]);

  useEffect(() => {
    recalcCodeBlockAnchors();
  }, [mdContent, recalcCodeBlockAnchors]);

  useEffect(() => {
    if (viewMode === 'source') return;
    const pane = editorPaneRef.current;
    if (!pane) return;

    const onRelayout = () => recalcCodeBlockAnchors();
    pane.addEventListener('scroll', onRelayout);
    window.addEventListener('resize', onRelayout);
    requestAnimationFrame(onRelayout);

    return () => {
      pane.removeEventListener('scroll', onRelayout);
      window.removeEventListener('resize', onRelayout);
    };
  }, [viewMode, recalcCodeBlockAnchors]);

  // Cierra dropdowns al hacer click fuera de ellos
  useEffect(() => {
    if (!showBlockMenu
      && !showCaseMenu
      && !showEmojiMenu
      && !showTableMenu
      && !showDiagramMenu
      && openCodeLangMenuIndex === null
      && !blockContextMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showBlockMenu && !blockMenuRef.current?.contains(e.target as Node)) setShowBlockMenu(false);
      if (showCaseMenu && !caseMenuRef.current?.contains(e.target as Node)) setShowCaseMenu(false);
      if (showEmojiMenu && !emojiMenuRef.current?.contains(e.target as Node)) setShowEmojiMenu(false);
      if (showTableMenu && !tableMenuRef.current?.contains(e.target as Node)) setShowTableMenu(false);
      if (showDiagramMenu && !diagramMenuRef.current?.contains(e.target as Node)) setShowDiagramMenu(false);
      if (openCodeLangMenuIndex !== null && !target.closest('.code-block-lang-select-wrap')) {
        setOpenCodeLangMenuIndex(null);
        setCodeLangSearch('');
      }
      if (blockContextMenu && !blockContextMenuRef.current?.contains(e.target as Node)) {
        setBlockContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showBlockMenu, showCaseMenu, showEmojiMenu, showTableMenu, showDiagramMenu, openCodeLangMenuIndex, blockContextMenu]);

  useEffect(() => {
    if (!blockContextMenu) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBlockContextMenu(null);
      }
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [blockContextMenu]);

  useEffect(() => {
    if (!blockContextMenu || !blockContextMenuRef.current) return;

    const rect = blockContextMenuRef.current.getBoundingClientRect();
    const nextPoint = placeMenuNearAnchor(
      blockContextMenu.anchorRect,
      { width: rect.width, height: rect.height },
      { sideX: 'right', alignY: 'start', gap: 8, padding: 8, flip: true },
    );

    const hasSamePosition = Math.abs(nextPoint.x - blockContextMenu.x) < 1 && Math.abs(nextPoint.y - blockContextMenu.y) < 1;
    const shouldShow = !blockContextMenu.ready;
    if (hasSamePosition && !shouldShow) return;

    setBlockContextMenu((prev) => {
      if (!prev) return prev;
      if (prev.blockIndex !== blockContextMenu.blockIndex) return prev;
      return {
        ...prev,
        ready: true,
        x: nextPoint.x,
        y: nextPoint.y,
      };
    });
  }, [blockContextMenu]);

  useEffect(() => {
    if (!blockContextMenu) return;
    const closeOnScroll = () => {
      setBlockContextMenu(null);
    };

    window.addEventListener('scroll', closeOnScroll, true);
    return () => {
      window.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [blockContextMenu]);

  const syncMarkdownToEditor = useCallback((nextMarkdown: string) => {
    userEditedMarkdownRef.current = true;
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

    let nextMarkdown: string;
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

  mermaidActionsRef.current = {
    edit: (index) => {
      const block = mermaidBlocks[index];
      if (block) openDiagramEditor('edit', block.code, index);
    },
    moveUp: (index) => handleMoveDiagram(index, 'up'),
    moveDown: (index) => handleMoveDiagram(index, 'down'),
    duplicate: handleDuplicateDiagram,
    remove: handleDeleteDiagram,
  };

  const handleChangeCodeLanguage = useCallback((index: number, language: string) => {
    if (index < 0) return;
    const targetLanguage = language === 'plaintext' ? '' : language.trim().toLowerCase();

    // Prefer direct ProseMirror node update to avoid full content reset (prevents visual jumps).
    if (editor) {
      if (!codeLangSelectionRef.current) {
        codeLangSelectionRef.current = {
          from: editor.state.selection.from,
          to: editor.state.selection.to,
          scrollTop: editorPaneRef.current?.scrollTop ?? 0,
        };
      }
      let codeBlockCounter = -1;
      let targetPos: number | null = null;
      let currentLanguage: string | null = null;

      editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'codeBlock') return true;
        const lang = String((node.attrs as { language?: string })?.language || '').toLowerCase();
        if (lang === 'mermaid') return true;

        codeBlockCounter += 1;
        if (codeBlockCounter === index) {
          targetPos = pos;
          currentLanguage = (node.attrs as { language?: string | null })?.language ?? null;
          return false;
        }
        return true;
      });

      if (targetPos !== null) {
        const nextLanguage = targetLanguage || null;
        if (currentLanguage !== nextLanguage) {
          const currentNode = editor.state.doc.nodeAt(targetPos);
          const currentAttrs = (currentNode?.attrs || {}) as Record<string, unknown>;
          const tr = editor.state.tr;
          tr.setNodeMarkup(targetPos, undefined, {
            ...currentAttrs,
            language: nextLanguage,
          });
          editor.view.dispatch(tr);

          const saved = codeLangSelectionRef.current;
          if (saved) {
            const maxPos = editor.state.doc.content.size;
            const from = Math.max(1, Math.min(saved.from, maxPos));
            const to = Math.max(1, Math.min(saved.to, maxPos));
            const selTr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to));
            editor.view.dispatch(selTr);
            editor.view.focus();
            if (editorPaneRef.current) {
              editorPaneRef.current.scrollTop = saved.scrollTop;
            }
          }
        }
        codeLangSelectionRef.current = null;
        return;
      }
    }

    // Fallback path based on raw markdown manipulation.
    const lines = mdContent.split('\n');
    let inFence = false;
    let codeBlockCounter = -1;

    for (let i = 0; i < lines.length; i += 1) {
      const fenceMatch = lines[i].trim().match(/^```([a-zA-Z0-9_-]+)?(?:\s+.*)?$/);
      if (!fenceMatch) continue;

      const fenceLanguage = (fenceMatch[1] || '').toLowerCase();

      if (!inFence) {
        // Opening fence
        inFence = true;
        if (fenceLanguage === 'mermaid') continue;

        codeBlockCounter += 1;
        if (codeBlockCounter !== index) continue;

        lines[i] = targetLanguage ? `\`\`\`${targetLanguage}` : '```';
        break;
      }

      // Closing fence
      inFence = false;
    }

    const nextMarkdown = lines.join('\n');

    if (nextMarkdown !== mdContent) {
      syncMarkdownToEditor(nextMarkdown);
    }
  }, [mdContent, syncMarkdownToEditor]);


  const getDiagramLabel = (code: string, index: number) => {
    const firstLine = code.split('\n').map((line) => line.trim()).find(Boolean);
    return firstLine ? `${tFn(language, 'notes', 'diagramLabel')} ${index + 1}: ${firstLine}` : `${tFn(language, 'notes', 'diagramLabel')} ${index + 1}`;
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

  const confirmDeleteDialog = useConfirmDelete<true>(confirmDestructiveActions);

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
          <p className="text-sm text-[var(--text-hint)]">{tFn(language, 'notes', 'selectOrCreate')}</p>
        </div>
      </div>
    );
  }

  const moveTargets = ['', ...noteFolders].filter((f) => f !== activeNote.folder);

  const switchToWysiwyg = () => {
    // Sincronizar markdown crudo → TipTap al salir del modo source
    if (viewMode === 'source' && editor) {
      try {
        suppressNextEditorMarkdownSyncRef.current = true;
        editor.commands.setContent(mdContent || '');
      } catch {
        suppressNextEditorMarkdownSyncRef.current = false;
      }
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
        // Si TipTap no esta montado aun, mantenemos mdContent actual y permitimos cambiar de vista.
      }
    }
    setViewMode('source');
  };

  const switchToSplit = () => {
    if (viewMode === 'source' && editor) {
      try {
        suppressNextEditorMarkdownSyncRef.current = true;
        editor.commands.setContent(mdContent || '');
      } catch {
        suppressNextEditorMarkdownSyncRef.current = false;
      }
    }
    setViewMode('split');
  };

  return (
    <div key={activeNote.id} className="animate-fade-in flex flex-1 flex-col overflow-hidden bg-[var(--bg-base)]">
      {/* Modal confirmación eliminar */}
      {confirmDeleteDialog.isOpen && (
        <ConfirmDeleteModal
          title={tFn(language, 'notes', 'confirmDeleteTitle')}
          message={
            <>
              {tFn(language, 'notes', 'confirmDeleteMsg')}{' '}
              <span className="font-medium text-[var(--text-primary)]">
                &quot;{activeNote.title || tFn(language, 'notes', 'untitled')}&quot;
              </span>
              ? {tFn(language, 'notes', 'confirmDeleteDesc')}
            </>
          }
          cancelLabel={tFn(language, 'notes', 'cancel')}
          confirmLabel={tFn(language, 'notes', 'delete')}
          onCancel={confirmDeleteDialog.cancel}
          onConfirm={() => { confirmDeleteDialog.cancel(); void handleDelete(); }}
        />
      )}
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => toggleNotePin(activeNote)}
            className={`rounded-lg p-1.5 transition ${
              activeNote.pinned
                ? 'text-amber-400 bg-amber-400/10'
                : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'
            }`}
            title={activeNote.pinned ? tFn(language, 'notes', 'unpinTitle') : tFn(language, 'notes', 'pinTitle')}
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
              title={tFn(language, 'notes', 'viewWysiwyg')}
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
              title={tFn(language, 'notes', 'viewSource')}
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
              title={tFn(language, 'notes', 'viewSplit')}
            >
              <Columns2 size={12} />
            </button>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowMoveMenu((v) => !v)}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              title={tFn(language, 'notes', 'moveFolder')}
            >
              <FolderOpen size={13} />
              <span>{activeNote.folder || tFn(language, 'notes', 'noFolder')}</span>
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
                    {f || tFn(language, 'notes', 'noFolder')}
                  </button>
                ))}
                {moveTargets.length === 0 && (
                  <p className="px-3 py-2 text-xs text-[var(--text-faint)] italic">{tFn(language, 'notes', 'noOtherFolders')}</p>
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
            title={tFn(language, 'notes', 'exportNote')}
          >
            <Download size={13} />
          </button>
          <button
            onClick={() => confirmDeleteDialog.request(true, () => void handleDelete())}
            className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:text-red-400 hover:bg-red-400/10"
            title={tFn(language, 'notes', 'deleteNote')}
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setActiveNote(null)}
            className="rounded-lg p-1.5 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            title={tFn(language, 'notes', 'close')}
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
              const labels: Record<string, string> = { '0': tFn(language, 'notes', 'blockParagraph'), '1': tFn(language, 'notes', 'blockH1'), '2': tFn(language, 'notes', 'blockH2'), '3': tFn(language, 'notes', 'blockH3'), '4': tFn(language, 'notes', 'blockH4'), '5': tFn(language, 'notes', 'blockH5') };
              const options = [
                { v: '0', label: tFn(language, 'notes', 'blockParagraph') }, { v: '1', label: tFn(language, 'notes', 'blockH1') }, { v: '2', label: tFn(language, 'notes', 'blockH2') },
                { v: '3', label: tFn(language, 'notes', 'blockH3') }, { v: '4', label: tFn(language, 'notes', 'blockH4') }, { v: '5', label: tFn(language, 'notes', 'blockH5') },
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
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBlockquote().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('blockquote') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={tFn(language, 'notes', 'tipQuote')}><Quote size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleCodeBlock().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('codeBlock') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={tFn(language, 'notes', 'tipCodeBlock')}><Braces size={13} /></button>

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            {/* Inline styles */}
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBold().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('bold') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={tFn(language, 'notes', 'tipBold')}><Bold size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleItalic().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('italic') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={tFn(language, 'notes', 'tipItalic')}><Italic size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleUnderline().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('underline') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={tFn(language, 'notes', 'tipUnderline')}><Underline size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleStrike().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('strike') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={tFn(language, 'notes', 'tipStrike')}><Strikethrough size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleCode().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('code') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={tFn(language, 'notes', 'tipCode')}><Code size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleHighlight().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('highlight') ? 'text-amber-400 bg-amber-400/10' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={tFn(language, 'notes', 'tipHighlight')}><Highlighter size={13} /></button>

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            {/* Listas */}
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('bulletList') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={tFn(language, 'notes', 'tipBulletList')}><List size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleOrderedList().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('orderedList') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={tFn(language, 'notes', 'tipOrderedList')}><ListOrdered size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleTaskList().run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('taskList') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={tFn(language, 'notes', 'tipTaskList')}><CheckSquare size={13} /></button>

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            {/* Alineación */}
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setTextAlign('left').run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive({ textAlign: 'left' }) ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={tFn(language, 'notes', 'tipAlignLeft')}><AlignLeft size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setTextAlign('center').run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive({ textAlign: 'center' }) ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={tFn(language, 'notes', 'tipAlignCenter')}><AlignCenter size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setTextAlign('right').run(); }} className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive({ textAlign: 'right' }) ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`} title={tFn(language, 'notes', 'tipAlignRight')}><AlignRight size={13} /></button>

            <div className="mx-1 h-4 w-px bg-[var(--border)]" />

            {/* Cambio de capitalización */}
            <div className="relative" ref={caseMenuRef}>
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowCaseMenu(v => !v); }}
                className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
                title={tFn(language, 'notes', 'tipCase')}
              ><CaseSensitive size={14} /></button>
              {showCaseMenu && (
                <div
                  className="absolute top-full right-0 mt-1 z-50 min-w-[160px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] py-1 shadow-lg"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {([
                    { mode: 'upper', label: tFn(language, 'notes', 'caseUpper') },
                    { mode: 'lower', label: tFn(language, 'notes', 'caseLower') },
                    { mode: 'sentence', label: tFn(language, 'notes', 'caseSentence') },
                    { mode: 'title', label: tFn(language, 'notes', 'caseTitle') },
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
            <div className="relative" ref={emojiMenuRef}>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  setShowEmojiMenu((v) => {
                    const next = !v;
                    if (next) setEmojiQuery('');
                    return next;
                  });
                }}
                className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
                title={tFn(language, 'notes', 'tipEmoji')}
              >
                <Smile size={13} />
              </button>
              {showEmojiMenu && (
                <div
                  className="absolute top-full right-0 mt-1 z-50 w-[260px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-2 shadow-lg"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <p className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-[var(--text-hint)]">{tFn(language, 'notes', 'emojisLabel')}</p>
                  <input
                    type="text"
                    value={emojiQuery}
                    onChange={(e) => setEmojiQuery(e.target.value)}
                    placeholder={tFn(language, 'notes', 'emojiSearchPlaceholder')}
                    className="mb-2 w-full rounded-md border border-[var(--border)] bg-[var(--bg-base)] px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-indigo-500/60"
                    autoFocus
                  />
                  <p className="mb-1 px-1 text-[10px] text-[var(--text-hint)]">
                    {tFn(language, 'notes', 'emojisShowing')} {visibleEmojis.length} {tFn(language, 'notes', 'emojisOf')} {filteredEmojis.length} {tFn(language, 'notes', 'emojisCount')}
                  </p>
                  <div className="grid max-h-[240px] grid-cols-10 gap-1 overflow-y-auto pr-1">
                    {visibleEmojis.map((item) => (
                      <button
                        key={item.emoji}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          editor?.chain().focus().insertContent(item.emoji).run();
                          setShowEmojiMenu(false);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded text-base transition hover:bg-[var(--bg-hover)]"
                        title={`${item.nameEs} / ${item.nameEn}`}
                      >
                        {item.emoji}
                      </button>
                    ))}
                  </div>
                  {filteredEmojis.length === 0 && (
                    <p className="mt-2 px-1 text-[11px] text-[var(--text-hint)]">{tFn(language, 'notes', 'emojisNoResults')}</p>
                  )}
                  {filteredEmojis.length > visibleEmojis.length && (
                    <p className="mt-2 px-1 text-[10px] text-[var(--text-hint)]">
                      {tFn(language, 'notes', 'emojisNarrowSearch')}
                    </p>
                  )}
                </div>
              )}
            </div>

            <button
              onMouseDown={(e) => {
                e.preventDefault();
                const sel = editor?.state.selection;
                savedRangeRef.current = sel ? { from: sel.from, to: sel.to } : null;
                setShowLinkModal(true);
              }}
              className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${editor?.isActive('link') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'}`}
              title={tFn(language, 'notes', 'tipLink')}
            ><Link size={13} /></button>
            <button
              onMouseDown={(e) => { e.preventDefault(); setShowImageModal(true); }}
              className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition"
              title={tFn(language, 'notes', 'tipImage')}
            ><ImageIcon size={13} /></button>
            <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().setHorizontalRule().run(); }} className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition" title={tFn(language, 'notes', 'tipSeparator')}><Minus size={13} /></button>

            {/* Tabla */}
            <div className="relative" ref={tableMenuRef}>
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowTableMenu(v => !v); }}
                className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${
                  editor?.isActive('table') ? 'text-indigo-300 bg-indigo-500/20' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'
                }`}
                title={tFn(language, 'notes', 'tipTable')}
              ><TableIcon size={13} /></button>
              {showTableMenu && (
                <div
                  className="absolute top-full right-0 mt-1 z-50 min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] py-1 shadow-lg"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">{tFn(language, 'notes', 'tableInsert')}</button>
                  <div className="my-1 border-t border-[var(--border)]" />
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addColumnBefore().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">{tFn(language, 'notes', 'tableAddColBefore')}</button>
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addColumnAfter().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">{tFn(language, 'notes', 'tableAddColAfter')}</button>
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteColumn().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">{tFn(language, 'notes', 'tableDeleteCol')}</button>
                  <div className="my-1 border-t border-[var(--border)]" />
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addRowBefore().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">{tFn(language, 'notes', 'tableAddRowBefore')}</button>
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addRowAfter().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">{tFn(language, 'notes', 'tableAddRowAfter')}</button>
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteRow().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">{tFn(language, 'notes', 'tableDeleteRow')}</button>
                  <div className="my-1 border-t border-[var(--border)]" />
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleHeaderRow().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition">{tFn(language, 'notes', 'tableToggleHeader')}</button>
                  <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteTable().run(); setShowTableMenu(false); }} className="w-full px-3 py-1.5 text-left text-[11px] text-red-400 hover:bg-[var(--bg-hover)] transition">{tFn(language, 'notes', 'tableDelete')}</button>
                </div>
              )}
            </div>

            <div className="relative" ref={diagramMenuRef}>
              <button
                onMouseDown={(e) => { e.preventDefault(); setShowDiagramMenu(v => !v); }}
                className={`rounded p-1.5 transition hover:bg-[var(--bg-hover)] ${
                  mermaidBlocks.length > 0 ? 'text-indigo-300 bg-indigo-500/14' : 'text-[var(--text-hint)] hover:text-[var(--text-primary)]'
                }`}
                title={tFn(language, 'notes', 'tipDiagram')}
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
                    {tFn(language, 'notes', 'diagramNew')}
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
        <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addColumnBefore().run(); }} className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition" title={tFn(language, 'notes', 'tableAddColLeft')}><BetweenHorizontalStart size={13} /></button>
        <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addColumnAfter().run(); }} className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition" title={tFn(language, 'notes', 'tableAddColRight')}><BetweenHorizontalEnd size={13} /></button>
        <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteColumn().run(); }} className="rounded p-1.5 text-red-400/60 hover:bg-red-500/10 hover:text-red-400 transition" title={tFn(language, 'notes', 'tableDeleteCol')}><PanelRightClose size={13} /></button>
        <div className="mx-1.5 h-3.5 w-px bg-[var(--border)]" />
        {/* Filas */}
        <span className="text-[10px] text-[var(--text-faint)] mr-0.5 select-none"><Rows3 size={11} /></span>
        <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addRowAfter().run(); }} className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition" title={tFn(language, 'notes', 'tableAddRowBelow')}><BetweenVerticalEnd size={13} /></button>
        <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteRow().run(); }} className="rounded p-1.5 text-red-400/60 hover:bg-red-500/10 hover:text-red-400 transition" title={tFn(language, 'notes', 'tableDeleteRow')}><PanelBottomClose size={13} /></button>
        <div className="mx-1.5 h-3.5 w-px bg-[var(--border)]" />
        {/* Cabecera */}
        <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleHeaderRow().run(); }} className="rounded p-1.5 text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition" title={tFn(language, 'notes', 'tableToggleHeader')}><TableProperties size={13} /></button>
        <div className="mx-1.5 h-3.5 w-px bg-[var(--border)]" />
        {/* Eliminar tabla */}
        <button onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteTable().run(); }} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition" title={tFn(language, 'notes', 'tableDelete')}><Trash2 size={11} /> {tFn(language, 'notes', 'tableLabel')}</button>
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
            placeholder={tFn(language, 'notes', 'titlePlaceholder')}
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
              className={`prose-editor-wrapper relative overflow-y-auto px-8 pb-8 ${
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
                <p className="text-sm font-semibold text-indigo-300">{tFn(language, 'notes', 'dropImageTitle')}</p>
                  <p className="text-xs text-indigo-400/70">{tFn(language, 'notes', 'dropImageHint')}</p>
                </div>
              )}
              {dragSourceBox && (
                <div
                  className="note-drag-source-mask pointer-events-none absolute z-20"
                  style={dragSourceBox}
                />
              )}
              {blockDropLine && (
                <div
                  className="note-drop-line pointer-events-none absolute z-20"
                  style={{ top: blockDropLine.top, left: blockDropLine.left, width: blockDropLine.width }}
                />
              )}
              {blockDropFlash && (
                <div
                  className="note-drop-line block-drop-flash pointer-events-none absolute z-20"
                  style={{ top: blockDropFlash.top, left: blockDropFlash.left, width: blockDropFlash.width }}
                />
              )}
              <button
                type="button"
                aria-label={tFn(language, 'notes', 'dragHandle')}
                onPointerDown={startBlockPointerDrag}
                onContextMenu={handleDragHandleContextMenu}
                className={`absolute z-30 rounded border border-transparent p-0 transition ${
                  dragHandlePos.visible ? 'opacity-100' : 'pointer-events-none opacity-0'
                } drag-handle`}
                style={{ top: dragHandlePos.top, left: dragHandlePos.left }}
              >
                <span className="drag-handle-grip" aria-hidden="true" />
              </button>
              {blockContextMenu && (
                <div
                  ref={blockContextMenuRef}
                  className="fixed z-[10050] min-w-[220px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-1.5 shadow-2xl"
                  onPointerEnter={() => setIsPointerInsideBlockContextMenu(true)}
                  onPointerLeave={() => setIsPointerInsideBlockContextMenu(false)}
                  style={{
                    left: blockContextMenu.x,
                    top: blockContextMenu.y,
                    opacity: blockContextMenu.ready ? 1 : 0,
                    transform: blockContextMenu.ready ? 'translateY(0) scale(1)' : 'translateY(4px) scale(0.98)',
                    transformOrigin: 'top left',
                    transition: 'opacity 120ms ease, transform 120ms ease',
                    pointerEvents: blockContextMenu.ready ? 'auto' : 'none',
                  }}
                >
                  <div className="mb-1 px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
                    {tFn(language, 'notes', 'blockActions')}
                  </div>
                  <button
                    type="button"
                    onClick={() => insertEmptyParagraphAroundBlock('above')}
                    className="flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    {tFn(language, 'notes', 'insertAbove')}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertEmptyParagraphAroundBlock('below')}
                    className="flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    {tFn(language, 'notes', 'insertBelow')}
                  </button>

                  {(blockContextMenu.type === 'paragraph' || blockContextMenu.type === 'heading') && (
                    <>
                      <div className="my-1 h-px bg-[var(--border)]" />
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
                        {tFn(language, 'notes', 'blockType')}
                      </div>
                      {[
                        { label: tFn(language, 'notes', 'blockParaLabel'), level: 0 as const },
                        { label: tFn(language, 'notes', 'blockH1Label'), level: 1 as const },
                        { label: tFn(language, 'notes', 'blockH2Label'), level: 2 as const },
                        { label: tFn(language, 'notes', 'blockH3Label'), level: 3 as const },
                      ].map((option) => {
                        const isActive = option.level === 0
                          ? blockContextMenu.type === 'paragraph'
                          : blockContextMenu.type === 'heading' && blockContextMenu.headingLevel === option.level;
                        return (
                          <button
                            key={option.label}
                            type="button"
                            onClick={() => setBlockHeadingLevel(option.level)}
                            className={`flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs transition ${
                              isActive
                                ? 'bg-indigo-500/15 text-indigo-300'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </>
                  )}

                  {blockContextMenu.type === 'mermaid' && (
                    <>
                      <div className="my-1 h-px bg-[var(--border)]" />
                      <button
                        type="button"
                        onClick={openMermaidEditorFromContextMenu}
                        className="flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                      >
                        {tFn(language, 'notes', 'editDiagram')}
                      </button>
                    </>
                  )}

                  <div className="my-1 h-px bg-[var(--border)]" />
                  <button
                    type="button"
                    onClick={copyBlockFromContextMenu}
                    className="flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    {tFn(language, 'notes', 'copy')}
                  </button>
                  <div className="my-1 h-px bg-[var(--border)]" />
                  <button
                    type="button"
                    onClick={deleteBlockFromContextMenu}
                    className="flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs text-red-300 transition hover:bg-red-500/10 hover:text-red-200"
                  >
                    {tFn(language, 'notes', 'deleteBlock')}
                  </button>
                </div>
              )}
              <EditorContent editor={editor} />

              {/* ── Task code reference popup (#code autocomplete) ── */}
              {taskRefQuery !== null && taskRefSuggestions.length > 0 && taskRefAnchor && (
                <div
                  ref={taskRefPopupRef}
                  className="absolute z-[500] min-w-[240px] overflow-hidden rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl animate-in"
                  style={{ top: taskRefAnchor.top, left: taskRefAnchor.left }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <p className="border-b border-[var(--border)] px-3 py-1.5 text-[10px] font-medium text-[var(--text-faint)]">
                    {tFn(language, 'notes', 'taskRefSuggestHint')}
                  </p>
                  {taskRefSuggestions.map((task, i) => (
                    <button
                      key={task.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (!editor) return;
                        // Replace the #partial text with the full #code
                        const { $anchor } = editor.state.selection;
                        const blockStart = $anchor.start();
                        const cursorPos = $anchor.pos;
                        const textBeforeCursor = editor.state.doc.textBetween(blockStart, cursorPos, '\n', '\n');
                        const codeMatch = textBeforeCursor.match(/#([a-zA-Z0-9\-_]*)$/);
                        if (codeMatch) {
                          const replaceFrom = cursorPos - codeMatch[0].length;
                          editor.chain().focus()
                            .deleteRange({ from: replaceFrom, to: cursorPos })
                            .insertContentAt(replaceFrom, `#${task.taskCode!} `)
                            .run();
                        }
                        setTaskRefQuery(null);
                        setTaskRefAnchor(null);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition ${
                        taskRefSuggestIdx === i
                          ? 'bg-indigo-500/10 text-[var(--text-primary)]'
                          : 'text-[var(--text-body)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <span className="font-mono text-indigo-400">#{task.taskCode}</span>
                      <span className="flex-1 truncate text-[var(--text-secondary)]">{task.title}</span>
                      <span className="shrink-0 text-[9px] text-[var(--text-faint)]">{task.project}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 z-10">
                {codeBlockAnchors.map((anchor, index) => (
                  <div
                    key={`code-lang-${index}`}
                    className={`pointer-events-auto absolute code-block-lang-select-wrap ${openCodeLangMenuIndex !== null && openCodeLangMenuIndex !== index ? 'opacity-0 pointer-events-none' : ''}`}
                    style={{ top: anchor.top + 4, left: anchor.left + 6 }}
                  >
                    {(() => {
                      const filteredLanguageOptions = CODE_LANGUAGE_OPTIONS.filter((option) => {
                        if (!codeLangSearch.trim()) return true;
                        const q = codeLangSearch.trim().toLowerCase();
                        return option.label.toLowerCase().includes(q) || option.value.toLowerCase().includes(q);
                      });

                      return (
                        <>
                    <button
                      type="button"
                      className="code-block-lang-select"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (editor) {
                          codeLangSelectionRef.current = {
                            from: editor.state.selection.from,
                            to: editor.state.selection.to,
                            scrollTop: editorPaneRef.current?.scrollTop ?? 0,
                          };
                        }
                        setOpenCodeLangMenuIndex((prev) => {
                          const next = prev === index ? null : index;
                          if (next === null) {
                            setCodeLangSearch('');
                            codeLangSelectionRef.current = null;
                          }
                          return next;
                        });
                      }}
                      title="Lenguaje del bloque de código"
                    >
                      <span>
                        {CODE_LANGUAGE_OPTIONS.find((option) => option.value === (codeBlockLanguages[index] || 'plaintext'))?.label || 'Texto'}
                      </span>
                      <ChevronDown size={11} className="opacity-70" />
                    </button>
                    {openCodeLangMenuIndex === index && (
                      <div className="code-block-lang-menu relative z-40">
                        <input
                          type="text"
                          value={codeLangSearch}
                          onChange={(e) => setCodeLangSearch(e.target.value)}
                          placeholder={tFn(language, 'notes', 'codeLangSearch')}
                          className="mb-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg-base)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-indigo-500/60"
                        />
                        <div className="code-block-lang-menu-list">
                          {filteredLanguageOptions.map((option) => {
                            const isActive = option.value === (codeBlockLanguages[index] || 'plaintext');
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleChangeCodeLanguage(index, option.value);
                                  setOpenCodeLangMenuIndex(null);
                                  setCodeLangSearch('');
                                  codeLangSelectionRef.current = null;
                                }}
                                className={`code-block-lang-menu-item ${isActive ? 'is-active' : ''}`}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                          {filteredLanguageOptions.length === 0 && (
                            <div className="px-2 py-1 text-[11px] text-[var(--text-hint)]">{tFn(language, 'notes', 'noCodeResults')}</div>
                          )}
                        </div>
                      </div>
                    )}
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>

              {/* ── Link preview card ── */}
              {linkPreview && (
                <LinkPreviewCard
                  id={linkPreview.id}
                  href={linkPreview.href}
                  isInternal={linkPreview.isInternal}
                  internalNote={linkPreview.internalNote}
                  externalMeta={linkPreview.externalMeta}
                  anchorPos={linkPreview.anchorPos}
                  containerRef={editorPaneRef}
                  language={language}
                  onClose={() => {
                    linkPreview.anchorEl.removeAttribute('aria-describedby');
                    setLinkPreview(null);
                  }}
                  onGoToNote={(noteId) => {
                    const note = useAppStore.getState().notes.find((n) => n.id === noteId);
                    if (note) { setSection('notes'); useAppStore.getState().setActiveNote(note); }
                    setLinkPreview(null);
                  }}
                  onEditNote={(noteId) => {
                    const note = useAppStore.getState().notes.find((n) => n.id === noteId);
                    if (note) { setSection('notes'); useAppStore.getState().setActiveNote(note); }
                    setLinkPreview(null);
                  }}
                  onOpenExternal={(href) => { fs.openUrl(href).catch(() => {}); setLinkPreview(null); }}
                  onCopyLink={(href) => { navigator.clipboard.writeText(href).catch(() => {}); setLinkPreview(null); }}
                  onEditUrl={(oldHref, newHref) => {
                    if (!editor || oldHref === newHref) { setLinkPreview(null); return; }
                    editor.chain().command(({ tr, state }) => {
                      const linkType = state.schema.marks['link'];
                      if (!linkType) return false;
                      const changes: Array<{ from: number; to: number; text: string; mark: Mark }> = [];
                      state.doc.descendants((node, pos) => {
                        if (!node.isText) return;
                        const mark = node.marks.find((m) => m.type === linkType && m.attrs.href === oldHref);
                        if (mark) changes.push({ from: pos, to: pos + node.nodeSize, text: node.text ?? '', mark });
                      });
                      for (let i = changes.length - 1; i >= 0; i--) {
                        const { from, to, text, mark } = changes[i];
                        const newMark = linkType.create({ ...mark.attrs, href: newHref });
                        if (text === oldHref) {
                          tr.replaceWith(from, to, state.schema.text(newHref, [newMark]));
                        } else {
                          tr.removeMark(from, to, linkType);
                          tr.addMark(from, to, newMark);
                        }
                      }
                      return changes.length > 0;
                    }).run();
                    setLinkPreview(null);
                  }}
                />
              )}
            </div>
          )}
          {/* Source — textarea con Markdown crudo */}
          {viewMode === 'source' && (
            <div className="flex-1 overflow-y-auto px-8 pb-8">
              <textarea
                ref={sourceTextareaRef}
                value={mdContent}
                onChange={(e) => {
                  userEditedMarkdownRef.current = true;
                  setMdContent(e.target.value);
                }}
                className="note-source-textarea w-full h-full min-h-[400px] resize-none bg-transparent font-mono text-sm text-[var(--text-secondary)] outline-none leading-relaxed placeholder-[var(--text-faint)]"
                placeholder={tFn(language, 'notes', 'sourcePlaceholder')}
                spellCheck={false}
              />
            </div>
          )}

          {/* Split — WYSIWYG izquierda, Markdown fuente derecha */}
          {viewMode === 'split' && (
            <div className="flex-1 overflow-y-auto px-8 pb-8">
              <div className="mb-2 text-[10px] text-[var(--text-faint)] uppercase tracking-wider">{tFn(language, 'notes', 'splitPreviewLabel')}</div>
              {mdContent.trim() ? (
                <MarkdownPreview
                  markdown={mdContent}
                  onChangeCodeLanguage={handleChangeCodeLanguage}
                  onEditMermaid={(index, code) => openDiagramEditor('edit', code, index)}
                  onMoveMermaidUp={(index) => handleMoveDiagram(index, 'up')}
                  onMoveMermaidDown={(index) => handleMoveDiagram(index, 'down')}
                  onDuplicateMermaid={handleDuplicateDiagram}
                  onDeleteMermaid={handleDeleteDiagram}
                />
              ) : (
                <div className="italic text-sm text-[var(--text-faint)]">{tFn(language, 'notes', 'splitNoContent')}</div>
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
