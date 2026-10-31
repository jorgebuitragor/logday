// Qué ayuda corresponde a cada sección (specs/ayuda-contextual AY25, AY26).
// Sin React, para probarlo solo.
import type { ActiveSection } from '../../types/config';

/** Las ayudas que hay: las de las pantallas que la tienen y la general. */
export type HelpTopic = 'tasks' | 'dailys' | 'overtime' | 'devtools' | 'pomodoro' | 'general';

const BY_SECTION: Partial<Record<ActiveSection, HelpTopic>> = {
  tasks: 'tasks',
  dailys: 'dailys',
  overtime: 'overtime',
  'ext:devtools': 'devtools',
  'ext:pomodoro': 'pomodoro',
};

/** La ayuda de la sección activa. Tareas es la misma en Lista, Kanban y
 *  Calendario; Inicio, Notas y las extensiones sin ayuda propia muestran la
 *  general ("Cómo funciona Logday"). */
export function helpTopicFor(section: ActiveSection): HelpTopic {
  return BY_SECTION[section] ?? 'general';
}
