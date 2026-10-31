// Timestamp Unix ↔ fecha (specs/devtools D4, design §4 "Fechas"): un solo
// campo que acepta las dos cosas.
import { useMemo, useRef } from 'react';
import { ArrowLeftRight, Clock } from 'lucide-react';
import { useDevtools } from '../ui/context';
import { CopyButton, EmptyOutput, IconButton, Option, PanelHeader, Segmented, StatusArea, StatusItem, useFieldId } from '../ui/controls';
import { useAnnounceError, useDebounced, useDraft, useFocusOnOpen, useToolActions, useToolOptions } from '../ui/hooks';
import { localeOf } from '../ui/text';
import { CHIP, NO_AUTOCORRECT, SECONDARY_CLS, lineInputCls } from '../ui/classes';
import { CommonStatus } from '../ui/TextTool';
import { SavedInline, SaveButton, useSaveToNote } from '../ui/OutputPanel';
import { ToolFrame } from '../ui/ToolFrame';
import { formatInZone, localTimeZone, parseDateInput, parseTimestamp, relativeTime, type TimestampUnit } from '../tools/time';

const DEFAULTS = { unit: 'auto' };
const ALLOWED = { unit: ['auto', 'seconds', 'milliseconds'] } as const;
const MAX_MS = 8.64e15;
type RowKey = 'tsUnixSeconds' | 'tsUnixMillis' | 'tsUtc' | 'tsLocal' | 'tsIso' | 'tsRelative';

const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');

/** `2026-10-30T14:05:00-05:00`: ISO 8601 con el desfase de la zona local. */
function isoWithOffset(ms: number): string {
  const d = new Date(ms);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${date}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

type Parsed =
  | { ok: true; ms: number; chip: 'tsDetectedSeconds' | 'tsDetectedMillis' | 'tsDetectedIso' | 'tsDetectedLocal'; numeric: boolean; decimals: boolean }
  | { ok: false; outOfRange: boolean };

function parse(input: string, unit: TimestampUnit | 'auto'): Parsed {
  const s = input.trim();
  if (/^-?[\d_\s]+(\.\d+)?$/.test(s)) {
    const r = parseTimestamp(s, unit);
    if (!r.ok) return { ok: false, outOfRange: true };
    return { ok: true, ms: r.value.ms, chip: r.value.unit === 'seconds' ? 'tsDetectedSeconds' : 'tsDetectedMillis', numeric: true, decimals: s.includes('.') };
  }
  const d = parseDateInput(s);
  if (!d.ok) return { ok: false, outOfRange: false };
  if (Math.abs(d.value) > MAX_MS) return { ok: false, outOfRange: true };
  const zoned = /(Z|[+-]\d{2}:?\d{2})$/i.test(s);
  return { ok: true, ms: d.value, chip: zoned ? 'tsDetectedIso' : 'tsDetectedLocal', numeric: false, decimals: false };
}

export default function TimestampTool() {
  const { tr, language, copyText } = useDevtools();
  const [opts, setOpts] = useToolOptions('timestamp', DEFAULTS, ALLOWED);
  const [input, setInput, cut] = useDraft('timestamp');
  const text = useDebounced(input);
  const ref = useRef<HTMLInputElement>(null);
  const inputId = useFieldId('ts');
  const errorId = useFieldId('ts-error');
  useFocusOnOpen(ref);
  const locale = localeOf(language);
  const zone = localTimeZone();

  const parsed = useMemo(() => (text.trim() ? parse(text, opts.unit as TimestampUnit | 'auto') : null), [text, opts.unit]);
  const now = Date.now();
  const rows: [RowKey, string][] | null = parsed?.ok
    ? [
        ['tsUnixSeconds', String(Math.floor(parsed.ms / 1000))],
        ['tsUnixMillis', String(parsed.ms)],
        ['tsUtc', `${new Date(parsed.ms).toISOString().replace('T', ' ').slice(0, 19)} UTC`],
        ['tsLocal', formatInZone(parsed.ms, zone, locale)],
        ['tsIso', isoWithOffset(parsed.ms)],
        ['tsRelative', relativeTime(parsed.ms, now, locale)],
      ]
    : null;
  const label = (key: RowKey) => (key === 'tsLocal' ? tr('tsLocal', { zone }) : tr(key));
  const output = rows ? rows.map(([k, v]) => `${label(k)}: ${v}`).join('\n') : null;
  const saver = useSaveToNote('plaintext', output);
  const error = parsed && !parsed.ok ? tr(parsed.outOfRange ? 'tsOutOfRange' : 'tsInvalid') : null;
  useAnnounceError(error);

  // D6: de número a fecha, o de fecha a número.
  const swap = parsed?.ok ? () => setInput(parsed.numeric ? isoWithOffset(parsed.ms) : String(Math.floor(parsed.ms / 1000))) : undefined;
  const setNow = () => {
    setInput(String(Math.floor(Date.now() / 1000)));
    ref.current?.focus();
  };

  useToolActions({
    copy: output ? () => void copyText(output) : undefined,
    save: saver.can ? () => void saver.save() : undefined,
    swap,
    clear: () => {
      setInput('');
      ref.current?.focus();
    },
  });

  return (
    <ToolFrame
      bodyClass="flex flex-col gap-4 px-5 py-4"
      options={
        <Option label={tr('tsUnit')}>
          <Segmented
            label={tr('tsUnit')}
            value={opts.unit}
            onChange={(unit) => setOpts({ unit })}
            options={[
              { value: 'auto', label: tr('tsAuto') },
              { value: 'seconds', label: tr('tsSeconds') },
              { value: 'milliseconds', label: tr('tsMillis') },
            ]}
          />
        </Option>
      }
      status={
        <StatusArea>
          <CommonStatus cut={cut} />
          {error && <StatusItem kind="error" id={errorId}>{error}</StatusItem>}
          {parsed?.ok && parsed.decimals && <StatusItem kind="warn">{tr('tsDecimals')}</StatusItem>}
        </StatusArea>
      }
    >
      <div className="flex flex-col gap-1.5">
        <PanelHeader title={tr('tsInput')} htmlFor={inputId} />
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={inputId}
            ref={ref}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={tr('tsPlaceholder')}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? errorId : undefined}
            className={lineInputCls(!!error)}
            {...NO_AUTOCORRECT}
          />
          {parsed?.ok && <span className={CHIP}>{tr(parsed.chip)}</span>}
          <IconButton icon={ArrowLeftRight} label={tr('swap')} shortcut="mod+shift+X" disabled={!swap} onClick={() => swap?.()} />
          <button type="button" onClick={setNow} className={SECONDARY_CLS}>
            <Clock size={13} aria-hidden />
            {tr('now')}
          </button>
        </div>
      </div>
      {!input.trim() ? (
        <EmptyOutput onExample={() => setInput('1767225600')} />
      ) : rows ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <PanelHeader title={tr('output')}>
            <CopyButton text={output ?? ''} showLabel shortcut="mod+shift+C" />
            <SaveButton disabled={!saver.can} onSave={() => void saver.save()} />
          </PanelHeader>
          {saver.saved && <SavedInline note={saver.saved} />}
          <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
            <table className="w-full text-left text-xs">
              <tbody>
                {rows.map(([key, value], i) => (
                  <tr key={key} className={i ? 'border-t border-[var(--border)]' : ''}>
                    <th scope="row" className="whitespace-nowrap px-3 py-2 font-normal text-[var(--text-secondary)]">{label(key)}</th>
                    <td className="select-text px-1 py-2 font-mono text-[var(--text-body)]">{value}</td>
                    <td className="w-8 px-1 py-1">
                      <CopyButton row text={value} label={tr('copyItem', { name: label(key) })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </ToolFrame>
  );
}
