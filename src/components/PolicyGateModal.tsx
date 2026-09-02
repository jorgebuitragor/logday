import { useRef, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { t } from '../lib/i18n';

// Gate bloqueante de consentimiento — se monta en App.tsx y se activa
// solo cuando appStore.policyGate no es null (login/refresh trajeron
// una policy_version que el usuario todavía no aceptó). Ver
// specs/cumplimiento-datos-personales/requirements.md "Consentimiento
// general obligatorio": nunca un checkbox premarcado, nunca "seguir
// usando implica aceptar" — el botón "Acepto" arranca deshabilitado
// hasta hacer scroll al final del texto.
export function PolicyGateModal() {
  const { language, policyGate, acceptPolicyGate, rejectPolicyGate } = useAppStore();
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  if (!policyGate) return null;

  const handleScroll = () => {
    const el = textRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolledToEnd(true);
  };

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await acceptPolicyGate();
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="flex w-full max-w-lg flex-col rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-[var(--border-card)] px-5 py-4">
          <ScrollText size={16} className="text-indigo-400" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {t(language, 'settings', 'policyGateTitle')}
          </h2>
        </div>

        <div
          ref={textRef}
          onScroll={handleScroll}
          className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap px-5 py-4 text-xs leading-relaxed text-[var(--text-secondary)]"
        >
          {policyGate.text}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-card)] px-5 py-4">
          <p className="text-[10px] text-[var(--text-hint)]">
            {scrolledToEnd ? '' : t(language, 'settings', 'policyGateScrollHint')}
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={rejectPolicyGate}
              className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)]"
            >
              {t(language, 'settings', 'policyGateReject')}
            </button>
            <button
              onClick={() => void handleAccept()}
              disabled={!scrolledToEnd || accepting}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t(language, 'settings', 'policyGateAccept')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
