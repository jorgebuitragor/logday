// Insignias "Claude Code" y "Codex" de una skill (SK2: una skill en las dos
// herramientas lleva las dos).
import type { Tool } from './api';
import type { Tr } from './text';

export function ToolBadges({ tools, tr, compact = false }: { tools: Tool[]; tr: Tr; compact?: boolean }) {
  return (
    <span className="inline-flex shrink-0 gap-1">
      {tools.map((tool) => (
        <span
          key={tool}
          title={tr(`tool.${tool}`)}
          className="rounded border border-[var(--border-card)] px-1 py-px text-[10px] leading-none text-[var(--text-secondary)]"
        >
          {compact ? tr(`toolShort.${tool}`) : tr(`tool.${tool}`)}
        </span>
      ))}
    </span>
  );
}
