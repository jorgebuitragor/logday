import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { t } from '../../lib/i18n';
import type { Note } from '../../types/note';

// El menú contextual de una nota es el mismo en la lista y en el árbol
// (pedido de Jorge, 31 oct 2026): las dos vistas pintan el menú del mismo
// hook y renombran en su fila.

const note = (over: Partial<Note> = {}): Note => ({
  id: 'n1', title: 'Plan', folder: 'trabajo', tags: [], created: '', updated: '',
  pinned: false, content: 'x', filePath: '/b/notes/trabajo/n1.md', ...over,
});

const app = vi.hoisted(() => ({
  language: 'es' as 'es' | 'en',
  notes: [] as unknown[],
  activeNote: null as unknown,
  activeSection: 'notes',
  noteFolders: ['trabajo'] as string[],
  activeNoteFolder: null as string | null,
  basePath: '/b',
  confirmDestructiveActions: true,
  noteSortBy: 'updated',
  noteSortDir: 'desc',
  setNoteSort: () => {},
  setActiveNote: () => {},
  createNote: async () => ({}),
  deleteNote: async () => {},
  duplicateNote: async () => {},
  toggleNotePin: async () => {},
  moveNote: async () => {},
  renameNote: async () => {},
  updateNote: async () => {},
  importNotesFromPaths: async () => {},
  selectNoteFolder: () => {},
  setTreeNoteFolder: () => {},
}));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select?: (s: typeof app) => unknown) => (select ? select(app) : app);
  useAppStore.getState = () => app;
  return { useAppStore };
});

// Las vistas usan el hook de verdad; solo se marca su `element` y se puede
// fingir una nota en renombrado, porque sin DOM no hay clic derecho.
const menuSpy = vi.hoisted(() => ({ calls: 0, renamingNoteId: null as string | null }));
vi.mock('./NoteContextMenu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./NoteContextMenu')>();
  return {
    ...actual,
    useNoteContextMenu: (opts: Parameters<typeof actual.useNoteContextMenu>[0]) => {
      menuSpy.calls += 1;
      const api = actual.useNoteContextMenu(opts);
      return {
        ...api,
        renamingNoteId: menuSpy.renamingNoteId,
        element: <>{api.element}<i data-shared-note-menu="" /></>,
      };
    },
  };
});

import { NoteContextMenuPanel, moveTargets } from './NoteContextMenu';
import { NoteList } from './NoteList';
import { NoteTree } from '../sidebar/NoteTree';

const noop = () => {};
const panelProps = {
  language: 'es' as const, canMove: true, disableNewNote: false, isWindows: false, subMenuOpen: false,
  onNewNoteInFolder: noop, onRename: noop, onEditTags: noop, onCopy: noop, onDuplicate: noop,
  onTogglePin: noop, onToggleMove: noop, onShowInSystem: noop, onExport: noop, onDelete: noop,
};

const buttonLabels = (html: string) =>
  [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());

const treeProps = {
  renamingFolder: null, setRenamingFolder: noop, handleRenameConfirm: noop, handleFolderContextMenu: noop,
  folderTags: {}, expandedFolders: new Set<string>(['trabajo']), setExpandedFolders: noop,
  moveNoteFolder: async () => {},
};

describe('Menú contextual de una nota', () => {
  it('tiene las opciones de la lista, en su orden, con "Nueva nota en esta carpeta" arriba', () => {
    const html = renderToStaticMarkup(<NoteContextMenuPanel note={note()} {...panelProps} />);
    expect(buttonLabels(html)).toEqual([
      t('es', 'sidebar', 'newNoteInFolder'),
      t('es', 'notes', 'rename'),
      t('es', 'notes', 'editTags'),
      t('es', 'notes', 'copy'),
      t('es', 'notes', 'duplicate'),
      t('es', 'notes', 'pin'),
      t('es', 'notes', 'moveTo'),
      t('es', 'notes', 'showInFinder'),
      t('es', 'notes', 'export'),
      t('es', 'notes', 'delete'),
    ]);
  });

  it('cambia Fijar por Desfijar, Finder por Explorador, y sin carpetas destino no ofrece Mover a', () => {
    const html = renderToStaticMarkup(
      <NoteContextMenuPanel note={note({ pinned: true })} {...panelProps} canMove={false} isWindows />,
    );
    const labels = buttonLabels(html);
    expect(labels).toContain(t('es', 'notes', 'unpin'));
    expect(labels).toContain(t('es', 'notes', 'showInExplorer'));
    expect(labels).not.toContain(t('es', 'notes', 'moveTo'));
  });

  it('con una nota nueva sin escribir, no deja crear otra', () => {
    const html = renderToStaticMarkup(<NoteContextMenuPanel note={note()} {...panelProps} disableNewNote />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Nueva nota en esta carpeta/);
  });

  it('Mover a ofrece todas las carpetas menos la de la nota', () => {
    expect(moveTargets(note({ folder: 'trabajo' }), ['trabajo', 'casa'])).toEqual(['', 'casa']);
    expect(moveTargets(note({ folder: '' }), ['trabajo'])).toEqual(['trabajo']);
  });

  it('la lista y el árbol pintan el mismo menú y renombran en la fila', () => {
    app.notes = [note()];
    menuSpy.renamingNoteId = 'n1';
    for (const View of [() => <NoteList />, () => <NoteTree {...treeProps} />]) {
      menuSpy.calls = 0;
      const html = renderToStaticMarkup(<View />);
      expect(menuSpy.calls).toBe(1);
      expect(html).toContain('data-shared-note-menu');
      expect(html).toMatch(/<input[^>]*value="Plan"/);
    }
    menuSpy.renamingNoteId = null;
    const tree = renderToStaticMarkup(<NoteTree {...treeProps} />);
    expect(tree).not.toMatch(/<input/);
    expect(tree).toContain('data-tree-note="n1"');
  });
});
