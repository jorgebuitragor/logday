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
import { TextSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import { DecorationSet, Decoration } from '@tiptap/pm/view';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
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
import { common, createLowlight } from 'lowlight';
import { gemoji } from 'gemoji';
import { useAppStore } from '../store/appStore';
import { Note } from '../types';
import { ExportModal } from './ExportModal';
import { MarkdownPreview } from './MarkdownPreview';
import { MermaidEditorModal } from './MermaidEditorModal';
import { MermaidBlock } from './MermaidBlock';
import { formatMermaidFence, parseMermaidBlocks } from '../lib/mermaid';
import { ImageLinkModal } from './ImageLinkModal';
import { CODE_LANGUAGE_OPTIONS, normalizeCodeLanguage } from '../lib/codeHighlight';
import { placeMenuNearAnchor } from '../lib/menuPosition';
import { t as tFn } from '../lib/i18n';
import { LinkPreviewCard } from './LinkPreviewCard';
import type { InternalNoteMeta, ExternalMetaState, AnchorPos } from './LinkPreviewCard';
import { fs, fetchUrlMetadata } from '../lib/invoke';

const lowlight = createLowlight(common);
const BLOCK_MENU_ESTIMATED_SIZE = { width: 220, height: 260 };
const GAP_LINK_CARD = 8; // px between anchor bottom and preview card top

// ── Task-code decoration plugin (display-only, no toca el markdown) ────────
const taskCodePluginKey = new PluginKey<DecorationSet>('taskCodeDecorations');
const TASK_CODE_RE = /#([A-Z0-9\-_]+)/gi;

function createTaskCodePlugin(tasksRef: React.MutableRefObject<import('../types').Task[]>): Plugin {
  return new Plugin({
    key: taskCodePluginKey,
    props: {
      decorations(state) {
        const tasksByCode = new Map(
          (tasksRef.current ?? [])
            .filter((t) => t.taskCode)
            .map((t) => [t.taskCode!.toUpperCase(), t])
        );
        if (tasksByCode.size === 0) return DecorationSet.empty;
        const decorations: Decoration[] = [];
        state.doc.descendants((node, pos) => {
          if (!node.isText || !node.text) return;
          TASK_CODE_RE.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = TASK_CODE_RE.exec(node.text)) !== null) {
            const code = match[1].toUpperCase();
            if (!tasksByCode.has(code)) continue;
            const from = pos + match.index;
            const to = from + match[0].length;
            decorations.push(
              Decoration.inline(from, to, {
                class: 'task-code-link',
                'data-task-code': code,
                title: tasksByCode.get(code)!.title,
              })
            );
          }
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

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

  const normalized = lines.join('\n');

  // Fuerza enlaces autolink (<https://...>) a formato explicito [url](url)
  // para mantener consistencia con la vista markdown solicitada.
  return normalized.replace(/<((?:https?:\/\/)[^\s<>]+)>/g, '[$1]($1)');
}

type EmojiOption = {
  emoji: string;
  nameEs: string;
  nameEn: string;
  keywords: string[];
};

const ES_TOKEN_MAP: Record<string, string[]> = {
  smile: ['sonrisa'],
  happy: ['feliz', 'alegre'],
  laugh: ['risa'],
  joy: ['alegria'],
  wink: ['guino'],
  heart: ['corazon', 'amor'],
  fire: ['fuego'],
  rocket: ['cohete', 'lanzamiento'],
  target: ['objetivo', 'meta'],
  pin: ['fijar'],
  note: ['nota'],
  memo: ['memo', 'nota'],
  warning: ['advertencia', 'alerta'],
  check: ['check', 'completo', 'listo'],
  cross: ['error', 'cerrar'],
  attachment: ['adjunto'],
  file: ['archivo'],
  idea: ['idea'],
  think: ['pensar'],
  thinking: ['pensando'],
  pray: ['rezar', 'gracias'],
  clap: ['aplauso'],
  cool: ['genial'],
  star: ['estrella'],
  sun: ['sol'],
  moon: ['luna'],
  party: ['fiesta'],
  celebration: ['celebracion'],
  bug: ['error', 'bug'],
  fix: ['arreglo'],
  lock: ['candado', 'seguridad'],
  key: ['llave'],
  money: ['dinero'],
  time: ['tiempo'],
  clock: ['reloj'],
  calendar: ['calendario'],
  phone: ['telefono'],
  email: ['correo'],
  work: ['trabajo'],
  task: ['tarea'],
};

const ES_CATEGORY_MAP: Record<string, string[]> = {
  smileys: ['caras', 'emociones'],
  emotion: ['emocion'],
  people: ['personas'],
  body: ['cuerpo'],
  animals: ['animales'],
  nature: ['naturaleza'],
  food: ['comida'],
  drink: ['bebida'],
  travel: ['viaje'],
  places: ['lugares'],
  activities: ['actividades'],
  objects: ['objetos'],
  symbols: ['simbolos'],
  flags: ['banderas'],
};

function tokenizeWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function buildSpanishName(nameEn: string): string {
  const words = tokenizeWords(nameEn);
  const translated = words.map((w) => ES_TOKEN_MAP[w]?.[0] || w);
  if (translated.length === 0) return 'Emoji';
  const sentence = translated.join(' ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function buildEmojiCatalog(): EmojiOption[] {
  const out: EmojiOption[] = [];
  const seenEmoji = new Set<string>();

  for (const item of gemoji) {
    if (!item?.emoji || seenEmoji.has(item.emoji)) continue;
    seenEmoji.add(item.emoji);

    const englishBaseName = (item.names?.[0] || item.description || 'emoji').replace(/_/g, ' ');
    const tokens = new Set<string>();

    for (const n of item.names || []) tokenizeWords(n).forEach((w) => tokens.add(w));
    for (const t of item.tags || []) tokenizeWords(t).forEach((w) => tokens.add(w));
    tokenizeWords(item.description || '').forEach((w) => tokens.add(w));
    tokenizeWords(item.category || '').forEach((w) => tokens.add(w));

    const esTokens = new Set<string>();
    for (const token of tokens) {
      (ES_TOKEN_MAP[token] || []).forEach((w) => esTokens.add(w));
      (ES_CATEGORY_MAP[token] || []).forEach((w) => esTokens.add(w));
    }

    out.push({
      emoji: item.emoji,
      nameEs: buildSpanishName(englishBaseName),
      nameEn: englishBaseName,
      keywords: Array.from(new Set([...tokens, ...esTokens])),
    });
  }

  return out;
}

const EMOJI_CATALOG: EmojiOption[] = buildEmojiCatalog();

function normalizeEmojiSearchTerm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

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

  // ── Link preview card ────────────────────────────────────────────────────
  interface LinkPreviewState {
    id: string;
    href: string;
    isInternal: boolean;
    internalNote: InternalNoteMeta | null;
    externalMeta: ExternalMetaState | null;
    anchorPos: AnchorPos;
    anchorEl: HTMLAnchorElement;
  }
  const [linkPreview, setLinkPreview] = useState<LinkPreviewState | null>(null);
  const externalMetaCacheRef = useRef<Map<string, ExternalMetaState>>(new Map());
  // ─────────────────────────────────────────────────────────────────────────

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
  const [mermaidPreviewAnchors, setMermaidPreviewAnchors] = useState<Array<{ top: number; left: number; width: number; height: number }>>([]);
  const [mermaidRenderedHeights, setMermaidRenderedHeights] = useState<number[]>([]);
  const [codeBlockAnchors, setCodeBlockAnchors] = useState<Array<{ top: number; left: number; height: number }>>([]);
  const [blockDropLineY, setBlockDropLineY] = useState<number | null>(null);
  const [blockDropFlashY, setBlockDropFlashY] = useState<number | null>(null);
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
  const tasksRef = useRef<import('../types').Task[]>(tasks);
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: false,
        codeBlock: false,
        heading: { levels: [1, 2, 3, 4, 5] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      CodeBlockLowlight.configure({
        lowlight,
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
        color: 'color-mix(in srgb, var(--accent) 55%, transparent)',
        width: 2,
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

  const recalcMermaidPreviewAnchors = useCallback(() => {
    if (viewMode === 'source') {
      setMermaidPreviewAnchors([]);
      return;
    }

    const pane = editorPaneRef.current;
    let root: HTMLElement | null = null;
    try {
      root = editor ? (editor.view.dom as HTMLElement) : null;
    } catch {
      // TipTap puede no tener la view montada aun al entrar a la pestaña.
      root = null;
    }
    if (!pane || !root) {
      setMermaidPreviewAnchors([]);
      return;
    }

    const paneRect = pane.getBoundingClientRect();
    const anchors = Array.from(root.querySelectorAll('pre'))
      .filter((pre) => pre.querySelector('code.language-mermaid'))
      .map((pre, index) => {
        const renderedCard = pane.querySelector<HTMLElement>(`[data-mermaid-card][data-mermaid-index="${index}"]`);
        const measuredCardHeight = renderedCard ? Math.ceil(renderedCard.getBoundingClientRect().height) : 0;
        const renderedHeight = Math.max((mermaidRenderedHeights[index] ?? 320) + 64, measuredCardHeight + 48);
        const placeholderHeight = Math.max(380, renderedHeight);
        const currentHeight = parseFloat(pre.style.height || '0');
        if (Math.abs(currentHeight - placeholderHeight) > 0.5) {
          pre.style.height = `${placeholderHeight}px`;
          pre.style.minHeight = `${placeholderHeight}px`;
        }
        const rect = pre.getBoundingClientRect();
        return {
          top: rect.top - paneRect.top + pane.scrollTop,
          left: rect.left - paneRect.left,
          width: rect.width,
          height: Math.max(rect.height, placeholderHeight),
        };
      });

    setMermaidPreviewAnchors((prev) => {
      if (
        prev.length === anchors.length &&
        prev.every(
          (a, i) =>
            Math.abs(a.top - anchors[i].top) < 0.5 &&
            Math.abs(a.left - anchors[i].left) < 0.5 &&
            Math.abs(a.width - anchors[i].width) < 0.5 &&
            Math.abs(a.height - anchors[i].height) < 0.5,
        )
      ) {
        return prev;
      }
      return anchors;
    });
  }, [editor, mermaidRenderedHeights, viewMode]);

  const applyMermaidPlaceholderHeight = useCallback((index: number, height: number) => {
    let root: HTMLElement | null = null;
    try {
      root = editor ? (editor.view.dom as HTMLElement) : null;
    } catch {
      root = null;
    }
    if (!root) return;

    const mermaidPres = Array.from(root.querySelectorAll('pre')).filter((pre) => pre.querySelector('code.language-mermaid'));
    const target = mermaidPres[index] as HTMLElement | undefined;
    if (!target) return;

    const placeholderHeight = Math.max(380, Math.ceil(height) + 48);
    target.style.height = `${placeholderHeight}px`;
    target.style.minHeight = `${placeholderHeight}px`;
  }, [editor]);

  useEffect(() => {
    setMermaidRenderedHeights((prev) => {
      if (prev.length <= mermaidBlocks.length) return prev;
      return prev.slice(0, mermaidBlocks.length);
    });
  }, [mermaidBlocks.length]);

  const recalcCodeBlockAnchors = useCallback(() => {
    if (viewMode === 'source') {
      setCodeBlockAnchors([]);
      return;
    }

    const pane = editorPaneRef.current;
    let root: HTMLElement | null = null;
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
    const raf = requestAnimationFrame(() => {
      recalcMermaidPreviewAnchors();
      recalcCodeBlockAnchors();
    });
    return () => cancelAnimationFrame(raf);
  }, [mermaidRenderedHeights, mermaidBlocks.length, recalcMermaidPreviewAnchors, recalcCodeBlockAnchors, viewMode]);

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
    if (event.button !== 0) return;
    if (!editor) return;
    const sourceIndexValue = dragHandleBlockIndex ?? hoverBlockIndexRef.current;
    if (sourceIndexValue == null) return;
    const sourceIndex = sourceIndexValue;
    if (sourceIndex < 0 || sourceIndex >= editor.state.doc.childCount) return;

    event.preventDefault();
    event.stopPropagation();
    setBlockContextMenu(null);
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
  }, [dragHandleBlockIndex, editor, getBlockAtCoords, topLevelPosAtIndex]);

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

    // Mientras el menu contextual de bloque este abierto, bloqueamos el drawer al bloque origen.
    if (blockContextMenu && blockIndex !== blockContextMenu.blockIndex) {
      return;
    }

    hoverBlockIndexRef.current = blockIndex;
    setDragHandleBlockIndex(blockIndex);

    const rect = blockEl.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const top = rect.top - paneRect.top + pane.scrollTop + Math.max(0, (rect.height - 18) / 2);
    const left = 6;
    setDragHandlePos({ top, left, visible: true });
  }, [blockContextMenu, editor, getBlockAtCoords]);

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
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const titleToSave = newTitle;
    const editorInstance = editor;
    saveTimeoutRef.current = setTimeout(() => {
      const freshNote = useAppStore.getState().activeNote;
      if (!freshNote || !editorInstance) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const currentMd = normalizeEditorMarkdown((editorInstance.storage as any).markdown.getMarkdown() as string);
        updateNote({ ...freshNote, title: titleToSave, content: currentMd });
      } catch { /* editor destroyed */ }
    }, 600);

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

  // ── Link preview — delegated listener helpers ──────────────────────────
  // Handler refs updated each render to avoid stale closures.
  const linkPreviewHandlerRef = useRef<{
    open: (anchor: HTMLAnchorElement) => void;
    close: () => void;
    navigateLink: (href: string, isInternal: boolean, internalNoteId?: string) => void;
  }>({
    open: () => {},
    close: () => {},
    navigateLink: () => {},
  });

  linkPreviewHandlerRef.current = {
    open(anchor: HTMLAnchorElement) {
      const href = anchor.getAttribute('href') ?? '';
      if (!href) return;

      const isInternal =
        !href.startsWith('http://') &&
        !href.startsWith('https://') &&
        !href.startsWith('//') &&
        !href.startsWith('mailto:') &&
        !href.startsWith('tel:') &&
        !href.startsWith('ftp:');

      // Resolve internal note
      let internalNote: InternalNoteMeta | null = null;
      if (isInternal) {
        const allNotes = useAppStore.getState().notes;
        const decoded = decodeURIComponent(href).toLowerCase();
        const found = allNotes.find(
          (n) =>
            n.id === href ||
            n.title.toLowerCase() === decoded ||
            n.title.toLowerCase() === href.toLowerCase()
        );
        if (found) {
          const plainBody = found.content
            .replace(/^#{1,6}\s+.*/gm, '')   // strip headings
            .replace(/[*_~`\[\]()]/g, ' ')   // strip most markdown symbols
            .replace(/\s+/g, ' ')
            .trim();
          internalNote = {
            id: found.id,
            title: found.title,
            updated: found.updated,
            preview: plainBody.slice(0, 120),
            tags: found.tags,
          };
        }
      }

      // Compute anchor position in scroll-container coordinates
      const pane = editorPaneRef.current;
      if (!pane) return;
      const paneRect = pane.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const anchorPos: AnchorPos = {
        top: anchorRect.bottom - paneRect.top + pane.scrollTop + GAP_LINK_CARD,
        linkTop: anchorRect.top - paneRect.top + pane.scrollTop,
        left: anchorRect.left - paneRect.left,
        right: anchorRect.right - paneRect.left,
      };

      const cardId = `lpc-${Date.now()}`;

      setLinkPreview({
        id: cardId,
        href,
        isInternal,
        internalNote,
        externalMeta: null,
        anchorPos,
        anchorEl: anchor,
      });

      // Add aria-describedby on the anchor
      anchor.setAttribute('aria-describedby', cardId);

      // Fetch external metadata lazily
      if (!isInternal) {
        const cached = externalMetaCacheRef.current.get(href);
        if (cached) {
          setLinkPreview((prev) => prev ? { ...prev, externalMeta: cached } : prev);
        } else {
          setLinkPreview((prev) => prev ? { ...prev, externalMeta: { status: 'loading' } } : prev);
          fetchUrlMetadata(href)
            .then((meta) => {
              const result: ExternalMetaState = {
                status: 'ok',
                title: meta.title,
                domain: meta.domain,
                description: meta.description,
              };
              externalMetaCacheRef.current.set(href, result);
              setLinkPreview((prev) =>
                prev?.href === href ? { ...prev, externalMeta: result } : prev
              );
            })
            .catch(() => {
              const result: ExternalMetaState = { status: 'error' };
              externalMetaCacheRef.current.set(href, result);
              setLinkPreview((prev) =>
                prev?.href === href ? { ...prev, externalMeta: result } : prev
              );
            });
        }
      }
    },

    close() {
      setLinkPreview((prev) => {
        if (prev) prev.anchorEl.removeAttribute('aria-describedby');
        return null;
      });
    },

    navigateLink(href: string, isInternal: boolean, internalNoteId?: string) {
      if (isInternal && internalNoteId) {
        const note = useAppStore.getState().notes.find((n) => n.id === internalNoteId);
        if (note) {
          setSection('notes');
          useAppStore.getState().setActiveNote(note);
        }
      } else if (!isInternal) {
        fs.openUrl(href).catch(() => {});
      }
    },
  };

  // Attach delegated listeners for link preview. Depends on activeNote?.id so the effect
  // re-runs when the pane first becomes available (the component returns early when there
  // is no active note, so editorPaneRef is null on initial mount).
  useEffect(() => {
    const pane = editorPaneRef.current;
    if (!pane) return;

    const getLinkAnchor = (target: EventTarget | null): HTMLAnchorElement | null => {
      if (!(target instanceof Element)) return null;
      return target.closest('a[href]') as HTMLAnchorElement | null;
    };

    const onClick = (e: MouseEvent) => {
      const anchor = getLinkAnchor(e.target);
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href) return;

      e.preventDefault();
      e.stopPropagation();

      // Ctrl / Cmd: navigate immediately
      if (e.ctrlKey || e.metaKey) {
        const isInternal =
          !href.startsWith('http') && !href.startsWith('//') &&
          !href.startsWith('mailto:') && !href.startsWith('tel:');
        const internalId = isInternal
          ? useAppStore.getState().notes.find(
              (n) => n.id === href || n.title.toLowerCase() === decodeURIComponent(href).toLowerCase()
            )?.id
          : undefined;
        linkPreviewHandlerRef.current.close();
        linkPreviewHandlerRef.current.navigateLink(href, isInternal, internalId);
        return;
      }

      // Plain click: show card
      linkPreviewHandlerRef.current.open(anchor);
    };

    // Touch: single tap shows card
    const onTouchEnd = (e: TouchEvent) => {
      const anchor = getLinkAnchor(e.target);
      if (!anchor) return;
      e.preventDefault();
      linkPreviewHandlerRef.current.open(anchor);
    };

    pane.addEventListener('click', onClick, true);
    pane.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      pane.removeEventListener('click', onClick, true);
      pane.removeEventListener('touchend', onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNote?.id]);

  // Close link preview on note change (card becomes stale)
  useEffect(() => {
    linkPreviewHandlerRef.current.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNote?.id]);

  // Close on container scroll (same pattern as block context menu)
  useEffect(() => {
    if (!linkPreview) return;
    const pane = editorPaneRef.current;
    if (!pane) return;
    const handler = () => linkPreviewHandlerRef.current.close();
    pane.addEventListener('scroll', handler);
    return () => pane.removeEventListener('scroll', handler);
  }, [linkPreview]);
  // ── end link preview ───────────────────────────────────────────────────

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
    if (skipNextContentSaveRef.current) {
      skipNextContentSaveRef.current = false;
      return;
    }
    schedulesSave({ content: mdContent });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mdContent]);

  // Suscripción directa al evento transaction del editor para refrescar el toolbar
  // de forma fiable (evita closures estales de useEditor config en TipTap 3)
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      forceUpdate();
      recalcMermaidPreviewAnchors();
      recalcCodeBlockAnchors();
    };
    editor.on('transaction', handler);
    return () => { editor.off('transaction', handler); };
  }, [editor, recalcMermaidPreviewAnchors, recalcCodeBlockAnchors]);

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
    recalcMermaidPreviewAnchors();
  }, [mermaidBlocks, recalcMermaidPreviewAnchors]);

  useEffect(() => {
    recalcCodeBlockAnchors();
  }, [mdContent, recalcCodeBlockAnchors]);

  useEffect(() => {
    if (viewMode === 'source') return;
    const pane = editorPaneRef.current;
    if (!pane) return;

    const onRelayout = () => {
      recalcMermaidPreviewAnchors();
      recalcCodeBlockAnchors();
    };
    pane.addEventListener('scroll', onRelayout);
    window.addEventListener('resize', onRelayout);
    requestAnimationFrame(onRelayout);

    return () => {
      pane.removeEventListener('scroll', onRelayout);
      window.removeEventListener('resize', onRelayout);
    };
  }, [viewMode, recalcMermaidPreviewAnchors, recalcCodeBlockAnchors]);

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
      {showDeleteConfirm && confirmDestructiveActions && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Trash2 size={15} className="text-red-400" />
              {tFn(language, 'notes', 'confirmDeleteTitle')}
            </div>
            <p className="mb-4 text-xs text-[var(--text-secondary)]">
              {tFn(language, 'notes', 'confirmDeleteMsg')} <span className="font-medium text-[var(--text-primary)]">"{activeNote.title || tFn(language, 'notes', 'untitled')}"</span>? {tFn(language, 'notes', 'confirmDeleteDesc')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
              >
                {tFn(language, 'notes', 'cancel')}
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); handleDelete(); }}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600"
              >
                {tFn(language, 'notes', 'delete')}
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
            onClick={() => {
              if (confirmDestructiveActions) setShowDeleteConfirm(true);
              else void handleDelete();
            }}
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
                {mermaidBlocks.map((block, index) => {
                  const anchor = mermaidPreviewAnchors[index];
                  if (!anchor) return null;
                  return (
                    <div
                      key={`${block.start}-${index}`}
                      className="pointer-events-auto absolute z-[25]"
                      style={{ top: anchor.top, left: anchor.left, width: anchor.width }}
                    >
                      <MermaidBlock
                        diagramIndex={index}
                        code={block.code}
                        compact
                        onHeightChange={(height) => {
                          applyMermaidPlaceholderHeight(index, height);
                          setMermaidRenderedHeights((prev) => {
                            if (prev[index] && Math.abs(prev[index] - height) < 1) return prev;
                            const next = [...prev];
                            next[index] = height;
                            return next;
                          });
                          requestAnimationFrame(() => {
                            recalcMermaidPreviewAnchors();
                            recalcCodeBlockAnchors();
                          });
                        }}
                        onEdit={() => openDiagramEditor('edit', block.code, index)}
                        onMoveUp={index > 0 ? () => handleMoveDiagram(index, 'up') : undefined}
                        onMoveDown={index < mermaidBlocks.length - 1 ? () => handleMoveDiagram(index, 'down') : undefined}
                        onDuplicate={() => handleDuplicateDiagram(index)}
                        onDelete={() => handleDeleteDiagram(index)}
                      />
                    </div>
                  );
                })}
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
                      const changes: Array<{ from: number; to: number; text: string; mark: any }> = [];
                      state.doc.descendants((node, pos) => {
                        if (!node.isText) return;
                        const mark = node.marks.find((m: any) => m.type === linkType && m.attrs.href === oldHref);
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
