// La ayuda de DevTools (specs/ayuda-contextual AY16, AY25, design "DevTools"):
// de arriba abajo, "En esta herramienta" si la herramienta la tiene, lo
// general y los atajos. Las teclas salen de `shortcutLabel(spec)`, como en
// los títulos. La abre el botón "Ayuda" del menú lateral, fuera de la vista y
// de su contexto: la herramienta es la última abierta (`lastTool`), que la
// vista guarda en cuanto se cambia (`goTo`).
import { useMemo } from 'react';
import { useAppStore } from '../../../store/appStore';
import { HelpSection, HelpShortcuts } from '../../../components/shared/HelpPopover';
import { KeyedText } from '../../../components/tour/KeyedText';
import { DEVTOOLS_ID, readDevtoolsSettings, type ToolId } from '../model';
import { HELP_SHORTCUTS, TOOL_HELP } from './meta';
import { isMac, makeTr, shortcutLabel, type Tr } from './text';

export const GENERAL_HELP = ['help.p1', 'help.p2', 'help.p3', 'help.p4', 'help.p5'] as const;

/** La ayuda de la herramienta abierta, leída del store. */
export default function DevtoolsHelp() {
  const language = useAppStore((s) => s.language);
  const raw = useAppStore((s) => s.extensions[DEVTOOLS_ID]?.settings);
  const tool = readDevtoolsSettings(raw).lastTool;
  const tr = useMemo(() => makeTr(language), [language]);
  const mac = useMemo(isMac, []);
  return <DevtoolsHelpBody tool={tool} tr={tr} mac={mac} />;
}

export function DevtoolsHelpBody({ tool, tr, mac }: { tool: ToolId; tr: Tr; mac: boolean }) {
  const shortcut = (spec: string) => shortcutLabel(spec, mac);
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
