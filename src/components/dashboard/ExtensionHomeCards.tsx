// Lo que las extensiones ponen al final de Inicio (specs/extensiones R27):
// las tarjetas de las activas que tienen una y, si no hay ninguna activa,
// un aviso de que existen.
import { useRef } from 'react';
import { Puzzle, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { useExtensions } from '../../extensions/useExtensions';
import { ExtensionSlot } from '../../extensions/ExtensionSlot';
import { getExtension } from '../../extensions/registry';
import { extensionText } from '../../extensions/text';
import type { ExtensionDefinition, ExtensionId } from '../../extensions/types';
import { ICON_BTN, SECONDARY_CLS } from '../shared/controlClasses';

/** Las activas con tarjeta, en su orden (`homeCard.order`). */
export function homeCardDefinitions(enabled: readonly ExtensionDefinition[]): ExtensionDefinition[] {
  return enabled
    .filter((def) => def.homeCard)
    .sort((a, b) => (a.homeCard?.order ?? 0) - (b.homeCard?.order ?? 0));
}

/** Las tarjetas, en una rejilla que pone una o varias por fila según el
 *  ancho. Cada una se carga y se aísla como cualquier punto de extensión
 *  (R15, R16). Una que devuelve `null` no deja hueco: no crea ningún
 *  elemento, y si ninguna pinta nada la rejilla y su título se ocultan
 *  (`:empty`). */
export function ExtensionHomeCards() {
  const language = useAppStore((s) => s.language);
  const defs = homeCardDefinitions(useExtensions().enabled);
  if (defs.length === 0) return null;
  return (
    <section aria-labelledby="home-extensions-title" className="has-[>div:empty]:hidden">
      <h2 id="home-extensions-title" className="sr-only">{t(language, 'dashboard', 'homeExtensionsHeading')}</h2>
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))] empty:hidden">
        {defs.map((def) => (
          <ExtensionSlot key={def.id} id={def.id} point="HomeCard" props={{}} variant="block" />
        ))}
      </div>
    </section>
  );
}

/** Las que nombra el aviso. Todas existen en el registro de Desktop. */
export const HINT_EXTENSIONS: readonly ExtensionId[] = ['pomodoro', 'google-calendar', 'devtools', 'quick-capture'];

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** El control enfocable que va justo antes de `el` en el documento: al
 *  ocultar el aviso, el foco vuelve ahí y no se cae al `body`. */
function previousFocusable(el: HTMLElement): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE));
  let prev: HTMLElement | null = null;
  for (const candidate of all) {
    if (el.contains(candidate)) continue;
    if (candidate.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) prev = candidate;
  }
  return prev;
}

/** Aviso "Extensiones": solo sin ninguna extensión activa y mientras no se
 *  haya descartado (se recuerda en config.json, sin sincronizar). */
export function ExtensionsHomeHint() {
  const { language, dismissed, dismiss, openCatalog } = useAppStore(
    useShallow((s) => ({
      language: s.language,
      dismissed: s.homeExtensionsHintDismissed,
      dismiss: s.dismissHomeExtensionsHint,
      openCatalog: s.openExtensionsCatalog,
    })),
  );
  const { enabled } = useExtensions();
  const ref = useRef<HTMLElement>(null);
  if (dismissed || enabled.length > 0) return null;

  const hide = () => {
    const target = ref.current ? previousFocusable(ref.current) : null;
    void dismiss();
    // Después de que el aviso salga del DOM.
    window.setTimeout(() => target?.focus(), 0);
  };

  return (
    <section
      ref={ref}
      aria-labelledby="home-extensions-hint-title"
      className="dash-enter dash-d4 rounded-2xl border border-dashed border-[var(--border)] p-4"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-lg bg-indigo-500/10 p-2 text-indigo-400">
          <Puzzle size={16} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="home-extensions-hint-title" className="text-sm font-semibold text-[var(--text-primary)]">
            {t(language, 'dashboard', 'extHintTitle')}
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-[var(--text-secondary)]">{t(language, 'dashboard', 'extHintText')}</p>
          <ul aria-label={t(language, 'dashboard', 'extHintListLabel')} className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {HINT_EXTENSIONS.map((id) => {
              const def = getExtension(id);
              if (!def) return null;
              const Icon = def.icon;
              return (
                <li key={id} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                  <Icon size={13} className="shrink-0 text-[var(--text-hint)]" aria-hidden />
                  {extensionText(language, id, 'name')}
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={openCatalog} className={`${SECONDARY_CLS} mt-3`}>
            {t(language, 'dashboard', 'extHintSee')}
          </button>
        </div>
        <button
          type="button"
          onClick={hide}
          aria-label={t(language, 'dashboard', 'extHintHide')}
          title={t(language, 'dashboard', 'extHintHide')}
          className={`${ICON_BTN} min-h-7 min-w-7 shrink-0 justify-center`}
        >
          <X size={14} aria-hidden />
        </button>
      </div>
    </section>
  );
}
