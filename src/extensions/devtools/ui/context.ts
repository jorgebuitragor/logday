// Lo que la vista de DevTools comparte con cada herramienta: textos,
// opciones recordadas, portapapeles, notas, atajos y foco. Las
// herramientas se cargan aparte (lazy) y solo hablan con la vista por aquí.
import { createContext, useContext, type MutableRefObject } from 'react';
import type { Note } from '../../../types/note';
import type { Language } from '../../../lib/i18n';
import type { DevtoolsSettings, DevtoolsSettingsPatch, OptionValue, ToolId } from '../model';
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
export type { OptionValue };

export interface DevtoolsContextValue {
  tool: ToolId;
  language: Language;
  tr: Tr;
  mac: boolean;
  settings: DevtoolsSettings;
  setOptions: (tool: ToolId, patch: Record<string, OptionValue>) => void;
  /** Guarda un parche armado con lo guardado en ese momento (no con lo de
   *  este render): dos clics seguidos no se pisan (design §G.2). */
  updateSettings: (make: (current: DevtoolsSettings) => DevtoolsSettingsPatch) => void;
  /** Abre Opciones → DevTools (D17); antes cierra el selector. */
  openSettings: () => void;
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
