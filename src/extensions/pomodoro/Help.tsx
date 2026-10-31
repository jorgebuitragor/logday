// La ayuda del Pomodoro (specs/ayuda-contextual AY20, AY25): cómo funciona y
// sus atajos, con las mismas teclas que muestran los títulos de los botones.
// La abre el botón "Ayuda" del menú lateral.
import { useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import { HelpSection, HelpShortcuts, type HelpShortcutRow } from '../../components/shared/HelpPopover';
import { isMac, makeTr, shortcutLabel, type Tr } from './text';

/** Los atajos de la vista (View.tsx, `onKeyDown`). */
export function pomodoroHelpRows(tr: Tr, mac: boolean): HelpShortcutRow[] {
  return [
    { keys: [tr('spaceKey')], label: tr('helpKeySpace') },
    { keys: [shortcutLabel('→', mac)], label: tr('helpKeySkip') },
    { keys: [shortcutLabel('←', mac)], label: tr('helpKeyRestart') },
    { keys: [shortcutLabel('T', mac)], label: tr('helpKeyTask') },
  ];
}

export default function PomodoroHelp() {
  const language = useAppStore((s) => s.language);
  const tr = useMemo(() => makeTr(language), [language]);
  const mac = useMemo(isMac, []);
  return <PomodoroHelpBody tr={tr} mac={mac} />;
}

export function PomodoroHelpBody({ tr, mac }: { tr: Tr; mac: boolean }) {
  return (
    <>
      <HelpSection items={[tr('help1'), tr('help2'), tr('help3'), tr('help4')]} />
      <HelpShortcuts rows={pomodoroHelpRows(tr, mac)} />
    </>
  );
}
