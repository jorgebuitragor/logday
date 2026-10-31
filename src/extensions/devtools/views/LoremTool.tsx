// Lorem ipsum (specs/devtools D3).
import { useCallback } from 'react';
import { useDevtools } from '../ui/context';
import { CopyButton, NumberField, Option, PanelHeader, Segmented, Toggle } from '../ui/controls';
import { useToolActions, useToolOptions } from '../ui/hooks';
import { SavedInline, SaveButton, useSaveToNote } from '../ui/OutputPanel';
import { ToolFrame } from '../ui/ToolFrame';
import { PRE_CLS } from '../ui/classes';
import { LOREM_LIMITS, lorem, type LoremUnit } from '../tools/generators';
import { GenerateButton, useGenerated } from './generator';

const DEFAULTS = { unit: 'paragraphs', count: 3, classic: true };
const ALLOWED = { unit: ['paragraphs', 'sentences', 'words'] } as const;

export default function LoremTool() {
  const { tr, copyText } = useDevtools();
  const [opts, setOpts] = useToolOptions('lorem', DEFAULTS, ALLOWED);
  const count = Math.min(LOREM_LIMITS.max, Math.max(LOREM_LIMITS.min, opts.count));
  const make = useCallback(() => lorem(opts.unit as LoremUnit, count, opts.classic), [opts.unit, count, opts.classic]);
  const [text, generate] = useGenerated('lorem', make, `${opts.unit}|${count}|${opts.classic}`);
  const saver = useSaveToNote('plaintext', text || null);
  useToolActions({
    copy: () => void copyText(text),
    save: () => void saver.save(),
    primary: () => generate(),
  });
  return (
    <ToolFrame
      bodyClass="flex flex-col gap-4 px-5 py-4"
      options={
        <>
          <Option label={tr('loremUnit')}>
            <Segmented
              label={tr('loremUnit')}
              value={opts.unit}
              onChange={(unit) => setOpts({ unit })}
              options={[
                { value: 'paragraphs', label: tr('loremParagraphs') },
                { value: 'sentences', label: tr('loremSentences') },
                { value: 'words', label: tr('loremWords') },
              ]}
            />
          </Option>
          <Option label={tr('count')}>
            <NumberField label={tr('count')} value={count} min={LOREM_LIMITS.min} max={LOREM_LIMITS.max} onChange={(n) => setOpts({ count: n })} />
          </Option>
          <Toggle label={tr('loremClassic')} checked={opts.classic} onChange={(classic) => setOpts({ classic })} />
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <PanelHeader title={tr('output')}>
          <GenerateButton onClick={() => generate()} />
          <CopyButton text={text} showLabel shortcut="mod+shift+C" />
          <SaveButton disabled={!saver.can} onSave={() => void saver.save()} />
        </PanelHeader>
        {saver.saved && <SavedInline note={saver.saved} />}
        <pre tabIndex={0} aria-label={tr('output')} className={`${PRE_CLS} whitespace-pre-wrap break-words`}>
          {text}
        </pre>
      </div>
    </ToolFrame>
  );
}
