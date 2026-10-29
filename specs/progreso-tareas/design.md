# Progreso de tareas — Diseño

## Dónde vive

- `src/lib/taskProgress.ts`: `normalizeProgress` (cualquier valor → entero
  0–100 o `undefined`), `progressToPayload` (→ entero o `null`) y
  `withNormalizedProgress` (la tarea con la clave normalizada o quitada).
  Es el único sitio con la regla; el resto la llama.
- `src/types/task.ts`: `progress?: number`, opcional como `due`. En el
  store, "sin progreso" es la clave ausente (o `undefined` tras mezclar
  una respuesta del servidor; ambos se tratan igual).
- `src/lib/markdown.ts`: `parseFrontmatter` normaliza al leer;
  `serializeTask` normaliza al escribir y omite la clave sin progreso.
- `src/lib/syncMapping.ts`: `progress` en `TaskCreatePayload` (siempre),
  `TaskPatchPayload` (opcional) y `TaskApiResponse` (opcional, por los
  servidores viejos). `taskFromApiResponse` deja la clave siempre en el
  objeto, con `undefined` si no hay: así `{ ...local, ...remoto }` en
  `applyRemoteTaskChange` borra un progreso que el servidor ya no tiene.
  `diffTaskFields` se movió aquí desde `appStore.ts` para poder probarlo, y
  compara `progress`. `TASK_FIELD_MAP` (store) incluye `progress` para la
  regla de prioridad cola vs. respuesta.
- `src/store/appStore.ts`: `createTask` (acepta `extra.progress`, para el
  importador de OpenProject) y `updateTask` normalizan con
  `withNormalizedProgress` antes de escribir y de calcular el diff.
- UI: `ProgressMeter` en `TaskMeta.tsx` (lista y Kanban comparten
  `TaskMeta`) y `TaskProgressField.tsx` en el panel.

## Decisiones

- **Lectura tolerante del `.md` (redondeo + límite) en vez de descartar
  los valores fuera de rango.** Quien escribe `progress: 120` a mano quiere
  "terminado", no "sin progreso"; perderlo sería peor. Lo ilegible sí se
  descarta: inventar un valor sería peor que no tener.
- **La cola offline no necesita cambios**: guarda el payload ya mapeado
  (`fields`), genérico por clave, y `hasNewerQueuedField` funciona con la
  clave `progress` del servidor. La migración del primer sync usa
  `taskToCreatePayload`, así que también lo lleva.
- **POST con `null` explícito sin progreso** (y no omitiendo la clave):
  sigue el mismo criterio que `due` o `completed_at` en el create. Ojo:
  el servidor conserva el progreso guardado si la clave falta en un POST
  sobre una tarea existente, pero con `null` lo borra; Desktop solo hace
  POST de tareas nuevas (o que el servidor no tiene, en la migración).
- **El slider y el número se guardan con el debounce de 800 ms** de los
  campos de texto, no a cada paso: arrastrar el slider mandaría un PATCH
  por cada valor intermedio.
- **"Sin progreso" abre el control sin guardar 0**: 0 % es un valor real.
- **Duplicar una tarea no copia el progreso**, igual que no copia el estado:
  la copia arranca de cero.
- **Barra con `var(--accent)` y pista `var(--border-card)`** (como
  `ToggleSwitch`), sin clases `indigo-*`, para que siga a cualquier tema,
  claro, oscuro o personalizado.

## Fuera de alcance

- Llenar `progress` desde OpenProject (lo hace la extensión).
- Exponer `progress` en las herramientas MCP y en el webhook saliente.
- Filtrar u ordenar por progreso.
