// "Traer de una nota" (design §6.2): primero la nota (solo las que tienen
// bloques de código), después el bloque. Combobox con ↑/↓ y Enter, y una
// trampa de foco propia porque `ModalPanel` no la tiene (hallazgo 6).
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, Search } from 'lucide-react';
import type { Note } from '../../../types/note';
import { ModalOverlay } from '../../../components/shared/ModalOverlay';
import { ModalPanel } from '../../../components/shared/ModalPanel';
import { noteCodeBlocks, toolForBlock, type NoteCodeBlock } from '../model';
import { readAllNotes } from '../notes';
import { useDevtools } from './context';
import { fallbackTool } from './meta';
import { fold, toolKey } from './text';
import { FOCUS_RING } from './classes';
import { Spinner } from './controls';

interface NoteWithBlocks {
  note: Note;
  blocks: NoteCodeBlock[];
}

const FOCUSABLE = 'button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';

export function NotePicker({ onClose, onPick }: { onClose: () => void; onPick: (note: Note, block: NoteCodeBlock) => void }) {
  const { tr, tool, available } = useDevtools();
  const [notes, setNotes] = useState<NoteWithBlocks[] | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState<NoteWithBlocks | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    void readAllNotes().then((all) => {
      if (!alive) return;
      setNotes(all.map((note) => ({ note, blocks: noteCodeBlocks(note.content) })).filter((n) => n.blocks.length));
    });
    return () => {
      alive = false;
    };
  }, []);

  // Al cerrar, el foco vuelve a donde estaba ("Traer de una nota" o el campo).
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    if (chosen) backRef.current?.focus();
    else inputRef.current?.focus();
  }, [chosen]);

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    return (notes ?? []).filter((n) => !q || fold(n.note.title).includes(q));
  }, [notes, query]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (chosen) setChosen(null);
      else onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = filtered.length;
      if (n) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    } else if (e.key === 'Enter' && filtered[active]) {
      e.preventDefault();
      setChosen(filtered[active]);
    }
  };

  const optionId = (i: number) => `devtools-picker-note-${i}`;
  const blockAction = (block: NoteCodeBlock) => {
    const target = toolForBlock(block, available);
    return target
      ? tr('pickerOpenIn', { tool: tr(toolKey(target, 'name')) })
      : tr('pickerLoadInto', { tool: tr(toolKey(fallbackTool(tool), 'name')) });
  };

  return (
    <ModalOverlay onClose={onClose} align="start" className="px-4 pt-[15vh]">
      <ModalPanel className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl">
        <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="devtools-picker-title" onKeyDown={onKeyDown}>
          <h2 id="devtools-picker-title" className="sr-only">{tr('pickerTitle')}</h2>
          {!chosen ? (
            <>
              <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3.5">
                <Search size={16} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
                <input
                  ref={inputRef}
                  role="combobox"
                  aria-expanded
                  aria-controls="devtools-picker-list"
                  aria-activedescendant={filtered[active] ? optionId(active) : undefined}
                  aria-label={tr('pickerSearch')}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onSearchKey}
                  placeholder={tr('pickerSearch')}
                  spellCheck={false}
                  autoComplete="off"
                  className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-hint)] outline-none"
                />
                <kbd className="rounded-md border border-[var(--border-card)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[10px] text-[var(--text-hint)]">ESC</kbd>
              </div>
              <div id="devtools-picker-list" role="listbox" aria-label={tr('pickerTitle')} className="max-h-[400px] overflow-y-auto p-1.5">
                {notes === null ? (
                  <p className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-hint)]"><Spinner /> {tr('pickerLoading')}</p>
                ) : !notes.length ? (
                  <p className="py-10 text-center text-sm text-[var(--text-hint)]">{tr('pickerEmpty')}</p>
                ) : !filtered.length ? (
                  <p className="py-10 text-center text-sm text-[var(--text-hint)]">{tr('pickerNoResults', { q: query })}</p>
                ) : (
                  filtered.map((n, i) => (
                    <div
                      key={n.note.id}
                      id={optionId(i)}
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => setChosen(n)}
                      className={`cursor-pointer rounded-lg px-3 py-2 ${i === active ? 'bg-[var(--bg-hover)]' : ''}`}
                    >
                      <div className="truncate text-sm font-medium text-[var(--text-body)]">{n.note.title}</div>
                      <div className="text-[10px] text-[var(--text-hint)]">
                        {n.blocks.length === 1 ? tr('pickerOneBlock') : tr('pickerBlocks', { n: n.blocks.length })}
                        {n.note.folder ? ` · ${n.note.folder}` : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
                <button
                  ref={backRef}
                  type="button"
                  onClick={() => setChosen(null)}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] ${FOCUS_RING}`}
                >
                  <ChevronLeft size={14} aria-hidden />
                  {tr('pickerBack')}
                </button>
                <span className="min-w-0 truncate text-sm font-medium text-[var(--text-primary)]">{chosen.note.title}</span>
              </div>
              <ul className="max-h-[400px] overflow-y-auto p-1.5">
                {chosen.blocks.map((block, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-[var(--bg-hover)]">
                    <div className="min-w-0 flex-1">
                      <span className="rounded-md bg-[var(--bg-hover)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
                        {block.language || tr('pickerNoLang')}
                      </span>
                      <pre className="mt-1 line-clamp-3 whitespace-pre-wrap break-all font-mono text-[11px] text-[var(--text-secondary)]">
                        {block.code.split('\n').slice(0, 3).join('\n')}
                      </pre>
                    </div>
                    <button
                      type="button"
                      onClick={() => onPick(chosen.note, block)}
                      className={`shrink-0 rounded-lg border border-[var(--border-card)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)] ${FOCUS_RING}`}
                    >
                      {blockAction(block)}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}
