// Comparar listas (specs/devtools D14, Adenda C.2). Una sola salida a la
// vista, en un único <pre>, para que no pese aunque sean miles de valores.
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { ChevronRight, Database, Eraser } from 'lucide-react';
import { draftKey, setDraft } from '../model';
import { useDevtools } from '../ui/context';
import { CopyButton, EmptyOutput, IconButton, PanelHeader, StatusArea, Toggle, useFieldId } from '../ui/controls';
import { useComputed, useDraft, useFocusOnOpen, useToolActions, useToolOptions } from '../ui/hooks';
import { FOCUS_RING, NO_AUTOCORRECT, PRE_CLS, SECONDARY_CLS, TEXT_LINK, textareaCls } from '../ui/classes';
import { CommonStatus, LargeInputNote } from '../ui/TextTool';
import { SavedInline, SaveButton, SwapButton, useSaveToNote } from '../ui/OutputPanel';
import { ToolFrame } from '../ui/ToolFrame';
import { compareLists, duplicateCounts, splitValues, type ListComparison } from '../tools/lists';
import type { DevtoolsKey } from '../../../lib/i18n';

const TABS = ['onlyA', 'onlyB', 'both', 'union'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, DevtoolsKey> = { onlyA: 'onlyA', onlyB: 'onlyB', both: 'inBoth', union: 'union' };
const TAB_EMPTY: Record<Tab, DevtoolsKey> = { onlyA: 'emptyOnlyA', onlyB: 'emptyOnlyB', both: 'emptyBoth', union: 'compareNeedBoth' };
const DEFAULTS = { ignoreCase: false, trim: false, tab: '' };
const EXAMPLE_A = '1001\n1002\n1003\nana@ejemplo.com\n1002';
const EXAMPLE_B = '1002\n1003\n1004\nANA@ejemplo.com';

const lines = (text: string) => splitValues(text, 'newline');

export default function ListCompareTool() {
  const { tr, copyText, goTo, announce, setOptions } = useDevtools();
  const [opts, setOpts] = useToolOptions('list-compare', DEFAULTS);
  const [a, setA, cutA] = useDraft('list-compare');
  const [b, setB, cutB] = useDraft('list-compare', 'b');
  const refA = useRef<HTMLTextAreaElement>(null);
  const idA = useFieldId('list-a');
  const idB = useFieldId('list-b');
  useFocusOnOpen(refA);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const c = useComputed(
    `${a}\u0000${b}`,
    (s) => {
      const [x, y] = s.split('\u0000');
      return { ok: true, value: compareLists(lines(x), lines(y), opts) };
    },
    `${opts.ignoreCase}|${opts.trim}`,
  );
  const ready = !!a.trim() && !!b.trim();
  const cmp: ListComparison | null = ready ? (c.result?.value ?? null) : null;

  // Pestaña inicial: "Solo en A" si tiene valores; si no, la primera con alguno.
  const stored = TABS.find((t) => t === opts.tab);
  const tab: Tab = stored ?? (cmp ? (TABS.find((t) => cmp[t].length) ?? 'onlyA') : 'onlyA');
  const values = cmp ? cmp[tab] : [];
  const text = values.join('\n');
  const saver = useSaveToNote('plaintext', text || null);

  // Anuncia el conteo de la pestaña cuando deja de cambiar (Adenda E).
  const count = values.length;
  useEffect(() => {
    if (!cmp) return;
    const id = setTimeout(() => announce(tr('tabCount', { tab: tr(TAB_LABEL[tab]), n: count })), 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, tab, !!cmp]);

  const selectTab = (t: Tab, focus = false) => {
    setOpts({ tab: t });
    if (focus) tabRefs.current[TABS.indexOf(t)]?.focus();
  };
  const onTabKey = (e: KeyboardEvent) => {
    const i = TABS.indexOf(tab);
    const next = e.key === 'ArrowRight' ? (i + 1) % 4 : e.key === 'ArrowLeft' ? (i + 3) % 4 : e.key === 'Home' ? 0 : e.key === 'End' ? 3 : -1;
    if (next < 0) return;
    e.preventDefault();
    selectTab(TABS[next], true);
  };
  const sendToSql = () => {
    // Como "Traer de una nota": la lista queda como entrada de sql-list.
    setDraft(draftKey('sql-list'), text);
    setOptions('sql-list', { direction: 'toSql' });
    goTo('sql-list', 'title');
  };
  const swap = () => {
    setA(b);
    setB(a);
  };

  useToolActions({
    copy: text ? () => void copyText(text) : undefined,
    save: saver.can ? () => void saver.save() : undefined,
    swap: a || b ? swap : undefined,
    clear: () => {
      setA('');
      refA.current?.focus();
    },
    primary: c.manual ? c.run : undefined,
    tab: cmp ? (i) => selectTab(TABS[i]) : undefined,
  });

  return (
    <ToolFrame
      bodyClass="flex flex-col gap-4 px-5 py-4"
      options={
        <>
          <Toggle label={tr('ignoreCase')} checked={opts.ignoreCase} onChange={(ignoreCase) => setOpts({ ignoreCase })} />
          <Toggle label={tr('trimSpaces')} checked={opts.trim} onChange={(trim) => setOpts({ trim })} />
        </>
      }
      status={
        <StatusArea>
          <CommonStatus cut={cutA || cutB} />
          {c.manual && c.stale && <LargeInputNote size={a.length + b.length} onRun={c.run} />}
        </StatusArea>
      }
    >
      <div className="grid items-start gap-2 @3xl/tool:grid-cols-[1fr_auto_1fr]">
        <ListInput id={idA} value={a} onChange={setA} label={tr('listA')} placeholder={tr('list-compare.placeholderA' as DevtoolsKey)} inputRef={refA} dups={cmp ? duplicateCounts(lines(a), opts) : null} />
        <div className="flex justify-center @3xl/tool:pt-8">
          <SwapButton swap={{ onSwap: swap }} disabled={!a && !b} />
        </div>
        <ListInput id={idB} value={b} onChange={setB} label={tr('listB')} placeholder={tr('list-compare.placeholderB' as DevtoolsKey)} dups={cmp ? duplicateCounts(lines(b), opts) : null} />
      </div>

      {!a.trim() && !b.trim() ? (
        <EmptyOutput
          onExample={() => {
            setA(EXAMPLE_A);
            setB(EXAMPLE_B);
          }}
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          {cmp && <p className="text-xs tabular-nums text-[var(--text-secondary)]">{tr('compareSummary', { a: cmp.countA, b: cmp.countB, both: cmp.both.length })}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="max-w-full overflow-x-auto">
              <div role="tablist" aria-label={tr('resultsLabel')} onKeyDown={onTabKey} className="flex w-max gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5">
                {TABS.map((t, i) => (
                  <button
                    key={t}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    id={`devtools-lc-tab-${t}`}
                    type="button"
                    role="tab"
                    aria-selected={t === tab}
                    aria-controls="devtools-lc-panel"
                    tabIndex={t === tab ? 0 : -1}
                    disabled={!cmp}
                    onClick={() => selectTab(t)}
                    className={`flex items-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} ${
                      t === tab && cmp ? 'bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/40' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {tr(TAB_LABEL[t])}
                    {cmp && <span className="ml-1.5 rounded-full bg-[var(--bg-hover)] px-1.5 text-[10px] tabular-nums text-[var(--text-secondary)]">{cmp[t].length}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <CopyButton text={text} disabled={!text} showLabel shortcut="mod+shift+C" />
              <button type="button" disabled={!text} onClick={sendToSql} className={SECONDARY_CLS}>
                <Database size={13} aria-hidden />
                {tr('sendToSql')}
              </button>
              <SaveButton disabled={!saver.can} onSave={() => void saver.save()} />
            </div>
          </div>
          {saver.saved && <SavedInline note={saver.saved} />}
          <div id="devtools-lc-panel" role="tabpanel" aria-labelledby={`devtools-lc-tab-${tab}`}>
            {!cmp ? (
              <p className="rounded-lg border border-dashed border-[var(--border-card)] p-4 text-center text-xs text-[var(--text-hint)]">{tr('compareNeedBoth')}</p>
            ) : values.length ? (
              <pre tabIndex={0} className={`${PRE_CLS.replace('max-h-[60vh]', 'max-h-[50vh]')} whitespace-pre ${c.stale && c.manual ? 'opacity-60' : ''}`}>{text}</pre>
            ) : (
              <p className="rounded-lg border border-dashed border-[var(--border-card)] p-4 text-center text-xs text-[var(--text-hint)]">{tr(TAB_EMPTY[tab])}</p>
            )}
          </div>
        </div>
      )}
    </ToolFrame>
  );
}

function ListInput({
  id, value, onChange, label, placeholder, inputRef, dups,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  dups: { value: string; times: number }[] | null;
}) {
  const { tr } = useDevtools();
  const [open, setOpen] = useState(false);
  const listId = `${id}-dups`;
  const count = value ? splitValues(value, 'newline').filter((v) => v.trim()).length : 0;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <PanelHeader title={label} htmlFor={id}>
        <IconButton icon={Eraser} label={tr('clear')} disabled={!value} onClick={() => onChange('')} />
      </PanelHeader>
      <textarea id={id} ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={textareaCls(false, 'min-h-[10rem] h-[30vh]')} {...NO_AUTOCORRECT} />
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-hint)]">
        <span className="tabular-nums">{tr('listCount', { n: count })}</span>
        {dups && (dups.length ? (
          <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)} className={`flex items-center gap-0.5 ${TEXT_LINK}`}>
            <ChevronRight size={11} className={`transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
            {tr('listDuplicates', { n: dups.length })}
          </button>
        ) : (
          <span>· {tr('listNoDuplicates')}</span>
        ))}
      </div>
      {open && dups && dups.length > 0 && (
        <div id={listId} className="flex flex-col gap-1">
          <ul className="max-h-32 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 font-mono text-[11px] text-[var(--text-body)]">
            {dups.map((d) => (
              <li key={d.value} className="select-text">{d.value} <span className="text-[var(--text-hint)]">×{d.times}</span></li>
            ))}
          </ul>
          <div className="self-start">
            <CopyButton text={dups.map((d) => d.value).join('\n')} label={tr('copyDuplicates')} showLabel />
          </div>
        </div>
      )}
    </div>
  );
}
