// Insignias "Claude Code" y "Codex" de una skill (SK2: una skill en las dos
// herramientas lleva las dos).
import type { Tool } from './api';
import type { Tr } from './text';

// Un color por herramienta para distinguirlas de un vistazo. El texto mezcla
// el tono 500 con el color de texto del tema: se aclara en los temas oscuros y
// se oscurece en el claro, así se lee en todos sin una regla por tema.
const TOOL_COLOR: Record<Tool, string> = {
  claude: 'border-orange-500/40 bg-orange-500/10 text-[color-mix(in_oklab,var(--color-orange-500)_65%,var(--text-primary))]',
  codex: 'border-blue-500/40 bg-blue-500/10 text-[color-mix(in_oklab,var(--color-blue-500)_65%,var(--text-primary))]',
};

export function ToolBadges({ tools, tr, compact = false }: { tools: Tool[]; tr: Tr; compact?: boolean }) {
  return (
    <span className="inline-flex shrink-0 gap-1">
      {tools.map((tool) => (
        <span
          key={tool}
          title={tr(`tool.${tool}`)}
          className={`rounded border px-1 py-px text-[10px] font-medium leading-none ${TOOL_COLOR[tool]}`}
        >
          {compact ? tr(`toolShort.${tool}`) : tr(`tool.${tool}`)}
        </span>
      ))}
    </span>
  );
}
