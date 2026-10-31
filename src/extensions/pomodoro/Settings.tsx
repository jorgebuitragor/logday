// Panel de Opciones → Extensiones → Pomodoro (design §2.10): duraciones,
// arranque solo y sonido. Los cambios se guardan al momento; la fase en
// curso mantiene su fin y lo nuevo se aplica desde la siguiente.
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Info, Volume2 } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { NumberField, Toggle } from '../../components/shared/FormControls';
import { SECONDARY_CLS } from '../../components/shared/controlClasses';
import {
  DEFAULT_OPTIONS, MAX_LONG_EVERY, MAX_MINUTES, MIN_LONG_EVERY, MIN_MINUTES, POMODORO_ID, isDefaultOptions, readOptions,
  type PomodoroOptions,
} from './model';
import { testSound, updateOptions, usePomodoro } from './store';
import { makeTr, type Tr } from './text';
import type { PomodoroKey } from '../../lib/i18n';

type NumberKey = 'workMin' | 'shortMin' | 'longMin' | 'longEvery';

const ROWS: { key: NumberKey; label: PomodoroKey; aria: PomodoroKey; unit: PomodoroKey }[] = [
  { key: 'workMin', label: 'setWork', aria: 'setWorkAria', unit: 'setUnitMin' },
  { key: 'shortMin', label: 'setShort', aria: 'setShortAria', unit: 'setUnitMin' },
  { key: 'longMin', label: 'setLong', aria: 'setLongAria', unit: 'setUnitMin' },
  { key: 'longEvery', label: 'setLongEvery', aria: 'setLongEveryAria', unit: 'setUnitBlocks' },
];

function Subtitle({ tr, k }: { tr: Tr; k: PomodoroKey }) {
  return <p className="font-medium text-[var(--text-secondary)]">{tr(k)}</p>;
}

export default function PomodoroSettings() {
  const { language, raw } = useAppStore(
    useShallow((s) => ({ language: s.language, raw: s.extensions[POMODORO_ID]?.settings })),
  );
  const status = usePomodoro((s) => s.timer.status);
  const o = useMemo(() => readOptions(raw), [raw]);
  const tr = useMemo(() => makeTr(language), [language]);
  const set = (patch: Partial<PomodoroOptions>) => updateOptions(patch);
  const midPhase = status === 'running' || status === 'paused';

  return (
    <div className="space-y-4 text-xs">
      <div className="space-y-2">
        <Subtitle tr={tr} k="setDurations" />
        <div className="grid grid-cols-[auto_auto_1fr] items-center gap-x-3 gap-y-2">
          {ROWS.map((row) => {
            const isBlocks = row.key === 'longEvery';
            return (
              <div key={row.key} className="contents">
                <span className="text-[var(--text-secondary)]">{tr(row.label)}</span>
                <NumberField
                  label={tr(row.aria)}
                  value={o[row.key]}
                  min={isBlocks ? MIN_LONG_EVERY : MIN_MINUTES}
                  max={isBlocks ? MAX_LONG_EVERY : MAX_MINUTES}
                  onChange={(v) => set({ [row.key]: v })}
                  width="w-16"
                />
                <span className="text-[var(--text-hint)]">{tr(row.unit)}</span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-[var(--text-hint)]">{tr('setRange')}</p>
        {midPhase && (
          <p className="flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)]">
            <Info size={12} className="mt-px shrink-0 text-[var(--text-hint)]" aria-hidden />
            {tr('setAppliesNext')}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Subtitle tr={tr} k="setStart" />
        <Toggle label={tr('setAutoBreaks')} checked={o.autoBreaks} onChange={(v) => set({ autoBreaks: v })} />
        <Toggle label={tr('setAutoWork')} checked={o.autoWork} onChange={(v) => set({ autoWork: v })} />
      </div>

      <div className="space-y-2">
        <Subtitle tr={tr} k="setAlert" />
        <div className="flex flex-wrap items-center gap-3">
          <Toggle label={tr('setSound')} checked={o.sound} onChange={(v) => set({ sound: v })} />
          <button type="button" className={SECONDARY_CLS} disabled={!o.sound} onClick={testSound}>
            <Volume2 size={13} aria-hidden />
            {tr('setSoundTest')}
          </button>
        </div>
        <p className="text-[11px] text-[var(--text-hint)]">{tr('setSoundDesc')}</p>
        <p className="text-[11px] text-[var(--text-hint)]">{tr('setNotifHint')}</p>
      </div>

      {!isDefaultOptions(o) && (
        <button type="button" className={SECONDARY_CLS} onClick={() => set({ ...DEFAULT_OPTIONS })}>
          {tr('setReset')}
        </button>
      )}
    </div>
  );
}
