// Metadatos de la vista por herramienta: ícono (design §4 y Adenda A),
// quién tiene "Traer de una nota" y el mensaje de cada error.
import {
  Ampersand, ArrowLeftRight, Barcode, Binary, Braces, CalendarClock, Clock, CodeXml, Database, Diff, FileCode,
  FingerprintPattern, GitCompareArrows, Hash, KeyRound, Link, LockKeyhole, Pilcrow, QrCode, Regex,
  type LucideIcon,
} from 'lucide-react';
import type { ToolId } from '../model';
import type { ToolError } from '../tools/result';
import type { DevtoolsKey } from '../../../lib/i18n';
import type { Tr } from './text';

export const TOOL_ICON: Record<ToolId, LucideIcon> = {
  json: Braces, yaml: FileCode, xml: CodeXml, convert: ArrowLeftRight,
  base64: Binary, url: Link, html: Ampersand, jwt: KeyRound,
  uuid: FingerprintPattern, hash: Hash, password: LockKeyhole, lorem: Pilcrow, qr: QrCode, barcode: Barcode,
  timestamp: Clock, cron: CalendarClock,
  regex: Regex, diff: Diff,
  'sql-list': Database, 'list-compare': GitCompareArrows,
};

/** Las que tienen entrada de texto y aceptan un bloque de una nota (§6.2). */
export const PICKER_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>([
  'json', 'yaml', 'xml', 'convert', 'base64', 'url', 'html', 'jwt', 'hash', 'timestamp', 'cron', 'regex', 'diff',
  'qr', 'sql-list', 'list-compare',
]);

/** El mensaje de un error de `ToolResult`, con su línea y columna si las
 *  trae ("Línea 3, columna 14: …"). */
export function errorText(tr: Tr, error: ToolError, vars: Record<string, string | number> = {}): string {
  const message = tr(`error.${error.code}` as DevtoolsKey, vars);
  return error.line ? tr('errorAt', { line: error.line, col: error.column ?? 1, message }) : message;
}

/** Índice del texto que corresponde a una línea y columna (desde 1). */
export function indexAt(text: string, line: number, column: number): number {
  let index = 0;
  for (let l = 1; l < line; l++) {
    const next = text.indexOf('\n', index);
    if (next === -1) return text.length;
    index = next + 1;
  }
  return Math.min(text.length, index + column - 1);
}
