// Bloques de código con un lenguaje dado dentro del Markdown de una nota.
// Los usa el editor para los bloques propios de las extensiones (R24 de
// specs/extensiones), igual que lib/mermaid.ts para los diagramas.

export interface FencedBlock {
  start: number;
  end: number;
  code: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** El lenguaje tiene que ser exacto (```http no toma ```https ni
 *  ```http-x, como `blockIndexAt` del editor), y la cerca puede ser de 3 o
 *  más comillas invertidas: cierra la primera línea con al menos las
 *  mismas (CommonMark). Así un cuerpo con una línea ``` cabe en una cerca
 *  de 4 (specs/cliente-http, hallazgo 2). */
export function parseFencedBlocks(markdown: string, language: string): FencedBlock[] {
  const regex = new RegExp(`^(\`{3,})${escape(language)}(?:[ \\t][^\\n]*)?\\n([\\s\\S]*?)^\\1\`*[ \\t]*$`, 'gm');
  const out: FencedBlock[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(markdown)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, code: m[2].replace(/^\n+|\n+$/g, '') });
  }
  return out;
}

/** Sin los bloques de esos lenguajes: para el resumen de la lista de
 *  notas, donde el JSON de un dibujo solo estorba. */
export function stripFencedBlocks(markdown: string, languages: readonly string[]): string {
  return languages.reduce((md, language) => {
    let out = md;
    for (const block of parseFencedBlocks(md, language).reverse()) {
      out = `${out.slice(0, block.start)}${out.slice(block.end)}`;
    }
    return out;
  }, markdown);
}

/** Si una línea del contenido empieza por comillas invertidas, la cerca
 *  lleva una más que la más larga, para que no se cierre antes. */
export function formatFence(language: string, code: string): string {
  const body = code.replace(/^\n+|\n+$/g, '');
  const longest = Math.max(0, ...[...body.matchAll(/^`+/gm)].map((m) => m[0].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${body}\n${fence}`;
}
