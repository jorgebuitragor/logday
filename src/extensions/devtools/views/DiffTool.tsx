// Comparar textos por líneas (specs/devtools D5, design §4 "Texto").
import { useRef, type ReactNode } from 'react';
import fastDiff from 'fast-diff';
import { Eraser } from 'lucide-react';
import { useDevtools } from '../ui/context';
import { EmptyOutput, IconButton, Option, PanelHeader, Segmented, StatusArea, StatusItem, Toggle, useFieldId, CopyButton } from '../ui/controls';
import { useComputed, useDraft, useFocusOnOpen, useToolActions, useToolOptions } from '../ui/hooks';
import { NO_AUTOCORRECT, textareaCls } from '../ui/classes';
import { CommonStatus, LargeInputNote } from '../ui/TextTool';
import { SavedInline, SaveButton, SwapButton, useSaveToNote } from '../ui/OutputPanel';
import { ToolFrame } from '../ui/ToolFrame';
import { diffStats, lineDiff, type DiffLine } from '../tools/diff';
import type { DevtoolsKey } from '../../../lib/i18n';

const DEFAULTS = { view: 'unified', ignoreWs: false };
const ALLOWED = { view: ['unified', 'split'] } as const;
/** Por encima de esto por lado, se compara con el botón (design §5). */
const MAX_LIVE_LINES = 5000;
const EXAMPLE_A = 'servidor: logday\npuerto: 8080\nrutas:\n  - /app\n  - /api\nlog: info';
const EXAMPLE_B = 'servidor: logday\npuerto: 9090\nrutas:\n  - /app\n  - /api\n  - /admin\nlog: info';

const lineCount = (s: string) => (s ? s.split('\n').length : 0);

/** Las líneas quitadas y agregadas seguidas, emparejadas una a una: así se
 *  marca dentro de cada par el tramo que cambió. */
function pairChanges(lines: DiffLine[]): Map<number, number> {
  const pairs = new Map<number, number>();
  let i = 0;
  while (i < lines.length) {
    if (lines[i].kind !== 'removed') {
      i++;
      continue;
    }
    const start = i;
    while (i < lines.length && lines[i].kind === 'removed') i++;
    const addStart = i;
    while (i < lines.length && lines[i].kind === 'added') i++;
    for (let k = 0; k < Math.min(addStart - start, i - addStart); k++) {
      pairs.set(start + k, addStart + k);
      pairs.set(addStart + k, start + k);
    }
  }
  return pairs;
}

/** El texto de una línea con el tramo distinto de su pareja más marcado. */
function inline(line: DiffLine, other: DiffLine | undefined): ReactNode {
  if (!other || line.text.length + other.text.length > 2000) return line.text || ' ';
  const [before, after] = line.kind === 'removed' ? [line.text, other.text] : [other.text, line.text];
  const keep = line.kind === 'removed' ? fastDiff.DELETE : fastDiff.INSERT;
  const strong = line.kind === 'removed' ? 'bg-red-500/30' : 'bg-emerald-500/30';
  return fastDiff(before, after)
    .filter(([op]) => op === fastDiff.EQUAL || op === keep)
    .map(([op, text], i) => (op === fastDiff.EQUAL ? text : <span key={i} className={`rounded-sm ${strong}`}>{text}</span>));
}

const ROW_BG = { same: '', added: 'bg-emerald-500/15', removed: 'bg-red-500/15' } as const;
const SIGN = { same: ' ', added: '+', removed: '−' } as const;
const SR = { added: 'diffAdded', removed: 'diffRemoved' } as const;

function Row({ line, other, num, tr }: { line: DiffLine | null; other?: DiffLine; num: 'both' | 'left' | 'right'; tr: (k: DevtoolsKey) => string }) {
  const grid = num === 'both' ? 'grid-cols-[3rem_3rem_1rem_1fr]' : 'grid-cols-[3rem_1rem_1fr]';
  if (!line) return <div className={`grid ${grid} min-h-[1.25rem] bg-[var(--bg-hover)]/40`} aria-hidden />;
  const n = 'text-right tabular-nums text-[var(--text-hint)] select-none pr-2';
  return (
    <div className={`grid ${grid} ${ROW_BG[line.kind]}`}>
      {num !== 'right' && <span className={n}>{line.left ?? ''}</span>}
      {num !== 'left' && <span className={n}>{line.right ?? ''}</span>}
      <span aria-hidden className="select-none text-center text-[var(--text-hint)]">{SIGN[line.kind]}</span>
      <span className="select-text whitespace-pre-wrap break-all pr-2 text-[var(--text-body)]">
        {line.kind !== 'same' && <span className="sr-only">{tr(SR[line.kind])}: </span>}
        {line.kind === 'same' ? line.text || ' ' : inline(line, other)}
      </span>
    </div>
  );
}

export default function DiffTool() {
  const { tr, copyText } = useDevtools();
  const [opts, setOpts] = useToolOptions('diff', DEFAULTS, ALLOWED);
  const [a, setA, cutA] = useDraft('diff');
  const [b, setB, cutB] = useDraft('diff', 'modified');
  const refA = useRef<HTMLTextAreaElement>(null);
  const idA = useFieldId('diff-a');
  const idB = useFieldId('diff-b');
  useFocusOnOpen(refA);

  const both = `${a}\u0000${b}`;
  const big = lineCount(a) > MAX_LIVE_LINES || lineCount(b) > MAX_LIVE_LINES;
  const c = useComputed(
    both,
    (s) => {
      const [x, y] = s.split('\u0000');
      // CRLF y LF se comparan como iguales, y se avisa.
      const eol = /\r\n/.test(x) !== /\r\n/.test(y);
      const lines = lineDiff(x.replace(/\r\n?/g, '\n'), y.replace(/\r\n?/g, '\n'), { ignoreWhitespace: opts.ignoreWs });
      return { ok: true, lines, eol };
    },
    String(opts.ignoreWs),
    big ? Number.MAX_SAFE_INTEGER : a.length + b.length,
  );
  const r = a.trim() || b.trim() ? c.result : null;
  const lines = r?.lines ?? [];
  const stats = diffStats(lines);
  const equal = !!r && !stats.added && !stats.removed;
  const pairs = pairChanges(lines);
  const unified = r ? lines.map((l) => `${l.kind === 'added' ? '+' : l.kind === 'removed' ? '-' : ' '}${l.text}`).join('\n') : null;
  const saver = useSaveToNote('diff', unified);

  const swap = () => {
    setA(b);
    setB(a);
  };
  useToolActions({
    copy: unified ? () => void copyText(unified) : undefined,
    save: saver.can ? () => void saver.save() : undefined,
    swap: a || b ? swap : undefined,
    clear: () => {
      setA('');
      refA.current?.focus();
    },
    primary: c.manual ? c.run : undefined,
  });

  // Lado a lado: cada quitada frente a su agregada; las sueltas, con hueco.
  const split: [DiffLine | null, DiffLine | null, number][] = [];
  if (opts.view === 'split') {
    lines.forEach((l, i) => {
      if (l.kind === 'same') split.push([l, l, i]);
      else if (l.kind === 'removed') {
        const p = pairs.get(i);
        split.push([l, p !== undefined ? lines[p] : null, i]);
      } else if (!pairs.has(i)) split.push([null, l, i]);
    });
  }

  const textarea = (id: string, value: string, set: (v: string) => void, label: string, placeholder: string, ref?: typeof refA) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <PanelHeader title={label} htmlFor={id}>
        <IconButton icon={Eraser} label={tr('clear')} disabled={!value} onClick={() => set('')} />
      </PanelHeader>
      <textarea id={id} ref={ref} value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} className={textareaCls(false, 'min-h-[10rem] h-[30vh]')} {...NO_AUTOCORRECT} />
    </div>
  );

  return (
    <ToolFrame
      bodyClass="flex flex-col gap-4 px-5 py-4"
      options={
        <>
          <Option label={tr('diffView')}>
            <Segmented label={tr('diffView')} value={opts.view} onChange={(view) => setOpts({ view })} options={[{ value: 'unified', label: tr('diffUnified') }, { value: 'split', label: tr('diffSplit') }]} />
          </Option>
          <Toggle label={tr('diffIgnoreWs')} checked={opts.ignoreWs} onChange={(ignoreWs) => setOpts({ ignoreWs })} />
        </>
      }
      status={
        <StatusArea>
          <CommonStatus cut={cutA || cutB} />
          {c.manual && c.stale && <LargeInputNote size={a.length + b.length} onRun={c.run} />}
          {r && (equal ? <StatusItem kind="valid">{tr('diffEqual')}</StatusItem> : <StatusItem kind="valid">{tr('diffSummary', { added: stats.added, removed: stats.removed })}</StatusItem>)}
          {r?.eol && <StatusItem kind="warn">{tr('diffEol')}</StatusItem>}
        </StatusArea>
      }
    >
      <div className="grid items-start gap-2 @3xl/tool:grid-cols-[1fr_auto_1fr]">
        {textarea(idA, a, setA, tr('diffOriginal'), tr('diff.placeholderA' as DevtoolsKey), refA)}
        <div className="flex justify-center @3xl/tool:pt-8">
          <SwapButton swap={{ onSwap: swap }} disabled={!a && !b} />
        </div>
        {textarea(idB, b, setB, tr('diffModified'), tr('diff.placeholderB' as DevtoolsKey))}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <PanelHeader title={tr('output')}>
          <CopyButton text={unified ?? ''} disabled={!unified} showLabel shortcut="mod+shift+C" />
          <SaveButton disabled={!saver.can} onSave={() => void saver.save()} />
        </PanelHeader>
        {saver.saved && <SavedInline note={saver.saved} />}
        {!r ? (
          <EmptyOutput
            onExample={() => {
              setA(EXAMPLE_A);
              setB(EXAMPLE_B);
            }}
          />
        ) : (
          <div tabIndex={0} aria-label={tr('output')} className={`max-h-[60vh] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] py-1 font-mono text-xs leading-relaxed ${c.stale && c.manual ? 'opacity-60' : ''}`}>
            {opts.view === 'unified' ? (
              lines.map((l, i) => <Row key={i} line={l} other={pairs.has(i) ? lines[pairs.get(i)!] : undefined} num="both" tr={tr} />)
            ) : (
              <div className="grid grid-cols-2 divide-x divide-[var(--border)]">
                <div>{split.map(([l, other, i]) => <Row key={i} line={l} other={other ?? undefined} num="left" tr={tr} />)}</div>
                <div>{split.map(([other, l, i]) => <Row key={i} line={l} other={other ?? undefined} num="right" tr={tr} />)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </ToolFrame>
  );
}

