// Lista ↔ IN de SQL (specs/devtools D13, Adenda C.1). Las opciones van
// escalonadas: las de siempre a la vista y el resto en "Más opciones".
import { ChevronRight } from 'lucide-react';
import type { DevtoolsKey } from '../../../lib/i18n';
import { AppSelect } from '../../../components/calendar/AppSelect';
import { useDevtools } from '../ui/context';
import { NumberField, Option, Segmented, Toggle } from '../ui/controls';
import { useToolOptions } from '../ui/hooks';
import { TextTool, type TextComputed } from '../ui/TextTool';
import { CHIP, FOCUS_RING, INPUT_CLS, NO_AUTOCORRECT } from '../ui/classes';
import { toolKey } from '../ui/text';
import {
  cleanValues, detectSeparator, findUnclosedQuote, fromSqlList, hasLeadingZero, splitValues, toSqlList,
  type ListSeparator, type SqlQuote,
} from '../tools/lists';

const DEFAULTS = {
  direction: 'toSql', quote: 'single', layout: 'oneLine', wrap: true, inputSep: 'auto', more: false,
  compact: false, dedupe: true, trim: true, skipEmpty: true, numbersUnquoted: false, split: false, chunk: 1000, column: '',
};
const ALLOWED = {
  direction: ['toSql', 'toList'], quote: ['single', 'double', 'none'], layout: ['oneLine', 'perLine'],
  inputSep: ['auto', 'newline', 'comma', 'tab', 'semicolon'],
} as const;
/** Las de "Más opciones", para decir cuántas no están en su valor por defecto. */
const MORE_KEYS = ['compact', 'dedupe', 'trim', 'skipEmpty', 'numbersUnquoted', 'split', 'chunk', 'column'] as const;
const ORACLE_LIMIT = 1000;
const EXAMPLES = { toSql: "1001\n1002\nO'Brien\n1002\n\n007", toList: "WHERE codigo IN ('1001', '1002', 'O''Brien') OR codigo IN ('007')" };

export default function SqlListTool() {
  const { tr } = useDevtools();
  const [opts, setOpts] = useToolOptions('sql-list', DEFAULTS, ALLOWED);
  const toSql = opts.direction === 'toSql';
  const quote = opts.quote as SqlQuote;
  const sep = opts.inputSep as ListSeparator;
  const changed = MORE_KEYS.filter((k) => opts[k] !== DEFAULTS[k]).length;
  const chunk = Math.max(1, opts.chunk);

  const compute = (text: string): TextComputed => {
    const clean = { trim: opts.trim, skipEmpty: opts.skipEmpty, dedupe: opts.dedupe };
    if (!toSql) {
      const pos = findUnclosedQuote(text);
      if (pos !== null) return { ok: false, error: { code: 'sql-unclosed-quote' }, message: tr('error.sql-unclosed-quote', { pos }) };
      const values = cleanValues(fromSqlList(text), clean);
      return { ok: true, value: values.join('\n'), valid: values.length === 1 ? tr('oneValue') : tr('sqlSummary', { n: values.length }) };
    }
    const raw = splitValues(text, sep);
    const trimmed = opts.trim ? raw.map((v) => v.trim()) : raw;
    const nonEmpty = opts.skipEmpty ? trimmed.filter((v) => v.trim() !== '') : trimmed;
    const split = opts.wrap && opts.split;
    const column = split ? opts.column.trim() || tr('columnPlaceholder') : opts.wrap ? opts.column.trim() : '';
    const unquoted = opts.numbersUnquoted && quote !== 'none';
    const res = toSqlList(text, sep, {
      ...clean, quote, numbersUnquoted: unquoted, compact: opts.compact, onePerLine: opts.layout === 'perLine',
      parentheses: opts.wrap, column, chunkSize: split ? chunk : 0,
    });
    // Sin columna, `toSqlList` da `(…)`: el IN va delante.
    const sql = opts.wrap && !column && res.sql ? `IN ${res.sql}` : res.sql;
    const parts = [res.count === 1 ? tr('oneValue') : tr('sqlSummary', { n: res.count })];
    const dups = nonEmpty.length - res.count;
    const empties = trimmed.length - nonEmpty.length;
    if (dups > 0) parts.push(tr('sqlDupsRemoved', { n: dups }));
    if (empties > 0) parts.push(tr('sqlEmptyRemoved', { n: empties }));
    if (split) parts.push(tr('sqlGroups', { g: res.groups, size: chunk }));
    const warnings = [
      ...(split && !opts.column.trim() ? [tr('sqlNoColumn')] : []),
      ...(res.count > ORACLE_LIMIT && !split ? [tr('sqlOracleLimit')] : []),
      ...(unquoted && nonEmpty.some(hasLeadingZero) ? [tr('sqlLeadingZero')] : []),
    ];
    return { ok: true, value: sql, valid: parts.join(' · '), warnings };
  };

  const more = (
    <div id="devtools-sql-more" className="grid basis-full grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-3">
      <span className="text-[var(--text-secondary)]">{tr('separator')}</span>
      <Segmented label={tr('separator')} value={opts.compact ? ',' : ', '} mono onChange={(v) => setOpts({ compact: v === ',' })} options={[{ value: ', ', label: "', '" }, { value: ',', label: "','" }]} />
      <span className="text-[var(--text-secondary)]">{tr('cleanup')}</span>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Toggle label={tr('removeDuplicates')} checked={opts.dedupe} onChange={(dedupe) => setOpts({ dedupe })} />
        <Toggle label={tr('trimSpaces')} checked={opts.trim} onChange={(trim) => setOpts({ trim })} />
        <Toggle label={tr('removeEmpty')} checked={opts.skipEmpty} onChange={(skipEmpty) => setOpts({ skipEmpty })} />
      </div>
      {toSql && (
        <>
          <span aria-hidden />
          <Toggle label={tr('numbersUnquoted')} checked={opts.numbersUnquoted} disabled={quote === 'none'} onChange={(numbersUnquoted) => setOpts({ numbersUnquoted })} />
          <span aria-hidden />
          <div className="flex flex-wrap items-center gap-2">
            <Toggle label={tr('splitGroups')} checked={opts.split} disabled={!opts.wrap} onChange={(split) => setOpts({ split })} />
            <NumberField label={tr('splitGroups')} value={chunk} min={1} max={100000} disabled={!opts.wrap || !opts.split} onChange={(n) => setOpts({ chunk: n })} width="w-24" />
          </div>
          <span className="text-[var(--text-secondary)]">{tr('column')}</span>
          <input
            aria-label={tr('column')}
            value={opts.column}
            disabled={!opts.wrap}
            onChange={(e) => setOpts({ column: e.target.value })}
            placeholder={tr('columnPlaceholder')}
            className={`${INPUT_CLS} w-48 font-mono disabled:opacity-50`}
            {...NO_AUTOCORRECT}
          />
        </>
      )}
    </div>
  );

  return (
    <TextTool
      depsKey={JSON.stringify(opts)}
      compute={compute}
      placeholder={tr(toSql ? toolKey('sql-list', 'placeholder') : ('sql-list.placeholderReverse' as DevtoolsKey))}
      example={EXAMPLES[toSql ? 'toSql' : 'toList']}
      language={toSql ? 'sql' : null}
      noteLanguage={toSql ? 'sql' : 'text'}
      swap={{ flip: () => setOpts({ direction: toSql ? 'toList' : 'toSql' }) }}
      inputExtra={(input) =>
        toSql && (
          <>
            {input && sep === 'auto' && <span className={CHIP}>{tr('inputSeparator', { sep: tr(`sep.${detectSeparator(input)}` as DevtoolsKey) })}</span>}
            <span className="sr-only">{tr('inputSeparatorLabel')}</span>
            <AppSelect<string>
              value={opts.inputSep}
              onChange={(inputSep) => setOpts({ inputSep })}
              options={(['auto', 'newline', 'comma', 'tab', 'semicolon'] as const).map((s) => ({
                value: s,
                label: s === 'auto' ? tr('sep.auto') : tr('inputSeparator', { sep: tr(`sep.${s}` as DevtoolsKey) }),
              }))}
            />
          </>
        )
      }
      options={
        <>
          <Option label={tr('direction')}>
            <Segmented label={tr('direction')} value={opts.direction} onChange={(direction) => setOpts({ direction })} options={[{ value: 'toSql', label: tr('listToSql') }, { value: 'toList', label: tr('sqlToList') }]} />
          </Option>
          {toSql && (
            <>
              <Option label={tr('quotes')}>
                <Segmented
                  label={tr('quotes')}
                  value={opts.quote}
                  onChange={(q) => setOpts({ quote: q })}
                  options={[{ value: 'single', label: tr('quotesSingle') }, { value: 'double', label: tr('quotesDouble') }, { value: 'none', label: tr('quotesNone') }]}
                />
              </Option>
              <Option label={tr('layout')}>
                <Segmented label={tr('layout')} value={opts.layout} onChange={(layout) => setOpts({ layout })} options={[{ value: 'oneLine', label: tr('layoutOneLine') }, { value: 'perLine', label: tr('layoutPerLine') }]} />
              </Option>
              <Toggle label={tr('wrapIn')} checked={opts.wrap} onChange={(wrap) => setOpts({ wrap })} />
            </>
          )}
          <button
            type="button"
            aria-expanded={opts.more}
            aria-controls="devtools-sql-more"
            onClick={() => setOpts({ more: !opts.more })}
            className={`flex items-center gap-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] ${FOCUS_RING}`}
          >
            <ChevronRight size={13} className={`transition-transform ${opts.more ? 'rotate-90' : ''}`} aria-hidden />
            {changed ? tr('moreOptionsChanged', { n: changed }) : tr('moreOptions')}
          </button>
          {opts.more && more}
        </>
      }
    />
  );
}
