// "Guardar en la nota" (specs/cliente-http HT50, design §14.3): el texto de
// una petición de la pantalla vuelve a su sección del bloque ```http de la
// nota. Puro: recibe el Markdown de la nota, leído de disco en el momento,
// y devuelve el nuevo. Toca solo las líneas de esa sección; la línea `###`
// de la nota, el resto del bloque y el resto de la nota quedan igual.
import { parseFencedBlocks } from '../../../lib/fencedBlocks';
import { MAX_REQUESTS, parseHttpBlock } from './parse';

export interface SaveTarget {
  blockIndex: number;
  requestIndex: number;
  /** El `source` de la sección al cargarla: si no coincide, la nota cambió. */
  loadedSource: string;
  /** El nombre de la sección, para "Guardar como petición nueva". */
  name: string | null;
}

/** `replace`: solo si la sección no cambió. `force`: "Reemplazar en la
 *  nota", aunque cambió. `append`: "Guardar como petición nueva", otra
 *  sección `###` al final del mismo bloque. */
export type SaveMode = 'replace' | 'force' | 'append';

export type SaveOutcome =
  | { ok: true; content: string; requestIndex: number; source: string }
  /** `conflict`: la sección cambió; `missing_block`: ya no está ese bloque;
   *  `full`: el bloque ya tiene 20 peticiones (HT6). */
  | { ok: false; reason: 'conflict' | 'missing_block' | 'full' };

const trimBlankEnd = (lines: string[]) => {
  const out = [...lines];
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out;
};

/** El texto de una petición de la pantalla, sin la línea `###`. */
export function draftLines(code: string): string[] {
  return trimBlankEnd(code.replace(/\r\n?/g, '\n').split('\n'));
}

/** Dónde está el código del bloque dentro del Markdown: entre la línea de
 *  la cerca de apertura y la de cierre, con sus saltos de línea. */
function blockSpan(markdown: string, blockIndex: number) {
  const block = parseFencedBlocks(markdown, 'http')[blockIndex];
  if (!block) return null;
  const inner = markdown.slice(block.start, block.end);
  const open = inner.indexOf('\n');
  const close = inner.lastIndexOf('\n');
  const start = block.start + open + 1;
  const end = block.start + close + 1;
  const raw = markdown.slice(start, end);
  const lead = raw.length - raw.replace(/^\n+/, '').length;
  const trail = raw.length - raw.replace(/\n+$/, '').length;
  return {
    block, start, end, openLine: inner.slice(0, open), closeLine: inner.slice(close + 1),
    lead: raw.slice(0, lead), trail: raw.slice(raw.length - trail),
  };
}

/** Escribe el código nuevo del bloque. Si una línea del código empieza por
 *  tantas comillas invertidas como la cerca, la cerca se alarga para que
 *  no se cierre antes (como `formatFence`). */
function withBlockCode(markdown: string, span: NonNullable<ReturnType<typeof blockSpan>>, code: string): string {
  const fence = /^`+/.exec(span.openLine)?.[0] ?? '```';
  const longest = Math.max(0, ...[...code.matchAll(/^`+/gm)].map((m) => m[0].length));
  let openLine = span.openLine;
  let closeLine = span.closeLine;
  if (longest >= fence.length) {
    const longer = '`'.repeat(longest + 1);
    openLine = longer + span.openLine.slice(fence.length);
    closeLine = longer + span.closeLine.replace(/^`+/, '');
  }
  const before = markdown.slice(0, span.block.start);
  const after = markdown.slice(span.block.end);
  // El cierre va siempre en su propia línea.
  return `${before}${openLine}\n${span.lead}${code}${span.trail || '\n'}${closeLine}${after}`;
}

export function saveRequestInNote(markdown: string, target: SaveTarget, draftCode: string, mode: SaveMode): SaveOutcome {
  const span = blockSpan(markdown, target.blockIndex);
  if (!span) return { ok: false, reason: 'missing_block' };
  const blockCode = span.block.code.replace(/\r\n?/g, '\n');
  const lines = blockCode.split('\n');
  const parsed = parseHttpBlock(blockCode);
  const draft = draftLines(draftCode);

  if (mode === 'append' || (mode === 'force' && !parsed.requests[target.requestIndex])) {
    if (parsed.requests.length >= MAX_REQUESTS) return { ok: false, reason: 'full' };
    const heading = target.name ? `### ${target.name} (2)` : '###';
    const code = `${trimBlankEnd(lines).join('\n')}\n\n${heading}\n${draft.join('\n')}`;
    const after = parseHttpBlock(code).requests;
    const index = after.length - 1;
    return { ok: true, content: withBlockCode(markdown, span, code), requestIndex: index, source: after[index]?.source ?? '' };
  }

  const req = parsed.requests[target.requestIndex];
  if (!req || (mode === 'replace' && req.source !== target.loadedSource)) return { ok: false, reason: 'conflict' };
  // La línea ### de la nota se conserva; lo demás de la sección es el borrador.
  const first = req.startLine - 1;
  const heading = /^###/.test(lines[first] ?? '') ? [lines[first]] : [];
  lines.splice(first, req.endLine - first, ...heading, ...draft);
  const code = lines.join('\n');
  const now = parseHttpBlock(code).requests[target.requestIndex];
  return { ok: true, content: withBlockCode(markdown, span, code), requestIndex: target.requestIndex, source: now?.source ?? '' };
}

/** La petición `index` del bloque como borrador de la pantalla: su texto
 *  sin la línea `###`, y su `source` para saber después si cambió. */
export function draftFromBlock(code: string, index: number): { code: string; source: string } | null {
  const text = code.replace(/\r\n?/g, '\n');
  const req = parseHttpBlock(text).requests[index];
  if (!req) return null;
  const lines = text.split('\n');
  let first = req.startLine - 1;
  if (/^###/.test(lines[first] ?? '')) first += 1;
  return { code: lines.slice(first, req.endLine).join('\n'), source: req.source };
}
