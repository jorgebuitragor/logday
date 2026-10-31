// Herramienta de texto a texto: entrada, opciones y salida, procesando en
// vivo. La usan JSON, YAML, XML, Convertir, Base64, URL y entidades HTML.
import { useRef, type ReactNode } from 'react';
import { Eraser } from 'lucide-react';
import type { ToolError, ToolResult } from '../tools/result';
import { useDevtools } from './context';
import { IconButton, PanelHeader, StatusArea, StatusItem, useFieldId } from './controls';
import { useAnnounceError, useComputed, useDraft, useFocusOnOpen, useToolActions } from './hooks';
import { errorText, indexAt } from './meta';
import { byteLength, formatSize, type Tr } from './text';
import type { Language } from '../../../lib/i18n';
import { NO_AUTOCORRECT, TEXT_LINK, textareaCls } from './classes';
import { OutputPanel, useSaveToNote, type SwapConfig } from './OutputPanel';
import type { HighlightLanguage } from './highlight';
import { ToolFrame } from './ToolFrame';

export interface TextComputed {
  ok: boolean;
  value?: string;
  error?: ToolError;
  /** Mensaje propio para el error; si no, el de `error.<código>`. */
  message?: string;
  /** Texto de éxito ("JSON válido · 3,2 KB"). */
  valid?: string;
  warnings?: string[];
  /** Resumen sobre la salida ("3 filas · 2 columnas"). */
  summary?: string;
}

export const fromResult = (r: ToolResult, extra: Omit<TextComputed, 'ok' | 'value' | 'error'> = {}): TextComputed =>
  r.ok ? { ok: true, value: r.value, ...extra } : { ok: false, error: r.error, ...extra };

/** Lo común de la zona de estado: la entrada cortada en el tope y
 *  "Cargado de «…»" hasta la siguiente edición. */
export function CommonStatus({ cut }: { cut: boolean }) {
  const { tr, loadedFrom } = useDevtools();
  return (
    <>
      {cut && <StatusItem kind="warn">{tr('largeInputCut')}</StatusItem>}
      {loadedFrom && <StatusItem kind="info">{tr('loadedFrom', { title: loadedFrom })}</StatusItem>}
    </>
  );
}

export function LargeInputNote({ size, onRun }: { size: number; onRun: () => void }) {
  const { tr, language, shortcut } = useDevtools();
  return (
    <StatusItem kind="warn">
      {tr('largeInput', { size: formatSize(size, language), shortcut: shortcut('mod+enter') })}{' '}
      <button type="button" className={TEXT_LINK} onClick={onRun}>{tr('run')}</button>
    </StatusItem>
  );
}

export function TextTool({
  options, compute, depsKey, placeholder, example, inputLabel, outputLabel, language, noteLanguage, swap, wrap, inputExtra,
}: {
  options?: ReactNode;
  compute: (input: string) => TextComputed;
  /** Resumen de las opciones: si cambia, se vuelve a procesar. */
  depsKey: string;
  placeholder: string;
  example: string;
  inputLabel?: string;
  outputLabel?: string;
  language?: HighlightLanguage | null;
  noteLanguage: string | null;
  /** `flip` invierte la dirección; la salida pasa a la entrada. */
  swap?: Omit<SwapConfig, 'onSwap'> & { flip: () => void };
  wrap?: boolean;
  /** Controles junto al título de la entrada (el separador de `sql-list`). */
  inputExtra?: (input: string) => ReactNode;
}) {
  const { tool, tr, copyText } = useDevtools();
  const [input, setInput, cut] = useDraft(tool);
  const ref = useRef<HTMLTextAreaElement>(null);
  const inputId = useFieldId('input');
  const errorId = useFieldId('error');
  useFocusOnOpen(ref);
  const c = useComputed(input, compute, depsKey);
  const r = c.result;
  // Mientras corre el debounce se sigue viendo el resultado anterior, sin
  // parpadeos; con entrada grande, atenuado hasta que se procese.
  const output = r?.ok ? (r.value ?? '') : null;
  const invalid = !!r && !r.ok;
  const saver = useSaveToNote(noteLanguage, output);
  const errorMessage = invalid && r?.error ? (r.message ?? errorText(tr, r.error)) : null;
  useAnnounceError(errorMessage);

  const doSwap = swap && output !== null && !swap.disabled
    ? () => {
        setInput(output);
        swap.flip();
      }
    : undefined;
  const clear = () => {
    setInput('');
    ref.current?.focus();
  };
  const goToError = (e: ToolError) => {
    const el = ref.current;
    if (!el || !e.line) return;
    const at = indexAt(input, e.line, e.column ?? 1);
    el.focus();
    el.setSelectionRange(at, Math.min(input.length, at + 1));
  };

  useToolActions({
    copy: output ? () => void copyText(output) : undefined,
    save: saver.can ? () => void saver.save() : undefined,
    swap: doSwap,
    clear,
    primary: c.manual ? c.run : undefined,
  });

  const status = (
    <StatusArea>
      <CommonStatus cut={cut} />
      {c.manual && c.stale && <LargeInputNote size={input.length} onRun={c.run} />}
      {invalid && r?.error && (
        <StatusItem kind="error" id={errorId}>
          {errorMessage}
          {r.error.line && (
            <>
              {' '}
              <button type="button" className={TEXT_LINK} onClick={() => goToError(r.error!)}>{tr('goToError')}</button>
            </>
          )}
        </StatusItem>
      )}
      {r?.ok && r.valid && <StatusItem kind="valid">{r.valid}</StatusItem>}
      {r?.warnings?.map((w) => <StatusItem key={w} kind="warn">{w}</StatusItem>)}
    </StatusArea>
  );

  return (
    <ToolFrame options={options} status={status}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <PanelHeader title={inputLabel ?? tr('input')} htmlFor={inputId}>
          {inputExtra?.(input)}
          <IconButton icon={Eraser} label={tr('clear')} shortcut="mod+shift+backspace" disabled={!input} onClick={clear} />
        </PanelHeader>
        <textarea
          id={inputId}
          ref={ref}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          className={textareaCls(invalid)}
          {...NO_AUTOCORRECT}
        />
      </div>
      <OutputPanel
        output={output || null}
        previous={invalid ? (c.lastOk?.value ?? null) : null}
        stale={c.stale && c.manual}
        language={language}
        wrap={wrap}
        label={outputLabel}
        noteLanguage={noteLanguage}
        saver={saver}
        summary={r?.ok ? r.summary : undefined}
        onExample={input ? undefined : () => {
          setInput(example);
          ref.current?.focus();
        }}
        swap={swap ? { onSwap: doSwap ?? (() => {}), disabled: swap.disabled || !doSwap, disabledTitle: swap.disabledTitle } : undefined}
      />
    </ToolFrame>
  );
}

/** "JSON válido · 3,2 KB". */
export const validWithSize = (tr: Tr, format: string, text: string, language: Language) =>
  `${tr('validFormat', { format })} · ${formatSize(byteLength(text), language)}`;
