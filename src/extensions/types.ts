import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Mismo id en Desktop, Web y Mobile (specs/extensiones/design.md). */
export type ExtensionId = 'team-chat' | 'mcp' | 'google-calendar' | 'outgoing-webhook' | 'granola' | 'excalidraw';

export type ExtensionCategory = 'integration' | 'tool';
export type LogdayApp = 'desktop' | 'web' | 'mobile';

/** Preferencias locales de una extensión, en `AppConfig.extensions`.
 *  No se sincronizan (R9) y nunca llevan secretos (R10). */
export interface ExtensionPrefs {
  enabled: boolean;
  /** Instante ISO en que el usuario aceptó el aviso de R6. */
  consentAt?: string;
  /** Configuración no secreta, propia de cada extensión. */
  settings?: Record<string, unknown>;
}

export type ExtensionsConfig = Partial<Record<ExtensionId, ExtensionPrefs>>;

/** Props de los botones que una extensión pone junto a Copiar en el daily. */
export interface DailyActionProps {
  /** Fecha del daily abierto (YYYY-MM-DD). */
  date: string;
  /** Guarda lo pendiente del editor y devuelve el mismo texto que Copiar. */
  getText: () => Promise<string>;
}

/** Props del bloque propio de una extensión dentro de una nota (R24). */
export interface NoteBlockProps {
  /** El contenido del bloque (lo que va dentro de la cerca de código). */
  code: string;
  onEdit: () => void;
}

/** Props del editor de ese bloque, que se abre al crearlo o editarlo. */
export interface NoteBlockEditorProps {
  code: string;
  onSave: (code: string) => void;
  onClose: () => void;
}

/** Lo que aporta una extensión a cada punto de extensión. No es una API
 *  pública: se cambia cuando haga falta, porque todas viven en este repo. */
export interface ExtensionModule {
  /** Panel bajo su tarjeta en Opciones → Extensiones. */
  Settings?: ComponentType;
  /** Vista de su sección en el menú lateral (R11). */
  View?: ComponentType;
  /** Botones junto a Copiar en el daily (R12). */
  dailyActions?: ComponentType<DailyActionProps>;
  /** Bloque propio en las notas y su editor (R24). */
  NoteBlock?: ComponentType<NoteBlockProps>;
  NoteBlockEditor?: ComponentType<NoteBlockEditorProps>;
  /** Procesos propios; devuelve cómo pararlos (R7). */
  start?: () => () => void;
}

export type ExtensionPoint = 'Settings' | 'View' | 'dailyActions' | 'NoteBlock' | 'NoteBlockEditor';

/** Metadatos del registro: se dibujan sin cargar el código (R16). */
export interface ExtensionDefinition {
  id: ExtensionId;
  category: ExtensionCategory;
  icon: LucideIcon;
  /** Solo informativo (R2). */
  apps: LogdayApp[];
  /** Si envía datos fuera, al activarla se pide el aviso de R6. */
  sendsDataExternally?: { to: string };
  /** Si tiene vista propia, aparece como sección del menú (R11). */
  view?: boolean;
  /** Si tiene panel `Settings`: mientras esté activa, tiene su propia
   *  entrada en la barra lateral de Opciones (R21). Es metadato para no
   *  cargar el módulo solo para saberlo (R16). */
  settings?: boolean;
  /** R24: el lenguaje de su bloque en las notas (```<language>). Es
   *  metadato para que el editor sepa qué bloques son de la extensión sin
   *  cargar su código. */
  noteBlock?: { language: string };
  /** Claves de sus secretos en el llavero (`ext:<id>:<clave>`). El
   *  llavero no se puede listar, así que "Quitar configuración" (R8)
   *  borra estas. */
  secretKeys?: string[];
  load: () => Promise<ExtensionModule>;
}

/** Sección del menú lateral de una extensión con vista. */
export type ExtensionSection = `ext:${ExtensionId}`;
