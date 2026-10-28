import type { Language } from '../types/common';
import { parseStamp } from './localDate';

/** Fecha de última edición en la vista previa de un enlace a nota
 *  ("28 oct 2026"). `updated` puede ser un instante (notas editadas en Mobile)
 *  o un `YYYY-MM-DD` legado; ambos se muestran como su día local.
 *
 *  Antes se hacía `new Date(updated + 'T00:00:00')`: con un instante eso da
 *  una fecha inválida, `Intl.DateTimeFormat.format` lanza `RangeError` y,
 *  sin un límite de errores alrededor, se caía la app entera. Aquí nunca se
 *  lanza: con un valor vacío o inválido no se muestra fecha (`null`). */
export function formatPreviewDate(updated: string | null | undefined, language: Language): string | null {
  const date = parseStamp(updated);
  if (!date) return null;
  try {
    return new Intl.DateTimeFormat(language === 'es' ? 'es-CO' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    }).format(date);
  } catch {
    return null;
  }
}
