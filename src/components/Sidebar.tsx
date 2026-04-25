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
  GitCommit,
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { ViewMode } from '../types';
import { placeMenuAtPointer } from '../lib/menuPosition';
import logoImg from '../assets/logo.png';
import iconSquareNoBg from '../../icon_square_wiout_background.png';

const ESTIMATED_AREA_MENU = { width: 180, height: 110 };
const ESTIMATED_FOLDER_MENU = { width: 220, height: 360 };
const ESTIMATED_OVERTIME_MENU = { width: 200, height: 110 };

type FolderCtxMenu = { folder: string; x: number; y: number } | null;

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
          title="Arrastrar carpeta"
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
    setView,
    toggleSearch,
    toggleSidebar,
    toggleSettings,
    toggleGit,
    gitConfig,
    gitStatus,
    gitRemoteStatus,
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
    overtimeMonths,
    overtimeMonth,
    loadOvertimeMonth,
    deleteOvertimeMonth,
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
    if (showCreateFolderModal) setTimeout(() => createFolderInputRef.current?.focus(), 50);
  }, [showCreateFolderModal]);

  useEffect(() => {
    if (subfolderParent !== null) setTimeout(() => subfolderInputRef.current?.focus(), 50);
  }, [subfolderParent]);

  useEffect(() => {
    if (editingTagsFolder !== null) setTimeout(() => folderTagInputRef.current?.focus(), 50);
  }, [editingTagsFolder]);

  useEffect(() => {
    if (renamingFolder !== null) setTimeout(() => renameInputRef.current?.focus(), 50);
  }, [renamingFolder]);

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

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    await createProject(newProjectName.trim());
    setNewProjectName('');
    setShowNewProject(false);
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
    { id: 'list', label: 'Lista', Icon: List },
    { id: 'kanban', label: 'Kanban', Icon: Layout },
    { id: 'calendar', label: 'Calendario', Icon: Calendar },
  ];

  if (isSidebarCollapsed) {
    return (
      <div className="flex h-full w-12 flex-col items-center gap-2 border-r border-[var(--border)] bg-[var(--bg-panel)] py-3">
        <button
          onClick={toggleSidebar}
          className="rounded-lg p-2 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          title="Expandir sidebar"
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
          title="Inicio"
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
          title="Dailys"
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
          title="Tareas"
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
          title="Notas"
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
          title="Horas Extras"
        >
          <Timer size={18} />
        </button>
        <div className="my-1 h-px w-6 bg-[var(--border)]" />
        {activeSection === 'tasks' &&
          views.map(({ id, Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`rounded-lg p-2 transition ${
                currentView === id
                  ? 'text-indigo-400 bg-indigo-500/10'
                  : 'text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
              title={id}
            >
              <Icon size={18} />
            </button>
          ))}
        <div className="flex-1" />
        <button
          onClick={toggleSearch}
          className="rounded-lg p-2 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          title="Búsqueda global (⌘F)"
        >
          <Search size={18} />
        </button>
        <button
          onClick={toggleGit}
          className="relative rounded-lg p-2 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          title="Git"
        >
          <GitCommit size={18} />
          {gitConfig.enabled && (
            <span className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${
              gitStatus === 'error'           ? 'bg-red-400'    :
              gitRemoteStatus === 'behind'    ? 'bg-blue-400'   :
              gitRemoteStatus === 'diverged'  ? 'bg-purple-400' :
              gitRemoteStatus === 'offline'   ? 'bg-zinc-500'   :
              gitStatus === 'synced'          ? 'bg-green-400'  : 'bg-amber-400'
            }`} />
          )}
        </button>
        <button
          onClick={toggleSettings}
          className="rounded-lg p-2 text-[var(--text-hint)] transition hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          title="Opciones"
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
          title="Inicio"
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
            title="Búsqueda global (⌘F)"
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
            { id: 'dailys',   Icon: CalendarDays, label: 'Dailys'  },
            { id: 'tasks',    Icon: CheckSquare,  label: 'Tareas'  },
            { id: 'notes',    Icon: Notebook,     label: 'Notas'   },
            { id: 'overtime', Icon: Timer,        label: 'Extras'  },
          ] as const
        ).map(({ id, Icon, label }) => {
          const isActive = activeSection === id;
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
            <p className="px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--text-hint)] font-medium">Vistas</p>
            {views.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
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

          <div className="mt-3 flex-1 overflow-y-auto px-2">
            <div className="flex items-center justify-between px-2 py-1">
              <button
                onClick={() => setIsProjectsOpen((v) => !v)}
                className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-[var(--text-hint)] font-medium hover:text-[var(--text-muted)]"
              >
                {isProjectsOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                Proyectos
              </button>
              <button
                onClick={() => setShowNewProject(true)}
                className="rounded p-0.5 text-[var(--text-hint)] transition hover:text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
                title="Nuevo proyecto"
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
                  <span>Todas las tareas</span>
                </button>

                {projects.map((p) => (
                  <button
                    key={p}
                    onClick={() => selectProject(p)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 transition ${
                      activeProject === p
                        ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    <FolderOpen size={13} />
                    <span className="truncate">{p}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
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
              Carpetas
            </button>
            <button
              onClick={() => setShowCreateFolderModal(true)}
              className="rounded p-0.5 text-[var(--text-hint)] transition hover:text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
              title="Nueva carpeta"
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
                <span>Todas las notas</span>
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
                <span>Sin carpeta</span>
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
              Nueva carpeta
            </button>
            {(copiedFolder || cuttedFolder) && (
              <button
                onClick={() => handlePasteFolder(null)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
              >
                <Clipboard size={13} />
                <span className="truncate">Pegar &quot;{(cuttedFolder ?? copiedFolder)!.split('/').pop()}&quot;</span>
              </button>
            )}
          </div>
        </>
      )}

      {/* Modal crear carpeta */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-72 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Nueva carpeta</h3>
            <input
              ref={createFolderInputRef}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') { setShowCreateFolderModal(false); setNewFolderName(''); }
              }}
              placeholder="Nombre de la carpeta…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500/60 placeholder-[var(--text-hint)]"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => { setShowCreateFolderModal(false); setNewFolderName(''); }}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                Crear
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
              Renombrar
            </button>
            <button
              onClick={handleNewSubfolder}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <FolderPlus size={13} />
              Nueva subcarpeta
            </button>
            <button
              onClick={handleEditFolderTags}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Tag size={13} />
              Editar tags
            </button>
            {folderCtx.folder.includes('/') && (
              <button
                onClick={handlePromoteFolder}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
              >
                <FolderUp size={13} />
                Mover al nivel superior
              </button>
            )}
            <button
              onClick={handleShareFolder}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Share2 size={13} />
              {navigator.userAgent.includes('Windows') ? 'Mostrar en Explorador' : 'Mostrar en Finder'}
            </button>
            <div className="my-1 h-px bg-[var(--border)]" />
            <button
              onClick={handleCutFolder}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Scissors size={13} />
              Cortar carpeta
            </button>
            <button
              onClick={handleCopyFolder}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Copy size={13} />
              Copiar carpeta
            </button>
            <button
              onClick={handleDuplicateFolder}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <CopyPlus size={13} />
              Duplicar carpeta
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
                <span className="truncate">Pegar &quot;{(cuttedFolder ?? copiedFolder)!.split('/').pop()}&quot; aquí</span>
              </button>
            )}
            <div className="my-1 h-px bg-[var(--border)]" />
            <button
              onClick={handleDeleteFolder}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 transition"
            >
              <Trash2 size={13} />
              Eliminar carpeta
            </button>
          </div>
        </>
      )}

      {/* Modal nueva subcarpeta */}
      {subfolderParent !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-72 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
            <h3 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Nueva subcarpeta</h3>
            <p className="mb-3 text-xs text-[var(--text-hint)]">en <span className="text-indigo-400">{subfolderParent}</span></p>
            <input
              ref={subfolderInputRef}
              value={newSubfolderName}
              onChange={(e) => setNewSubfolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateSubfolder();
                if (e.key === 'Escape') { setSubfolderParent(null); setNewSubfolderName(''); }
              }}
              placeholder="Nombre de la subcarpeta…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500/60 placeholder-[var(--text-hint)]"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => { setSubfolderParent(null); setNewSubfolderName(''); }}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateSubfolder}
                disabled={!newSubfolderName.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                Crear
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
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Tags de carpeta</h3>
                <p className="text-xs text-[var(--text-hint)]">{editingTagsFolder}</p>
              </div>
              <button onClick={() => setEditingTagsFolder(null)} className="text-[var(--text-hint)] hover:text-[var(--text-muted)]">
                <X size={14} />
              </button>
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5 min-h-[24px]">
              {(folderTags[editingTagsFolder] ?? []).length === 0 && (
                <span className="text-xs text-[var(--text-faint)] italic">Sin tags</span>
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
                placeholder="Nuevo tag…"
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500/60 placeholder-[var(--text-hint)]"
              />
              <button
                onClick={handleAddFolderTag}
                disabled={!folderTagInput.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                Añadir
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
            Daily de hoy
          </button>

          <p className="px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--text-hint)] font-medium">
            Historial
          </p>
          <div className="mt-1 space-y-0.5">
            {dailyMonths.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[var(--text-faint)] italic">
                Sin dailys registrados
              </p>
            ) : (
              dailyMonths.map((ym) => {
                const [y, m] = ym.split('-');
                const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                const label = `${MESES[parseInt(m) - 1]} ${y}`;
                return (
                  <button
                    key={ym}
                    onClick={() => setActiveDailyMonth(ym)}
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
            Historial
          </p>
          <div className="mt-1 space-y-0.5">
            {overtimeMonths.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[var(--text-faint)] italic">
                Sin extras registradas
              </p>
            ) : (
              overtimeMonths.map((ym) => {
                const [y, m] = ym.split('-');
                const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                const label = `${MESES[parseInt(m) - 1]} ${y}`;
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
          onClick={toggleGit}
          className="relative flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
        >
          <GitCommit size={14} />
          <span>Git</span>
          {gitConfig.enabled && (
            <span className={`ml-auto h-1.5 w-1.5 rounded-full ${
              gitStatus === 'error'           ? 'bg-red-400'    :
              gitRemoteStatus === 'behind'    ? 'bg-blue-400'   :
              gitRemoteStatus === 'diverged'  ? 'bg-purple-400' :
              gitRemoteStatus === 'offline'   ? 'bg-zinc-500'   :
              gitStatus === 'synced'          ? 'bg-green-400'  : 'bg-amber-400'
            }`} />
          )}
        </button>
        <button
          onClick={toggleSettings}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]"
        >
          <Settings size={14} />
          <span>Opciones</span>
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
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Nuevo proyecto</h3>
            </div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-hint)]">
              Nombre
            </label>
            <input
              ref={newProjectInputRef}
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateProject();
                if (e.key === 'Escape') { setShowNewProject(false); setNewProjectName(''); }
              }}
              placeholder="ej. trabajo, personal, ideas…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-indigo-500/60 placeholder-[var(--text-hint)]"
            />
            <p className="mt-1.5 text-[10px] text-[var(--text-hint)]">
              Se creará como carpeta dentro de <span className="font-mono">projects/</span>
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setShowNewProject(false); setNewProjectName(''); }}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)]"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                Crear proyecto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Menú contextual mes de Extras */}
      {overtimeMonthCtx && (() => {
        const [y, m] = overtimeMonthCtx.ym.split('-');
        const MESES_S = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
          'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const label = `${MESES_S[parseInt(m) - 1]} ${y}`;
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
              Ir a {label}
            </button>
            <div className="mx-2 my-1 border-t border-[var(--border)]" />
            <button
              onClick={() => { setConfirmDeleteOvertimeMonth(overtimeMonthCtx.ym); setOvertimeMonthCtx(null); setOvertimeMonthCtxPos(null); setOvertimeMonthCtxReady(false); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition"
            >
              <Trash2 size={13} />
              Eliminar extras de {label}
            </button>
          </div>
        );
      })()}

      {/* Confirmación eliminar mes de Extras */}
      {confirmDeleteOvertimeMonth && (() => {
        const [y, m] = confirmDeleteOvertimeMonth.split('-');
        const MESES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const label = `${MESES_L[parseInt(m) - 1]} ${y}`;
        return (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40">
            <div className="w-80 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <Trash2 size={15} className="text-red-400" />
                Eliminar extras de {label}
              </div>
              <p className="mb-4 text-xs text-[var(--text-secondary)]">
                Se eliminarán <span className="font-medium text-[var(--text-primary)]">todas las entradas</span> del mes de <span className="font-medium text-[var(--text-primary)]">{label}</span>. Esta acción no se puede deshacer.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDeleteOvertimeMonth(null)}
                  className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => { await deleteOvertimeMonth(confirmDeleteOvertimeMonth); setConfirmDeleteOvertimeMonth(null); }}
                  className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600"
                >
                  Eliminar todo
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
