import { useEffect, useState, type ReactNode } from 'react';
import type { Note } from '../../types/note';
import { ChevronDown, ChevronRight, FolderOpen, GripVertical } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { FolderNode } from '../../lib/folderTree';
import { registerDropHighlight, unregisterDropHighlight, startFolderDrag } from '../../lib/folderDragDrop';
import InlineRenameInput from '../shared/InlineRenameInput';

interface FolderTreeItemProps {
  node: FolderNode;
  depth: number;
  activeNoteFolder: string | null;
  renamingFolder: string | null;
  setRenamingFolder: (f: string | null) => void;
  handleRenameConfirm: (newValue: string) => void;
  handleFolderContextMenu: (e: React.MouseEvent, folder: string) => void;
  selectNoteFolder: (f: string | null) => void;
  folderTags: Record<string, string[]>;
  expandedFolders: Set<string>;
  setExpandedFolders: React.Dispatch<React.SetStateAction<Set<string>>>;
  moveNoteFolder: (folder: string, targetParent: string) => Promise<void>;
  /** Vista de árbol: las notas de cada carpeta, ya ordenadas. Si viene,
   *  la carpeta muestra sus notas debajo de sus subcarpetas. */
  notesByFolder?: Map<string, Note[]>;
  renderNote?: (note: Note, depth: number) => ReactNode;
  /** Vista de árbol: clic en la carpeta (en vez de selectNoteFolder). */
  onTreeFolderClick?: (path: string) => void;
}

export function FolderTreeItem({
  node, depth, activeNoteFolder, renamingFolder,
  setRenamingFolder, handleRenameConfirm, handleFolderContextMenu,
  selectNoteFolder, folderTags, expandedFolders, setExpandedFolders, moveNoteFolder,
  notesByFolder, renderNote, onTreeFolderClick,
}: FolderTreeItemProps) {
  const notesHere = notesByFolder?.get(node.path) ?? [];
  const hasChildren = node.children.length > 0 || notesHere.length > 0;
  const isExpanded = expandedFolders.has(node.path);
  const isActive = activeNoteFolder === node.path;
  const tags = folderTags[node.path] ?? [];
  const indent = depth * 12;
  const [isDragOver, setIsDragOver] = useState(false);

  // Registrar callback de highlight para este nodo
  useEffect(() => {
    registerDropHighlight(node.path, setIsDragOver);
    return () => unregisterDropHighlight(node.path);
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
          <InlineRenameInput
            value={node.path}
            onCommit={handleRenameConfirm}
            onCancel={() => setRenamingFolder(null)}
            className="flex-1 rounded border border-indigo-500/40 bg-[var(--bg-surface)] px-1 py-0.5 text-xs text-[var(--text-primary)] outline-none"
          />
        ) : (
          <button
            onClick={() => {
              if (!onTreeFolderClick) {
                selectNoteFolder(node.path);
                return;
              }
              onTreeFolderClick(node.path);
              setExpandedFolders((prev) => {
                const next = new Set(prev);
                if (next.has(node.path)) next.delete(node.path);
                else next.add(node.path);
                return next;
              });
            }}
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
              setRenamingFolder={setRenamingFolder}
              handleRenameConfirm={handleRenameConfirm}
              handleFolderContextMenu={handleFolderContextMenu}
              selectNoteFolder={selectNoteFolder}
              folderTags={folderTags}
              expandedFolders={expandedFolders}
              setExpandedFolders={setExpandedFolders}
              moveNoteFolder={moveNoteFolder}
              notesByFolder={notesByFolder}
              renderNote={renderNote}
              onTreeFolderClick={onTreeFolderClick}
            />
          ))}
          {renderNote && notesHere.map((note) => renderNote(note, depth + 1))}
        </div>
      )}
    </div>
  );
}
