// "Ver el recorrido" desde Opciones → Acerca de (specs/onboarding OB15): las
// mismas 5 escenas de la bienvenida, sin carpeta ni apariencia.
import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { Z_MODAL_NESTED } from '../../lib/zIndex';
import { ModalOverlay } from '../shared/ModalOverlay';
import { ModalPanel } from '../shared/ModalPanel';
import { FOCUS_RING, SECONDARY_CLS } from '../shared/controlClasses';
import { TourScenes } from './TourScenes';
import { TOUR_SCENES } from './scenes';

const TITLE_ID = 'tour-modal-title';
// Mismo botón que la bienvenida: indigo literal, legible en los temas tintados.
const PRIMARY_BTN = `rounded-xl bg-[#4f46e5] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#6366f1] ${FOCUS_RING}`;

export function TourModal({ onClose, initialScene = 0 }: { onClose: () => void; initialScene?: number }) {
  const language = useAppStore((s) => s.language);
  const [scene, setScene] = useState(initialScene);
  const last = TOUR_SCENES.length - 1;

  // Esc cierra el recorrido y no Opciones: se escucha en captura para
  // llegar antes que el `keydown` de SettingsModal.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <ModalOverlay onClose={onClose} zIndex={Z_MODAL_NESTED} className="px-4">
      <ModalPanel className="w-full max-w-xl rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl">
        <div role="dialog" aria-modal="true" aria-labelledby={TITLE_ID} className="max-h-[calc(100vh-2rem)] overflow-y-auto p-5">
          <h1 id={TITLE_ID} className="mb-4 text-base font-semibold text-[var(--text-primary)]">
            {t(language, 'onboarding', 'tourTitle')}
          </h1>
          <TourScenes scene={scene} />
          <div className="mt-5 flex items-center gap-3">
            <button type="button" onClick={onClose} className={SECONDARY_CLS}>{t(language, 'tour', 'close')}</button>
            <div className="flex-1" />
            {scene > 0 && (
              <button type="button" onClick={() => setScene(scene - 1)} className={SECONDARY_CLS}>
                {t(language, 'onboarding', 'back')}
              </button>
            )}
            <button
              type="button"
              onClick={() => (scene < last ? setScene(scene + 1) : onClose())}
              className={PRIMARY_BTN}
            >
              {scene < last ? t(language, 'onboarding', 'next') : t(language, 'tour', 'tourDone')}
            </button>
          </div>
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}
