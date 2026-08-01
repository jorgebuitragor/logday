import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, GripVertical } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';
import { FolderNode } from '../lib/folderTree';
import { registerDropHighlight, unregisterDropHighlight, startFolderDrag } from '../lib/folderDragDrop';
import InlineRenameInput from './InlineRenameInput';

interface ProjectTreeItemProps {
  node: FolderNode;
  depth: number;
  activeProject: string | null;
  renamingProject: string | null;
  setRenamingProject: (f: string | null) => void;
  handleProjectRenameConfirm: (newValue: string) => void;
  handleProjectContextMenu: (e: React.MouseEvent, project: string) => void;
  selectProject: (p: string | null) => void;
  expandedProjects: Set<string>;
  setExpandedProjects: React.Dispatch<React.SetStateAction<Set<string>>>;
  moveProject: (project: string, targetParent: string) => Promise<void>;
}

export function ProjectTreeItem({
  node,
  depth,
  activeProject,
  renamingProject,
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
    registerDropHighlight(node.path, setIsDragOver);
    return () => unregisterDropHighlight(node.path);
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
          <InlineRenameInput
            value={node.name}
            onCommit={handleProjectRenameConfirm}
            onCancel={() => setRenamingProject(null)}
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
