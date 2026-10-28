import type { Task } from '../types/task';
import type { TaskSortBy } from '../types/config';
import type { Language } from './i18n';
import { daysBetweenISO } from './localDate';

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
const newestFirst = (a: Task, b: Task) => b.created.localeCompare(a.created);
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

/** Tareas hechas, de la completada más recientemente a la más antigua. */
export function doneTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => (b.completedAt ?? b.created).localeCompare(a.completedAt ?? a.created) || newestFirst(a, b));
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
