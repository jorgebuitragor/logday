// Paso 5: la pantalla de inicio y "Abrir Logday" (specs/onboarding OB16).
// `setStartupScreen` también fija la sección activa, así que la app abre en
// la elegida; la config se escribe al terminar.
import { Fragment } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { splitKeys } from '../../components/tour/scenes';
import type { PickedFolder } from '../../lib/onboarding';
import { homeItem, useSectionItems, type SectionIcon } from '../../components/sidebar/sections';
import { OnboardingLayout, useOnboardingText } from './OnboardingLayout';
import type { StepFinishProps } from './types';

const SCREENS = ['dashboard', 'dailys', 'tasks', 'notes', 'overtime'] as const;
const DESC = {
  dashboard: 'startupDescDashboard',
  dailys: 'startupDescDailys',
  tasks: 'startupDescTasks',
  notes: 'startupDescNotes',
  overtime: 'startupDescOvertime',
} as const;

export function StepDone({ folder, onBack, onOpen, finishing, finishError, onPickOther }: Omit<StepFinishProps, 'onSkipAll'> & {
  folder: PickedFolder;
  onBack: () => void;
  onOpen: () => void;
}) {
  const tr = useOnboardingText();
  const { language, startupScreen, setStartupScreen } = useAppStore(
    useShallow((s) => ({ language: s.language, startupScreen: s.startupScreen, setStartupScreen: s.setStartupScreen })),
  );
  // Los mismos nombres e íconos que el menú.
  const { items } = useSectionItems();
  const home = homeItem(language);
  const byId = new Map<string, { label: string; Icon: SectionIcon }>([[home.id, home], ...items.map((i) => [i.id, i] as const)]);

  return (
    <OnboardingLayout
      step={5}
      focusTitle
      title={tr('doneTitle')}
      onBack={onBack}
      busy={finishing}
      finishError={finishError}
      onPickOther={onPickOther}
      primary={{ label: finishing ? tr('finishing') : tr('open'), onClick: onOpen }}
    >
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-[var(--text-secondary)]">{tr('startLegend')}</legend>
        <div className="space-y-1">
          {SCREENS.map((value) => {
            const item = byId.get(value);
            const Icon = item?.Icon;
            const selected = startupScreen === value;
            return (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${
                  selected ? 'bg-indigo-500/10 text-indigo-400' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <input
                  type="radio"
                  name="onboarding-startup"
                  value={value}
                  checked={selected}
                  onChange={() => void setStartupScreen(value)}
                  className="accent-indigo-500"
                />
                {Icon && <Icon size={15} className="shrink-0" />}
                <span className="min-w-0">
                  <span className="block text-xs font-medium">{item?.label}</span>
                  <span className="block text-[10px] text-[var(--text-hint)]">{t(language, 'settings', DESC[value])}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <p className="mt-3 text-[11px] text-[var(--text-hint)]">{tr('startHint')}</p>
      <p className="mt-1 text-[11px] text-[var(--text-hint)]">
        {splitKeys(t(language, 'onboarding', 'savedIn'), { path: folder.path }).map((part, i) =>
          part.key
            ? <span key={i} className="break-all font-mono text-[var(--text-secondary)]">{part.text}</span>
            : <Fragment key={i}>{part.text}</Fragment>,
        )}
      </p>
    </OnboardingLayout>
  );
}
