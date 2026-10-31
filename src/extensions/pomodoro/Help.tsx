// La ayuda del Pomodoro (specs/ayuda-contextual AY20): cómo funciona y sus
// atajos, con las mismas teclas que muestran los títulos de los botones.
import { HelpButton, HelpSection, HelpShortcuts, type HelpShortcutRow } from '../../components/shared/HelpButton';
import { shortcutLabel, type Tr } from './text';

/** Los atajos de la vista (View.tsx, `onKeyDown`). */
export function pomodoroHelpRows(tr: Tr, mac: boolean): HelpShortcutRow[] {
  return [
    { keys: [tr('spaceKey')], label: tr('helpKeySpace') },
    { keys: [shortcutLabel('→', mac)], label: tr('helpKeySkip') },
    { keys: [shortcutLabel('←', mac)], label: tr('helpKeyRestart') },
    { keys: [shortcutLabel('T', mac)], label: tr('helpKeyTask') },
  ];
}

export function PomodoroHelp({ tr, mac }: { tr: Tr; mac: boolean }) {
  return (
    <HelpButton screen={tr('title')} title={tr('helpTitle')}>
      <PomodoroHelpBody tr={tr} mac={mac} />
    </HelpButton>
  );
}

export function PomodoroHelpBody({ tr, mac }: { tr: Tr; mac: boolean }) {
  return (
    <>
      <HelpSection items={[tr('help1'), tr('help2'), tr('help3'), tr('help4')]} />
      <HelpShortcuts rows={pomodoroHelpRows(tr, mac)} />
    </>
  );
}
