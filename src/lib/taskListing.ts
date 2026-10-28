import type { Task, TaskStatus } from '../types/task';
import type { TaskSortBy } from '../types/config';
import type { Language } from './i18n';
import { addDaysISO, daysBetweenISO, localISODate, stampSortKey, stampToLocalDate } from './localDate';

// Cómo se ordena y agrupa la lista de tareas.
//
// Antes la lista mostraba las tareas en el orden en que se leían del disco,
// con las hechas mezcladas con las pendientes. Ahora las pendientes van
// primero, agrupadas por vencimiento (o en un solo grupo si se ordena por
// creación o por título), y las hechas al final, de la más reciente a la
// más antigua.

export type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none';
export type TaskGroupKey = DueBucket | 'pending';

export interface TaskGroup {
  key: TaskGroupKey;
  tasks: Task[];
}

const BUCKET_ORDER: DueBucket[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none'];

/** En qué grupo de vencimiento cae una fecha, respecto de `today`. */
export function dueBucket(due: string | undefined, today: string): DueBucket {
  if (!due) return 'none';
  const days = daysBetweenISO(today, due);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 7) return 'week';
  return 'later';
}

// A igual fecha, lo que está en curso va antes que lo que falta empezar.
const inProgressFirst = (a: Task, b: Task) =>
  (a.status === 'in-progress' ? 0 : 1) - (b.status === 'in-progress' ? 0 : 1);
// `created` puede ser un instante o un `YYYY-MM-DD` legado: se ordena por
// el momento que representa, nunca como string (ver localDate.ts).
const newestFirst = (a: Task, b: Task) => stampSortKey(b.created) - stampSortKey(a.created);
const completedKey = (t: Task) => stampSortKey(t.completedAt || t.created);
const byTitle = (a: Task, b: Task) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });

/** Tareas pendientes (no hechas), agrupadas y ordenadas según `sortBy`.
 *  Los grupos vacíos no se devuelven. */
export function groupOpenTasks(tasks: Task[], sortBy: TaskSortBy, today: string): TaskGroup[] {
  const open = tasks.filter((t) => t.status !== 'done');
  if (sortBy === 'title') return open.length ? [{ key: 'pending', tasks: [...open].sort(byTitle) }] : [];
  if (sortBy === 'created') return open.length ? [{ key: 'pending', tasks: [...open].sort(newestFirst) }] : [];

  const buckets = new Map<DueBucket, Task[]>();
  for (const task of open) {
    const key = dueBucket(task.due, today);
    const list = buckets.get(key) ?? [];
    list.push(task);
    buckets.set(key, list);
  }
  return BUCKET_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    tasks: buckets.get(key)!.sort((a, b) =>
      (a.due ?? '').localeCompare(b.due ?? '') || inProgressFirst(a, b) || newestFirst(a, b),
    ),
  }));
}

/** Una columna del Kanban en el mismo orden que la lista: por
 *  vencimiento (sin fecha al final), más recientes o título. La de hechas,
 *  de la completada más recientemente a la más antigua. No hay orden manual:
 *  ningún cliente lo guarda, y agregarlo es un campo nuevo en el sync. */
export function sortColumn(tasks: Task[], sortBy: TaskSortBy): Task[] {
  if (tasks.length && tasks.every((t) => t.status === 'done')) return doneTasks(tasks);
  if (sortBy === 'title') return [...tasks].sort(byTitle);
  if (sortBy === 'created') return [...tasks].sort(newestFirst);
  return [...tasks].sort((a, b) =>
    (a.due ? 0 : 1) - (b.due ? 0 : 1) || (a.due ?? '').localeCompare(b.due ?? '') || inProgressFirst(a, b) || newestFirst(a, b),
  );
}

/** Tareas hechas, de la completada más recientemente a la más antigua. */
export function doneTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => completedKey(b) - completedKey(a) || newestFirst(a, b));
}

/** Día local (`YYYY-MM-DD`) en que se completó la tarea, o `''` si no está
 *  hecha o no tiene fecha. `completedAt` solo cuenta con `status === 'done'`:
 *  un valor que quedó de antes (p. ej. desde otro cliente) no se toma en
 *  cuenta. Acepta un instante o un `YYYY-MM-DD` legado. */
export function completedLocalDate(task: Task): string {
  return task.status === 'done' ? stampToLocalDate(task.completedAt) : '';
}

/** Lunes y domingo (`YYYY-MM-DD` local) de la semana de `now`. */
export function localWeekRange(now: Date = new Date()): { start: string; end: string } {
  const diffToMonday = (now.getDay() + 6) % 7;
  const start = addDaysISO(localISODate(now), -diffToMonday);
  return { start, end: addDaysISO(start, 6) };
}

/** Tareas completadas en la semana (lunes a domingo, hora local) de `now`.
 *  Se compara el día local de la marca, no el string crudo: un instante del
 *  domingo a las 10 p. m. en Colombia es "lunes" en UTC y antes se perdía. */
export function countDoneThisWeek(tasks: Task[], now: Date = new Date()): number {
  const { start, end } = localWeekRange(now);
  return tasks.filter((t) => {
    const day = completedLocalDate(t);
    return !!day && day >= start && day <= end;
  }).length;
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'normal';

/** Fecha de vencimiento para leer de un vistazo: "Hoy", "Mañana", "Ayer",
 *  el día de la semana si cae en los próximos días, o "3 nov" (con el año
 *  si no es el actual). */
export function formatDueLabel(due: string, today: string, language: Language): { label: string; tone: DueTone } {
  const days = daysBetweenISO(today, due);
  const es = language === 'es';
  const tone: DueTone = days < 0 ? 'overdue' : days === 0 ? 'today' : days === 1 ? 'soon' : 'normal';
  if (days === 0) return { label: es ? 'Hoy' : 'Today', tone };
  if (days === 1) return { label: es ? 'Mañana' : 'Tomorrow', tone };
  if (days === -1) return { label: es ? 'Ayer' : 'Yesterday', tone };

  const [y, m, d] = due.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  const locale = es ? 'es-CO' : 'en-US';
  const clean = (s: string) => s.replace(/\./g, '');
  if (days > 1 && days < 7) {
    const weekday = clean(new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date));
    return { label: `${weekday} ${d}`, tone };
  }
  // Armado a mano: el formato combinado de Intl cambia según el motor
  // (es-CO da "15 de nov." en unos y "15 nov" en otros).
  const month = clean(new Intl.DateTimeFormat(locale, { month: 'short' }).format(date));
  const year = y === Number(today.slice(0, 4)) ? '' : es ? ` ${y}` : `, ${y}`;
  return { label: es ? `${d} ${month}${year}` : `${month} ${d}${year}`, tone };
}

export interface TaskFilter {
  status: TaskStatus | 'all';
  /** Tags elegidos: la tarea tiene que tener al menos uno. */
  tags: string[];
  query: string;
}

export const EMPTY_TASK_FILTER: TaskFilter = { status: 'all', tags: [], query: '' };

export const isTaskFilterActive = (f: TaskFilter) => f.status !== 'all' || f.tags.length > 0 || f.query.trim() !== '';

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Filtro común de las tres vistas. El texto busca, sin distinguir
 *  mayúsculas ni tildes, en título, código, tags y proyecto: lo mismo que
 *  se ve en cada fila. Con `ignoreStatus` no filtra por estado (el Kanban,
 *  donde el estado son las columnas). */
export function filterTasks(tasks: Task[], filter: TaskFilter, { ignoreStatus = false } = {}): Task[] {
  const words = fold(filter.query).split(/\s+/).filter(Boolean);
  return tasks.filter((t) => {
    if (!ignoreStatus && filter.status !== 'all' && t.status !== filter.status) return false;
    if (filter.tags.length && !filter.tags.some((tag) => t.tags.includes(tag))) return false;
    if (!words.length) return true;
    const haystack = fold([t.title, t.taskCode ?? '', t.project, ...t.tags].join(' '));
    return words.every((w) => haystack.includes(w));
  });
}

/** Todos los tags de `tasks`, ordenados. */
export function allTaskTags(tasks: Task[]): string[] {
  return [...new Set(tasks.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

/** "27 de octubre de 2026" / "October 27, 2026", para fechas que se leen
 *  completas (la creación en el panel de una tarea). Acepta un `YYYY-MM-DD`
 *  o un instante, que se muestra como su día local. */
export function formatLongDate(stamp: string, language: Language): string {
  const iso = stampToLocalDate(stamp);
  if (!iso) return stamp;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(language === 'es' ? 'es-CO' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(y, m - 1, d, 12));
}

/** Ids entre `anchor` y `target` (ambos incluidos) en el orden de `order`:
 *  la selección con ⇧-clic. Si `anchor` no está, solo `target`. */
export function rangeIds(order: string[], anchor: string, target: string): string[] {
  const a = order.indexOf(anchor);
  const b = order.indexOf(target);
  if (b < 0) return [];
  if (a < 0) return [target];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}
