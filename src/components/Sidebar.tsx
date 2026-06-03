import { useState, useRef, useEffect } from 'react';
import {
  CheckSquare,
  List,
  Layout,
  Calendar,
  Search,
  Plus,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  Settings,
  FileText,
  Notebook,
  CalendarDays,
  Pencil,
  Trash2,
  Share2,
  Timer,
  Tag,
  X,
  FolderPlus,
  Copy,
  Clipboard,
  CopyPlus,
  GripVertical,
  Scissors,
  FolderUp,
  FileDown,
  FileType2,
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { ViewMode } from '../types';
import { placeMenuAtPointer } from '../lib/menuPosition';
import { t, MONTHS_TITLE } from '../lib/i18n';
import { save } from '@tauri-apps/plugin-dialog';
import { fs } from '../lib/invoke';
import jsPDF from 'jspdf';
import logoImg from '../assets/logo.png';
import iconSquareNoBg from '../../icon_square_wiout_background.png';

function formatYearMonthLabel(ym: string, language: 'es' | 'en', style: 'short' | 'long'): string {
  const [year, month] = ym.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  const locale = language === 'es' ? 'es-CO' : 'en-US';
  if (style === 'short') {
    const monthName = new Intl.DateTimeFormat(locale, { month: 'long' }).format(date);
    const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    return `${capitalized} ${year}`;
  }
  return new Intl.DateTimeFormat(locale, { month: style, year: 'numeric' }).format(date);
}

const ESTIMATED_AREA_MENU = { width: 180, height: 110 };
const ESTIMATED_FOLDER_MENU = { width: 220, height: 360 };
const ESTIMATED_OVERTIME_MENU = { width: 200, height: 110 };
const ESTIMATED_PROJECT_MENU = { width: 210, height: 210 };
const ESTIMATED_VIEW_MENU = { width: 170, height: 90 };

type FolderCtxMenu = { folder: string; x: number; y: number } | null;
type ProjectCtxMenu = { project: string; x: number; y: number } | null;
type ViewCtxMenu = { view: ViewMode; x: number; y: number } | null;

// ── Utilidad árbol de carpetas ─────────────────────────────────
type FolderNode = { name: string; path: string; children: FolderNode[] };

function buildFolderTree(folders: string[]): FolderNode[] {
  const sorted = [...folders].sort();
  const root: FolderNode[] = [];
  for (const path of sorted) {
    const parts = path.split('/');
    let current = root;
    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      currentPath = i === 0 ? parts[0] : `${currentPath}/${parts[i]}`;
      let node = current.find(n => n.path === currentPath);
      if (!node) {
        node = { name: parts[i], path: currentPath, children: [] };
        current.push(node);
      }
      current = node.children;
    }
  }
  return root;
}

// ── Drag & drop con Pointer Events (funciona en WKWebView/Tauri) ──────────────
// Map de callbacks de highlight por path de carpeta
const _dropHighlight = new Map<string, (v: boolean) => void>();
// Callback de highlight para la zona raíz
let _rootZoneHighlight: ((v: boolean) => void) | null = null;

function startFolderDrag(
  draggedPath: string,
  onDrop: (targetPath: string) => void,
) {
  document.body.style.cursor = 'grabbing';

  const onMove = (e: PointerEvent) => {
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    // Encontrar la carpeta bajo el cursor (si hay alguna)
    let folderUnderCursor: string | null = null;
    for (const el of els) {
      const found = (el as HTMLElement).closest?.('[data-folder-path]');
      if (found) { folderUnderCursor = found.getAttribute('data-folder-path'); break; }
    }
    // Actualizar highlight de carpetas
    _dropHighlight.forEach((cb, path) => {
      const valid = path !== draggedPath && !path.startsWith(draggedPath + '/');
      cb(valid && folderUnderCursor === path);
    });
    // Actualizar línea guía de zona raíz
    const overRoot = folderUnderCursor === null &&
      els.some(el => (el as HTMLElement).closest?.('[data-root-zone]') != null);
    _rootZoneHighlight?.(overRoot);
  };

  const onUp = (e: PointerEvent) => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.body.style.cursor = '';
    _dropHighlight.forEach(cb => cb(false));
    _rootZoneHighlight?.(false);

    // Encontrar la carpeta destino bajo el cursor
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    let target: string | null = null;
    for (const el of els) {
      const found = (el as HTMLElement).closest?.('[data-folder-path]');
      if (found) { target = found.getAttribute('data-folder-path'); break; }
    }
    if (target && target !== draggedPath && !target.startsWith(draggedPath + '/')) {
      onDrop(target);
    } else if (!target && els.some(el => (el as HTMLElement).closest?.('[data-root-zone]') != null)) {
      // Soltar en zona raíz → mover a nivel raíz
      onDrop('');
    }
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

// Línea visual que indica que la carpeta se soltará en el nivel raíz
function RootDropLine() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    _rootZoneHighlight = setActive;
    return () => { if (_rootZoneHighlight === setActive) _rootZoneHighlight = null; };
  }, []);
  return (
    <div className={`mx-2 mt-1 h-0.5 rounded-full transition-colors duration-100 ${
      active ? 'bg-indigo-500' : 'bg-transparent'
    }`} />
  );
}

// ── Componente árbol de carpetas ──────────────────────────────
interface FolderTreeItemProps {
  node: FolderNode;
  depth: number;
  activeNoteFolder: string | null;
  renamingFolder: string | null;
  renameValue: string;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  setRenameValue: (v: string) => void;
  setRenamingFolder: (f: string | null) => void;
  handleRenameConfirm: () => void;
  handleFolderContextMenu: (e: React.MouseEvent, folder: string) => void;
  selectNoteFolder: (f: string | null) => void;
  folderTags: Record<string, string[]>;
  expandedFolders: Set<string>;
  setExpandedFolders: React.Dispatch<React.SetStateAction<Set<string>>>;
  moveNoteFolder: (folder: string, targetParent: string) => Promise<void>;
}

function FolderTreeItem({
  node, depth, activeNoteFolder, renamingFolder, renameValue, renameInputRef,
  setRenameValue, setRenamingFolder, handleRenameConfirm, handleFolderContextMenu,
  selectNoteFolder, folderTags, expandedFolders, setExpandedFolders, moveNoteFolder,
}: FolderTreeItemProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedFolders.has(node.path);
  const isActive = activeNoteFolder === node.path;
  const tags = folderTags[node.path] ?? [];
  const indent = depth * 12;
  const [isDragOver, setIsDragOver] = useState(false);

  // Registrar callback de highlight para este nodo
  useEffect(() => {
    _dropHighlight.set(node.path, setIsDragOver);
    return () => { _dropHighlight.delete(node.path); };
  }, [node.path]);

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(node.path)) next.delete(node.path);
      else next.add(node.path);
      return next;
    });
  };

  const handleGripPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startFolderDrag(node.path, async (target) => {
      // Solo expandir si hay un target real (no raíz vacía)
      if (target) setExpandedFolders(prev => new Set([...prev, target]));
      await moveNoteFolder(node.path, target);
    });
  };

  return (
    <div data-folder-item>
      <div
        data-folder-path={node.path}
        className={`group flex items-center gap-1 rounded-lg transition ${
          isDragOver
            ? 'ring-1 ring-indigo-500/60 bg-indigo-500/10'
            : isActive
              ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
              : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
        }`}
        style={{ paddingLeft: `${8 + indent}px`, paddingRight: '8px' }}
      >
        {/* Grip handle — Pointer Events, funciona en WKWebView */}
        <div
          onPointerDown={handleGripPointerDown}
          className="flex shrink-0 cursor-grab items-center justify-center w-3 opacity-0 group-hover:opacity-30 hover:!opacity-70 transition-opacity select-none"
          title={t(useAppStore.getState().language, 'sidebar', 'dragFolder')}
        >
          <GripVertical size={11} />
        </div>

        {/* expand/collapse toggle */}
        <button
          onClick={hasChildren ? toggleExpand : undefined}
          className={`flex shrink-0 items-center justify-center w-4 h-4 rounded transition ${hasChildren ? 'hover:bg-[var(--bg-surface)]' : ''}`}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />
          ) : (
            <span className="w-4" />
          )}
        </button>

        {renamingFolder === node.path ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameConfirm();
              if (e.key === 'Escape') setRenamingFolder(null);
            }}
            onBlur={handleRenameConfirm}
            className="flex-1 rounded border border-indigo-500/40 bg-[var(--bg-surface)] px-1 py-0.5 text-xs text-[var(--text-primary)] outline-none"
          />
        ) : (
          <button
            onClick={() => selectNoteFolder(node.path)}
            onContextMenu={(e) => handleFolderContextMenu(e, node.path)}
            className="flex flex-1 min-w-0 flex-col py-2 text-left"
          >
            <div className="flex items-center gap-1.5">
              <FolderOpen size={13} className="shrink-0" />
              <span className="truncate text-xs">{node.name}</span>
            </div>
            {tags.length > 0 && (
              <div className="mt-0.5 ml-[18px] flex flex-wrap gap-1">
                {tags.map(tag => (
                  <span key={tag} className="rounded px-1 py-0.5 text-[9px] bg-indigo-500/10 text-indigo-400 leading-none">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map(child => (
            <FolderTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              activeNoteFolder={activeNoteFolder}
              renamingFolder={renamingFolder}
              renameValue={renameValue}
              renameInputRef={renameInputRef}
              setRenameValue={setRenameValue}
              setRenamingFolder={setRenamingFolder}
              handleRenameConfirm={handleRenameConfirm}
              handleFolderContextMenu={handleFolderContextMenu}
              selectNoteFolder={selectNoteFolder}
              folderTags={folderTags}
              expandedFolders={expandedFolders}
              setExpandedFolders={setExpandedFolders}
              moveNoteFolder={moveNoteFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ProjectTreeItemProps {
  node: FolderNode;
  depth: number;
  activeProject: string | null;
  renamingProject: string | null;
  projectRenameValue: string;
  projectRenameInputRef: React.RefObject<HTMLInputElement | null>;
  setProjectRenameValue: (v: string) => void;
  setRenamingProject: (f: string | null) => void;
  handleProjectRenameConfirm: () => void;
  handleProjectContextMenu: (e: React.MouseEvent, project: string) => void;
  selectProject: (p: string | null) => void;
  expandedProjects: Set<string>;
  setExpandedProjects: React.Dispatch<React.SetStateAction<Set<string>>>;
  moveProject: (project: string, targetParent: string) => Promise<void>;
}

function ProjectTreeItem({
  node,
  depth,
  activeProject,
  renamingProject,
  projectRenameValue,
  projectRenameInputRef,
  setProjectRenameValue,
  setRenamingProject,
  handleProjectRenameConfirm,
  handleProjectContextMenu,
  selectProject,
  expandedProjects,
  setExpandedProjects,
  moveProject,
}: ProjectTreeItemProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedProjects.has(node.path);
  const isActive = activeProject === node.path;
  const indent = depth * 12;
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    _dropHighlight.set(node.path, setIsDragOver);
    return () => { _dropHighlight.delete(node.path); };
  }, [node.path]);

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(node.path)) next.delete(node.path);
      else next.add(node.path);
      return next;
    });
  };

  const handleGripPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startFolderDrag(node.path, async (target) => {
      if (target) setExpandedProjects((prev) => new Set([...prev, target]));
      await moveProject(node.path, target);
    });
  };

  return (
    <div data-folder-item>
      <div
        data-folder-path={node.path}
        className={`group flex items-center gap-1 rounded-lg transition ${
          isDragOver
            ? 'ring-1 ring-indigo-500/60 bg-indigo-500/10'
            : isActive
              ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
              : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
        }`}
        style={{ paddingLeft: `${8 + indent}px`, paddingRight: '8px' }}
      >
        <div
          onPointerDown={handleGripPointerDown}
          className="flex shrink-0 cursor-grab items-center justify-center w-3 opacity-0 group-hover:opacity-30 hover:!opacity-70 transition-opacity select-none"
          title={t(useAppStore.getState().language, 'sidebar', 'dragFolder')}
        >
          <GripVertical size={11} />
        </div>

        <button
          onClick={hasChildren ? toggleExpand : undefined}
          className={`flex shrink-0 items-center justify-center w-4 h-4 rounded transition ${hasChildren ? 'hover:bg-[var(--bg-surface)]' : ''}`}
        >
          {hasChildren ? (isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />) : <span className="w-4" />}
        </button>

        {renamingProject === node.path ? (
          <input
            ref={projectRenameInputRef}
            value={projectRenameValue}
            onChange={(e) => setProjectRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleProjectRenameConfirm();
              if (e.key === 'Escape') setRenamingProject(null);
            }}
            onBlur={handleProjectRenameConfirm}
            className="flex-1 rounded border border-indigo-500/40 bg-[var(--bg-surface)] px-1 py-0.5 text-xs text-[var(--text-primary)] outline-none"
          />
        ) : (
          <button
            onClick={() => selectProject(node.path)}
            onContextMenu={(e) => handleProjectContextMenu(e, node.path)}
            className="flex flex-1 min-w-0 items-center gap-1.5 py-2 text-left"
          >
            <FolderOpen size={13} className="shrink-0" />
            <span className="truncate text-xs">{node.name}</span>
          </button>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <ProjectTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              activeProject={activeProject}
              renamingProject={renamingProject}
              projectRenameValue={projectRenameValue}
              projectRenameInputRef={projectRenameInputRef}
              setProjectRenameValue={setProjectRenameValue}
              setRenamingProject={setRenamingProject}
              handleProjectRenameConfirm={handleProjectRenameConfirm}
              handleProjectContextMenu={handleProjectContextMenu}
              selectProject={selectProject}
              expandedProjects={expandedProjects}
              setExpandedProjects={setExpandedProjects}
              moveProject={moveProject}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const {
    projects,
    activeProject,
    currentView,
    isSidebarCollapsed,
    basePath,
    activeSection,
    noteFolders,
    activeNoteFolder,
    folderTags,
    dailyMonths,
    activeDailyMonth,
    selectProject,
    createProject,
    renameProject,
    deleteProject,
    moveProject,
    setView,
    toggleSearch,
    toggleSidebar,
    toggleSettings,
    setSection,
    selectNoteFolder,
    createNoteFolder,
    renameNoteFolder,
    deleteNoteFolder,
    setFolderTags,
    moveNoteFolder,
    duplicateNoteFolder,
    setActiveDailyMonth,
    createTodayDaily,
    deleteDailyMonth,
    loadDailyMonth,
    showToast,
    overtimeMonths,
    overtimeMonth,
    loadOvertimeMonth,
    deleteOvertimeMonth,
    language,
    confirmDestructiveActions,
  } = useAppStore();

  const [isProjectsOpen, setIsProjectsOpen] = useState(true);
  const [isFoldersOpen, setIsFoldersOpen] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const newProjectInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showNewProject) setTimeout(() => newProjectInputRef.current?.focus(), 50);
  }, [showNewProject]);

  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const createFolderInputRef = useRef<HTMLInputElement>(null);

  // Modal crear proyecto
  const [newProjectName, setNewProjectName] = useState('');
  const [projectSubfolderParent, setProjectSubfolderParent] = useState<string | null>(null);
  const [newProjectSubfolderName, setNewProjectSubfolderName] = useState('');
  const projectSubfolderInputRef = useRef<HTMLInputElement>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const [projectCtx, setProjectCtx] = useState<ProjectCtxMenu>(null);
  const [projectCtxPos, setProjectCtxPos] = useState<{ x: number; y: number } | null>(null);
  const [projectCtxReady, setProjectCtxReady] = useState(false);
  const projectCtxRef = useRef<HTMLDivElement>(null);
  const [renamingProject, setRenamingProject] = useState<string | null>(null);
  const [projectRenameValue, setProjectRenameValue] = useState('');
  const projectRenameInputRef = useRef<HTMLInputElement>(null);

  const [projectAreaCtx, setProjectAreaCtx] = useState<{ x: number; y: number } | null>(null);
  const [projectAreaCtxPos, setProjectAreaCtxPos] = useState<{ x: number; y: number } | null>(null);
  const [projectAreaCtxReady, setProjectAreaCtxReady] = useState(false);
  const projectAreaCtxRef = useRef<HTMLDivElement>(null);

  const [viewCtx, setViewCtx] = useState<ViewCtxMenu>(null);
  const [viewCtxPos, setViewCtxPos] = useState<{ x: number; y: number } | null>(null);
  const [viewCtxReady, setViewCtxReady] = useState(false);
  const viewCtxRef = useRef<HTMLDivElement>(null);

  // Modal renombrar carpeta
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Menú contextual en carpetas
  const [folderCtx, setFolderCtx] = useState<FolderCtxMenu>(null);
  const [folderCtxPos, setFolderCtxPos] = useState<{ x: number; y: number } | null>(null);
  const [folderCtxReady, setFolderCtxReady] = useState(false);
  const folderCtxRef = useRef<HTMLDivElement>(null);

  // Modal nueva subcarpeta
  const [subfolderParent, setSubfolderParent] = useState<string | null>(null);
  const [newSubfolderName, setNewSubfolderName] = useState('');
  const subfolderInputRef = useRef<HTMLInputElement>(null);

  // Tags de carpeta
  const [editingTagsFolder, setEditingTagsFolder] = useState<string | null>(null);
  const [folderTagInput, setFolderTagInput] = useState('');
  const folderTagInputRef = useRef<HTMLInputElement>(null);

  // Expandidos en árbol de carpetas
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  // Carpeta copiada/cortada para pegar
  const [copiedFolder, setCopiedFolder] = useState<string | null>(null);
  const [cuttedFolder, setCuttedFolder] = useState<string | null>(null);
  // Ctx menú de área libre de carpetas
  type AreaCtxMenu = { x: number; y: number } | null;
  const [areaCtx, setAreaCtx] = useState<AreaCtxMenu>(null);
  const [areaCtxPos, setAreaCtxPos] = useState<{ x: number; y: number } | null>(null);
  const [areaCtxReady, setAreaCtxReady] = useState(false);
  const areaCtxRef = useRef<HTMLDivElement>(null);

  // Menú contextual de mes en Dailys
  const [dailyMonthCtx, setDailyMonthCtx] = useState<{ ym: string; x: number; y: number } | null>(null);
  const [dailyMonthCtxPos, setDailyMonthCtxPos] = useState<{ x: number; y: number } | null>(null);
  const [dailyMonthCtxReady, setDailyMonthCtxReady] = useState(false);
  const dailyMonthCtxRef = useRef<HTMLDivElement>(null);
  const [confirmDeleteDailyMonth, setConfirmDeleteDailyMonth] = useState<string | null>(null);
  const [exportingDailyMonth, setExportingDailyMonth] = useState(false);

  const handleExportDailyMonth = async (ym: string, format: 'pdf' | 'md' | 'txt') => {
    setDailyMonthCtx(null); setDailyMonthCtxPos(null); setDailyMonthCtxReady(false);
    setExportingDailyMonth(true);
    try {
      // Asegurar que las entradas del mes estén cargadas
      await loadDailyMonth(ym);
      const [yearStr, monthStr] = ym.split('-');
      const label = `${MONTHS_TITLE[language][parseInt(monthStr) - 1]}-${yearStr}`;
      // Leer del estado del store tras la carga
      const freshEntries = useAppStore.getState().dailyEntries;
      const entries = Object.entries(freshEntries)
        .filter(([d]) => d.startsWith(ym))
        .sort(([a], [b]) => a.localeCompare(b));

      if (format === 'pdf') {
        const path = await save({
          defaultPath: `dailys-${ym}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });
        if (!path) return;
        const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
        const margin = 15;
        const pageWidth = pdf.internal.pageSize.getWidth();
        const maxWidth = pageWidth - margin * 2;
        let y = margin;
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16);
        pdf.text(label, margin, y); y += 10;
        for (const [date, content] of entries) {
          if (y > 270) { pdf.addPage(); y = margin; }
          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
          pdf.text(date, margin, y); y += 6;
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
          const lines = content.split('\n').filter((l) => l.trim());
          for (const line of lines) {
            const wrapped = pdf.splitTextToSize(line, maxWidth);
            if (y + wrapped.length * 4.5 > 280) { pdf.addPage(); y = margin; }
            pdf.text(wrapped, margin, y); y += wrapped.length * 4.5;
          }
          y += 5;
        }
        const base64 = pdf.output('datauristring').split(',')[1];
        await fs.writeBinary(path, base64);
      } else {
        const path = await save({
          defaultPath: `dailys-${ym}.${format}`,
          filters: [{ name: format === 'md' ? 'Markdown' : 'Plain text', extensions: [format] }],
        });
        if (!path) return;
        const ismd = format === 'md';
        const header = ismd ? `# ${label}\n\n` : `${label}\n${'='.repeat(label.length)}\n\n`;
        const body = entries
          .map(([date, content]) =>
            ismd ? `## ${date}\n\n${content}` : `${date}\n${'-'.repeat(date.length)}\n${content}`
          )
          .join('\n\n---\n\n');
        await fs.writeFile(path, header + body + '\n');
      }
      showToast({ kind: 'success', title: t(language, 'toast', 'dailyExported'), description: `${label}.${format}` });
    } finally {
      setExportingDailyMonth(false);
    }
  };

  useEffect(() => {
    if (!dailyMonthCtx) return;
    const handler = (e: MouseEvent) => {
      if (!dailyMonthCtxRef.current?.contains(e.target as Node)) {
        setDailyMonthCtx(null);
        setDailyMonthCtxPos(null);
        setDailyMonthCtxReady(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dailyMonthCtx]);

  // Menú contextual de mes en Extras
  const [overtimeMonthCtx, setOvertimeMonthCtx] = useState<{ ym: string; x: number; y: number } | null>(null);
  const [overtimeMonthCtxPos, setOvertimeMonthCtxPos] = useState<{ x: number; y: number } | null>(null);
  const [overtimeMonthCtxReady, setOvertimeMonthCtxReady] = useState(false);
  const overtimeMonthCtxRef = useRef<HTMLDivElement>(null);
  const [confirmDeleteOvertimeMonth, setConfirmDeleteOvertimeMonth] = useState<string | null>(null);

  useEffect(() => {
    if (!overtimeMonthCtx) return;
    const handler = (e: MouseEvent) => {
      if (!overtimeMonthCtxRef.current?.contains(e.target as Node)) {
        setOvertimeMonthCtx(null);
        setOvertimeMonthCtxPos(null);
        setOvertimeMonthCtxReady(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overtimeMonthCtx]);

  useEffect(() => {
    if (!folderCtx || !folderCtxRef.current) return;

    const recalc = () => {
      if (!folderCtx || !folderCtxRef.current) return;
      const rect = folderCtxRef.current.getBoundingClientRect();
      setFolderCtxPos(
        placeMenuAtPointer(
          { x: folderCtx.x, y: folderCtx.y },
          { width: rect.width, height: rect.height },
          { padding: 8 },
        ),
      );
      setFolderCtxReady(true);
    };

    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [folderCtx]);

  useEffect(() => {
    if (!areaCtx || !areaCtxRef.current) return;

    const recalc = () => {
      if (!areaCtx || !areaCtxRef.current) return;
      const rect = areaCtxRef.current.getBoundingClientRect();
      setAreaCtxPos(
        placeMenuAtPointer(
          { x: areaCtx.x, y: areaCtx.y },
          { width: rect.width, height: rect.height },
          { padding: 8 },
        ),
      );
      setAreaCtxReady(true);
    };

    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [areaCtx]);

  useEffect(() => {
    if (!dailyMonthCtx || !dailyMonthCtxRef.current) return;
    const recalc = () => {
      if (!dailyMonthCtx || !dailyMonthCtxRef.current) return;
      const rect = dailyMonthCtxRef.current.getBoundingClientRect();
      setDailyMonthCtxPos(
        placeMenuAtPointer(
          { x: dailyMonthCtx.x, y: dailyMonthCtx.y },
          { width: rect.width, height: rect.height },
          { padding: 8 },
        ),
      );
      setDailyMonthCtxReady(true);
    };
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [dailyMonthCtx]);

  useEffect(() => {
    if (!overtimeMonthCtx || !overtimeMonthCtxRef.current) return;

    const recalc = () => {
      if (!overtimeMonthCtx || !overtimeMonthCtxRef.current) return;
      const rect = overtimeMonthCtxRef.current.getBoundingClientRect();
      setOvertimeMonthCtxPos(
        placeMenuAtPointer(
          { x: overtimeMonthCtx.x, y: overtimeMonthCtx.y },
          { width: rect.width, height: rect.height },
          { padding: 8 },
        ),
      );
      setOvertimeMonthCtxReady(true);
    };

    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [overtimeMonthCtx]);

  useEffect(() => {
    if (!projectCtx || !projectCtxRef.current) return;

    const recalc = () => {
      if (!projectCtx || !projectCtxRef.current) return;
      const rect = projectCtxRef.current.getBoundingClientRect();
      setProjectCtxPos(
        placeMenuAtPointer(
          { x: projectCtx.x, y: projectCtx.y },
          { width: rect.width, height: rect.height },
          { padding: 8 },
        ),
      );
      setProjectCtxReady(true);
    };

    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [projectCtx]);

  useEffect(() => {
    if (!projectAreaCtx || !projectAreaCtxRef.current) return;

    const recalc = () => {
      if (!projectAreaCtx || !projectAreaCtxRef.current) return;
      const rect = projectAreaCtxRef.current.getBoundingClientRect();
      setProjectAreaCtxPos(
        placeMenuAtPointer(
          { x: projectAreaCtx.x, y: projectAreaCtx.y },
          { width: rect.width, height: rect.height },
          { padding: 8 },
        ),
      );
      setProjectAreaCtxReady(true);
    };

    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [projectAreaCtx]);

  useEffect(() => {
    if (!viewCtx || !viewCtxRef.current) return;

    const recalc = () => {
      if (!viewCtx || !viewCtxRef.current) return;
      const rect = viewCtxRef.current.getBoundingClientRect();
      setViewCtxPos(
        placeMenuAtPointer(
          { x: viewCtx.x, y: viewCtx.y },
          { width: rect.width, height: rect.height },
          { padding: 8 },
        ),
      );
      setViewCtxReady(true);
    };

    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [viewCtx]);

  useEffect(() => {
    if (showCreateFolderModal) setTimeout(() => createFolderInputRef.current?.focus(), 50);
  }, [showCreateFolderModal]);

  useEffect(() => {
    if (projectSubfolderParent !== null) setTimeout(() => projectSubfolderInputRef.current?.focus(), 50);
  }, [projectSubfolderParent]);

  useEffect(() => {
    if (subfolderParent !== null) setTimeout(() => subfolderInputRef.current?.focus(), 50);
  }, [subfolderParent]);

  useEffect(() => {
    if (editingTagsFolder !== null) setTimeout(() => folderTagInputRef.current?.focus(), 50);
  }, [editingTagsFolder]);

  useEffect(() => {
    if (renamingFolder !== null) setTimeout(() => renameInputRef.current?.focus(), 50);
  }, [renamingFolder]);

  useEffect(() => {
    if (renamingProject !== null) setTimeout(() => projectRenameInputRef.current?.focus(), 50);
  }, [renamingProject]);

  // Cerrar ctx menú de carpeta al click fuera
  useEffect(() => {
    if (!folderCtx) return;
    const handler = (e: MouseEvent) => {
      if (folderCtxRef.current && !folderCtxRef.current.contains(e.target as Node)) {
        setFolderCtx(null);
        setFolderCtxPos(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [folderCtx]);

  useEffect(() => {
    if (!projectCtx) return;
    const handler = (e: MouseEvent) => {
      if (projectCtxRef.current && !projectCtxRef.current.contains(e.target as Node)) {
        setProjectCtx(null);
        setProjectCtxPos(null);
        setProjectCtxReady(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [projectCtx]);

  useEffect(() => {
    if (!projectAreaCtx) return;
    const handler = (e: MouseEvent) => {
      if (projectAreaCtxRef.current && !projectAreaCtxRef.current.contains(e.target as Node)) {
        setProjectAreaCtx(null);
        setProjectAreaCtxPos(null);
        setProjectAreaCtxReady(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [projectAreaCtx]);

  useEffect(() => {
    if (!viewCtx) return;
    const handler = (e: MouseEvent) => {
      if (viewCtxRef.current && !viewCtxRef.current.contains(e.target as Node)) {
        setViewCtx(null);
        setViewCtxPos(null);
        setViewCtxReady(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [viewCtx]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    await createProject(newProjectName.trim());
    setNewProjectName('');
    setShowNewProject(false);
  };

  const handleCreateProjectSubfolder = async () => {
    if (!newProjectSubfolderName.trim() || projectSubfolderParent === null) return;
    await createProject(newProjectSubfolderName.trim(), projectSubfolderParent);
    setExpandedProjects((prev) => new Set([...prev, projectSubfolderParent]));
    setNewProjectSubfolderName('');
    setProjectSubfolderParent(null);
  };

  const handleProjectContextMenu = (e: React.MouseEvent, project: string) => {
    e.preventDefault();
    e.stopPropagation();
    setProjectCtxReady(false);
    setProjectCtxPos(
      placeMenuAtPointer(
        { x: e.clientX, y: e.clientY },
        ESTIMATED_PROJECT_MENU,
        { padding: 8 },
      ),
    );
    setProjectCtx({ project, x: e.clientX, y: e.clientY });
  };

  const handleProjectStartRename = () => {
    if (!projectCtx) return;
    const leaf = projectCtx.project.split('/').pop() ?? projectCtx.project;
    setProjectRenameValue(leaf);
    setRenamingProject(projectCtx.project);
    setProjectCtx(null);
  };

  const handleProjectRenameConfirm = async () => {
    if (!renamingProject || !projectRenameValue.trim()) {
      setRenamingProject(null);
      return;
    }
    const leaf = renamingProject.split('/').pop() ?? renamingProject;
    if (projectRenameValue.trim() === leaf) {
      setRenamingProject(null);
      return;
    }
    await renameProject(renamingProject, projectRenameValue.trim());
    setRenamingProject(null);
  };

  const handleProjectDelete = async () => {
    if (!projectCtx) return;
    const project = projectCtx.project;
    setProjectCtx(null);
    await deleteProject(project);
  };

  const handleProjectNewSubfolder = () => {
    if (!projectCtx) return;
    setProjectSubfolderParent(projectCtx.project);
    setProjectCtx(null);
  };

  const handleProjectPromote = async () => {
    if (!projectCtx) return;
    const project = projectCtx.project;
    setProjectCtx(null);
    const parts = project.split('/');
    const grandParent = parts.length > 2 ? parts.slice(0, -2).join('/') : '';
    await moveProject(project, grandParent);
  };

  const handleViewContextMenu = (e: React.MouseEvent, view: ViewMode) => {
    e.preventDefault();
    e.stopPropagation();
    setViewCtxReady(false);
    setViewCtxPos(
      placeMenuAtPointer(
        { x: e.clientX, y: e.clientY },
        ESTIMATED_VIEW_MENU,
        { padding: 8 },
      ),
    );
    setViewCtx({ view, x: e.clientX, y: e.clientY });
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createNoteFolder(newFolderName.trim());
    setNewFolderName('');
    setShowCreateFolderModal(false);
  };

  const handleCreateSubfolder = async () => {
    if (!newSubfolderName.trim() || subfolderParent === null) return;
    await createNoteFolder(newSubfolderName.trim(), subfolderParent);
    // auto-expand parent
    setExpandedFolders(prev => new Set([...prev, subfolderParent]));
    setNewSubfolderName('');
    setSubfolderParent(null);
  };

  const handleAddFolderTag = () => {
    if (!editingTagsFolder || !folderTagInput.trim()) return;
    const tag = folderTagInput.trim().toLowerCase().replace(/\s+/g, '-');
    const current = folderTags[editingTagsFolder] ?? [];
    if (!current.includes(tag)) setFolderTags(editingTagsFolder, [...current, tag]);
    setFolderTagInput('');
  };

  const handleRemoveFolderTag = (folder: string, tag: string) => {
    const current = folderTags[folder] ?? [];
    setFolderTags(folder, current.filter(t => t !== tag));
  };

  const handleFolderContextMenu = (e: React.MouseEvent, folder: string) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderCtxReady(false);
    setFolderCtxPos(
      placeMenuAtPointer(
        { x: e.clientX, y: e.clientY },
        ESTIMATED_FOLDER_MENU,
        { padding: 8 },
      ),
    );
    setFolderCtx({ folder, x: e.clientX, y: e.clientY });
  };

  const handleStartRename = () => {
    if (!folderCtx) return;
    setRenameValue(folderCtx.folder);
    setRenamingFolder(folderCtx.folder);
    setFolderCtx(null);
  };

  const handleNewSubfolder = () => {
    if (!folderCtx) return;
    setSubfolderParent(folderCtx.folder);
    setFolderCtx(null);
  };

  const handleEditFolderTags = () => {
    if (!folderCtx) return;
    setEditingTagsFolder(folderCtx.folder);
    setFolderTagInput('');
    setFolderCtx(null);
  };

  const handlePromoteFolder = async () => {
    if (!folderCtx) return;
    const folder = folderCtx.folder;
    setFolderCtx(null);
    const parts = folder.split('/');
    // grandParent: vacío si el padre es raíz (depth 1), abuelo si depth > 1
    const grandParent = parts.length > 2 ? parts.slice(0, -2).join('/') : '';
    await moveNoteFolder(folder, grandParent);
  };

  const handleRenameConfirm = async () => {
    if (!renamingFolder || !renameValue.trim() || renameValue.trim() === renamingFolder) {
      setRenamingFolder(null);
      return;
    }
    await renameNoteFolder(renamingFolder, renameValue.trim());
    setRenamingFolder(null);
  };

  const handleDeleteFolder = async () => {
    if (!folderCtx) return;
    const folder = folderCtx.folder;
    setFolderCtx(null);
    await deleteNoteFolder(folder);
  };

  const handleShareFolder = () => {
    if (!folderCtx || !basePath) return;
    const path = `${basePath}/notes/${folderCtx.folder}`;
    setFolderCtx(null);
    import('../lib/invoke').then(({ fs }) => fs.openInSystem(path));
  };

  const handleCopyFolder = () => {
    if (!folderCtx) return;
    setCopiedFolder(folderCtx.folder);
    setCuttedFolder(null);
    setFolderCtx(null);
  };

  const handleCutFolder = () => {
    if (!folderCtx) return;
    setCuttedFolder(folderCtx.folder);
    setCopiedFolder(null);
    setFolderCtx(null);
  };

  const handlePasteFolder = async (targetParent: string | null) => {
    setAreaCtx(null);
    setAreaCtxPos(null);
    setAreaCtxReady(false);
    setFolderCtx(null);
    setFolderCtxPos(null);
    setFolderCtxReady(false);
    if (cuttedFolder) {
      const folder = cuttedFolder;
      setCuttedFolder(null);
      // Mover: el targetParent null significa raíz — moveNoteFolder no admite raíz,
      // así que duplicamos y eliminamos (o usamos moveNoteFolder si el destino no es null)
      if (targetParent !== null) {
        await moveNoteFolder(folder, targetParent);
      }
      // Si targetParent es null (raíz) y la carpeta ya es raíz, no hacer nada
    } else if (copiedFolder) {
      await duplicateNoteFolder(copiedFolder, targetParent);
    }
  };

  const handleDuplicateFolder = async () => {
    if (!folderCtx) return;
    const folder = folderCtx.folder;
    setFolderCtx(null);
    // El padre de la carpeta (o null si es raíz)
    const parts = folder.split('/');
    const parent = parts.length > 1 ? parts.slice(0, -1).join('/') : null;
    await duplicateNoteFolder(folder, parent);
  };

  const views: { id: ViewMode; label: string; Icon: React.ElementType }[] = [
    { id: 'list', label: t(language, 'sidebar', 'viewList'), Icon: List },
    { id: 'kanban', label: t(language, 'sidebar', 'viewKanban'), Icon: Layout },
    { id: 'calendar', label: t(language, 'sidebar', 'viewCalendar'), Icon: Calendar },
  ];

  if (isSidebarCollapsed) {
    return (
      <div className="flex h-full w-12 flex-col items-center gap-2 border-r border-[var(--border)] bg-[var(--bg-panel)] py-3">
        <button
          onClick={toggleSidebar}
          className="rounded-lg p-2 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          title={t(language, 'sidebar', 'expand')}
        >
          <PanelLeft size={18} />
        </button>
        <div className="my-1 h-px w-6 bg-[var(--border)]" />
        <button
          onClick={() => setSection('dashboard')}
          className={`rounded-lg p-2 transition ${
            activeSection === 'dashboard'
              ? 'text-indigo-400 bg-indigo-500/10'
              : 'text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
          title={t(language, 'sidebar', 'dashboard')}
        >
          <img src={logoImg} alt="Logday" className="h-[18px] w-[18px] rounded-sm object-cover" />
        </button>
        <div className="my-1 h-px w-6 bg-[var(--border)]" />
        <button
          onClick={() => setSection('dailys')}
          className={`rounded-lg p-2 transition ${
            activeSection === 'dailys'
              ? 'text-indigo-400 bg-indigo-500/10'
              : 'text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
          title={t(language, 'sidebar', 'dailys')}
        >
          <CalendarDays size={18} />
        </button>
        <button
          onClick={() => setSection('tasks')}
          className={`rounded-lg p-2 transition ${
            activeSection === 'tasks'
              ? 'text-indigo-400 bg-indigo-500/10'
              : 'text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
          title={t(language, 'sidebar', 'tasks')}
        >
          <CheckSquare size={18} />
        </button>
        <button
          onClick={() => setSection('notes')}
          className={`rounded-lg p-2 transition ${
            activeSection === 'notes'
              ? 'text-indigo-400 bg-indigo-500/10'
              : 'text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
          title={t(language, 'sidebar', 'notes')}
        >
          <Notebook size={18} />
        </button>
        <button
          onClick={() => setSection('overtime')}
          className={`rounded-lg p-2 transition ${
            activeSection === 'overtime'
              ? 'text-indigo-400 bg-indigo-500/10'
              : 'text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
          title={t(language, 'sidebar', 'overtime_long')}
        >
          <Timer size={18} />
        </button>
        <div className="my-1 h-px w-6 bg-[var(--border)]" />
        {activeSection === 'tasks' &&
          views.map(({ id, Icon, label }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`rounded-lg p-2 transition ${
                currentView === id
                  ? 'text-indigo-400 bg-indigo-500/10'
                  : 'text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
              title={label}
            >
              <Icon size={18} />
            </button>
          ))}
        <div className="flex-1" />
        <button
          onClick={toggleSearch}
          className="rounded-lg p-2 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          title={t(language, 'sidebar', 'search')}
        >
          <Search size={18} />
        </button>
        <button
          onClick={toggleSettings}
          className="rounded-lg p-2 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          title={t(language, 'sidebar', 'settingsBtn')}
        >
          <Settings size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-56 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)] text-xs">
      {/* App header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-3">
        <button
          onClick={() => setSection('dashboard')}
          className="flex items-center gap-2"
          title={t(language, 'sidebar', 'dashboard')}
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600">
            <img src={iconSquareNoBg} alt="Logday" className="h-4 w-4 rounded-sm object-contain" />
          </div>
          <span className="font-semibold text-[var(--text-primary)] text-sm">Logday</span>
        </button>
        <div className="flex items-center gap-0.5">
          <button
            onClick={toggleSearch}
            className="rounded p-1 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            title={t(language, 'sidebar', 'search')}
          >
            <Search size={14} />
          </button>
          <button
            onClick={toggleSidebar}
            className="rounded p-1 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>
      </div>

      {/* Section toggle */}
      <div className="grid grid-cols-4 border-b border-[var(--border)] px-2 py-2 gap-1">
        {(
          [
            { id: 'dailys',   Icon: CalendarDays, labelKey: 'dailys'   },
            { id: 'tasks',    Icon: CheckSquare,  labelKey: 'tasks'    },
            { id: 'notes',    Icon: Notebook,     labelKey: 'notes'    },
            { id: 'overtime', Icon: Timer,        labelKey: 'overtime' },
          ] as const
        ).map(({ id, Icon, labelKey }) => {
          const isActive = activeSection === id;
          const label = t(language, 'sidebar', labelKey);
          return (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-[background-color,color] duration-200 ${
                isActive
                  ? 'bg-indigo-500/15 text-indigo-400 font-medium'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
              }`}
              title={label}
            >
              <Icon size={14} className="shrink-0" />
              <span
                className={`whitespace-nowrap text-[10px] leading-tight transition-all duration-200 ${
                  isActive ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* TASKS SECTION */}
      {activeSection === 'tasks' && (
        <>
          <div className="px-2 pt-2">
            <p className="px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--text-hint)] font-medium">{t(language, 'sidebar', 'views')}</p>
            {views.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                onContextMenu={(e) => handleViewContextMenu(e, id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 transition ${
                  currentView === id
                    ? 'bg-indigo-500/15 text-indigo-400'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div
            data-root-zone
            className="mt-3 flex-1 overflow-y-auto px-2"
            onContextMenu={(e) => {
              if ((e.target as HTMLElement).closest('[data-folder-item]')) return;
              e.preventDefault();
              setProjectAreaCtxReady(false);
              setProjectAreaCtx({ x: e.clientX, y: e.clientY });
              setProjectAreaCtxPos(
                placeMenuAtPointer(
                  { x: e.clientX, y: e.clientY },
                  ESTIMATED_AREA_MENU,
                  { padding: 8 },
                ),
              );
            }}
          >
            <div className="flex items-center justify-between px-2 py-1">
              <button
                onClick={() => setIsProjectsOpen((v) => !v)}
                className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-[var(--text-hint)] font-medium hover:text-[var(--text-muted)]"
              >
                {isProjectsOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                {t(language, 'sidebar', 'projects')}
              </button>
              <button
                onClick={() => setShowNewProject(true)}
                className="rounded p-0.5 text-[var(--text-hint)] transition hover:text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
                title={t(language, 'sidebar', 'newProject')}
              >
                <Plus size={12} />
              </button>
            </div>

            {isProjectsOpen && (
              <div className="mt-1 space-y-0.5">
                <button
                  onClick={() => selectProject(null)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 transition ${
                    activeProject === null
                      ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  <CheckSquare size={13} />
                  <span>{t(language, 'sidebar', 'allTasks')}</span>
                </button>

                {projects.length > 0 && (
                  <div className="my-1.5 px-2">
                    <div className="h-px bg-[var(--border)]" />
                  </div>
                )}

                {buildFolderTree(projects).map((node) => (
                  <ProjectTreeItem
                    key={node.path}
                    node={node}
                    depth={0}
                    activeProject={activeProject}
                    renamingProject={renamingProject}
                    projectRenameValue={projectRenameValue}
                    projectRenameInputRef={projectRenameInputRef}
                    setProjectRenameValue={setProjectRenameValue}
                    setRenamingProject={setRenamingProject}
                    handleProjectRenameConfirm={handleProjectRenameConfirm}
                    handleProjectContextMenu={handleProjectContextMenu}
                    selectProject={selectProject}
                    expandedProjects={expandedProjects}
                    setExpandedProjects={setExpandedProjects}
                    moveProject={moveProject}
                  />
                ))}
                <RootDropLine />
              </div>
            )}
          </div>
        </>
      )}

      {/* Ctx menú de vistas (Tareas) */}
      {viewCtx && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => { setViewCtx(null); setViewCtxPos(null); setViewCtxReady(false); }} />
          <div
            ref={viewCtxRef}
            className="fixed z-50 min-w-[150px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl py-1"
            style={{ left: viewCtxPos?.x ?? 8, top: viewCtxPos?.y ?? 8, visibility: viewCtxReady ? 'visible' : 'hidden' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setView(viewCtx.view); setViewCtx(null); setViewCtxPos(null); setViewCtxReady(false); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <CheckSquare size={13} />
              {t(language, 'sidebar', 'activateView')}
            </button>
          </div>
        </>
      )}

      {/* Ctx menú de área libre de proyectos */}
      {projectAreaCtx && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => { setProjectAreaCtx(null); setProjectAreaCtxPos(null); setProjectAreaCtxReady(false); }} />
          <div
            ref={projectAreaCtxRef}
            className="fixed z-50 min-w-[160px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl py-1"
            style={{ left: projectAreaCtxPos?.x ?? 8, top: projectAreaCtxPos?.y ?? 8, visibility: projectAreaCtxReady ? 'visible' : 'hidden' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setProjectAreaCtx(null); setProjectAreaCtxPos(null); setProjectAreaCtxReady(false); setShowNewProject(true); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <FolderPlus size={13} />
              {t(language, 'sidebar', 'projectNewFolder')}
            </button>
          </div>
        </>
      )}

      {/* Ctx menú de carpeta de proyecto */}
      {projectCtx && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => { setProjectCtx(null); setProjectCtxPos(null); setProjectCtxReady(false); }} />
          <div
            ref={projectCtxRef}
            className="fixed z-50 min-w-[170px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl py-1"
            style={{ left: projectCtxPos?.x ?? 8, top: projectCtxPos?.y ?? 8, visibility: projectCtxReady ? 'visible' : 'hidden' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleProjectStartRename}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Pencil size={13} />
              {t(language, 'sidebar', 'renameFolder')}
            </button>
            <button
              onClick={handleProjectNewSubfolder}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <FolderPlus size={13} />
              {t(language, 'sidebar', 'newSubfolder')}
            </button>
            {projectCtx.project.includes('/') && (
              <button
                onClick={handleProjectPromote}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
              >
                <FolderUp size={13} />
                {t(language, 'sidebar', 'moveTopLevel')}
              </button>
            )}
            <div className="my-1 h-px bg-[var(--border)]" />
            <button
              onClick={handleProjectDelete}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 transition"
            >
              <Trash2 size={13} />
              {t(language, 'sidebar', 'deleteFolder')}
            </button>
          </div>
        </>
      )}

      {/* Modal nueva subcarpeta de proyecto */}
      {projectSubfolderParent !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-72 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
            <h3 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">{t(language, 'sidebar', 'projectSubfolderTitle')}</h3>
            <p className="mb-3 text-xs text-[var(--text-hint)]">{t(language, 'sidebar', 'inFolder')} <span className="text-indigo-400">{projectSubfolderParent}</span></p>
            <input
              ref={projectSubfolderInputRef}
              value={newProjectSubfolderName}
              onChange={(e) => setNewProjectSubfolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateProjectSubfolder();
                if (e.key === 'Escape') { setProjectSubfolderParent(null); setNewProjectSubfolderName(''); }
              }}
              placeholder={t(language, 'sidebar', 'subfolderNamePlaceholder')}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500/60 placeholder-[var(--text-hint)]"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => { setProjectSubfolderParent(null); setNewProjectSubfolderName(''); }}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition"
              >
                {t(language, 'sidebar', 'cancel')}
              </button>
              <button
                onClick={handleCreateProjectSubfolder}
                disabled={!newProjectSubfolderName.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                {t(language, 'sidebar', 'create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NOTES SECTION */}
      {activeSection === 'notes' && (
        <div
          data-root-zone
          className="mt-2 flex-1 overflow-y-auto px-2"
          onContextMenu={(e) => {
            if ((e.target as HTMLElement).closest('[data-folder-item]')) return;
            e.preventDefault();
            setAreaCtxReady(false);
            setAreaCtx({ x: e.clientX, y: e.clientY });
            setAreaCtxPos(
              placeMenuAtPointer(
                { x: e.clientX, y: e.clientY },
                ESTIMATED_AREA_MENU,
                { padding: 8 },
              ),
            );
          }}
        >
          <div className="flex items-center justify-between px-2 py-1">
            <button
              onClick={() => setIsFoldersOpen((v) => !v)}
              className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-[var(--text-hint)] font-medium hover:text-[var(--text-muted)]"
            >
              {isFoldersOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              {t(language, 'sidebar', 'folders')}
            </button>
            <button
              onClick={() => setShowCreateFolderModal(true)}
              className="rounded p-0.5 text-[var(--text-hint)] transition hover:text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
              title={t(language, 'sidebar', 'newFolder')}
            >
              <Plus size={12} />
            </button>
          </div>

          {isFoldersOpen && (
            <div className="mt-1 space-y-0.5">
              <button
                onClick={() => selectNoteFolder(null)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 transition ${
                  activeNoteFolder === null
                    ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <FileText size={13} />
                <span>{t(language, 'sidebar', 'allNotes')}</span>
              </button>

              <button
                onClick={() => selectNoteFolder('')}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 transition ${
                  activeNoteFolder === ''
                    ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <FileText size={13} />
                <span>{t(language, 'notes', 'noFolder')}</span>
              </button>

              {noteFolders.length > 0 && (
                <div className="my-1.5 px-2">
                  <div className="h-px bg-[var(--border)]" />
                </div>
              )}

              {buildFolderTree(noteFolders).map((node) => (
                <FolderTreeItem
                  key={node.path}
                  node={node}
                  depth={0}
                  activeNoteFolder={activeNoteFolder}
                  renamingFolder={renamingFolder}
                  renameValue={renameValue}
                  renameInputRef={renameInputRef}
                  setRenameValue={setRenameValue}
                  setRenamingFolder={setRenamingFolder}
                  handleRenameConfirm={handleRenameConfirm}
                  handleFolderContextMenu={handleFolderContextMenu}
                  selectNoteFolder={selectNoteFolder}
                  folderTags={folderTags}
                  expandedFolders={expandedFolders}
                  setExpandedFolders={setExpandedFolders}
                  moveNoteFolder={moveNoteFolder}
                />
              ))}
              {/* Línea guía visual para soltar en raíz */}
              <RootDropLine />
            </div>
          )}
        </div>
      )}

      {/* Ctx menú de área libre de carpetas */}
      {areaCtx && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => { setAreaCtx(null); setAreaCtxPos(null); setAreaCtxReady(false); }} />
          <div
            ref={areaCtxRef}
            className="fixed z-50 min-w-[160px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl py-1"
            style={{ left: areaCtxPos?.x ?? 8, top: areaCtxPos?.y ?? 8, visibility: areaCtxReady ? 'visible' : 'hidden' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setAreaCtx(null); setAreaCtxPos(null); setAreaCtxReady(false); setShowCreateFolderModal(true); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <FolderPlus size={13} />
              {t(language, 'sidebar', 'newFolder')}
            </button>
            {(copiedFolder || cuttedFolder) && (
              <button
                onClick={() => handlePasteFolder(null)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
              >
                <Clipboard size={13} />
                <span className="truncate">{t(language, 'sidebar', 'pasteFolder')} &quot;{(cuttedFolder ?? copiedFolder)!.split('/').pop()}&quot;</span>
              </button>
            )}
          </div>
        </>
      )}

      {/* Modal crear carpeta */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-72 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{t(language, 'sidebar', 'newFolderTitle')}</h3>
            <input
              ref={createFolderInputRef}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') { setShowCreateFolderModal(false); setNewFolderName(''); }
              }}
              placeholder={t(language, 'sidebar', 'folderNamePlaceholder')}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500/60 placeholder-[var(--text-hint)]"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => { setShowCreateFolderModal(false); setNewFolderName(''); }}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition"
              >
                {t(language, 'sidebar', 'cancel')}
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                {t(language, 'sidebar', 'create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ctx menú de carpeta */}
      {folderCtx && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => { setFolderCtx(null); setFolderCtxPos(null); setFolderCtxReady(false); }} />
          <div
            ref={folderCtxRef}
            className="fixed z-50 min-w-[160px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl py-1"
            style={{ left: folderCtxPos?.x ?? 8, top: folderCtxPos?.y ?? 8, visibility: folderCtxReady ? 'visible' : 'hidden' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleStartRename}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Pencil size={13} />
              {t(language, 'sidebar', 'renameFolder')}
            </button>
            <button
              onClick={handleNewSubfolder}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <FolderPlus size={13} />
              {t(language, 'sidebar', 'newSubfolder')}
            </button>
            <button
              onClick={handleEditFolderTags}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Tag size={13} />
              {t(language, 'sidebar', 'editFolderTags')}
            </button>
            {folderCtx.folder.includes('/') && (
              <button
                onClick={handlePromoteFolder}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
              >
                <FolderUp size={13} />
                {t(language, 'sidebar', 'moveTopLevel')}
              </button>
            )}
            <button
              onClick={handleShareFolder}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Share2 size={13} />
              {navigator.userAgent.includes('Windows') ? t(language, 'notes', 'showInExplorer') : t(language, 'notes', 'showInFinder')}
            </button>
            <div className="my-1 h-px bg-[var(--border)]" />
            <button
              onClick={handleCutFolder}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Scissors size={13} />
              {t(language, 'sidebar', 'cutFolder')}
            </button>
            <button
              onClick={handleCopyFolder}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Copy size={13} />
              {t(language, 'sidebar', 'copyFolder')}
            </button>
            <button
              onClick={handleDuplicateFolder}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <CopyPlus size={13} />
              {t(language, 'sidebar', 'duplicateFolder')}
            </button>
            {(copiedFolder || cuttedFolder) && (
              <button
                onClick={() => {
                  const folder = folderCtx!.folder;
                  setFolderCtx(null);
                  handlePasteFolder(folder);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
              >
                <Clipboard size={13} />
                <span className="truncate">{t(language, 'sidebar', 'pasteFolderHere')} &quot;{(cuttedFolder ?? copiedFolder)!.split('/').pop()}&quot;</span>
              </button>
            )}
            <div className="my-1 h-px bg-[var(--border)]" />
            <button
              onClick={handleDeleteFolder}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 transition"
            >
              <Trash2 size={13} />
              {t(language, 'sidebar', 'deleteFolder')}
            </button>
          </div>
        </>
      )}

      {/* Modal nueva subcarpeta */}
      {subfolderParent !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-72 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
            <h3 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">{t(language, 'sidebar', 'newSubfolder')}</h3>
            <p className="mb-3 text-xs text-[var(--text-hint)]">{t(language, 'sidebar', 'inFolder')} <span className="text-indigo-400">{subfolderParent}</span></p>
            <input
              ref={subfolderInputRef}
              value={newSubfolderName}
              onChange={(e) => setNewSubfolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateSubfolder();
                if (e.key === 'Escape') { setSubfolderParent(null); setNewSubfolderName(''); }
              }}
              placeholder={t(language, 'sidebar', 'subfolderNamePlaceholder')}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500/60 placeholder-[var(--text-hint)]"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => { setSubfolderParent(null); setNewSubfolderName(''); }}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition"
              >
                {t(language, 'sidebar', 'cancel')}
              </button>
              <button
                onClick={handleCreateSubfolder}
                disabled={!newSubfolderName.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                {t(language, 'sidebar', 'create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar tags de carpeta */}
      {editingTagsFolder !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onMouseDown={() => setEditingTagsFolder(null)}
        >
          <div
            className="w-72 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t(language, 'sidebar', 'folderTagsTitle')}</h3>
                <p className="text-xs text-[var(--text-hint)]">{editingTagsFolder}</p>
              </div>
              <button onClick={() => setEditingTagsFolder(null)} className="text-[var(--text-hint)] hover:text-[var(--text-muted)]">
                <X size={14} />
              </button>
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5 min-h-[24px]">
              {(folderTags[editingTagsFolder] ?? []).length === 0 && (
                <span className="text-xs text-[var(--text-faint)] italic">{t(language, 'notes', 'noTags')}</span>
              )}
              {(folderTags[editingTagsFolder] ?? []).map(tag => (
                <span key={tag} className="flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-400">
                  {tag}
                  <button onClick={() => handleRemoveFolderTag(editingTagsFolder, tag)} className="hover:text-red-400 transition">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                ref={folderTagInputRef}
                value={folderTagInput}
                onChange={(e) => setFolderTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddFolderTag();
                  if (e.key === 'Escape') setEditingTagsFolder(null);
                }}
                placeholder={t(language, 'notes', 'newTagPlaceholder')}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500/60 placeholder-[var(--text-hint)]"
              />
              <button
                onClick={handleAddFolderTag}
                disabled={!folderTagInput.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                {t(language, 'notes', 'addTag')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DAILYS SECTION */}
      {activeSection === 'dailys' && (
        <div className="mt-2 flex-1 overflow-y-auto px-2">
          <button
            onClick={createTodayDaily}
            className="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-indigo-400 transition hover:bg-indigo-500/10"
          >
            <Plus size={12} />
            {t(language, 'sidebar', 'dailyToday')}
          </button>

          <p className="px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--text-hint)] font-medium">
            {t(language, 'sidebar', 'history')}
          </p>
          <div className="mt-1 space-y-0.5">
            {dailyMonths.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[var(--text-faint)] italic">
                {t(language, 'sidebar', 'noDailysRecorded')}
              </p>
            ) : (
              dailyMonths.map((ym) => {
                const label = formatYearMonthLabel(ym, language, 'short');
                return (
                  <button
                    key={ym}
                    onClick={() => setActiveDailyMonth(ym)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDailyMonthCtxReady(false);
                      setDailyMonthCtxPos(
                        placeMenuAtPointer(
                          { x: e.clientX, y: e.clientY },
                          { width: 200, height: 96 },
                          { padding: 8 },
                        ),
                      );
                      setDailyMonthCtx({ ym, x: e.clientX, y: e.clientY });
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 transition ${
                      activeDailyMonth === ym
                        ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    <CalendarDays size={13} />
                    <span>{label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* OVERTIME SECTION */}
      {activeSection === 'overtime' && (
        <div className="mt-2 flex-1 overflow-y-auto px-2">
          <p className="px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--text-hint)] font-medium">
            {t(language, 'sidebar', 'history')}
          </p>
          <div className="mt-1 space-y-0.5">
            {overtimeMonths.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[var(--text-faint)] italic">
                {t(language, 'sidebar', 'noOvertimeRecorded')}
              </p>
            ) : (
              overtimeMonths.map((ym) => {
                const label = formatYearMonthLabel(ym, language, 'short');
                return (
                  <button
                    key={ym}
                    onClick={() => loadOvertimeMonth(ym)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOvertimeMonthCtxReady(false);
                      setOvertimeMonthCtxPos(
                        placeMenuAtPointer(
                          { x: e.clientX, y: e.clientY },
                          ESTIMATED_OVERTIME_MENU,
                          { padding: 8 },
                        ),
                      );
                      setOvertimeMonthCtx({ ym, x: e.clientX, y: e.clientY });
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 transition ${
                      overtimeMonth === ym
                        ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    <Timer size={13} />
                    <span>{label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto border-t border-[var(--border)] px-2 py-2 space-y-0.5">
        <button
          onClick={toggleSettings}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
        >
          <Settings size={14} />
          <span>{t(language, 'settings', 'title')}</span>
        </button>
        {basePath && (
          <p className="truncate px-3 text-[10px] text-[var(--text-faint)]" title={basePath}>
            {basePath}
          </p>
        )}
      </div>

      {/* Modal nuevo proyecto */}
      {showNewProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onClick={() => { setShowNewProject(false); setNewProjectName(''); }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-xs rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-2">
              <FolderOpen size={16} className="text-indigo-400" />
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t(language, 'sidebar', 'newProjectTitle')}</h3>
            </div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-hint)]">
              {t(language, 'sidebar', 'nameLabel')}
            </label>
            <input
              ref={newProjectInputRef}
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateProject();
                if (e.key === 'Escape') { setShowNewProject(false); setNewProjectName(''); }
              }}
              placeholder={t(language, 'sidebar', 'newProjectNamePlaceholder')}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500/60 placeholder-[var(--text-hint)]"
            />
            <p className="mt-1.5 text-[10px] text-[var(--text-hint)]">
              {t(language, 'sidebar', 'createInsideProjectsHint')}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setShowNewProject(false); setNewProjectName(''); }}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)]"
              >
                {t(language, 'sidebar', 'cancel')}
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                {t(language, 'sidebar', 'createProjectBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Menú contextual mes de Dailys */}
      {dailyMonthCtx && (() => {
        const label = formatYearMonthLabel(dailyMonthCtx.ym, language, 'short');
        return (
          <div
            ref={dailyMonthCtxRef}
            style={{
              position: 'fixed',
              top: dailyMonthCtxPos?.y ?? 8,
              left: dailyMonthCtxPos?.x ?? 8,
              zIndex: 9999,
              visibility: dailyMonthCtxReady ? 'visible' : 'hidden',
            }}
            className="min-w-[210px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
          >
            <button
              onClick={() => { setActiveDailyMonth(dailyMonthCtx.ym); setDailyMonthCtx(null); setDailyMonthCtxPos(null); setDailyMonthCtxReady(false); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <CalendarDays size={13} />
              {t(language, 'sidebar', 'goToMonth')} {label}
            </button>
            <div className="mx-2 my-1 border-t border-[var(--border)]" />
            <button
              onClick={() => handleExportDailyMonth(dailyMonthCtx.ym, 'md')}
              disabled={exportingDailyMonth}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition disabled:opacity-40"
            >
              <FileText size={13} />
              {t(language, 'dailys', 'monthCtxExportMd')}
            </button>
            <button
              onClick={() => handleExportDailyMonth(dailyMonthCtx.ym, 'txt')}
              disabled={exportingDailyMonth}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition disabled:opacity-40"
            >
              <FileDown size={13} />
              {t(language, 'dailys', 'monthCtxExportTxt')}
            </button>
            <button
              onClick={() => handleExportDailyMonth(dailyMonthCtx.ym, 'pdf')}
              disabled={exportingDailyMonth}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition disabled:opacity-40"
            >
              <FileType2 size={13} />
              {t(language, 'dailys', 'monthCtxExportPdf')}
            </button>
            <div className="mx-2 my-1 border-t border-[var(--border)]" />
            <button
              onClick={async () => {
                if (confirmDestructiveActions) setConfirmDeleteDailyMonth(dailyMonthCtx.ym);
                else await deleteDailyMonth(dailyMonthCtx.ym);
                setDailyMonthCtx(null);
                setDailyMonthCtxPos(null);
                setDailyMonthCtxReady(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition"
            >
              <Trash2 size={13} />
              {t(language, 'sidebar', 'deleteDailyOf')} {label}
            </button>
          </div>
        );
      })()}

      {/* Confirmación eliminar mes de Dailys */}
      {confirmDeleteDailyMonth && confirmDestructiveActions && (() => {
        const label = formatYearMonthLabel(confirmDeleteDailyMonth, language, 'long');
        return (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40">
            <div className="w-80 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <Trash2 size={15} className="text-red-400" />
                {t(language, 'sidebar', 'deleteDailyMonthTitle')} {label}
              </div>
              <p className="mb-4 text-xs text-[var(--text-secondary)]">
                {t(language, 'sidebar', 'deleteDailyMonthDescStart')} <span className="font-medium text-[var(--text-primary)]">{t(language, 'sidebar', 'deleteDailyMonthDescAllEntries')}</span> {t(language, 'sidebar', 'deleteDailyMonthDescOfMonth')} <span className="font-medium text-[var(--text-primary)]">{label}</span>. {t(language, 'sidebar', 'deleteDailyMonthDescEnd')}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDeleteDailyMonth(null)}
                  className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
                >
                  {t(language, 'sidebar', 'cancel')}
                </button>
                <button
                  onClick={async () => { await deleteDailyMonth(confirmDeleteDailyMonth); setConfirmDeleteDailyMonth(null); }}
                  className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600"
                >
                  {t(language, 'sidebar', 'deleteAll')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Menú contextual mes de Extras */}
      {overtimeMonthCtx && (() => {
        const label = formatYearMonthLabel(overtimeMonthCtx.ym, language, 'short');
        return (
          <div
            ref={overtimeMonthCtxRef}
            style={{
              position: 'fixed',
              top: overtimeMonthCtxPos?.y ?? 8,
              left: overtimeMonthCtxPos?.x ?? 8,
              zIndex: 9999,
              visibility: overtimeMonthCtxReady ? 'visible' : 'hidden',
            }}
            className="min-w-[180px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
          >
            <button
              onClick={() => { loadOvertimeMonth(overtimeMonthCtx.ym); setOvertimeMonthCtx(null); setOvertimeMonthCtxPos(null); setOvertimeMonthCtxReady(false); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Timer size={13} />
              {t(language, 'sidebar', 'goToMonth')} {label}
            </button>
            <div className="mx-2 my-1 border-t border-[var(--border)]" />
            <button
              onClick={async () => {
                if (confirmDestructiveActions) setConfirmDeleteOvertimeMonth(overtimeMonthCtx.ym);
                else await deleteOvertimeMonth(overtimeMonthCtx.ym);
                setOvertimeMonthCtx(null);
                setOvertimeMonthCtxPos(null);
                setOvertimeMonthCtxReady(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition"
            >
              <Trash2 size={13} />
              {t(language, 'sidebar', 'deleteOvertimeOf')} {label}
            </button>
          </div>
        );
      })()}

      {/* Confirmación eliminar mes de Extras */}
      {confirmDeleteOvertimeMonth && confirmDestructiveActions && (() => {
        const label = formatYearMonthLabel(confirmDeleteOvertimeMonth, language, 'long');
        return (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40">
            <div className="w-80 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <Trash2 size={15} className="text-red-400" />
                {t(language, 'sidebar', 'deleteOvertimeMonthTitle')} {label}
              </div>
              <p className="mb-4 text-xs text-[var(--text-secondary)]">
                {t(language, 'sidebar', 'deleteOvertimeMonthDescStart')} <span className="font-medium text-[var(--text-primary)]">{t(language, 'sidebar', 'deleteOvertimeMonthDescAllEntries')}</span> {t(language, 'sidebar', 'deleteOvertimeMonthDescOfMonth')} <span className="font-medium text-[var(--text-primary)]">{label}</span>. {t(language, 'sidebar', 'deleteOvertimeMonthDescEnd')}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDeleteOvertimeMonth(null)}
                  className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
                >
                  {t(language, 'sidebar', 'cancel')}
                </button>
                <button
                  onClick={async () => { await deleteOvertimeMonth(confirmDeleteOvertimeMonth); setConfirmDeleteOvertimeMonth(null); }}
                  className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600"
                >
                  {t(language, 'sidebar', 'deleteAll')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
