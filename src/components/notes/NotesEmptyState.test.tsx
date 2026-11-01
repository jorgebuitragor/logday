import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { t } from '../../lib/i18n';

const app = vi.hoisted(() => ({
  language: 'es' as 'es' | 'en',
  notes: [] as unknown[],
  createNote: async () => ({}),
  shortcuts: { newNote: 'n', newTask: 't', search: 'f', newDaily: 'd', markAbsence: 'a' },
}));

vi.mock('../../store/appStore', () => {
  const useAppStore = (select?: (s: typeof app) => unknown) => (select ? select(app) : app);
  useAppStore.getState = () => app;
  return { useAppStore };
});

import { NotesEmptyState, newNoteShortcut } from './NotesEmptyState';

describe('Notas sin nota abierta', () => {
  it('sin ninguna nota, invita a crear la primera con un botón', () => {
    app.notes = [];
    const html = renderToStaticMarkup(<NotesEmptyState />);
    expect(html).toContain(t('es', 'notes', 'emptyStateTitle'));
    expect(html).toContain(t('es', 'notes', 'emptyStateHint'));
    expect(html).toMatch(/<button[^>]*>.*Nueva nota.*<\/button>/);
    expect(html).toContain('bg-[var(--accent-solid)]');
  });

  it('con notas, pide elegir una y deja el botón como secundario', () => {
    app.notes = [{}];
    const html = renderToStaticMarkup(<NotesEmptyState />);
    expect(html).toContain(t('es', 'notes', 'selectOrCreate'));
    expect(html).not.toContain(t('es', 'notes', 'emptyStateTitle'));
    expect(html).toContain('Nueva nota');
    expect(html).not.toContain('bg-[var(--accent-solid)]');
  });

  it('el atajo sale de la config, con ⌘ o Ctrl', () => {
    expect(newNoteShortcut('n', true)).toBe('⌘N');
    expect(newNoteShortcut('m', false)).toBe('Ctrl+M');
  });

  it('los textos nuevos existen en es y en', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const key of ['createFirstNote', 'emptyStateTitle', 'emptyStateHint'] as const) {
        expect(t(lang, 'notes', key)).toBeTruthy();
      }
    }
  });
});
