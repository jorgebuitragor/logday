// Piezas que comparten la vista y el contador del menú: el ícono y el color
// de cada fase (design §5) y el botón principal.
import { Coffee, Sofa, Target, type LucideIcon } from 'lucide-react';
import { FOCUS_RING } from '../../components/shared/controlClasses';
import type { Phase } from './model';

export const PHASE_ICON: Record<Phase, LucideIcon> = { work: Target, short: Coffee, long: Sofa };

/** El color de la fase: solo para gráficos (anillo, barra, puntos e
 *  íconos), nunca para texto (design §5). */
export const phaseColor = (phase: Phase) => `var(--phase-${phase})`;

/** No es PRIMARY_CLS: en sepia y en los temas claros personalizados su
 *  texto blanco no se lee. El texto va en `--text-primary` (design §2.6). */
export const MAIN_BTN = `flex items-center gap-2 rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-5 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-indigo-500/15 ${FOCUS_RING}`;

/** El atajo para la vista: el contador del menú lo pide al abrirla con el
 *  teclado, y la vista mueve el foco a su título (design §7). */
let focusOnOpen = false;
export const requestViewFocus = () => {
  focusOnOpen = true;
};
export const takeViewFocus = () => {
  const v = focusOnOpen;
  focusOnOpen = false;
  return v;
};
