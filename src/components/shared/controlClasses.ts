// Clases de los controles que comparten las extensiones (DevTools,
// Pomodoro): el botón secundario, el de ícono, el campo y el anillo de
// foco. Salen de las que ya usa la app (specs/devtools design §3). No hay
// PRIMARY_CLS: en sepia y en los temas tintados su texto blanco no se lee
// (specs/devtools, hallazgo 9.1-2).

export const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';

export const SECONDARY_CLS = `flex items-center gap-1.5 rounded-lg border border-[var(--border-card)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

export const INPUT_CLS =
  'rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none';

export const ICON_BTN = `flex items-center gap-1.5 rounded-lg p-1.5 text-xs text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${FOCUS_RING}`;

export const PANEL_TITLE = 'text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)]';

export const CHIP = 'rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]';

/** Un enlace en línea: el acento de los enlaces de la app. En los temas
 *  tintados `text-indigo-400` se repinta a `--accent` (App.css) y en el
 *  claro se oscurece. Antes vivía en DevTools; la ayuda también lo usa. */
export const TEXT_LINK = 'text-indigo-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded';

/** Una tecla dibujada como `<kbd>`, la del recorrido y la ayuda. */
export const KBD = 'rounded-md border border-[var(--border-card)] bg-[var(--bg-surface)] px-1.5 py-0.5 font-sans text-[10px] text-[var(--text-hint)]';
