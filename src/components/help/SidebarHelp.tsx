// El botón "Ayuda" del menú lateral (specs/ayuda-contextual AY24–AY29): uno
// solo para toda la app, que abre la ayuda de la sección activa. Va en la
// Lista con nombres como una fila encima de "Opciones", y en la Barra de
// íconos y el menú colapsado como un ícono encima de Buscar. ⌘/ hace lo
// mismo que pulsarlo (App.tsx, `requestHelpToggle`).
import { useEffect, useEffectEvent } from 'react';
import { CircleHelp } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { t } from '../../lib/i18n';
import { FOCUS_RING } from '../shared/controlClasses';
import { useHelpPopover } from '../shared/HelpPopover';
import { IS_MAC } from '../sidebar/sections';
import { NavTooltip, useNavTooltip } from '../sidebar/SectionMenus';
import { helpShortcutLabel } from './helpKeys';
import { useSectionHelp } from './ScreenHelp';

export const HELP_TOGGLE_EVENT = 'logday:toggle-help';
const HELP_TOOLTIP_ID = 'help-nav-tooltip';
// Abierta, el fondo del hover y sin acento (design, Estados).
const OPEN_CLS = 'aria-expanded:bg-[var(--bg-hover)] aria-expanded:text-[var(--text-primary)]';

/** Abre o cierra la ayuda, como si se pulsara el botón del menú. */
export function requestHelpToggle(target: EventTarget = window): void {
  target.dispatchEvent(new Event(HELP_TOGGLE_EVENT));
}

interface SidebarHelpProps {
  /** `row`: la fila de la Lista con nombres; `column`: el ícono de la
   *  columna (Barra de íconos y colapsado). */
  variant: 'row' | 'column';
  /** Las clases de sus vecinos ("Opciones" o Buscar), para verse igual. */
  className: string;
}

/** Sin dibujar si el usuario lo apagó en Opciones → Preferencias (AY23):
 *  sin botón tampoco hay ⌘/. Se vuelve a montar al cambiar de sección, así
 *  que la ayuda abierta se cierra (AY6). */
export function SidebarHelpButton(props: SidebarHelpProps) {
  const enabled = useAppStore((s) => s.helpButtonsEnabled);
  const activeSection = useAppStore((s) => s.activeSection);
  return enabled ? <SidebarHelpInner key={activeSection} {...props} /> : null;
}

function SidebarHelpInner({ variant, className }: SidebarHelpProps) {
  const language = useAppStore((s) => s.language);
  const help = useHelpPopover(useSectionHelp());
  const isColumn = variant === 'column';
  const tooltip = useNavTooltip(isColumn && !help.open, HELP_TOOLTIP_ID);
  const keys = helpShortcutLabel(IS_MAC);

  const onToggle = useEffectEvent(() => {
    tooltip.hide();
    help.toggle(true);
  });
  useEffect(() => {
    const handler = () => onToggle();
    window.addEventListener(HELP_TOGGLE_EVENT, handler);
    return () => window.removeEventListener(HELP_TOGGLE_EVENT, handler);
  }, []);

  const common = {
    ...help.triggerProps,
    'aria-keyshortcuts': IS_MAC ? 'Meta+/' : 'Control+/',
  };

  if (isColumn) {
    // El tooltip propio de la columna (NS16): el nombre y el atajo.
    const tip = tooltip.bind({ id: 'help', label: help.label, shortcut: '/' });
    return (
      <>
        <button {...common} {...tip} className={`${className} ${OPEN_CLS}`}>
          <CircleHelp size={18} aria-hidden />
        </button>
        <NavTooltip tip={help.open ? null : tooltip.tip} id={HELP_TOOLTIP_ID} />
        {help.popover}
      </>
    );
  }
  return (
    <>
      <button {...common} className={`group ${className} ${OPEN_CLS} ${FOCUS_RING}`}>
        <CircleHelp size={14} aria-hidden className="shrink-0" />
        <span>{t(language, 'help', 'menuLabel')}</span>
        {/* El atajo, como en las secciones: al pasar el puntero o con el foco. */}
        <span aria-hidden className="ml-auto pl-2 text-[10px] text-[var(--text-hint)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {keys}
        </span>
      </button>
      {help.popover}
    </>
  );
}
