// Expresiones regulares (specs/devtools D5, design §4 "Texto"). El patrón
// corre en un worker que se corta a 1 s: un `(a+)+$` no congela la app.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Eraser, TimerOff } from 'lucide-react';
import { MAX_LIVE_CHARS } from '../model';
import { useDevtools } from '../ui/context';
import { CopyButton, EmptyOutput, IconButton, PanelHeader, Spinner, StatusArea, StatusItem, useFieldId } from '../ui/controls';
import { useAnnounceError, useDraft, useFocusOnOpen, useToolActions, useToolOptions, LIVE_DEBOUNCE_MS } from '../ui/hooks';
import { FOCUS_RING, NO_AUTOCORRECT, PRE_CLS, TEXT_LINK, lineInputCls, textareaCls } from '../ui/classes';
import { CommonStatus, LargeInputNote } from '../ui/TextTool';
import { SavedInline, SaveButton, useSaveToNote } from '../ui/OutputPanel';
import { ToolFrame } from '../ui/ToolFrame';
import { MAX_MATCHES, REGEX_FLAGS, groupNames, type RegexRun } from '../tools/regex';
import { REGEX_TIMEOUT_MS, cancelRegex, runRegexInWorker, type RegexOutcome } from '../tools/regexRunner';

const DEFAULTS = { flags: 'g' };
const SLOW_MS = 150;
const EXAMPLE_PATTERN = '(?<año>\\d{4})-(?<mes>\\d{2})-(\\d{2})';
const EXAMPLE_TEXT = 'Entregas: 2026-10-30 (Logday), 2026-11-15 y 2027-01-08.\nSin fecha: 30/10/2026.';

interface Run {
  key: string;
  text: string;
  outcome: RegexOutcome;
}

export default function RegexTool() {
  const { tr, copyText, announce } = useDevtools();
  const [opts, setOpts] = useToolOptions('regex', DEFAULTS);
  const flags = REGEX_FLAGS.filter((f) => opts.flags.includes(f)).join('');
  const [pattern, setPattern] = useDraft('regex', 'pattern');
  const [text, setText, cut] = useDraft('regex');
  const patternRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const patternId = useFieldId('pattern');
  const textId = useFieldId('text');
  const errorId = useFieldId('regex-error');
  useFocusOnOpen(textRef);
  const manual = text.length > MAX_LIVE_CHARS;

  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const runId = useRef(0);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = `${flags}\u0000${pattern}\u0000${text}`;

  const exec = useCallback(
    (p: string, f: string, t: string, k: string) => {
      const id = ++runId.current;
      if (slowTimer.current) clearTimeout(slowTimer.current);
      if (!p) {
        setRun(null);
        setBusy(false);
        return;
      }
      slowTimer.current = setTimeout(() => setBusy(true), SLOW_MS);
      void runRegexInWorker(p, f, t).then((outcome) => {
        // Una búsqueda nueva deja a la anterior sin respuesta: se ignora.
        if (id !== runId.current) return;
        if (slowTimer.current) clearTimeout(slowTimer.current);
        setBusy(false);
        setRun({ key: k, text: t, outcome });
        if (!outcome.ok && 'timeout' in outcome) announce(tr('regexTimeout', { seconds: REGEX_TIMEOUT_MS / 1000 }));
      });
    },
    [announce, tr],
  );
  const runNow = useCallback(() => exec(pattern, flags, text, key), [exec, pattern, flags, text, key]);

  useEffect(() => {
    if (manual) return;
    const id = setTimeout(runNow, LIVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [runNow, manual]);
  useEffect(
    () => () => {
      cancelRegex();
      if (slowTimer.current) clearTimeout(slowTimer.current);
    },
    [],
  );

  const outcome = run?.outcome;
  const timeout = !!outcome && !outcome.ok && 'timeout' in outcome;
  const matchRun: RegexRun | null = outcome?.ok ? outcome.value : null;
  const regexError = outcome && !outcome.ok && 'error' in outcome ? outcome.error : null;
  useAnnounceError(regexError ? tr('regexInvalid', { message: regexError.detail ?? tr('error.regex-invalid') }) : null);
  const stale = !!run && run.key !== key;
  const names = groupNames(pattern);
  const groupCount = Math.max(names.length, ...(matchRun?.matches.map((m) => m.groups.length) ?? [0]));

  const [hover, setHover] = useState<number | null>(null);
  const markRefs = useRef(new Map<number, HTMLElement>());
  const highlight = (i: number | null) => {
    setHover(i);
    if (i !== null) markRefs.current.get(i)?.scrollIntoView({ block: 'nearest' });
  };

  const output = matchRun?.matches.length ? matchRun.matches.map((m) => m.text).join('\n') : null;
  const noteText = matchRun
    ? `/${pattern}/${flags}\n\n${matchRun.matches.map((m, i) => `${i + 1}\t${m.index}\t${m.text}`).join('\n')}`
    : null;
  const saver = useSaveToNote('text', noteText);

  useToolActions({
    copy: output ? () => void copyText(output) : undefined,
    save: saver.can ? () => void saver.save() : undefined,
    clear: () => {
      setText('');
      textRef.current?.focus();
    },
    primary: manual || timeout ? runNow : undefined,
  });

  const toggleFlag = (f: string) => setOpts({ flags: flags.includes(f) ? flags.replace(f, '') : flags + f });

  // El texto con cada coincidencia en un <mark>; las vacías, como una raya.
  const preview: ReactNode[] = [];
  if (matchRun && run) {
    let pos = 0;
    matchRun.matches.forEach((m, i) => {
      if (m.index > pos) preview.push(run.text.slice(pos, m.index));
      const ring = hover === i ? 'outline outline-2 outline-[var(--accent)]' : '';
      const setRef = (el: HTMLElement | null) => {
        if (el) markRefs.current.set(i, el);
        else markRefs.current.delete(i);
      };
      if (m.end === m.index) {
        preview.push(
          <mark key={i} ref={setRef} className={`inline-block h-[1em] w-0 border-l-2 border-[var(--accent)] bg-transparent align-middle ${ring}`}>
            <span className="sr-only">{tr('regexMatchLabel', { n: i + 1 })} {tr('regexEmptyMatch')}</span>
          </mark>,
        );
      } else {
        preview.push(
          <mark
            key={i}
            ref={setRef}
            className={`rounded-sm text-[var(--text-primary)] [box-decoration-break:clone] ${i % 2 ? 'bg-amber-500/25' : 'bg-[var(--accent-soft)]'} ${ring}`}
          >
            <span className="sr-only">{tr('regexMatchLabel', { n: i + 1 })}: </span>
            {m.text}
            <span className="sr-only"> ({tr('regexMatchLabel', { n: i + 1 })})</span>
          </mark>,
        );
      }
      pos = m.end;
    });
    if (pos < run.text.length) preview.push(run.text.slice(pos));
  }

  const count = matchRun?.matches.length ?? 0;
  const countText = !matchRun ? null : count === 0 ? tr('regexNoMatch') : count === 1 ? tr('regexOneMatch') : tr('regexMatches', { n: count });

  return (
    <ToolFrame
      bodyClass="flex flex-col gap-4 px-5 py-4"
      status={
        <StatusArea>
          <CommonStatus cut={cut} />
          {manual && stale && <LargeInputNote size={text.length} onRun={runNow} />}
          {busy && <StatusItem kind="info"><span className="inline-flex items-center gap-1.5"><Spinner /> {tr('regexRunning')}</span></StatusItem>}
          {regexError && <StatusItem kind="error" id={errorId}>{tr('regexInvalid', { message: regexError.detail ?? tr('error.regex-invalid') })}</StatusItem>}
          {timeout && (
            <StatusItem kind="warn" icon={TimerOff}>
              {tr('regexTimeout', { seconds: REGEX_TIMEOUT_MS / 1000 })}{' '}
              <button type="button" className={TEXT_LINK} onClick={runNow}>{tr('retry')}</button>
            </StatusItem>
          )}
          {countText && <StatusItem kind={count ? 'valid' : 'info'}>{countText}</StatusItem>}
          {matchRun && !flags.includes('g') && <StatusItem kind="info">{tr('regexOnlyFirst')}</StatusItem>}
          {matchRun?.truncated && <StatusItem kind="warn">{tr('regexCapped', { n: MAX_MATCHES })}</StatusItem>}
        </StatusArea>
      }
    >
      <div className="flex flex-col gap-1.5">
        <PanelHeader title={tr('regexPattern')} htmlFor={patternId} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 font-mono text-sm text-[var(--text-hint)]">
            <span aria-hidden>/</span>
            <input
              id={patternId}
              ref={patternRef}
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={tr('regexPatternPlaceholder')}
              aria-invalid={!!regexError || undefined}
              aria-describedby={regexError ? errorId : undefined}
              className={lineInputCls(!!regexError)}
              {...NO_AUTOCORRECT}
            />
            <span aria-hidden>/{flags}</span>
          </div>
          <div role="group" aria-label={tr('regexFlags')} className="flex items-center gap-1">
            <span className="mr-1 text-xs text-[var(--text-secondary)]">{tr('regexFlags')}</span>
            {REGEX_FLAGS.map((f) => {
              const on = flags.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  title={tr(`flag.${f}`)}
                  onClick={() => toggleFlag(f)}
                  className={`rounded-md px-2 py-1 font-mono text-xs transition ${FOCUS_RING} ${
                    on ? 'bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/40' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 @3xl/tool:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <PanelHeader title={tr('regexText')} htmlFor={textId}>
            <IconButton icon={Eraser} label={tr('clear')} shortcut="mod+shift+backspace" disabled={!text} onClick={() => setText('')} />
          </PanelHeader>
          <textarea
            id={textId}
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={tr('regexTextPlaceholder')}
            className={textareaCls()}
            {...NO_AUTOCORRECT}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <PanelHeader title={tr('regexPreview')}>
              <CopyButton text={output ?? ''} disabled={!output} showLabel shortcut="mod+shift+C" />
              <SaveButton disabled={!saver.can} onSave={() => void saver.save()} />
            </PanelHeader>
            {saver.saved && <SavedInline note={saver.saved} />}
            {!pattern && !text ? (
              <EmptyOutput
                onExample={() => {
                  setPattern(EXAMPLE_PATTERN);
                  setText(EXAMPLE_TEXT);
                }}
              />
            ) : (
              <pre tabIndex={0} aria-label={tr('regexPreview')} className={`${PRE_CLS} whitespace-pre-wrap break-words ${stale || timeout ? 'opacity-60' : ''}`}>
                {timeout ? '' : matchRun ? preview : text}
              </pre>
            )}
          </div>
          {matchRun && count > 0 && !timeout && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <PanelHeader title={tr('regexTable')} />
              <div className="max-h-[40vh] overflow-auto rounded-lg border border-[var(--border)]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[var(--bg-surface)] text-[10px] uppercase tracking-widest text-[var(--text-hint)]">
                    <tr>
                      <th scope="col" className="px-2 py-1.5 font-semibold">#</th>
                      <th scope="col" className="px-2 py-1.5 font-semibold">{tr('regexColMatch')}</th>
                      <th scope="col" className="px-2 py-1.5 font-semibold">{tr('regexColIndex')}</th>
                      {Array.from({ length: groupCount }, (_, g) => (
                        <th key={g} scope="col" className="px-2 py-1.5 font-semibold normal-case tracking-normal">
                          {names[g] ?? tr('regexGroup', { n: g + 1 })}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matchRun.matches.map((m, i) => (
                      <tr
                        key={i}
                        tabIndex={0}
                        onMouseEnter={() => highlight(i)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => highlight(i)}
                        onBlur={() => setHover(null)}
                        className={`border-t border-[var(--border)] ${FOCUS_RING} ${hover === i ? 'bg-[var(--bg-hover)]' : ''}`}
                      >
                        <th scope="row" className="px-2 py-1 font-normal tabular-nums text-[var(--text-hint)]">{i + 1}</th>
                        <td className="max-w-[16rem] select-text truncate px-2 py-1 font-mono text-[var(--text-body)]" title={m.text}>
                          {m.text.length > 80 ? `${m.text.slice(0, 80)}…` : m.text || tr('regexEmptyMatch')}
                        </td>
                        <td className="px-2 py-1 tabular-nums text-[var(--text-secondary)]">{m.index}</td>
                        {Array.from({ length: groupCount }, (_, g) => (
                          <td key={g} className="select-text px-2 py-1 font-mono text-[var(--text-body)]">
                            {m.groups[g] ?? <span className="text-[var(--text-hint)]">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </ToolFrame>
  );
}
