// La ayuda de DevTools (specs/ayuda-contextual AY16, AY25, design "DevTools"):
// de arriba abajo, "En esta herramienta" si la herramienta la tiene, lo
// general y los atajos. Las teclas salen de `shortcutLabel(spec)`, como en
// los títulos. La abre el botón "Ayuda" del menú lateral, fuera de la vista y
// de su contexto: la herramienta es la última abierta (`lastTool`), que la
// vista guarda en cuanto se cambia (`goTo`). Cliente HTTP solo cuenta con
// su extensión activa (specs/cliente-http HT27): si era la última y ya no
// está, la ayuda es la de la herramienta por defecto, como la vista.
import { useMemo } from 'react';
import { useAppStore } from '../../../store/appStore';
import { HelpSection, HelpShortcuts } from '../../../components/shared/HelpPopover';
import { KeyedText } from '../../../components/tour/KeyedText';
import { DEFAULT_TOOL, DEVTOOLS_ID, availableToolsIn, readDevtoolsSettings, type ToolId } from '../model';
import { HELP_SHORTCUTS, TOOL_HELP } from './meta';
import { isMac, makeTr, shortcutLabel, type Tr } from './text';

export const GENERAL_HELP = ['help.p1', 'help.p2', 'help.p3', 'help.p4', 'help.p5', 'help.p6'] as const;

/** La ayuda de la herramienta abierta, leída del store. */
export default function DevtoolsHelp() {
  const language = useAppStore((s) => s.language);
  const raw = useAppStore((s) => s.extensions[DEVTOOLS_ID]?.settings);
  const config = useAppStore((s) => s.extensions);
  const available = useMemo(() => availableToolsIn(config), [config]);
  const lastTool = readDevtoolsSettings(raw).lastTool;
  const tool = available.includes(lastTool) ? lastTool : DEFAULT_TOOL;
  const tr = useMemo(() => makeTr(language), [language]);
  const mac = useMemo(isMac, []);
  return <DevtoolsHelpBody tool={tool} tr={tr} mac={mac} httpAvailable={available.includes('http')} />;
}

export function DevtoolsHelpBody({
  tool, tr, mac, httpAvailable = false,
}: { tool: ToolId; tr: Tr; mac: boolean; httpAvailable?: boolean }) {
  const shortcut = (spec: string) => shortcutLabel(spec, mac);
  const keys = { search: shortcut('mod+shift+F'), run: shortcut('mod+enter') };
  const inTool = tool === 'http' && !httpAvailable ? undefined : TOOL_HELP[tool];
  return (
    <>
      {inTool && <HelpSection title={tr('help.inTool')} items={inTool.map((key) => tr(key))} />}
      <HelpSection items={GENERAL_HELP.map((key) => <KeyedText key={key} text={tr(key)} keys={keys} />)} />
      <HelpShortcuts
        rows={HELP_SHORTCUTS.map((row) => ({
          keys: row.keys.map(shortcut),
          label: tr(httpAvailable && row.withHttp ? row.withHttp : row.label),
          sep: row.sep,
        }))}
      />
    </>
  );
}
