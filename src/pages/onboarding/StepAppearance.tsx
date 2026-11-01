// Paso 3: el tema y el estilo del menú (specs/onboarding OB10, OB11), con
// los mismos controles de Opciones. El tema va a localStorage al momento; el
// estilo espera en el store y se guarda al terminar.
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { ThemeTile } from '../../components/settings/ThemeTile';
import { themeOptions } from '../../components/settings/themeOptions';
import { SidebarStylePicker } from '../../components/settings/SidebarStylePicker';
import { OnboardingLayout, useOnboardingText } from './OnboardingLayout';
import type { StepFinishProps } from './types';

const GROUP_TITLE = 'mb-2 text-xs font-medium text-[var(--text-secondary)]';

export function StepAppearance({ onBack, onContinue, ...finish }: StepFinishProps & { onBack: () => void; onContinue: () => void }) {
  const tr = useOnboardingText();
  const { language, theme, setTheme } = useAppStore(
    useShallow((s) => ({ language: s.language, theme: s.theme, setTheme: s.setTheme })),
  );
  return (
    <OnboardingLayout
      step={3}
      focusTitle
      title={tr('lookTitle')}
      intro={<p>{tr('lookBody')}</p>}
      onBack={onBack}
      onSkipAll={finish.onSkipAll}
      busy={finish.finishing}
      finishError={finish.finishError}
      onPickOther={finish.onPickOther}
      primary={{ label: tr('continue'), onClick: onContinue }}
    >
      {/* Sin el tema personalizado (OB10). */}
      <fieldset>
        <legend className={GROUP_TITLE}>{t(language, 'settings', 'theme')}</legend>
        <div className="grid grid-cols-4 gap-2">
          {themeOptions(language).map(({ value, Icon, label, desc }) => (
            <ThemeTile
              key={value}
              name="onboarding-theme"
              compact
              active={theme === value}
              onClick={() => setTheme(value)}
              icon={<Icon size={18} />}
              label={label}
              title={desc}
            />
          ))}
        </div>
      </fieldset>

      <h2 className={`${GROUP_TITLE} mt-5`}>{t(language, 'settings', 'sidebarSection')}</h2>
      <SidebarStylePicker />
    </OnboardingLayout>
  );
}
