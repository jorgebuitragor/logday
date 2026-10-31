// La ayuda de DevTools (specs/ayuda-contextual AY16, design "DevTools"): de
// arriba abajo, "En esta herramienta" si la herramienta la tiene, lo general
// y los atajos. Las teclas salen de `shortcut(spec)`, como en los títulos.
import { t } from '../../../lib/i18n';
import { HelpButton, HelpSection, HelpShortcuts } from '../../../components/shared/HelpButton';
import { KeyedText } from '../../../components/tour/KeyedText';
import { useDevtools } from './context';
import { HELP_SHORTCUTS, TOOL_HELP } from './meta';

export const GENERAL_HELP = ['help.p1', 'help.p2', 'help.p3', 'help.p4', 'help.p5'] as const;

export function DevtoolsHelp() {
  const { tr, language } = useDevtools();
  return (
    <HelpButton screen={t(language, 'extensions', 'devtools.name')} title={tr('help.title')}>
      <DevtoolsHelpBody />
    </HelpButton>
  );
}

export function DevtoolsHelpBody() {
  const { tool, tr, shortcut } = useDevtools();
  const keys = { search: shortcut('mod+shift+F'), run: shortcut('mod+enter') };
  const inTool = TOOL_HELP[tool];
  return (
    <>
      {inTool && <HelpSection title={tr('help.inTool')} items={inTool.map((key) => tr(key))} />}
      <HelpSection items={GENERAL_HELP.map((key) => <KeyedText key={key} text={tr(key)} keys={keys} />)} />
      <HelpShortcuts
        rows={HELP_SHORTCUTS.map((row) => ({ keys: row.keys.map(shortcut), label: tr(row.label), sep: row.sep }))}
      />
    </>
  );
}
