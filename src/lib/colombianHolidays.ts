/**
 * Festivos de Colombia — algoritmo dinámico para cualquier año.
 * Fuente legal: Ley 51 de 1983 (Ley Emiliani) y Ley 27 de 1985.
 */

// Algoritmo de Butcher para calcular la fecha de Pascua
function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, mo, day, 12, 0, 0);
}

// Traslado al lunes siguiente (Ley Emiliani)
function toNextMonday(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay();
  if (dow === 1) return d; // ya es lunes
  d.setDate(d.getDate() + (dow === 0 ? 1 : 8 - dow));
  return d;
}

/** Convierte una fecha local a string YYYY-MM-DD sin dependencia de UTC */
export function toISO(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * Retorna el conjunto de festivos colombianos para el año dado
 * como strings YYYY-MM-DD.
 */
export function getColombianHolidays(year: number): Set<string> {
  const h = new Set<string>();

  // Festivos fijos
  h.add(`${year}-01-01`); // Año Nuevo
  h.add(`${year}-05-01`); // Día del Trabajo
  h.add(`${year}-07-20`); // Independencia de Colombia
  h.add(`${year}-08-07`); // Batalla de Boyacá
  h.add(`${year}-12-08`); // Inmaculada Concepción
  h.add(`${year}-12-25`); // Navidad

  // Ley Emiliani — trasladados al lunes siguiente
  [
    new Date(year, 0, 6),   // Reyes Magos (6 ene)
    new Date(year, 2, 19),  // San José (19 mar)
    new Date(year, 5, 29),  // San Pedro y San Pablo (29 jun)
    new Date(year, 9, 12),  // Día de la Raza (12 oct)
    new Date(year, 10, 1),  // Todos los Santos (1 nov)
    new Date(year, 10, 11), // Independencia de Cartagena (11 nov)
  ].forEach((d) => h.add(toISO(toNextMonday(d))));

  // Semana Santa y festivos relativos a Pascua
  const easter = easterDate(year);
  h.add(toISO(addDays(easter, -3))); // Jueves Santo
  h.add(toISO(addDays(easter, -2))); // Viernes Santo
  h.add(toISO(toNextMonday(addDays(easter, 39))));  // Ascensión del Señor
  h.add(toISO(toNextMonday(addDays(easter, 60))));  // Corpus Christi
  h.add(toISO(toNextMonday(addDays(easter, 68))));  // Sagrado Corazón de Jesús

  return h;
}

/** Devuelve true si la fecha es un día hábil (lunes–viernes, no festivo CO). */
export function isWorkingDay(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  return !getColombianHolidays(date.getFullYear()).has(toISO(date));
}

/**
 * Devuelve true si la fecha es un festivo colombiano (excluye fines de semana).
 */
export function isColombianHoliday(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  return getColombianHolidays(date.getFullYear()).has(toISO(date));
}

/**
 * Versión con soporte para semana laboral de 5 o 6 días.
 * Con 6 días el sábado también es laborable (excluye festivos).
 * @param respectHolidays Si es false, los festivos se tratan como días laborables.
 */
export function isWorkDay(date: Date, workWeekDays: 5 | 6 = 5, respectHolidays = true): boolean {
  const dow = date.getDay();
  if (dow === 0) return false; // domingo nunca
  if (dow === 6 && workWeekDays < 6) return false;
  if (!respectHolidays) return true;
  return !getColombianHolidays(date.getFullYear()).has(toISO(date));
}

/**
 * Devuelve el día hábil inmediatamente anterior a `from`,
 * omitiendo fines de semana y festivos colombianos.
 */
export function getPreviousWorkingDay(from: Date): Date {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  while (!isWorkingDay(d)) d.setDate(d.getDate() - 1);
  return d;
}

/** Construye un objeto Date a partir de YYYY-MM-DD evitando problemas UTC. */
export function dateFromISO(iso: string): Date {
  const [y, mo, da] = iso.split('-').map(Number);
  return new Date(y, mo - 1, da, 12, 0, 0);
}

// ── Formato del mensaje de daily ──────────────────────────────

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function dayLabel(d: Date): string {
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/**
 * Genera el texto formateado del daily para copiar al canal del equipo.
 *
 * Formato:
 * Buenos días.
 *
 * El día [DayName] [Day] de [Month]:
 * [prevActivities]
 *
 * El día de hoy, [DayName] [Day] de [Month]:
 * [todayActivities]
 */
export function buildDailyCopyText(
  prevDate: Date,
  prevActivities: string,
  todayDate: Date,
  todayActivities: string
): string {
  const prev = prevActivities.trim() || '- (sin actividades registradas)';
  const today = todayActivities.trim() || '- (sin actividades aún)';
  const realToday = new Date();
  const isToday =
    todayDate.getFullYear() === realToday.getFullYear() &&
    todayDate.getMonth() === realToday.getMonth() &&
    todayDate.getDate() === realToday.getDate();
  const todayLabel = isToday
    ? `El día de hoy, ${dayLabel(todayDate)}:`
    : `El día ${dayLabel(todayDate)}:`;
  return [
    'Buenos días.',
    '',
    `El día ${dayLabel(prevDate)}:`,
    prev,
    '',
    todayLabel,
    today,
  ].join('\n');
}
