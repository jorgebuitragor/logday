// Panel de salida (design §3 y §5): Copiar, Guardar en una nota e
// Intercambiar, el estado vacío y el "Resultado anterior" atenuado cuando
// la entrada tiene un error.
import { useState, type ReactNode } from 'react';
import { ArrowDownUp, ArrowLeftRight, FilePlus } from 'lucide-react';
import type { Note } from '../../../types/note';
import { useDevtools } from './context';
import { CopyButton, EmptyOutput, IconButton, PanelHeader } from './controls';
import { CodeText, HIGHLIGHT_LIMIT, type HighlightLanguage } from './highlight';
import { PRE_CLS, TEXT_LINK } from './classes';

export interface SwapConfig {
  onSwap: () => void;
  disabled?: boolean;
  /** `title` cuando no se puede (CSV → JSON). */
  disabledTitle?: string;
}

/** "Guardar en una nota" y, debajo, "Guardado en «…» · Abrir" mientras la
 *  salida no cambie (el toast desaparece; esto queda, WCAG 2.2.1). */
export function useSaveToNote(noteLanguage: string | null, output: string | null) {
  const { tool, saveNote } = useDevtools();
  const [saved, setSaved] = useState<{ note: Note; output: string } | null>(null);
  const can = noteLanguage !== null && !!output;
  const save = async () => {
    if (!can || noteLanguage === null || !output) return;
    const note = await saveNote(tool, noteLanguage, output);
    if (note) setSaved({ note, output });
  };
  return { can, save, saved: saved && saved.output === output ? saved.note : null };
}

export function SavedInline({ note }: { note: Note }) {
  const { tr, openNote } = useDevtools();
  return (
    <span className="text-[11px] text-[var(--text-secondary)]">
      {tr('savedInline', { title: note.title })} ·{' '}
      <button type="button" className={TEXT_LINK} onClick={() => openNote(note)}>
        {tr('openNote')}
      </button>
    </span>
  );
}

export function SaveButton({ onSave, disabled }: { onSave: () => void; disabled: boolean }) {
  const { tr } = useDevtools();
  return <IconButton icon={FilePlus} label={tr('saveToNote')} shortcut="mod+shift+S" showLabel disabled={disabled} onClick={onSave} />;
}

export function SwapButton({ swap, disabled }: { swap: SwapConfig; disabled: boolean }) {
  const { tr, shortcut } = useDevtools();
  const off = disabled || !!swap.disabled;
  const title = swap.disabled && swap.disabledTitle ? swap.disabledTitle : `${tr('swapHint')} (${shortcut('mod+shift+X')})`;
  return (
    <>
      <span className="@3xl/tool:hidden">
        <IconButton icon={ArrowDownUp} label={tr('swap')} title={title} disabled={off} onClick={swap.onSwap} />
      </span>
      <span className="hidden @3xl/tool:inline">
        <IconButton icon={ArrowLeftRight} label={tr('swap')} title={title} disabled={off} onClick={swap.onSwap} />
      </span>
    </>
  );
}

export function OutputPanel({
  output, previous, stale = false, language, wrap = false, onExample, noteLanguage, swap, extraActions, label, summary, saver,
}: {
  /** La salida válida actual, o `null` (vacía o con error). */
  output: string | null;
  /** Con error: el último resultado válido, atenuado. */
  previous?: string | null;
  /** Resultado de una entrada anterior (entrada grande sin procesar). */
  stale?: boolean;
  language?: HighlightLanguage | null;
  wrap?: boolean;
  onExample?: () => void;
  /** Lenguaje de la cerca al guardar; `null`, sin "Guardar en una nota". */
  noteLanguage: string | null;
  swap?: SwapConfig;
  extraActions?: ReactNode;
  label?: string;
  /** Texto bajo el título (por ejemplo, "3 filas · 2 columnas"). */
  summary?: ReactNode;
  /** El de la herramienta, si también lo usa su atajo ⌘⇧S. */
  saver?: ReturnType<typeof useSaveToNote>;
}) {
  const { tr } = useDevtools();
  const own = useSaveToNote(noteLanguage, output);
  const note = saver ?? own;
  const shown = output ?? previous ?? null;
  const isPrevious = output === null && !!previous;
  const big = (shown?.length ?? 0) > HIGHLIGHT_LIMIT;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <PanelHeader title={isPrevious ? tr('previousOutput') : (label ?? tr('output'))}>
        {swap && <SwapButton swap={swap} disabled={!output} />}
        {extraActions}
        <CopyButton text={output ?? ''} disabled={!output} showLabel shortcut="mod+shift+C" />
        {noteLanguage !== null && <SaveButton disabled={!note.can} onSave={() => void note.save()} />}
      </PanelHeader>
      {note.saved && <SavedInline note={note.saved} />}
      {summary && <p className="text-[11px] text-[var(--text-secondary)] tabular-nums">{summary}</p>}
      {shown === null ? (
        <EmptyOutput onExample={onExample} />
      ) : (
        <pre
          tabIndex={0}
          aria-label={tr('output')}
          className={`${PRE_CLS} ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'} ${isPrevious ? 'opacity-50' : stale ? 'opacity-60' : ''}`}
        >
          <CodeText code={shown} language={big ? null : language} />
        </pre>
      )}
      {big && output && <p className="text-[11px] text-[var(--text-hint)]">{tr('highlightOff')}</p>}
    </div>
  );
}
