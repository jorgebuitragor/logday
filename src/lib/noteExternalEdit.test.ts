// Reescribir una nota desde fuera del editor (specs/cliente-http HT50,
// design §14.3): el `.md` por `updateNote` y el `Y.Text` con el mismo delta,
// como lo haría el editor. Con el store y el disco simulados.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

const env = vi.hoisted(() => ({
  open: false,
  note: null as null | { id: string; title: string; content: string; filePath: string },
  persisted: null as null | Uint8Array,
  updated: [] as { content: string }[],
  synced: [] as string[],
  order: [] as string[],
}));

vi.mock('../store/appStore', () => ({
  readNoteFromPath: async () => (env.note ? { ...env.note } : null),
  waitForNoteSave: async () => {},
  syncNoteContent: async (_g: unknown, _s: unknown, _note: unknown, doc: Y.Doc) => {
    env.order.push('sync');
    env.synced.push(doc.getText('content').toString());
  },
  useAppStore: Object.assign(() => null, {
    getState: () => ({
      updateNote: async (note: { content: string }) => {
        env.order.push('md');
        env.updated.push(note);
      },
    }),
    setState: () => {},
  }),
}));

vi.mock('./noteContentSync', async (orig) => {
  const real = await orig<typeof import('./noteContentSync')>();
  return {
    ...real,
    isNoteOpen: () => env.open,
    loadPersistedYDoc: async () => {
      if (!env.persisted) return null;
      const doc = new Y.Doc();
      Y.applyUpdate(doc, env.persisted);
      return doc;
    },
  };
});

const { editNoteContent } = await import('./noteExternalEdit');

const docWith = (text: string) => {
  const doc = new Y.Doc();
  doc.getText('content').insert(0, text);
  return Y.encodeStateAsUpdate(doc);
};

beforeEach(() => {
  env.open = false;
  env.note = { id: 'n1', title: 'API', content: 'Intro\n```http\nGET https://x.com/a\n```', filePath: '/d/notes/n1.md' };
  env.persisted = null;
  env.updated = [];
  env.synced = [];
  env.order = [];
});

describe('editNoteContent', () => {
  it('con la nota abierta en el editor, no escribe', async () => {
    env.open = true;
    expect(await editNoteContent('/d/notes/n1.md', 'n1', () => 'otro')).toEqual({ status: 'open' });
    expect(env.updated).toEqual([]);
  });

  it('una nota que no está, o con otro id: no escribe', async () => {
    expect(await editNoteContent('/d/notes/n1.md', 'n2', () => 'otro')).toEqual({ status: 'missing' });
    env.note = null;
    expect(await editNoteContent('/d/notes/n1.md', 'n1', () => 'otro')).toEqual({ status: 'missing' });
    expect(env.updated).toEqual([]);
  });

  it('si `edit` no quiere escribir (un conflicto) o no cambia nada, no escribe', async () => {
    expect(await editNoteContent('/d/notes/n1.md', 'n1', () => null)).toEqual({ status: 'declined' });
    expect(await editNoteContent('/d/notes/n1.md', 'n1', (c) => c)).toEqual({ status: 'unchanged' });
    expect(env.updated).toEqual([]);
  });

  it('escribe el Markdown y aplica al Y.Text solo el cambio, conservando lo que difiere fuera de él', async () => {
    // Otro cliente escribió "[WEB]" y el Markdown lo tiene escapado: el
    // Y.Text no lo pierde aunque se edite la petición.
    env.note!.content = '\\[WEB\\] Intro\n```http\nGET https://x.com/a\n```';
    env.persisted = docWith('[WEB] Intro\n```http\nGET https://x.com/a\n```');
    const r = await editNoteContent('/d/notes/n1.md', 'n1', (c) => c.replace('/a', '/b'));
    expect(r.status).toBe('saved');
    expect(env.updated[0].content).toBe('\\[WEB\\] Intro\n```http\nGET https://x.com/b\n```');
    expect(env.synced).toEqual(['[WEB] Intro\n```http\nGET https://x.com/b\n```']);
    expect(env.order).toEqual(['md', 'sync']);
  });

  it('sin .ydoc, lo siembra desde el Markdown como el editor y después aplica el cambio', async () => {
    const r = await editNoteContent('/d/notes/n1.md', 'n1', (c) => c.replace('/a', '/b'));
    expect(r.status).toBe('saved');
    expect(env.synced).toEqual(['Intro\n```http\nGET https://x.com/b\n```']);
  });
});
