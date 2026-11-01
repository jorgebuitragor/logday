// Hashes MD5, SHA-1, SHA-256 y SHA-512 de un texto (specs/devtools D3).
import { useEffect, useRef, useState } from 'react';
import { Eraser, TriangleAlert } from 'lucide-react';
import { MAX_LIVE_CHARS } from '../model';
import { useDevtools } from '../ui/context';
import { CopyButton, IconButton, PanelHeader, StatusArea, StatusItem, Toggle, useFieldId } from '../ui/controls';
import { useDebounced, useDraft, useFocusOnOpen, useToolActions, useToolOptions } from '../ui/hooks';
import { toolKey } from '../ui/text';
import { NO_AUTOCORRECT, textareaCls } from '../ui/classes';
import { CommonStatus, LargeInputNote } from '../ui/TextTool';
import { SavedInline, SaveButton, useSaveToNote } from '../ui/OutputPanel';
import { ToolFrame } from '../ui/ToolFrame';
import { HASH_ALGORITHMS, hashAll, type HashAlgorithm } from '../tools/hash';

const DEFAULTS = { upper: false };
const WEAK = new Set<HashAlgorithm>(['MD5', 'SHA-1']);

export default function HashTool() {
  const { tr, copyText } = useDevtools();
  const [opts, setOpts] = useToolOptions('hash', DEFAULTS);
  const [input, setInput, cut] = useDraft('hash');
  const ref = useRef<HTMLTextAreaElement>(null);
  const inputId = useFieldId('hash');
  useFocusOnOpen(ref);
  const debounced = useDebounced(input);
  const manual = input.length > MAX_LIVE_CHARS;
  const [runText, setRunText] = useState<string | null>(null);
  const source = manual ? runText : debounced;
  const [hashes, setHashes] = useState<{ text: string; values: Record<HashAlgorithm, string> } | null>(null);

  useEffect(() => {
    if (!source) return;
    let alive = true;
    void hashAll(source).then((values) => {
      if (alive) setHashes({ text: source, values });
    });
    return () => {
      alive = false;
    };
  }, [source]);

  const current = input && hashes && (manual ? hashes.text === runText : true) ? hashes.values : null;
  const fmt = (h: string) => (opts.upper ? h.toUpperCase() : h);
  const output = current ? HASH_ALGORITHMS.map((alg) => `${alg.padEnd(8)}${fmt(current[alg])}`).join('\n') : null;
  const saver = useSaveToNote('plaintext', output);
  const run = () => setRunText(input);
  useToolActions({
    copy: output ? () => void copyText(output) : undefined,
    save: saver.can ? () => void saver.save() : undefined,
    clear: () => {
      setInput('');
      ref.current?.focus();
    },
    primary: manual ? run : undefined,
  });

  return (
    <ToolFrame
      options={<Toggle label={tr('uppercase')} checked={opts.upper} onChange={(upper) => setOpts({ upper })} />}
      status={
        <StatusArea>
          <CommonStatus cut={cut} />
          {manual && runText !== input && <LargeInputNote size={input.length} onRun={run} />}
          <StatusItem kind="info">{tr('hashNote')}</StatusItem>
        </StatusArea>
      }
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <PanelHeader title={tr('input')} htmlFor={inputId}>
          <IconButton icon={Eraser} label={tr('clear')} shortcut="mod+shift+backspace" disabled={!input} onClick={() => setInput('')} />
        </PanelHeader>
        <textarea
          id={inputId}
          ref={ref}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tr(toolKey('hash', 'placeholder'))}
          className={textareaCls()}
          {...NO_AUTOCORRECT}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <PanelHeader title={tr('output')}>
          <CopyButton text={output ?? ''} disabled={!output} showLabel shortcut="mod+shift+C" />
          <SaveButton disabled={!saver.can} onSave={() => void saver.save()} />
        </PanelHeader>
        {saver.saved && <SavedInline note={saver.saved} />}
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
          <table className="w-full text-left text-xs">
            <thead className="sr-only">
              <tr>
                <th scope="col">{tr('hashAlgorithm')}</th>
                <th scope="col">{tr('hashValue')}</th>
                <th scope="col">{tr('copy')}</th>
              </tr>
            </thead>
            <tbody>
              {HASH_ALGORITHMS.map((alg, i) => (
                <tr key={alg} className={i ? 'border-t border-[var(--border)]' : ''}>
                  <th scope="row" className="w-20 whitespace-nowrap px-3 py-2 align-top font-normal text-[var(--text-secondary)]">
                    <span className="inline-flex items-center gap-1">
                      {alg}
                      {WEAK.has(alg) && (
                        <span title={tr('hashWeak')}>
                          <TriangleAlert size={11} className="text-amber-400" aria-hidden />
                          <span className="sr-only">{tr('hashWeak')}</span>
                        </span>
                      )}
                    </span>
                  </th>
                  <td className={`select-text break-all px-1 py-2 font-mono ${current ? 'text-[var(--text-body)]' : 'text-[var(--text-hint)]'}`}>
                    {current ? fmt(current[alg]) : '—'}
                  </td>
                  <td className="w-8 px-1 py-1 align-top">
                    <CopyButton row text={current ? fmt(current[alg]) : ''} disabled={!current} label={tr('copyItem', { name: alg })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ToolFrame>
  );
}
