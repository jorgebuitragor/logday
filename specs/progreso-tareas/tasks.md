# Progreso de tareas — Tasks

- [x] `normalizeProgress` / `progressToPayload` / `withNormalizedProgress`
      (`src/lib/taskProgress.ts`, tests en `taskProgress.test.ts`). PR2, PR4.
- [x] `Task.progress` y frontmatter `progress:` (`markdown.ts`, tests en
      `markdown.test.ts`). PR1, PR3, PR4.
- [x] Payloads create/patch, respuesta y `diffTaskFields`
      (`syncMapping.ts`, tests en `syncMapping.test.ts`); `TASK_FIELD_MAP`
      en el store. PR5, PR6, PR7.
- [x] Normalizar en `createTask` (con `extra.progress`) y `updateTask`. PR2.
- [x] `ProgressMeter` en `TaskMeta` (lista y Kanban). PR8.
- [x] `TaskProgressField` en el panel, con `useFieldDrafts`. PR9, PR10.
- [x] Textos es/en en `i18n.ts`.
- [ ] Probar en la app (build de QA): editar, quitar, cambio remoto con el
      panel abierto, y ver la barra en lista y Kanban en tema claro y oscuro.
