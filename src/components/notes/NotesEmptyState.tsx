import { Notebook, Plus } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { IS_MAC } from '../sidebar/sections';

/** El atajo de "Nueva nota" como se escribe en el sistema: ⌘N o Ctrl+N. */
export function newNoteShortcut(key: string, mac: boolean): string {
  const k = key.toUpperCase();
  return mac ? `⌘${k}` : `Ctrl+${k}`;
}

/** El panel de Notas sin nota abierta. Si todavía no hay ninguna, invita a
 *  crear la primera con un botón; antes solo decía "Selecciona o crea una
 *  nota" y el único acceso era un ícono chico en el menú lateral (Jorge, 31
 *  oct 2026). */
export function NotesEmptyState() {
  const { language, hasNotes, createNote, newNoteKey } = useAppStore(
    useShallow((s) => ({
      language: s.language,
      hasNotes: s.notes.length > 0,
      createNote: s.createNote,
      newNoteKey: s.shortcuts.newNote,
    })),
  );
  const shortcut = newNoteShortcut(newNoteKey, IS_MAC);
  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--bg-base)]">
      <div className="flex max-w-xs flex-col items-center gap-3 px-6 text-center">
        {!hasNotes && <Notebook size={36} className="text-[var(--text-faint)]" strokeWidth={1.5} aria-hidden="true" />}
        <div>
          <p className="text-sm text-[var(--text-hint)]">
            {t(language, 'notes', hasNotes ? 'selectOrCreate' : 'emptyStateTitle')}
          </p>
          {!hasNotes && (
            <p className="mt-1 text-xs text-[var(--text-faint)]">{t(language, 'notes', 'emptyStateHint')}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void createNote()}
          className={
            hasNotes
              ? 'flex items-center gap-1.5 rounded-lg border border-[var(--border-card)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'
              : 'mt-1 flex items-center gap-1.5 rounded-lg bg-[var(--accent-solid)] px-4 py-2 text-sm text-[var(--accent-on)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'
          }
        >
          <Plus size={14} aria-hidden="true" />
          {t(language, 'notes', 'newNote')}
          <kbd className="ml-1 rounded border border-current/30 px-1 font-sans text-[10px] opacity-70">{shortcut}</kbd>
        </button>
      </div>
    </div>
  );
}
