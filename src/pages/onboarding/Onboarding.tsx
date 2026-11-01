// La bienvenida por pasos (specs/onboarding): se muestra mientras no hay
// carpeta configurada. Lleva el paso y la carpeta elegida; lo demás (idioma,
// tema, estilo del menú, pantalla de inicio) va directo al store. Nada se
// escribe en config.json hasta terminar (OB3, OB4).
import { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { canContinue, canSkipAll, nextStep, prevStep, type OnboardingStep, type PickedFolder } from '../../lib/onboarding';
import { StepWelcome } from './StepWelcome';
import { StepFolder } from './StepFolder';
import { StepAppearance } from './StepAppearance';
import { StepTour } from './StepTour';
import { StepDone } from './StepDone';
import type { StepFinishProps } from './types';

export function Onboarding({ initialStep = 1, initialFolder = null }: {
  /** Para las pruebas. */
  initialStep?: OnboardingStep;
  initialFolder?: PickedFolder | null;
}) {
  const { language, setLanguage, pickBaseFolder, completeOnboarding } = useAppStore(
    useShallow((s) => ({
      language: s.language,
      setLanguage: s.setLanguage,
      pickBaseFolder: s.pickBaseFolder,
      completeOnboarding: s.completeOnboarding,
    })),
  );
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [folder, setFolder] = useState<PickedFolder | null>(initialFolder);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(false);
  // OB17: el foco va al título al cambiar de paso, no al abrir.
  const moved = useRef(false);

  const go = (to: OnboardingStep) => {
    moved.current = true;
    setFinishError(false);
    setStep(to);
  };

  const pick = async () => {
    setPicking(true);
    setPickError(false);
    try {
      // Cancelar devuelve null y no cambia nada (OB6).
      const picked = await pickBaseFolder();
      if (picked) setFolder(picked);
    } catch (e) {
      console.error('Onboarding pick error:', e);
      setPickError(true);
    } finally {
      setPicking(false);
    }
  };

  const finish = async () => {
    if (!folder || finishing) return;
    setFinishing(true);
    setFinishError(false);
    try {
      // Al terminar, `isConfigured` desmonta la bienvenida.
      await completeOnboarding(folder.path);
    } catch (e) {
      console.error('Onboarding finish error:', e);
      setFinishError(true);
      setFinishing(false);
    }
  };

  const finishProps: StepFinishProps = {
    finishing,
    finishError,
    onSkipAll: () => { if (canSkipAll(step, folder)) void finish(); },
    onPickOther: () => go(2),
  };

  // Sin carpeta no se pasa del 2 (OB2).
  const shown: OnboardingStep = step > 2 && !folder ? 2 : step;

  switch (shown) {
    case 1:
      return <StepWelcome language={language} onLanguage={(lang) => void setLanguage(lang)} onStart={() => go(2)} focusTitle={moved.current} />;
    case 2:
      return (
        <StepFolder
          folder={folder}
          picking={picking}
          pickError={pickError}
          onPick={() => void pick()}
          onBack={() => go(prevStep(2))}
          onContinue={() => { if (canContinue(2, folder)) go(nextStep(2)); }}
        />
      );
    case 3:
      return <StepAppearance {...finishProps} onBack={() => go(2)} onContinue={() => go(4)} />;
    case 4:
      return <StepTour {...finishProps} onBack={() => go(3)} onDone={() => go(5)} />;
    case 5:
      return <StepDone {...finishProps} folder={folder!} onBack={() => go(4)} onOpen={() => void finish()} />;
  }
}
