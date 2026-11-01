// Contraseñas (specs/devtools D3). Sin "Guardar en una nota": las notas se
// sincronizan y quedarían en texto plano (Decisiones del 30 oct 2026).
import { useCallback } from 'react';
import { useDevtools } from '../ui/context';
import { Checkbox, CopyButton, NumberField, Option, PanelHeader, StatusArea, StatusItem } from '../ui/controls';
import { useToolActions, useToolOptions } from '../ui/hooks';
import { ToolFrame } from '../ui/ToolFrame';
import { PASSWORD_LIMITS, generatePassword, passwordEntropy, type PasswordOptions } from '../tools/generators';
import { GenerateButton, useGenerated } from './generator';

const DEFAULTS = { length: 20, lower: true, upper: true, digits: true, symbols: true, avoidAmbiguous: false };
const SETS = [
  ['lower', 'pwLower'],
  ['upper', 'pwUpper'],
  ['digits', 'pwDigits'],
  ['symbols', 'pwSymbols'],
  ['avoidAmbiguous', 'pwAvoidSimilar'],
] as const;

export default function PasswordTool() {
  const { tr, copyText } = useDevtools();
  const [opts, setOpts] = useToolOptions('password', DEFAULTS);
  const length = Math.min(PASSWORD_LIMITS.max, Math.max(PASSWORD_LIMITS.min, opts.length));
  const options: PasswordOptions = { ...opts, length };
  const none = !opts.lower && !opts.upper && !opts.digits && !opts.symbols;
  const key = `${length}|${opts.lower}|${opts.upper}|${opts.digits}|${opts.symbols}|${opts.avoidAmbiguous}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const make = useCallback(() => generatePassword(options), [key]);
  const [password, generate] = useGenerated('password', make, key);
  const bits = passwordEntropy(options);
  const strength = bits < 50 ? 1 : bits < 80 ? 2 : 3;
  const strengthLabel = tr(strength === 1 ? 'pwWeak' : strength === 2 ? 'pwFair' : 'pwStrong');
  const barColor = strength === 1 ? 'bg-red-400' : strength === 2 ? 'bg-amber-400' : 'bg-emerald-400';
  useToolActions({
    copy: password ? () => void copyText(password) : undefined,
    primary: none ? undefined : () => generate(),
  });

  return (
    <ToolFrame
      bodyClass="flex flex-col gap-4 px-5 py-4"
      options={
        <>
          <Option label={tr('pwLength')}>
            <input
              type="range"
              aria-label={tr('pwLength')}
              min={PASSWORD_LIMITS.min}
              max={PASSWORD_LIMITS.max}
              value={length}
              onChange={(e) => setOpts({ length: Number(e.target.value) })}
              className="w-40 cursor-pointer accent-[var(--accent)]"
            />
            <NumberField label={tr('pwLength')} value={length} min={PASSWORD_LIMITS.min} max={PASSWORD_LIMITS.max} onChange={(n) => setOpts({ length: n })} />
          </Option>
          <div role="group" aria-label={tr('pwChars')} className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {SETS.map(([k, label]) => (
              <Checkbox key={k} label={tr(label)} checked={opts[k]} onChange={(v) => setOpts({ [k]: v })} />
            ))}
          </div>
        </>
      }
      status={
        <StatusArea>
          {none ? (
            <StatusItem kind="error">{tr('pwNoCharset')}</StatusItem>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-secondary)]">
              <span>{tr('pwEntropy', { bits })} · {strengthLabel}</span>
              <span className="flex gap-1" aria-hidden>
                {[1, 2, 3].map((n) => (
                  <span key={n} className={`h-1 w-8 rounded-full ${n <= strength ? barColor : 'bg-[var(--border)]'}`} />
                ))}
              </span>
            </div>
          )}
        </StatusArea>
      }
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <PanelHeader title={tr('output')}>
          <GenerateButton onClick={() => generate()} disabled={none} />
          <CopyButton text={password} disabled={!password || none} showLabel shortcut="mod+shift+C" />
        </PanelHeader>
        <p className={`select-text break-all rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5 font-mono text-sm text-[var(--text-body)] ${none ? 'opacity-50' : ''}`}>
          {password || '—'}
        </p>
      </div>
    </ToolFrame>
  );
}
