// Cron → descripción y próximas ejecuciones (specs/devtools D4). Las
// próximas se calculan con 5 o 6 campos (Valores finales).
import { useMemo, useRef } from 'react';
import { Eraser } from 'lucide-react';
import { useDevtools } from '../ui/context';
import { CopyButton, EmptyOutput, IconButton, PanelHeader, StatusArea, StatusItem, useFieldId } from '../ui/controls';
import { useAnnounceError, useDebounced, useDraft, useFocusOnOpen, useToolActions } from '../ui/hooks';
import { localeOf, toolKey } from '../ui/text';
import { CHIP, NO_AUTOCORRECT, lineInputCls } from '../ui/classes';
import { CommonStatus } from '../ui/TextTool';
import { SavedInline, SaveButton, useSaveToNote } from '../ui/OutputPanel';
import { ToolFrame } from '../ui/ToolFrame';
import { cronFieldCount, describeCron, nextRuns } from '../tools/cron';
import { formatInZone, localTimeZone, relativeTime } from '../tools/time';

const NEXT = 5;

export default function CronTool() {
  const { tr, language, copyText } = useDevtools();
  const [input, setInput, cut] = useDraft('cron');
  const expr = useDebounced(input.trim());
  const ref = useRef<HTMLInputElement>(null);
  const inputId = useFieldId('cron');
  const errorId = useFieldId('cron-error');
  useFocusOnOpen(ref);
  const locale = localeOf(language);
  const zone = localTimeZone();

  const data = useMemo(() => {
    if (!expr) return null;
    const description = describeCron(expr, language);
    const fields = cronFieldCount(expr);
    const runs = description.ok ? nextRuns(expr, Date.now(), NEXT) : null;
    return { description, fields, runs };
  }, [expr, language]);
  const now = Date.now();
  const d = data?.description;
  const error = d && !d.ok ? tr('cronInvalid', { message: (d.error.detail ?? '').replace(/^Error:\s*/, '') || tr('error.cron-invalid') }) : null;
  const output = d?.ok
    ? [expr, d.value, ...(data?.runs ?? []).map((ms) => formatInZone(ms, zone, locale))].join('\n')
    : null;
  const saver = useSaveToNote('text', output);
  useAnnounceError(error);

  useToolActions({
    copy: d?.ok ? () => void copyText(d.value) : undefined,
    save: saver.can ? () => void saver.save() : undefined,
    clear: () => {
      setInput('');
      ref.current?.focus();
    },
  });

  return (
    <ToolFrame
      bodyClass="flex flex-col gap-4 px-5 py-4"
      status={
        <StatusArea>
          <CommonStatus cut={cut} />
          {error && <StatusItem kind="error" id={errorId}>{error}</StatusItem>}
        </StatusArea>
      }
    >
      <div className="flex flex-col gap-1.5">
        <PanelHeader title={tr('input')} htmlFor={inputId}>
          <IconButton icon={Eraser} label={tr('clear')} shortcut="mod+shift+backspace" disabled={!input} onClick={() => setInput('')} />
        </PanelHeader>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={inputId}
            ref={ref}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={tr(toolKey('cron', 'placeholder'))}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? errorId : undefined}
            className={lineInputCls(!!error)}
            {...NO_AUTOCORRECT}
          />
          {data?.fields && <span className={CHIP}>{tr(data.fields === 5 ? 'cronFields5' : 'cronFields6')}</span>}
        </div>
      </div>
      {!input.trim() ? (
        <EmptyOutput onExample={() => setInput('0 9 * * 1-5')} />
      ) : d?.ok ? (
        <>
          <div className="flex flex-col gap-1.5">
            <PanelHeader title={tr('cronWhat')}>
              <CopyButton text={d.value} showLabel shortcut="mod+shift+C" />
              <SaveButton disabled={!saver.can} onSave={() => void saver.save()} />
            </PanelHeader>
            {saver.saved && <SavedInline note={saver.saved} />}
            <p className="select-text text-sm text-[var(--text-primary)]">{d.value}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <PanelHeader title={tr('cronNext')} />
            {data?.runs === null ? (
              <p className="text-xs text-[var(--text-hint)]">{tr('cronNoNextForFields')}</p>
            ) : !data?.runs?.length ? (
              <p className="text-xs text-[var(--text-hint)]">{tr('cronNever')}</p>
            ) : (
              <>
                <ol className="flex flex-col gap-1 text-xs">
                  {data.runs.map((ms) => (
                    <li key={ms} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="select-text text-[var(--text-body)]">{formatInZone(ms, zone, locale)}</span>
                      <span className="text-[var(--text-hint)]">{relativeTime(ms, now, locale)}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-[11px] text-[var(--text-hint)]">{tr('cronZone', { zone })}</p>
              </>
            )}
          </div>
        </>
      ) : null}
    </ToolFrame>
  );
}
