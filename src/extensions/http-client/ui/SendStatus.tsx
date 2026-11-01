// Lo que el bloque de una nota y el formulario de la pantalla muestran igual
// alrededor de un envío (Interfaz §1.4 y §11): la confirmación en el sitio,
// "Enviando…", el error con Reintentar y "Enviar sin verificar".
import { useEffect, useRef, useState } from 'react';
import { RotateCw, ShieldOff, TriangleAlert } from 'lucide-react';
import { FOCUS_RING, SECONDARY_CLS } from '../../../components/shared/controlClasses';
import { Spinner, StatusItem } from '../../../components/shared/FormControls';
import { sendErrorMessage } from '../core/api';
import { listVars, type Tr } from '../core/text';
import { dismissConfirm, type ErrorOutcome, type PendingConfirm } from '../store';

export const GHOST_BTN = `rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] ${FOCUS_RING}`;
export const TEXT_LINK = `rounded text-[11px] font-medium text-[var(--text-primary)] underline decoration-[var(--border-high)] underline-offset-2 hover:decoration-[var(--text-primary)] ${FOCUS_RING}`;

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function useNow(ms: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return now;
}

/** La confirmación de HT20 y HT21, dentro del bloque o de la herramienta:
 *  no es modal y el foco empieza en "No enviar". */
export function ConfirmBox({ tr, blockId, pending, onSend }: { tr: Tr; blockId: string; pending: PendingConfirm; onSend: () => void }) {
  const dontRef = useRef<HTMLButtonElement>(null);
  const textId = `http-confirm-${blockId.replace(/[^a-zA-Z0-9]/g, '-')}`;
  // Al abrirse, el foco va a "No enviar", la opción segura.
  useEffect(() => {
    dontRef.current?.focus();
  }, [pending]);
  const envName = pending.envName ?? tr('envNone');
  const protectedReason = pending.reasons.find((r) => r.kind === 'protected');
  const untrusted = pending.reasons.find((r) => r.kind === 'untrusted_host');
  return (
    <div
      role="group"
      aria-labelledby={textId}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          dismissConfirm(blockId);
        }
      }}
      className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-[var(--text-primary)]"
    >
      <div id={textId} className="flex items-start gap-1.5">
        <TriangleAlert size={12} className="mt-0.5 shrink-0 text-amber-400" aria-hidden />
        <div className="space-y-0.5">
          {protectedReason && <p>{tr('confirmProtected', { method: pending.method, env: envName })}</p>}
          {untrusted && untrusted.kind === 'untrusted_host' && (
            <p>
              {untrusted.vars.length > 0
                ? tr('confirmUntrusted', { vars: listVars(tr, untrusted.vars), host: untrusted.host, env: envName })
                : tr('confirmUntrustedSecret', { host: untrusted.host, env: envName })}
            </p>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button ref={dontRef} type="button" onClick={() => dismissConfirm(blockId)} className={GHOST_BTN}>{tr('confirmDont')}</button>
        <button type="button" onClick={onSend} className={`${SECONDARY_CLS} border-amber-500/50 text-[var(--text-primary)]`}>
          {untrusted ? tr('confirmSendAnyway') : tr('confirmSendTo', { env: envName })}
        </button>
      </div>
    </div>
  );
}

/** "Enviando…", con los segundos a partir del primero. */
export function SendProgress({ tr, startedAt, now }: { tr: Tr; startedAt: number; now: number }) {
  return (
    <p className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
      <Spinner />
      {now - startedAt >= 1000 ? tr('sendingFor', { s: Math.floor((now - startedAt) / 1000) }) : tr('sending')}
    </p>
  );
}

/** El error del último envío, con Reintentar y, si fue el certificado y el
 *  entorno no lo acepta ya, "Enviar sin verificar (solo esta vez)". */
export function SendFailure({
  tr, error, insecureEnv, onRetry,
}: {
  tr: Tr;
  error: ErrorOutcome;
  /** El entorno activo ya acepta certificados no válidos. */
  insecureEnv: boolean;
  onRetry: (opts: { insecureOnce?: boolean }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <StatusItem kind="error">
        {sendErrorMessage(tr, error.error, { envName: error.envName ?? tr('envNone'), timeoutSec: error.timeoutSec })}
      </StatusItem>
      <div className="flex gap-2">
        <button type="button" onClick={() => onRetry({})} className={SECONDARY_CLS}>
          <RotateCw size={13} aria-hidden />
          {tr('retry')}
        </button>
        {error.error.code === 'tls' && !insecureEnv && (
          <button type="button" onClick={() => onRetry({ insecureOnce: true })} className={SECONDARY_CLS}>
            <ShieldOff size={13} aria-hidden />
            {tr('err.tlsRetry')}
          </button>
        )}
      </div>
    </div>
  );
}
