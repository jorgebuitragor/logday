// Metadatos de la vista por herramienta: ícono (design §4 y Adenda A),
// quién tiene "Traer de una nota" y el mensaje de cada error.
import {
  Ampersand, AppWindow, ArrowLeftRight, Barcode, Binary, Braces, CalendarClock, Clock, CodeXml, Database, Diff, FileCode,
  FingerprintPattern, GitCompareArrows, Hash, KeyRound, Link, LockKeyhole, Pilcrow, QrCode, Regex,
  type LucideIcon,
} from 'lucide-react';
import type { ToolId } from '../model';
import type { ToolError } from '../tools/result';
import type { DevtoolsKey } from '../../../lib/i18n';
import type { Tr } from './text';

export const TOOL_ICON: Record<ToolId, LucideIcon> = {
  json: Braces, yaml: FileCode, xml: CodeXml, convert: ArrowLeftRight, 'html-preview': AppWindow,
  base64: Binary, url: Link, html: Ampersand, jwt: KeyRound,
  uuid: FingerprintPattern, hash: Hash, password: LockKeyhole, lorem: Pilcrow, qr: QrCode, barcode: Barcode,
  timestamp: Clock, cron: CalendarClock,
  regex: Regex, diff: Diff,
  'sql-list': Database, 'list-compare': GitCompareArrows,
};

/** Las que tienen entrada de texto y aceptan un bloque de una nota (§6.2). */
export const PICKER_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>([
  'json', 'yaml', 'xml', 'convert', 'html-preview', 'base64', 'url', 'html', 'jwt', 'hash', 'timestamp', 'cron', 'regex', 'diff',
  'qr', 'sql-list', 'list-compare',
]);

/** "En esta herramienta" de la ayuda (specs/ayuda-contextual AY16): solo
 *  las que tienen algo que la descripción bajo el título no dice. */
export const TOOL_HELP: Partial<Record<ToolId, DevtoolsKey[]>> = {
  regex: ['regex.help1', 'regex.help2', 'regex.help3'],
  cron: ['cron.help1', 'cron.help2', 'cron.help3'],
  'sql-list': ['sql-list.help1', 'sql-list.help2', 'sql-list.help3'],
  'list-compare': ['list-compare.help1', 'list-compare.help2', 'list-compare.help3'],
  diff: ['diff.help1', 'diff.help2', 'diff.help3'],
  qr: ['qr.help1', 'qr.help2', 'qr.help3'],
  barcode: ['barcode.help1', 'barcode.help2'],
  jwt: ['jwt.help1', 'jwt.help2'],
  'html-preview': ['html-preview.help1', 'html-preview.help2', 'html-preview.help3'],
};

/** Los atajos de la vista (View.tsx), en el orden de la ayuda. `sep` une
 *  las teclas: "/" para una u otra, "…" para un rango. */
export const HELP_SHORTCUTS: readonly { keys: string[]; label: DevtoolsKey; sep?: string }[] = [
  { keys: ['mod+shift+F'], label: 'help.k.search' },
  { keys: ['alt+mod+down', 'alt+mod+up'], label: 'help.k.move', sep: '/' },
  { keys: ['mod+enter'], label: 'help.k.run' },
  { keys: ['mod+shift+C'], label: 'help.k.copy' },
  { keys: ['mod+shift+S'], label: 'help.k.save' },
  { keys: ['mod+shift+O'], label: 'help.k.open' },
  { keys: ['mod+shift+X'], label: 'help.k.swap' },
  { keys: ['mod+shift+backspace'], label: 'help.k.clear' },
  { keys: ['alt+mod+1', 'alt+mod+4'], label: 'help.k.tabs', sep: '…' },
];

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
