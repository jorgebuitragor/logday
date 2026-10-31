// El marco común de los pasos de la bienvenida (specs/onboarding OB1, OB17,
// design Layout común): el progreso, el título que recibe el foco, el
// contenido con scroll y el pie fijo. Cabe en 800×600.
import { useEffect, useRef, type ReactNode } from 'react';
import { useAppStore } from '../../store/appStore';
import { t, type OnboardingKey } from '../../lib/i18n';
import { interpolate } from '../../lib/interpolate';
import { FOCUS_RING, SECONDARY_CLS } from '../../components/shared/controlClasses';
import { ONBOARDING_STEPS, type OnboardingStep } from '../../lib/onboarding';

/** Indigo fijo y no `--accent`: el texto blanco no contrasta en sepia ni en
 *  los temas tintados (design, Botón principal). */
export const PRIMARY_BTN = `rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-indigo-600 ${FOCUS_RING}`;
export const SKIP_BTN = `rounded text-xs text-[var(--text-hint)] hover:text-[var(--text-secondary)] hover:underline disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

export function useOnboardingText() {
  const language = useAppStore((s) => s.language);
  return (key: OnboardingKey, vars?: Record<string, string | number>) => interpolate(t(language, 'onboarding', key), vars);
}

interface Primary {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Id del texto que explica por qué está deshabilitado. */
  describedBy?: string;
}

interface OnboardingLayoutProps {
  step: OnboardingStep;
  title: string;
  /** Lo que va sobre el título (el logo del paso 1). */
  hero?: ReactNode;
  /** Título y texto centrados (paso 1). */
  center?: boolean;
  /** El texto de apoyo bajo el título. */
  intro?: ReactNode;
  children: ReactNode;
  onBack?: () => void;
  /** "Omitir y abrir Logday" (OB2). */
  onSkipAll?: () => void;
  /** Otro botón secundario, a la izquierda del principal ("Omitir recorrido"). */
  extra?: ReactNode;
  primary?: Primary;
  /** Mientras se prepara la carpeta, no se cambia de paso. */
  busy?: boolean;
  /** OB9: no se pudo preparar la carpeta. */
  finishError?: boolean;
  onPickOther?: () => void;
  /** OB17: el foco va al título al cambiar de paso; no al abrir la
   *  bienvenida ni en el paso 4, donde va al título de la escena. */
  focusTitle?: boolean;
}

export function OnboardingLayout({
  step, title, hero, center = false, intro, children, onBack, onSkipAll, extra, primary, busy = false, finishError = false, onPickOther, focusTitle = true,
}: OnboardingLayoutProps) {
  const tr = useOnboardingText();
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  // OB17: cada paso es otro componente, así que el layout se vuelve a
  // montar al cambiar de paso y basta con el montaje.
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle, step]);

  return (
    <div className="flex h-screen w-full flex-col bg-[var(--bg-base)]">
      {/* Progreso */}
      <div className="flex shrink-0 items-center justify-center gap-3 pt-6 pb-2">
        <ol aria-label={tr('progress')} className="flex items-center gap-1.5">
          {Array.from({ length: ONBOARDING_STEPS }, (_, i) => {
            const n = i + 1;
            return (
              <li
                key={n}
                aria-current={n === step ? 'step' : undefined}
                className={`h-1.5 w-1.5 rounded-full ${n <= step ? 'bg-[var(--accent)]' : 'bg-[var(--border-high)]'}`}
              >
                <span className="sr-only">{tr('step', { n, total: ONBOARDING_STEPS })}</span>
              </li>
            );
          })}
        </ol>
        <span aria-hidden="true" className="text-[10px] text-[var(--text-hint)]">{tr('step', { n: step, total: ONBOARDING_STEPS })}</span>
      </div>

      {/* Contenido */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={`obd-step mx-auto w-full max-w-xl px-8 py-6 ${center ? 'text-center' : ''}`}>
          {hero}
          <h1 ref={titleRef} tabIndex={-1} className="text-lg font-semibold text-[var(--text-primary)] outline-none">{title}</h1>
          {intro && <div className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{intro}</div>}
          <div className="mt-5">{children}</div>
        </div>
      </div>

      {/* Pie */}
      {(onBack || onSkipAll || primary || extra) && (
        <div className="shrink-0 border-t border-[var(--border)]">
          {finishError && (
            <div role="alert" className="mx-auto flex w-full max-w-xl flex-wrap items-center justify-between gap-2 px-8 pt-3 text-xs text-red-400">
              <span>{tr('finishError')}</span>
              {onPickOther && (
                <button type="button" onClick={onPickOther} className={`rounded underline underline-offset-2 hover:text-red-300 ${FOCUS_RING}`}>
                  {tr('pickOther')}
                </button>
              )}
            </div>
          )}
          <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-8 py-4">
            {onBack ? (
              <button type="button" onClick={onBack} disabled={busy} className={SECONDARY_CLS}>{tr('back')}</button>
            ) : <span />}
            <div className="flex flex-1 justify-center">
              {onSkipAll && (
                <button type="button" onClick={onSkipAll} disabled={busy} className={SKIP_BTN}>{tr('skipAll')}</button>
              )}
            </div>
            {extra}
            {primary && (
              <button
                type="button"
                onClick={primary.onClick}
                disabled={busy || primary.disabled}
                aria-describedby={primary.describedBy}
                className={PRIMARY_BTN}
              >
                {primary.label}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
