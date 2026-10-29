import { t } from '../lib/i18n';
import type { Language } from '../types/common';
import type { ExtensionId } from './types';

export type ExtensionTextField = 'name' | 'description' | 'consent';

/** Textos de una extensión: `extensions.<id>.<campo>` en `i18n.ts` (R20).
 *  Si a un id del registro le falta una clave en español, no compila; la
 *  prueba del registro comprueba también el inglés. */
export function extensionText(language: Language, id: ExtensionId, field: ExtensionTextField): string {
  return t(language, 'extensions', `${id}.${field}`);
}
