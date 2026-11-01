// Clases de DevTools. Salen de las que ya usa la app (design §3): el botón
// secundario de las extensiones, los campos de Opciones y el textarea del
// editor de tareas, en mono. No se usa PRIMARY_CLS: en sepia y en los
// temas tintados su texto blanco no se lee (design §8, hallazgo 9.1-2).

export { FOCUS_RING, SECONDARY_CLS, INPUT_CLS, ICON_BTN, PANEL_TITLE, CHIP, TEXT_LINK } from '../../../components/shared/controlClasses';

const FIELD_BASE =
  'w-full rounded-lg border bg-[var(--bg-input)] px-3 py-2 font-mono text-xs leading-relaxed text-[var(--text-body)] placeholder:text-[var(--text-hint)] select-text focus:outline-none focus:ring-2 focus:ring-indigo-500/40';

export const textareaCls = (invalid = false, height = 'min-h-[12rem] h-[40vh]') =>
  `${height} resize-y ${FIELD_BASE} ${invalid ? 'border-red-500/60' : 'border-[var(--border)]'}`;

export const lineInputCls = (invalid = false) =>
  `min-w-0 flex-1 rounded-lg border bg-[var(--bg-input)] px-3 py-1.5 font-mono text-sm text-[var(--text-body)] placeholder:text-[var(--text-hint)] select-text focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
    invalid ? 'border-red-500/60' : 'border-[var(--border)]'
  }`;

export const PRE_CLS =
  'min-h-[12rem] max-h-[60vh] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 font-mono text-xs leading-relaxed text-[var(--text-body)] select-text';

/** Los campos de texto no corrigen nada: WebKit cambia comillas y guiones
 *  y rompería un JSON o un token (design §3). */
export const NO_AUTOCORRECT = {
  spellCheck: false,
  autoCorrect: 'off',
  autoCapitalize: 'off',
  autoComplete: 'off',
} as const;
