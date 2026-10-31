// Las opciones del selector de tarea (design §2.8): solo pendientes y en
// curso, de cualquier proyecto, en dos grupos. Pura, para probarla sola.
import { stampSortKey } from '../../lib/localDate';
import type { Task } from '../../types/task';
import { fold } from './text';

export const MAX_OPTIONS = 50;

export interface TaskGroups {
  inProgress: Task[];
  todo: Task[];
  /** Las que coinciden pero no se dibujan (más de 50). */
  hidden: number;
  /** Las que coinciden, sin contar el tope. */
  total: number;
}

/** Primero las que vencen antes; sin vencimiento, al final. Después, las
 *  más recientes. */
function compare(a: Task, b: Task): number {
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  return stampSortKey(b.created) - stampSortKey(a.created);
}

export function groupTasks(tasks: readonly Task[], query: string): TaskGroups {
  const q = fold(query.trim());
  const matches = tasks.filter((t) => {
    if (t.status !== 'todo' && t.status !== 'in-progress') return false;
    if (!q) return true;
    return fold(`${t.title} ${t.taskCode ?? ''} ${t.project}`).includes(q);
  });
  const inProgress = matches.filter((t) => t.status === 'in-progress').sort(compare);
  const todo = matches.filter((t) => t.status === 'todo').sort(compare);
  const shownInProgress = inProgress.slice(0, MAX_OPTIONS);
  const shownTodo = todo.slice(0, Math.max(0, MAX_OPTIONS - shownInProgress.length));
  return { inProgress: shownInProgress, todo: shownTodo, hidden: matches.length - shownInProgress.length - shownTodo.length, total: matches.length };
}
