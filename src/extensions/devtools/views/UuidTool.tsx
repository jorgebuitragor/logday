// UUID v4 y v7 (specs/devtools D3).
import { useCallback } from 'react';
import { useDevtools } from '../ui/context';
import { CopyButton, NumberField, Option, PanelHeader, Segmented, Toggle } from '../ui/controls';
import { useToolActions, useToolOptions } from '../ui/hooks';
import { SavedInline, SaveButton, useSaveToNote } from '../ui/OutputPanel';
import { ToolFrame } from '../ui/ToolFrame';
import { PRE_CLS } from '../ui/classes';
import { uuidV4, uuidV7 } from '../tools/generators';
import { GenerateButton, useGenerated } from './generator';

const DEFAULTS = { version: 'v4', count: 1, upper: false, noHyphens: false };
const ALLOWED = { version: ['v4', 'v7'] } as const;
const MAX = 100;

export default function UuidTool() {
  const { tr, copyText } = useDevtools();
  const [opts, setOpts] = useToolOptions('uuid', DEFAULTS, ALLOWED);
  const count = Math.min(MAX, Math.max(1, opts.count));
  const make = useCallback(() => {
    // v7 con milisegundos crecientes: así la lista sale en orden.
    const start = Date.now();
    return Array.from({ length: count }, (_, i) => (opts.version === 'v7' ? uuidV7(start + i) : uuidV4())).join('\n');
  }, [count, opts.version]);
  const [raw, generate] = useGenerated('uuid', make, `${opts.version}|${count}`);
  // Mayúsculas y guiones son solo formato: no cambian los UUID generados.
  const output = raw
    .split('\n')
    .map((u) => (opts.noHyphens ? u.replace(/-/g, '') : u))
    .map((u) => (opts.upper ? u.toUpperCase() : u))
    .join('\n');
  const saver = useSaveToNote('text', output || null);
  useToolActions({
    copy: () => void copyText(output),
    save: () => void saver.save(),
    primary: () => generate(),
  });

  return (
    <ToolFrame
      bodyClass="flex flex-col gap-4 px-5 py-4"
      options={
        <>
          <Option label={tr('uuidVersion')} hint={opts.version === 'v7' ? tr('uuidV7Hint') : undefined}>
            <Segmented label={tr('uuidVersion')} value={opts.version} onChange={(version) => setOpts({ version })} options={[{ value: 'v4', label: 'v4' }, { value: 'v7', label: 'v7' }]} />
          </Option>
          <Option label={tr('count')}>
            <NumberField label={tr('count')} value={count} min={1} max={MAX} onChange={(n) => setOpts({ count: n })} />
          </Option>
          <Toggle label={tr('uppercase')} checked={opts.upper} onChange={(upper) => setOpts({ upper })} />
          <Toggle label={tr('uuidNoHyphens')} checked={opts.noHyphens} onChange={(noHyphens) => setOpts({ noHyphens })} />
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <PanelHeader title={tr('output')}>
          <GenerateButton onClick={() => generate()} />
          <CopyButton text={output} showLabel shortcut="mod+shift+C" />
          <SaveButton disabled={!saver.can} onSave={() => void saver.save()} />
        </PanelHeader>
        {saver.saved && <SavedInline note={saver.saved} />}
        {count === 1 ? (
          <p className="select-text break-all rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 font-mono text-sm text-[var(--text-body)]">{output}</p>
        ) : (
          <pre tabIndex={0} aria-label={tr('output')} className={`${PRE_CLS} whitespace-pre`}>{output}</pre>
        )}
      </div>
    </ToolFrame>
  );
}
