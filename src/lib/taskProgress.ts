// Progreso opcional de una tarea: entero de 0 a 100, o sin progreso.
// Contrato en logday-server (specs/esquema-datos/requirements.md,
// "Progreso de tareas"): el servidor responde 400 a cualquier valor que no
// sea un entero JSON entre 0 y 100 o null, y ese 400 la cola lo descarta
// como fallo permanente (el cambio se pierde). Por eso todo valor pasa por
// aquí antes de guardarse o mandarse: nunca sale un valor inválido.

export const PROGRESS_MIN = 0;
export const PROGRESS_MAX = 100;

/** Progreso válido (entero 0–100) a partir de cualquier valor, o
 *  `undefined` si no hay progreso.
 *
 *  Lectura tolerante, porque el `.md` se puede editar a mano: un número con
 *  decimales se redondea y uno fuera de rango se lleva al borde (150 → 100,
 *  -5 → 0); un string numérico vale igual, con o sin `%` al final ("40%").
 *  Lo que no es un número (vacío, `null`, "mucho", NaN) cuenta como sin
 *  progreso: es preferible perder un valor ilegible que inventar uno. */
export function normalizeProgress(value: unknown): number | undefined {
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string') {
    const s = value.trim().replace(/%$/, '').trim();
    if (s === '') return undefined;
    n = Number(s);
  } else {
    return undefined;
  }
  if (!Number.isFinite(n)) return undefined;
  return Math.min(PROGRESS_MAX, Math.max(PROGRESS_MIN, Math.round(n)));
}

/** El valor que viaja al servidor: entero 0–100 o `null` (sin progreso). */
export function progressToPayload(value: unknown): number | null {
  return normalizeProgress(value) ?? null;
}

/** La tarea con su progreso normalizado, o sin la clave si no tiene: así lo
 *  que queda en el store es igual a lo que se relee del `.md`, y la
 *  detección de campos cambiados no ve una diferencia que no existe. */
export function withNormalizedProgress<T extends { progress?: number }>(task: T): T {
  const progress = normalizeProgress(task.progress);
  if (progress === undefined ? !('progress' in task) : progress === task.progress) return task;
  const next = { ...task };
  if (progress === undefined) delete next.progress;
  else next.progress = progress;
  return next;
}
