// Fechas de calendario (YYYY-MM-DD) en la zona horaria del equipo.
//
// `toISOString()` da la fecha en UTC: en Colombia (UTC-5), desde las
// 7 p. m. ya es el día siguiente. Así se guardaban como "mañana" las
// fechas de creación, edición y completado hechas de noche, las tareas que
// vencen hoy salían como vencidas y el calendario marcaba mañana como hoy.
// Para fechas de calendario hay que usar estas funciones; `toISOString()`
// sigue siendo lo correcto para instantes (marcas de sincronización, etc.).

/** YYYY-MM-DD de `d` en la hora local (por defecto, hoy). */
export function localISODate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM de `d` en la hora local (por defecto, el mes actual). */
export function localISOMonth(d: Date = new Date()): string {
  return localISODate(d).slice(0, 7);
}

/** Suma `days` días a una fecha YYYY-MM-DD, sin pasar por UTC. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  // Mediodía: un cambio de horario nunca mueve la fecha de día.
  return localISODate(new Date(y, m - 1, d + days, 12));
}

/** Días de `from` a `to` (ambas YYYY-MM-DD); negativo si `to` es anterior. */
export function daysBetweenISO(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

// ── Marcas de creación, edición y completado ────────────────────────────────
//
// `created` y `completedAt` de las tareas, y `created` y `updated` de las
// notas, pueden venir en dos formatos: un instante UTC de `toISOString()`
// (lo que escribe Mobile, y lo que escribirán todos los clientes) o un
// `YYYY-MM-DD` legado, que es esa fecha de calendario en la zona local y no
// se migra nunca. Estas funciones leen los dos. Un `YYYY-MM-DD` nunca se pasa
// por `new Date('YYYY-MM-DD')`, que lo toma como medianoche UTC (en Colombia,
// el día anterior), y valores de formatos mezclados no se comparan como
// strings: "2026-10-28" < "2026-10-28T…" aunque el instante sea anterior.
// Los mismos nombres existen en Web y Mobile.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Instante actual para guardar en una marca (UTC, formato `toISOString()`). */
export function nowInstant(): string {
  return new Date().toISOString();
}

/** Si `v` es una fecha de calendario `YYYY-MM-DD` (el formato legado). */
export function isDateOnly(v: string): boolean {
  return DATE_ONLY.test(v);
}

/** Una marca como `Date`: un `YYYY-MM-DD` es la medianoche local de ese día;
 *  un instante, su `Date`. Vacío o inválido: `null`. Nunca lanza. */
export function parseStamp(v: string | null | undefined): Date | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  if (isDateOnly(s)) {
    const [y, m, d] = s.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    // Descarta fechas que no existen (2026-02-30), que Date correría de mes.
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return date;
  }
  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** La marca como `YYYY-MM-DD` local: un `YYYY-MM-DD` válido sale tal cual; un
 *  instante, como el día en que cayó aquí. Vacío o inválido: `''`. */
export function stampToLocalDate(v: string | null | undefined): string {
  const date = parseStamp(v);
  if (!date) return '';
  return isDateOnly((v as string).trim()) ? (v as string).trim() : localISODate(date);
}

/** Clave numérica para ordenar marcas de formatos mezclados: milisegundos de
 *  época, o `0` si la marca está vacía o es inválida (queda como la más
 *  antigua). */
export function stampSortKey(v: string | null | undefined): number {
  return parseStamp(v)?.getTime() ?? 0;
}
