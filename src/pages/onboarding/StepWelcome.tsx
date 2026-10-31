// Paso 1: bienvenida e idioma (specs/onboarding OB5).
import type { Language } from '../../types/common';
import { LogoMark } from '../../components/sidebar/sections';
import { OnboardingLayout, PRIMARY_BTN, useOnboardingText } from './OnboardingLayout';

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
];

export function StepWelcome({ language, onLanguage, onStart, focusTitle }: {
  language: Language;
  onLanguage: (lang: Language) => void;
  onStart: () => void;
  focusTitle: boolean;
}) {
  const tr = useOnboardingText();
  return (
    <OnboardingLayout
      step={1}
      focusTitle={focusTitle}
      center
      title={tr('welcomeTitle')}
      hero={
        <div className="mb-4 flex flex-col items-center text-center">
          {/* El mismo logo del menú, con el acento del tema activo. */}
          <LogoMark size={64} className="mb-3" />
          <p aria-hidden="true" className="brand-wordmark text-3xl">log<span className="accent">day</span></p>
        </div>
      }
      intro={<>
        <p className="text-sm text-[var(--text-secondary)]">{tr('tagline')}</p>
        <p className="mt-2">{tr('welcomeBody')}</p>
      </>}
    >
      {/* Radios nativos con el aspecto de los botones de idioma de
          Opciones → General (design, Paso 1). */}
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-[var(--text-secondary)]">{tr('language')}</legend>
        <div className="flex gap-2">
          {LANGUAGES.map((opt) => {
            const selected = language === opt.value;
            return (
              <label
                key={opt.value}
                lang={opt.value}
                className={`flex-1 cursor-pointer rounded-xl border px-4 py-2.5 text-center text-sm font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${
                  selected
                    ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-400'
                    : 'border-[var(--border-card)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--border-high)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <input
                  type="radio"
                  name="onboarding-language"
                  value={opt.value}
                  checked={selected}
                  onChange={() => onLanguage(opt.value)}
                  className="sr-only"
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-6 flex flex-col items-center gap-2">
        <button type="button" onClick={onStart} className={PRIMARY_BTN}>{tr('start')}</button>
        <p className="text-xs text-[var(--text-hint)]">{tr('duration')}</p>
      </div>
    </OnboardingLayout>
  );
}
