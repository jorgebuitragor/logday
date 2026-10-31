// Panel de Opciones → Extensiones → Pomodoro (design §2.10): duraciones,
// arranque solo, sonido, dónde se ve (PM15) y restablecer todo (PM16). Los
// cambios se guardan al momento; la fase en curso mantiene su fin y lo
// nuevo se aplica desde la siguiente.
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Info, RotateCcw, Volume2 } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { NumberField, Toggle } from '../../components/shared/FormControls';
import { ConfirmDeleteModal } from '../../components/shared/ConfirmDeleteModal';
import { FOCUS_RING, SECONDARY_CLS } from '../../components/shared/controlClasses';
import { useConfirmDelete } from '../../hooks/useConfirmDelete';
import { Z_MODAL_NESTED } from '../../lib/zIndex';
import {
  DEFAULT_OPTIONS, MAX_LONG_EVERY, MAX_MINUTES, MIN_LONG_EVERY, MIN_MINUTES, POMODORO_ID, isDefaultOptions, readOptions,
  type PomodoroOptions,
} from './model';
import { resetPomodoro, testSound, updateOptions, usePomodoro } from './store';
import { isMac, makeTr, type Tr } from './text';
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

/** Como "Quitar configuración" en Opciones → Extensiones: texto rojo, sin
 *  relleno, porque borra el historial. */
const DANGER_CLS = `flex items-center gap-1.5 rounded-lg border border-[var(--border-card)] px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-500/10 ${FOCUS_RING}`;

export default function PomodoroSettings() {
  const { language, raw, confirmDestructiveActions, showToast } = useAppStore(
    useShallow((s) => ({
      language: s.language,
      raw: s.extensions[POMODORO_ID]?.settings,
      confirmDestructiveActions: s.confirmDestructiveActions,
      showToast: s.showToast,
    })),
  );
  const status = usePomodoro((s) => s.timer.status);
  const o = useMemo(() => readOptions(raw), [raw]);
  const tr = useMemo(() => makeTr(language), [language]);
  const mac = useMemo(isMac, []);
  const set = (patch: Partial<PomodoroOptions>) => updateOptions(patch);
  const midPhase = status === 'running' || status === 'paused';
  // El patrón compartido de confirmación: con la opción global apagada,
  // restablece directo.
  const resetDialog = useConfirmDelete<true>(confirmDestructiveActions);
  const doReset = async () => {
    resetDialog.cancel();
    try {
      await resetPomodoro();
      showToast({ kind: 'success', title: tr('resetDone') });
    } catch (err) {
      showToast({ kind: 'error', title: tr('resetError'), description: String(err) });
    }
  };

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

      <div className="space-y-2">
        <Subtitle tr={tr} k="setShowIn" />
        {/* En macOS el tiempo va en la barra de menús; en Windows y Linux,
            en la bandeja del sistema (tooltip o etiqueta). */}
        <Toggle
          label={tr(mac ? 'setTrayTimeMac' : 'setTrayTime')}
          checked={o.showTrayTime}
          onChange={(v) => set({ showTrayTime: v })}
        />
        <p className="text-[11px] text-[var(--text-hint)]">{tr('setTrayTimeHint')}</p>
        <Toggle label={tr('setSidebarCounter')} checked={o.showSidebarCounter} onChange={(v) => set({ showSidebarCounter: v })} />
      </div>

      {!isDefaultOptions(o) && (
        <button type="button" className={SECONDARY_CLS} onClick={() => set({ ...DEFAULT_OPTIONS })}>
          {tr('setReset')}
        </button>
      )}

      <div className="space-y-2 border-t border-[var(--border)] pt-4">
        <Subtitle tr={tr} k="setResetSection" />
        <p className="text-[11px] text-[var(--text-hint)]">{tr('setResetAllDesc')}</p>
        <button type="button" className={DANGER_CLS} onClick={() => resetDialog.request(true, () => void doReset())}>
          <RotateCcw size={13} aria-hidden />
          {tr('setResetAll')}
        </button>
      </div>

      {resetDialog.isOpen && (
        <ConfirmDeleteModal
          zIndex={Z_MODAL_NESTED}
          title={tr('resetTitle')}
          message={tr('resetMessage')}
          cancelLabel={tr('resetCancel')}
          confirmLabel={tr('resetConfirm')}
          onCancel={resetDialog.cancel}
          onConfirm={() => void doReset()}
        />
      )}
    </div>
  );
}
