// La ayuda de la pantalla Cliente HTTP (specs/ayuda-contextual AY25,
// specs/cliente-http HT35): la columna de peticiones, el formulario, los
// entornos y secretos, y que los bloques de las notas también se envían. La
// abre el botón "Ayuda" del menú lateral, fuera de la vista.
import { useMemo } from 'react';
import { useAppStore } from '../../../store/appStore';
import { HelpSection, HelpShortcuts, type HelpShortcutRow } from '../../../components/shared/HelpPopover';
import { KeyedText } from '../../../components/tour/KeyedText';
import type { HttpClientKey } from '../../../lib/i18n';
import { isMac, makeTr, sendShortcut, type Tr } from '../core/text';

export const HTTP_HELP_ITEMS: readonly HttpClientKey[] = ['help1', 'help2', 'help3', 'help4', 'help5', 'help6'];

/** Los atajos del formulario (RequestForm.tsx, `onKeyDown` y la URL). */
export function httpHelpRows(tr: Tr, mac: boolean): HelpShortcutRow[] {
  return [
    { keys: [sendShortcut(mac)], label: tr('helpKeySend') },
    { keys: ['Enter'], label: tr('helpKeyUrl') },
    { keys: ['Esc'], label: tr('helpKeyCancel') },
  ];
}

export default function HttpClientHelp() {
  const language = useAppStore((s) => s.language);
  const tr = useMemo(() => makeTr(language), [language]);
  const mac = useMemo(isMac, []);
  return <HttpClientHelpBody tr={tr} mac={mac} />;
}

export function HttpClientHelpBody({ tr, mac }: { tr: Tr; mac: boolean }) {
  const keys = { send: sendShortcut(mac) };
  return (
    <>
      <HelpSection items={HTTP_HELP_ITEMS.map((key) => <KeyedText key={key} text={tr(key)} keys={keys} />)} />
      <HelpShortcuts rows={httpHelpRows(tr, mac)} />
    </>
  );
}
