// Bloques de código con un lenguaje dado dentro del Markdown de una nota.
// Los usa el editor para los bloques propios de las extensiones (R24 de
// specs/extensiones), igual que lib/mermaid.ts para los diagramas.

export interface FencedBlock {
  start: number;
  end: number;
  code: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseFencedBlocks(markdown: string, language: string): FencedBlock[] {
  const regex = new RegExp(`^\`\`\`${escape(language)}[^\\n]*\\n([\\s\\S]*?)\`\`\``, 'gm');
  const out: FencedBlock[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(markdown)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, code: m[1].replace(/^\n+|\n+$/g, '') });
  }
  return out;
}

/** El contenido no puede llevar una línea que empiece por ``` (cerraría la
 *  cerca): las extensiones guardan JSON en una sola línea. */
export function formatFence(language: string, code: string): string {
  return `\`\`\`${language}\n${code.replace(/^\n+|\n+$/g, '')}\n\`\`\``;
}
