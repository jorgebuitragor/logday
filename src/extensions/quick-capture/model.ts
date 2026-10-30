// Lógica pura de la captura rápida (specs/captura-rapida): configuración,
// texto capturado y atajos. Sin Tauri ni store, para probarla y para que
// la ventana de captura la use sin cargar la app.
import type { CustomTheme, Theme } from '../../types/theme';

export const QUICK_CAPTURE_ID = 'quick-capture' as const;

/** C1: ⌘⇧Espacio en macOS, Ctrl+Shift+Espacio en Windows y Linux. */
export const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+Space';

/** Proyecto de las tareas sin proyecto (el mismo que usa la app). */
export const INBOX_PROJECT = 'inbox';

export type CaptureKind = 'task' | 'note';

export interface QuickCaptureSettings {
  shortcut: string;
  kind: CaptureKind;
  /** Proyecto por defecto de las tareas. */
  project: string;
  /** Carpeta por defecto de las notas; '' es la raíz. */
  folder: string;
}

export function readCaptureSettings(raw?: Record<string, unknown>): QuickCaptureSettings {
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  return {
    shortcut: str(raw?.shortcut) || DEFAULT_SHORTCUT,
    kind: raw?.kind === 'note' ? 'note' : 'task',
    project: str(raw?.project) || INBOX_PROJECT,
    folder: str(raw?.folder) ?? '',
  };
}

/** C9, C14: la primera línea es el título y el resto, el contenido.
 *  `null` si no hay título. */
export function splitCapture(text: string): { title: string; content: string } | null {
  const lines = text.replace(/\r\n?/g, '\n').replace(/^\s*\n/, '').split('\n');
  const title = lines[0].trim();
  if (!title) return null;
  return { title, content: lines.slice(1).join('\n').trim() };
}

// ── Mensajes entre la ventana de captura y la principal ──────────────

export const EVT_SHOWN = 'quick-capture:shown';
export const EVT_REQUEST = 'quick-capture:request';
export const EVT_REPLY = 'quick-capture:reply';

/** C17: lo que espera la captura a la ventana principal. */
export const REPLY_TIMEOUT_MS = 5000;

export type CaptureRequest =
  | { id: string; type: 'context' }
  | { id: string; type: 'save'; kind: CaptureKind; title: string; content: string; target: string; open: boolean };

export interface CaptureContext {
  /** C18: hay carpeta de datos. */
  configured: boolean;
  language: 'es' | 'en';
  theme: Theme;
  customThemes: CustomTheme[];
  projects: string[];
  folders: string[];
  defaults: QuickCaptureSettings;
}

export type CaptureReply =
  | { id: string; ok: true; context?: CaptureContext; where?: string }
  | { id: string; ok: false; error: string };

// ── Atajos ───────────────────────────────────────────────────────────

const MODIFIER_CODES = /^(Meta|Control|Alt|Shift|OS)(Left|Right)?$/;

interface KeyLike {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** C2: un `keydown` en el formato del plugin (`Command+Shift+Space`).
 *  `null` mientras falte la tecla o un modificador. Se guarda la tecla
 *  física (`code`), para que no dependa de la distribución del teclado. */
export function shortcutFromKeyEvent(e: KeyLike, mac: boolean): string | null {
  if (!e.code || MODIFIER_CODES.test(e.code)) return null;
  const mods: string[] = [];
  if (mac) {
    if (e.metaKey) mods.push('Command');
    if (e.ctrlKey) mods.push('Control');
  } else {
    if (e.ctrlKey) mods.push('Control');
    if (e.metaKey) mods.push('Super');
  }
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (!mods.length) return null;
  return [...mods, e.code].join('+');
}

const MAC_SYMBOLS: Record<string, string> = {
  commandorcontrol: '⌘', command: '⌘', cmd: '⌘', super: '⌘',
  control: '⌃', ctrl: '⌃', alt: '⌥', option: '⌥', shift: '⇧',
};
const OTHER_NAMES: Record<string, string> = {
  commandorcontrol: 'Ctrl', control: 'Ctrl', ctrl: 'Ctrl', command: 'Super', cmd: 'Super', super: 'Super',
  alt: 'Alt', option: 'Alt', shift: 'Shift',
};
const ARROWS: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };

function keyLabel(key: string, spaceLabel: string): string {
  if (key === 'Space') return spaceLabel;
  if (ARROWS[key]) return ARROWS[key];
  const m = /^(?:Key|Digit|Numpad)(.)$/.exec(key);
  return m ? m[1] : key;
}

/** El atajo como lo ve el usuario: `⌘⇧Espacio` o `Ctrl+Shift+Espacio`. */
export function prettyShortcut(shortcut: string, mac: boolean, spaceLabel: string): string {
  const parts = shortcut.split('+').filter(Boolean);
  const key = keyLabel(parts.pop() ?? '', spaceLabel);
  const names = mac ? MAC_SYMBOLS : OTHER_NAMES;
  const mods = parts.map((p) => names[p.toLowerCase()] ?? p);
  return mac ? mods.join('') + key : [...mods, key].join('+');
}

export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
}
