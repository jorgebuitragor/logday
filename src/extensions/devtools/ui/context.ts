// Lo que la vista de DevTools comparte con cada herramienta: textos,
// opciones recordadas, portapapeles, notas, atajos y foco. Las
// herramientas se cargan aparte (lazy) y solo hablan con la vista por aquí.
import { createContext, useContext, type MutableRefObject } from 'react';
import type { Note } from '../../../types/note';
import type { Language } from '../../../lib/i18n';
import type { DevtoolsSettings, ToolId } from '../model';
import type { Tr } from './text';

/** Lo que cada herramienta ofrece a los atajos de la vista (design §7). */
export interface ToolActions {
  copy?: () => void;
  save?: () => void;
  swap?: () => void;
  clear?: () => void;
  /** ⌘↵: Generar, Procesar o Reintentar. */
  primary?: () => void;
  /** ⌥⌘1…4 en Comparar listas. */
  tab?: (index: number) => void;
}

export type FocusTarget = 'input' | 'title';
export type OptionValue = string | number | boolean;

export interface DevtoolsContextValue {
  tool: ToolId;
  language: Language;
  tr: Tr;
  mac: boolean;
  settings: DevtoolsSettings;
  setOptions: (tool: ToolId, patch: Record<string, OptionValue>) => void;
  /** Escribe en la región `aria-live` de la vista. */
  announce: (message: string) => void;
  copyText: (text: string) => Promise<boolean>;
  saveNote: (tool: ToolId, language: string, output: string) => Promise<Note | null>;
  openNote: (note: Note) => void;
  openPicker: () => void;
  actionsRef: MutableRefObject<ToolActions>;
  /** Título de la nota de la que se trajo la entrada, hasta que se edite. */
  loadedFrom: string | null;
  clearLoaded: () => void;
  /** `true` una sola vez si, al abrir la herramienta, el foco va a `target`. */
  takeFocus: (target: FocusTarget) => boolean;
  goTo: (tool: ToolId, focus?: FocusTarget) => void;
  /** "⌘⇧C" en macOS, "Ctrl+Shift+C" en Windows y Linux. */
  shortcut: (spec: string) => string;
  switcherOpen: boolean;
  setSwitcherOpen: (open: boolean) => void;
}

export const DevtoolsContext = createContext<DevtoolsContextValue | null>(null);

export function useDevtools(): DevtoolsContextValue {
  const ctx = useContext(DevtoolsContext);
  if (!ctx) throw new Error('useDevtools fuera de DevtoolsView');
  return ctx;
}
