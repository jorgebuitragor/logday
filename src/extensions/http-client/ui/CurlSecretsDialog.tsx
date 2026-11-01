// "¿Qué hacemos con los valores sensibles de este cURL?" (specs/cliente-http
// HT70, HT71). Se abre antes de insertar nada, con "Preguntar" en Opciones:
// el texto pegado (con los valores) solo vive en memoria, en el cierre que
// espera la respuesta, mientras el diálogo está abierto. Aquí solo se ven
// los nombres de las variables, nunca los valores.
//
// El pegado viene del editor de notas o de la URL de la pantalla, fuera de
// un árbol de React de la extensión, así que el diálogo tiene su propia raíz
// y la quita al cerrarse.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { KeyRound } from 'lucide-react';
import { ModalOverlay } from '../../../components/shared/ModalOverlay';
import { ModalPanel } from '../../../components/shared/ModalPanel';
import { FOCUS_RING, SECONDARY_CLS, SEND_BTN } from '../../../components/shared/controlClasses';
import type { Tr } from '../core/text';

export type CurlChoice = 'variables' | 'keep';

export interface CurlAnswer {
  choice: CurlChoice;
  /** "Recordar mi elección": fija la opción de Opciones (HT70). */
  remember: boolean;
}

/** El contenido del diálogo, sin el fondo ni el portal (para probarlo con
 *  react-dom/server). */
export function CurlSecretsPanel({
  tr, names, remember, onRemember, onChoose, primaryRef, titleId, bodyId,
}: {
  tr: Tr;
  /** Los nombres de las variables que reemplazarían los valores. */
  names: readonly string[];
  remember: boolean;
  onRemember: (on: boolean) => void;
  onChoose: (choice: CurlChoice) => void;
  primaryRef?: RefObject<HTMLButtonElement | null>;
  titleId: string;
  bodyId: string;
}) {
  return (
    <div className="modal-spring-in w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-5 shadow-2xl">
      <h2 id={titleId} className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        <KeyRound size={15} className="shrink-0 text-amber-400" aria-hidden />
        {tr('curlAskTitle')}
      </h2>
      <div id={bodyId} className="space-y-2 text-xs text-[var(--text-secondary)]">
        <p>{tr('curlAskBody', { n: names.length })}</p>
        <ul className="flex flex-wrap gap-1.5" aria-label={tr('curlAskListAria')}>
          {names.map((n) => (
            <li key={n} className="rounded-md bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-primary)]">
              {`{{${n}}}`}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-[var(--text-hint)]">{tr('curlAskHelp')}</p>
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => onRemember(e.target.checked)}
          className={`h-3.5 w-3.5 accent-[var(--accent-solid)] ${FOCUS_RING}`}
        />
        {tr('curlAskRemember')}
      </label>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={() => onChoose('keep')} className={SECONDARY_CLS}>{tr('curlAskKeep')}</button>
        <button ref={primaryRef} type="button" onClick={() => onChoose('variables')} className={`${SEND_BTN} px-3 py-1.5`}>
          {tr('curlAskVariables')}
        </button>
      </div>
      <p className="mt-3 text-right text-[10px] text-[var(--text-hint)]">{tr('curlAskEsc')}</p>
    </div>
  );
}

/** El diálogo: el foco va a "Cambiar por variables", Tab no sale de él y
 *  Esc lo cierra sin elegir (se pega el texto tal cual). */
function CurlSecretsDialog({ tr, names, onDone }: { tr: Tr; names: readonly string[]; onDone: (answer: CurlAnswer | null) => void }) {
  const [remember, setRemember] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, '');
  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onDone(null);
      return;
    }
    if (e.key !== 'Tab') return;
    const items = Array.from(boxRef.current?.querySelectorAll<HTMLElement>('button, input') ?? []);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <ModalOverlay>
      <ModalPanel>
        <div
          ref={boxRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`curl-ask-title-${uid}`}
          aria-describedby={`curl-ask-body-${uid}`}
          onKeyDown={onKeyDown}
        >
          <CurlSecretsPanel
            tr={tr}
            names={names}
            remember={remember}
            onRemember={setRemember}
            onChoose={(choice) => onDone({ choice, remember })}
            primaryRef={primaryRef}
            titleId={`curl-ask-title-${uid}`}
            bodyId={`curl-ask-body-${uid}`}
          />
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}

let open: { root: Root; host: HTMLElement; done: (answer: CurlAnswer | null) => void } | null = null;

/** Abre el diálogo y espera la respuesta: `null` con Esc (o si se cierra
 *  por otra razón). Uno a la vez: si ya había uno, ese se cierra sin
 *  elegir. */
export function askCurlSecrets(tr: Tr, names: readonly string[]): Promise<CurlAnswer | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  closeCurlSecretsDialog();
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.dataset.httpClientCurlDialog = '';
    document.body.appendChild(host);
    const root = createRoot(host);
    let settled = false;
    const current = {
      root,
      host,
      done: (answer: CurlAnswer | null) => {
        if (settled) return;
        settled = true;
        if (open === current) open = null;
        // Se desmonta fuera del manejador del clic o de la tecla.
        setTimeout(() => {
          root.unmount();
          host.remove();
        }, 0);
        resolve(answer);
      },
    };
    open = current;
    root.render(<CurlSecretsDialog tr={tr} names={names} onDone={(a) => current.done(a)} />);
  });
}

/** La parada de la extensión cierra el diálogo, sin elegir. */
export function closeCurlSecretsDialog(): void {
  open?.done(null);
}
