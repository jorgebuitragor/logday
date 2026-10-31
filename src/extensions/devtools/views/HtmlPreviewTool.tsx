// Visor HTML (specs/devtools D26, design "Visor HTML"): el HTML a la
// izquierda y la vista previa aislada a la derecha (apiladas en ventana
// angosta). La vista previa no ejecuta scripts ni carga nada de internet,
// salvo que se encienda "Cargar recursos externos", que no se recuerda.
import { useMemo, useRef, useState } from 'react';
import { AlignLeft, Eraser, FoldVertical, ShieldCheck, TriangleAlert } from 'lucide-react';
import { HtmlPreview } from '../../../components/shared/HtmlPreview';
import { MAX_LIVE_CHARS } from '../model';
import { useDevtools } from '../ui/context';
import { CopyButton, EmptyOutput, IconButton, Option, PanelHeader, Segmented, StatusArea, StatusItem, Toggle, useFieldId } from '../ui/controls';
import { useDebounced, useDraft, useFocusOnOpen, useToolActions, useToolOptions } from '../ui/hooks';
import { CommonStatus, LargeInputNote } from '../ui/TextTool';
import { ToolFrame } from '../ui/ToolFrame';
import { NO_AUTOCORRECT, textareaCls } from '../ui/classes';
import { byteLength, formatSize, toolKey } from '../ui/text';
import { checkHtml, formatHtml, minifyHtml } from '../tools/htmlFormat';
import type { Indent } from '../tools/formats';

/** D26: la vista previa se rehace 250 ms después de dejar de escribir. */
export const PREVIEW_DEBOUNCE_MS = 250;
/** Los avisos de estructura que se listan; del resto, solo cuántos son. */
const MAX_ISSUES = 3;

export const PREVIEW_WIDTHS = { mobile: 375, tablet: 768, full: null } as const;
type WidthOption = keyof typeof PREVIEW_WIDTHS;

const DEFAULTS = { width: 'full', indent: '2' };
const ALLOWED = { width: ['mobile', 'tablet', 'full'], indent: ['2', '4', 'tab'] } as const;
const HEIGHT = 'h-[60vh] min-h-[16rem]';

const EXAMPLE =
  '<!DOCTYPE html><html lang="es"><head><title>Pedido 1001</title><style>body{font-family:system-ui,sans-serif;margin:24px;color:#1f2937}h1{color:#4f46e5;font-size:22px}.total{font-weight:600}</style></head>' +
  '<body><h1>Pedido 1001</h1><p>Hola, <b>Ana</b>. Tu pedido ya va en camino.</p><ul><li>Cuaderno × 2</li><li>Lápiz × 1</li></ul>' +
  '<p class="total">Total: $ 18.500</p><p><a href="https://example.com/pedidos/1001">Ver el pedido</a></p></body></html>';

const indentOf = (v: string): Indent => (v === '4' ? 4 : v === 'tab' ? 'tab' : 2);

export default function HtmlPreviewTool() {
  const { tool, tr, language, copyText, announce } = useDevtools();
  const [input, setInput, cut] = useDraft(tool);
  const [opts, setOpts] = useToolOptions(tool, DEFAULTS, ALLOWED);
  // No se recuerda (ni entre herramientas): cargar de internet deja ver a
  // terceros qué se está mirando (los píxeles de seguimiento de un correo),
  // así que es una decisión de cada vez.
  const [external, setExternal] = useState(false);
  const [scale, setScale] = useState(1);
  const ref = useRef<HTMLTextAreaElement>(null);
  const inputId = useFieldId('input');
  useFocusOnOpen(ref);

  // D8: por encima del tope, la vista previa se rehace con el botón.
  const manual = input.length > MAX_LIVE_CHARS;
  const debounced = useDebounced(input, PREVIEW_DEBOUNCE_MS);
  const [manualShown, setManualShown] = useState<string | null>(null);
  const shown = manual ? (manualShown ?? '') : debounced;
  const stale = manual && manualShown !== input;
  const run = () => setManualShown(input);

  const issues = useMemo(() => checkHtml(shown), [shown]);
  const stats = useMemo(() => {
    if (!input) return null;
    const lines = input.split('\n').length;
    return tr('htmlStats', { size: formatSize(byteLength(input), language), lines });
  }, [input, language, tr]);

  const clear = () => {
    setInput('');
    setManualShown(null);
    ref.current?.focus();
  };
  const transform = (fn: (s: string) => string, done: 'htmlFormatted' | 'htmlMinified') => {
    if (!input.trim()) return;
    const next = fn(input);
    setInput(next);
    if (manual) setManualShown(next);
    announce(tr(done));
  };
  const format = () => transform((s) => formatHtml(s, indentOf(opts.indent)), 'htmlFormatted');
  const minify = () => transform(minifyHtml, 'htmlMinified');

  useToolActions({
    copy: input ? () => void copyText(input) : undefined,
    clear,
    primary: manual ? run : undefined,
  });

  const width = PREVIEW_WIDTHS[opts.width as WidthOption];
  const widths = [
    { value: 'mobile', label: tr('htmlWidthMobile'), title: '375 px' },
    { value: 'tablet', label: tr('htmlWidthTablet'), title: '768 px' },
    { value: 'full', label: tr('htmlWidthFull') },
  ];
  const indents = [
    { value: '2', label: tr('indent2') },
    { value: '4', label: tr('indent4') },
    { value: 'tab', label: tr('indentTab') },
  ];

  const status = (
    <StatusArea>
      <CommonStatus cut={cut} />
      {manual && stale && <LargeInputNote size={input.length} onRun={run} />}
      {issues.slice(0, MAX_ISSUES).map((issue) => (
        <StatusItem key={`${issue.code}:${issue.tag}:${issue.line}`} kind="warn">
          {tr(issue.code === 'unclosed' ? 'htmlUnclosed' : 'htmlStray', { tag: issue.tag, line: issue.line })}
        </StatusItem>
      ))}
      {issues.length > MAX_ISSUES && <StatusItem kind="warn">{tr('htmlMoreIssues', { count: issues.length - MAX_ISSUES })}</StatusItem>}
    </StatusArea>
  );

  return (
    <ToolFrame
      status={status}
      options={
        <>
          <Option label={tr('htmlWidth')}>
            <Segmented label={tr('htmlWidth')} value={opts.width} onChange={(w) => setOpts({ width: w })} options={widths} />
          </Option>
          <Option label={tr('indent')}>
            <Segmented label={tr('indent')} value={opts.indent} onChange={(indent) => setOpts({ indent })} options={indents} />
          </Option>
          <Toggle label={tr('htmlExternal')} checked={external} onChange={setExternal} />
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <PanelHeader title={tr('htmlSource')} htmlFor={inputId}>
          <IconButton icon={AlignLeft} label={tr('modeFormat')} showLabel disabled={!input.trim()} onClick={format} />
          <IconButton icon={FoldVertical} label={tr('modeMinify')} showLabel disabled={!input.trim()} onClick={minify} />
          <CopyButton text={input} disabled={!input} showLabel shortcut="mod+shift+C" />
          <IconButton icon={Eraser} label={tr('clear')} shortcut="mod+shift+backspace" disabled={!input} onClick={clear} />
        </PanelHeader>
        <textarea
          id={inputId}
          ref={ref}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tr(toolKey(tool, 'placeholder'))}
          className={textareaCls(false, HEIGHT)}
          {...NO_AUTOCORRECT}
        />
        {stats && <p className="text-[11px] tabular-nums text-[var(--text-hint)]">{stats}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <PanelHeader title={tr('htmlPreview')}>
          {width && scale < 1 && shown.trim() && (
            <span className="text-[11px] tabular-nums text-[var(--text-hint)]">{tr('htmlScaled', { pct: Math.round(scale * 100) })}</span>
          )}
        </PanelHeader>
        {shown.trim() ? (
          <HtmlPreview html={shown} allowExternal={external} width={width} title={tr('htmlPreviewFrame')} heightClass={HEIGHT} onScale={setScale} />
        ) : (
          <EmptyOutput
            text={tr('htmlPreviewEmpty')}
            onExample={input ? undefined : () => {
              setInput(EXAMPLE);
              ref.current?.focus();
            }}
          />
        )}
        <p className="flex items-start gap-1.5 text-[11px] text-[var(--text-hint)]">
          {external ? (
            <TriangleAlert size={12} className="mt-px shrink-0 text-amber-400" aria-hidden />
          ) : (
            <ShieldCheck size={12} className="mt-px shrink-0" aria-hidden />
          )}
          {tr(external ? 'htmlIsolatedExternal' : 'htmlIsolated')}
        </p>
      </div>
    </ToolFrame>
  );
}
