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
  Scissors,
  FolderUp,
  FileDown,
  FileType2,
} from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { ViewMode } from '../../types/config';
import { usePositionedMenu } from '../../hooks/usePositionedMenu';
import { ConfirmDeleteModal } from '../shared/ConfirmDeleteModal';
import { useConfirmDelete } from '../../hooks/useConfirmDelete';
import { t, MONTHS_TITLE } from '../../lib/i18n';
import { buildFolderTree } from '../../lib/folderTree';
import { exportDailyMonthEntries } from '../../lib/dailyMonthExport';
import { FolderTreeItem } from './FolderTreeItem';
import { ProjectTreeItem } from './ProjectTreeItem';
import { RootDropLine } from './RootDropLine';
import { ModalOverlay } from '../shared/ModalOverlay';
import { ModalPanel } from '../shared/ModalPanel';

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
const ESTIMATED_DAILY_MONTH_MENU = { width: 200, height: 96 };

type FolderCtxMenu = { folder: string; x: number; y: number } | null;
type ProjectCtxMenu = { project: string; x: number; y: number } | null;
type ViewCtxMenu = { view: ViewMode; x: number; y: number } | null;

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
    sidebarLabelsVisible,
  } = useAppStore();

  const [isProjectsOpen, setIsProjectsOpen] = useState(true);
  const [isFoldersOpen, setIsFoldersOpen] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const newProjectInputRef = useRef<HTMLInputElement>(null);

  // Oculta el label del tab activo del menú de secciones si, con el
  // sidebar angosto, no entra en su botón sin desbordarse — se mide el
  // ancho real en vez de un umbral fijo porque el largo del texto varía
  // por idioma (p. ej. "Overtime" en inglés es más largo que "Extras").
  // Se decide en base al label MÁS ANCHO de los cuatro (no solo el del
  // tab activo): si no, un texto corto como "Notas" seguía entrando a
  // un ancho donde uno más largo como "Tareas" ya no — el mismo ancho
  // de sidebar mostraba u ocultaba el texto según qué pestaña estuviera
  // activa, inconsistente al cambiar de tab sin tocar el resize.
  const [activeSectionLabelFits, setActiveSectionLabelFits] = useState(true);
  const sectionGridRef = useRef<HTMLDivElement>(null);
  const sectionBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Margen de aire: si el texto entra pero raspando el borde del botón
  // se ve apretado (encontrado probando con "Tareas" a 170px: entraba
  // por 3px y se veía mal) — exigir este colchón lo oculta antes de
  // llegar a ese punto, no solo cuando desborda de verdad.
  const LABEL_FIT_MARGIN_PX = 8;

  useEffect(() => {
    const checkFit = () => {
      const btns = Object.values(sectionBtnRefs.current).filter((b): b is HTMLButtonElement => b !== null);
      if (btns.length === 0) { setActiveSectionLabelFits(true); return; }
      const btnWidth = btns[0].clientWidth;
      const widestLabel = Math.max(...btns.map((b) => b.querySelector('span')?.scrollWidth ?? 0));
      setActiveSectionLabelFits(widestLabel + LABEL_FIT_MARGIN_PX <= btnWidth);
    };
    checkFit();
    const grid = sectionGridRef.current;
    if (!grid) return;
    const observer = new ResizeObserver(checkFit);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [sidebarLabelsVisible, language]);

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
  const projectCtxLayout = usePositionedMenu(projectCtx, {
    estimatedSize: ESTIMATED_PROJECT_MENU,
    onClose: () => setProjectCtx(null),
  });
  const [renamingProject, setRenamingProject] = useState<string | null>(null);

  const [projectAreaCtx, setProjectAreaCtx] = useState<{ x: number; y: number } | null>(null);
  const projectAreaCtxLayout = usePositionedMenu(projectAreaCtx, {
    estimatedSize: ESTIMATED_AREA_MENU,
    onClose: () => setProjectAreaCtx(null),
  });

  const [viewCtx, setViewCtx] = useState<ViewCtxMenu>(null);
  const viewCtxLayout = usePositionedMenu(viewCtx, {
    estimatedSize: ESTIMATED_VIEW_MENU,
    onClose: () => setViewCtx(null),
  });

  // Modal renombrar carpeta
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);

  // Menú contextual en carpetas
  const [folderCtx, setFolderCtx] = useState<FolderCtxMenu>(null);
  const folderCtxLayout = usePositionedMenu(folderCtx, {
    estimatedSize: ESTIMATED_FOLDER_MENU,
    onClose: () => setFolderCtx(null),
  });

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
  const areaCtxLayout = usePositionedMenu(areaCtx, {
    estimatedSize: ESTIMATED_AREA_MENU,
    onClose: () => setAreaCtx(null),
  });

  // Menú contextual de mes en Dailys
  const [dailyMonthCtx, setDailyMonthCtx] = useState<{ ym: string; x: number; y: number } | null>(null);
  const dailyMonthCtxLayout = usePositionedMenu(dailyMonthCtx, {
    estimatedSize: ESTIMATED_DAILY_MONTH_MENU,
    onClose: () => setDailyMonthCtx(null),
  });
  const confirmDeleteDailyMonthDialog = useConfirmDelete<string>(confirmDestructiveActions);
  const confirmDeleteFolderDialog = useConfirmDelete<string>(confirmDestructiveActions);
  const confirmDeleteProjectDialog = useConfirmDelete<string>(confirmDestructiveActions);
  const [exportingDailyMonth, setExportingDailyMonth] = useState(false);

  const handleExportDailyMonth = async (ym: string, format: 'pdf' | 'md' | 'txt') => {
    setDailyMonthCtx(null);
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
        .sort(([a], [b]) => a.localeCompare(b)) as [string, string][];

      const wrote = await exportDailyMonthEntries(ym, label, entries, format);
      if (wrote) {
        showToast({ kind: 'success', title: t(language, 'toast', 'dailyExported'), description: `${label}.${format}` });
      }
    } finally {
      setExportingDailyMonth(false);
    }
  };

  // Menú contextual de mes en Extras
  const [overtimeMonthCtx, setOvertimeMonthCtx] = useState<{ ym: string; x: number; y: number } | null>(null);
  const overtimeMonthCtxLayout = usePositionedMenu(overtimeMonthCtx, {
    estimatedSize: ESTIMATED_OVERTIME_MENU,
    onClose: () => setOvertimeMonthCtx(null),
  });
  const confirmDeleteOvertimeMonthDialog = useConfirmDelete<string>(confirmDestructiveActions);

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
    setProjectCtx({ project, x: e.clientX, y: e.clientY });
  };

  const handleProjectStartRename = () => {
    if (!projectCtx) return;
    setRenamingProject(projectCtx.project);
    setProjectCtx(null);
  };

  const handleProjectRenameConfirm = async (newValue: string) => {
    if (!renamingProject || !newValue.trim()) {
      setRenamingProject(null);
      return;
    }
    const leaf = renamingProject.split('/').pop() ?? renamingProject;
    if (newValue.trim() === leaf) {
      setRenamingProject(null);
      return;
    }
    await renameProject(renamingProject, newValue.trim());
    setRenamingProject(null);
  };

  const handleProjectDelete = () => {
    if (!projectCtx) return;
    const project = projectCtx.project;
    setProjectCtx(null);
    confirmDeleteProjectDialog.request(project, (p) => void deleteProject(p));
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
    setFolderCtx({ folder, x: e.clientX, y: e.clientY });
  };

  const handleStartRename = () => {
    if (!folderCtx) return;
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

  const handleRenameConfirm = async (newValue: string) => {
    if (!renamingFolder || !newValue.trim() || newValue.trim() === renamingFolder) {
      setRenamingFolder(null);
      return;
    }
    await renameNoteFolder(renamingFolder, newValue.trim());
    setRenamingFolder(null);
  };

  const handleDeleteFolder = () => {
    if (!folderCtx) return;
    const folder = folderCtx.folder;
    setFolderCtx(null);
    confirmDeleteFolderDialog.request(folder, (f) => void deleteNoteFolder(f));
  };

  const handleShareFolder = () => {
    if (!folderCtx || !basePath) return;
    const path = `${basePath}/notes/${folderCtx.folder}`;
    setFolderCtx(null);
    import('../../lib/invoke').then(({ fs }) => fs.openInSystem(path));
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
    setFolderCtx(null);
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
          <svg viewBox="0 0 64 64" className="h-[18px] w-[18px]" role="img" aria-label="Logday">
            <rect x="0" y="0" width="64" height="64" rx="15" fill="var(--accent)" />
            <path d="M19 13.5h19L47 21.5V48.5a2 2 0 0 1-2 2H19a2 2 0 0 1-2-2V15.5a2 2 0 0 1 2-2z" fill="#ffffff" />
            <path d="M38 13.5L47 21.5h-9z" fill="var(--accent)" fillOpacity={0.24} />
            <path d="M20 36h4l3-8.5 4.5 13L44 25" fill="none" stroke="var(--accent)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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
    <div className="flex h-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)] text-xs" style={{ width: 'var(--logday-sidebar-w)' }}>
      {/* App header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-3">
        <button
          onClick={() => setSection('dashboard')}
          className="flex items-center gap-2"
          title={t(language, 'sidebar', 'dashboard')}
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent)]">
            <svg viewBox="0 0 64 64" className="h-5 w-5" role="img" aria-label="Logday">
              <path d="M19 13.5h19L47 21.5V48.5a2 2 0 0 1-2 2H19a2 2 0 0 1-2-2V15.5a2 2 0 0 1 2-2z" fill="#ffffff" />
              <path d="M38 13.5L47 21.5h-9z" fill="var(--accent)" fillOpacity={0.24} />
              <path d="M20 36h4l3-8.5 4.5 13L44 25" fill="none" stroke="var(--accent)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="brand-wordmark text-base">log<span className="accent">day</span></span>
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
      <div ref={sectionGridRef} className="grid grid-cols-4 border-b border-[var(--border)] px-2 py-2 gap-1">
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
              ref={(el) => { sectionBtnRefs.current[id] = el; }}
              onClick={() => setSection(id)}
              className={`flex h-[42px] flex-col items-center justify-center gap-0.5 rounded-lg transition-[background-color,color] duration-200 ${
                isActive
                  ? 'bg-indigo-500/15 text-indigo-400 font-medium'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]'
              }`}
              title={label}
            >
              <Icon size={14} className="shrink-0" />
              {sidebarLabelsVisible && (
                <span
                  className={`whitespace-nowrap text-[10px] leading-tight transition-all duration-200 ${
                    isActive && activeSectionLabelFits ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'
                  }`}
                >
                  {label}
                </span>
              )}
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
              setProjectAreaCtx({ x: e.clientX, y: e.clientY });
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
          <div className="fixed inset-0 z-40" onMouseDown={() => setViewCtx(null)} />
          <div
            ref={viewCtxLayout.ref}
            className="fixed z-50 min-w-[150px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl py-1"
            style={viewCtxLayout.style}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setView(viewCtx.view); setViewCtx(null); }}
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
          <div className="fixed inset-0 z-40" onMouseDown={() => setProjectAreaCtx(null)} />
          <div
            ref={projectAreaCtxLayout.ref}
            className="fixed z-50 min-w-[160px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl py-1"
            style={projectAreaCtxLayout.style}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setProjectAreaCtx(null); setShowNewProject(true); }}
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
          <div className="fixed inset-0 z-40" onMouseDown={() => setProjectCtx(null)} />
          <div
            ref={projectCtxLayout.ref}
            className="fixed z-50 min-w-[170px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl py-1"
            style={projectCtxLayout.style}
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

      {/* Confirmación eliminar proyecto */}
      {confirmDeleteProjectDialog.isOpen && confirmDeleteProjectDialog.pending && (
        <ConfirmDeleteModal
          title={t(language, 'sidebar', 'deleteProjectConfirmTitle')}
          message={
            <>
              {t(language, 'sidebar', 'deleteProjectConfirmMsg')} &quot;{confirmDeleteProjectDialog.pending}&quot;?{' '}
              {t(language, 'sidebar', 'deleteProjectConfirmDesc')}
            </>
          }
          cancelLabel={t(language, 'sidebar', 'cancel')}
          confirmLabel={t(language, 'sidebar', 'deleteFolder')}
          onCancel={confirmDeleteProjectDialog.cancel}
          onConfirm={() => {
            const project = confirmDeleteProjectDialog.pending!;
            confirmDeleteProjectDialog.cancel();
            void deleteProject(project);
          }}
        />
      )}

      {/* Modal nueva subcarpeta de proyecto */}
      {projectSubfolderParent !== null && (
        <ModalOverlay onClose={() => { setProjectSubfolderParent(null); setNewProjectSubfolderName(''); }}>
          <ModalPanel className="w-72 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
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
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* NOTES SECTION */}
      {activeSection === 'notes' && (
        <div
          data-root-zone
          className="mt-2 flex-1 overflow-y-auto px-2"
          onContextMenu={(e) => {
            if ((e.target as HTMLElement).closest('[data-folder-item]')) return;
            e.preventDefault();
            setAreaCtx({ x: e.clientX, y: e.clientY });
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
          <div className="fixed inset-0 z-40" onMouseDown={() => setAreaCtx(null)} />
          <div
            ref={areaCtxLayout.ref}
            className="fixed z-50 min-w-[160px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl py-1"
            style={areaCtxLayout.style}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setAreaCtx(null); setShowCreateFolderModal(true); }}
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
        <ModalOverlay onClose={() => { setShowCreateFolderModal(false); setNewFolderName(''); }}>
          <ModalPanel className="w-72 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
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
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* Ctx menú de carpeta */}
      {folderCtx && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setFolderCtx(null)} />
          <div
            ref={folderCtxLayout.ref}
            className="fixed z-50 min-w-[160px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl py-1"
            style={folderCtxLayout.style}
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

      {/* Confirmación eliminar carpeta de notas */}
      {confirmDeleteFolderDialog.isOpen && confirmDeleteFolderDialog.pending && (
        <ConfirmDeleteModal
          title={t(language, 'sidebar', 'deleteFolderConfirmTitle')}
          message={
            <>
              {t(language, 'sidebar', 'deleteFolderConfirmMsg')} &quot;{confirmDeleteFolderDialog.pending}&quot;?{' '}
              {t(language, 'sidebar', 'deleteFolderConfirmDesc')}
            </>
          }
          cancelLabel={t(language, 'sidebar', 'cancel')}
          confirmLabel={t(language, 'sidebar', 'deleteFolder')}
          onCancel={confirmDeleteFolderDialog.cancel}
          onConfirm={() => {
            const folder = confirmDeleteFolderDialog.pending!;
            confirmDeleteFolderDialog.cancel();
            void deleteNoteFolder(folder);
          }}
        />
      )}

      {/* Modal nueva subcarpeta */}
      {subfolderParent !== null && (
        <ModalOverlay onClose={() => { setSubfolderParent(null); setNewSubfolderName(''); }}>
          <ModalPanel className="w-72 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
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
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* Modal editar tags de carpeta */}
      {editingTagsFolder !== null && (
        <ModalOverlay onClose={() => setEditingTagsFolder(null)}>
          <ModalPanel className="w-72 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
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
          </ModalPanel>
        </ModalOverlay>
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
        <ModalOverlay onClose={() => { setShowNewProject(false); setNewProjectName(''); }} className="px-4">
          <ModalPanel className="w-full max-w-xs rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
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
          </ModalPanel>
        </ModalOverlay>
      )}

      {/* Menú contextual mes de Dailys */}
      {dailyMonthCtx && (() => {
        const label = formatYearMonthLabel(dailyMonthCtx.ym, language, 'short');
        return (
          <div
            ref={dailyMonthCtxLayout.ref}
            style={{ ...dailyMonthCtxLayout.style, zIndex: 9999 }}
            className="min-w-[210px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
          >
            <button
              onClick={() => { setActiveDailyMonth(dailyMonthCtx.ym); setDailyMonthCtx(null); }}
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
              onClick={() => {
                confirmDeleteDailyMonthDialog.request(dailyMonthCtx.ym, (ym) => void deleteDailyMonth(ym));
                setDailyMonthCtx(null);
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
      {confirmDeleteDailyMonthDialog.isOpen && confirmDeleteDailyMonthDialog.pending && (() => {
        const ym = confirmDeleteDailyMonthDialog.pending;
        const label = formatYearMonthLabel(ym, language, 'long');
        return (
          <ConfirmDeleteModal
            title={<>{t(language, 'sidebar', 'deleteDailyMonthTitle')} {label}</>}
            message={
              <>
                {t(language, 'sidebar', 'deleteDailyMonthDescStart')} <span className="font-medium text-[var(--text-primary)]">{t(language, 'sidebar', 'deleteDailyMonthDescAllEntries')}</span> {t(language, 'sidebar', 'deleteDailyMonthDescOfMonth')} <span className="font-medium text-[var(--text-primary)]">{label}</span>. {t(language, 'sidebar', 'deleteDailyMonthDescEnd')}
              </>
            }
            cancelLabel={t(language, 'sidebar', 'cancel')}
            confirmLabel={t(language, 'sidebar', 'deleteAll')}
            onCancel={confirmDeleteDailyMonthDialog.cancel}
            onConfirm={async () => { await deleteDailyMonth(ym); confirmDeleteDailyMonthDialog.cancel(); }}
          />
        );
      })()}

      {/* Menú contextual mes de Extras */}
      {overtimeMonthCtx && (() => {
        const label = formatYearMonthLabel(overtimeMonthCtx.ym, language, 'short');
        return (
          <div
            ref={overtimeMonthCtxLayout.ref}
            style={{ ...overtimeMonthCtxLayout.style, zIndex: 9999 }}
            className="min-w-[180px] rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
          >
            <button
              onClick={() => { loadOvertimeMonth(overtimeMonthCtx.ym); setOvertimeMonthCtx(null); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition"
            >
              <Timer size={13} />
              {t(language, 'sidebar', 'goToMonth')} {label}
            </button>
            <div className="mx-2 my-1 border-t border-[var(--border)]" />
            <button
              onClick={() => {
                confirmDeleteOvertimeMonthDialog.request(overtimeMonthCtx.ym, (ym) => void deleteOvertimeMonth(ym));
                setOvertimeMonthCtx(null);
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
      {confirmDeleteOvertimeMonthDialog.isOpen && confirmDeleteOvertimeMonthDialog.pending && (() => {
        const ym = confirmDeleteOvertimeMonthDialog.pending;
        const label = formatYearMonthLabel(ym, language, 'long');
        return (
          <ConfirmDeleteModal
            title={<>{t(language, 'sidebar', 'deleteOvertimeMonthTitle')} {label}</>}
            message={
              <>
                {t(language, 'sidebar', 'deleteOvertimeMonthDescStart')} <span className="font-medium text-[var(--text-primary)]">{t(language, 'sidebar', 'deleteOvertimeMonthDescAllEntries')}</span> {t(language, 'sidebar', 'deleteOvertimeMonthDescOfMonth')} <span className="font-medium text-[var(--text-primary)]">{label}</span>. {t(language, 'sidebar', 'deleteOvertimeMonthDescEnd')}
              </>
            }
            cancelLabel={t(language, 'sidebar', 'cancel')}
            confirmLabel={t(language, 'sidebar', 'deleteAll')}
            onCancel={confirmDeleteOvertimeMonthDialog.cancel}
            onConfirm={async () => { await deleteOvertimeMonth(ym); confirmDeleteOvertimeMonthDialog.cancel(); }}
          />
        );
      })()}
    </div>
  );
}
