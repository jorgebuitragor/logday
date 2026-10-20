import { ShieldAlert } from 'lucide-react';
import { t } from '../../lib/i18n';
import { Language } from '../../types/common';
import { ModalOverlay } from './ModalOverlay';
import { ModalPanel } from './ModalPanel';

interface Props {
  language: Language;
  zIndex?: number;
  onAccept: () => void;
  onCancel: () => void;
}

// Consentimiento aparte y explícito para el campo "incapacidad" de
// AbsenceDay — dato sensible de salud bajo la ley colombiana, exige
// un consentimiento diferenciado del general de la política (ver
// specs/cumplimiento-datos-personales/). Solo se muestra con sync
// activo — en modo 100% local el dato nunca sale del disco del
// usuario, no hay tratamiento por un tercero.
export function SensitiveDataConsentModal({ language, zIndex, onAccept, onCancel }: Props) {
  return (
    <ModalOverlay zIndex={zIndex}>
      <ModalPanel className="w-80 rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <ShieldAlert size={16} className="text-amber-400" />
          {t(language, 'absence', 'sensitiveConsentTitle')}
        </div>
        <p className="mb-4 text-xs leading-relaxed text-[var(--text-secondary)]">
          {t(language, 'absence', 'sensitiveConsentBody')}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
          >
            {t(language, 'absence', 'cancel')}
          </button>
          <button
            onClick={onAccept}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500"
          >
            {t(language, 'absence', 'sensitiveConsentAccept')}
          </button>
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}
