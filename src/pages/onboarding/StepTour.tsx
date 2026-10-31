// Paso 4: cómo funciona (specs/onboarding OB2, OB12). Atrás y Siguiente
// recorren las escenas; desde la primera, Atrás vuelve al paso 3, y desde
// la última, Siguiente pasa al 5. "Omitir recorrido" va directo al 5.
import { useState } from 'react';
import { TourScenes } from '../../components/tour/TourScenes';
import { TOUR_SCENES } from '../../components/tour/scenes';
import { OnboardingLayout, SKIP_BTN, useOnboardingText } from './OnboardingLayout';
import type { StepFinishProps } from './types';

export function StepTour({ onBack, onDone, ...finish }: StepFinishProps & { onBack: () => void; onDone: () => void }) {
  const tr = useOnboardingText();
  const [scene, setScene] = useState(0);
  const last = TOUR_SCENES.length - 1;
  return (
    <OnboardingLayout
      step={4}
      focusTitle={false}
      title={tr('tourTitle')}
      onBack={() => (scene > 0 ? setScene(scene - 1) : onBack())}
      onSkipAll={finish.onSkipAll}
      busy={finish.finishing}
      finishError={finish.finishError}
      onPickOther={finish.onPickOther}
      extra={scene < last && (
        <button type="button" onClick={onDone} disabled={finish.finishing} className={SKIP_BTN}>{tr('skipTour')}</button>
      )}
      primary={{
        label: scene < last ? tr('next') : tr('continue'),
        onClick: () => (scene < last ? setScene(scene + 1) : onDone()),
      }}
    >
      <TourScenes scene={scene} />
    </OnboardingLayout>
  );
}
