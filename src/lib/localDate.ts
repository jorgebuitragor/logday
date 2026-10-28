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
