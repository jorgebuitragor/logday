# Primer sync / migración de datos existentes — Tareas

Estado: implementado. Los bloqueos de abajo ya estaban resueltos en
el código (desactualizado respecto al spec) al momento de implementar
esto.

- [x] `specs/sync-servidor` "Cursor y reconciliación" implementado.
- [x] `specs/sync-servidor` "Escritura y cola offline" replicado a
      `Note`, `OvertimeEntry`, `OvertimeMonthMeta`, `CalendarEvent`,
      `AbsenceDay`.
- [x] `specs/sync-servidor` fase CRDT implementada.
- [x] `DailyEntry` mapeado (tipo de respuesta, funciones de
      (de)serialización, integrado a escritura).

## Implementación

- [x] `src/lib/syncMigration.ts`: una función por entidad
      (`migrateTasks`, `migrateNotes`, `migrateOvertimeEntries`,
      `migrateOvertimeMonthMeta`, `migrateCalendarEvents`,
      `migrateAbsenceDays`, `migrateDailyEntries`) — cada una trae la
      lista completa del servidor, filtra por id/fecha/year_month no
      presente, y hace `POST`/`PATCH`/`PUT` de lo que falta usando
      `xToCreatePayload`/`createXRemote` ya existentes (o el push CRDT
      para `Note`/`DailyEntry`).
- [x] `src/lib/sync.ts`: 7 funciones `list*Remote` nuevas (no existía
      ninguna, solo `syncChangesRemote`).
- [x] Orquestador `migrateExistingData(get, set)` que corre las siete
      en secuencia, actualizando progreso item por item.
- [x] `appStore.ts`: acción `syncMigrateExisting` (import dinámico de
      `syncMigration.ts` para evitar un ciclo de módulos — ver
      `design.md`), estado `syncMigrationStatus`/`syncMigrationProgress`.
      `projectDir`/`readTaskFromPath`/`notesDir`/`noteFolderDir`/
      `readNoteFromPath`/`scanNoteFolders`/`overtimeBaseDir`/
      `overtimeMonthFilePath` exportados para que la migración lea
      disco directo sin pasar por `loadTasks`/`loadNotes`/
      `loadOvertimeMonth` (ver `design.md` "Enumeración de lo local").
- [x] `SyncSettingsTab.tsx`: botón "Migrar datos existentes"
      (habilitado solo si `connected`), contador de progreso en vivo
      (`{done}/{total}`), toast de resumen al terminar.
- [x] i18n: strings nuevos en `extras` (es/en).

## Validación

- [ ] Prueba manual: instalación con datos locales previos (tasks,
      notas, overtime, dailys creados antes de conectar sync) +
      servidor vacío → correr migración → confirmar en el servidor
      (`curl`/sqlite) que todo llegó, con los mismos `id`/fecha que en
      disco, notas y dailys con contenido real (no vacío).
- [ ] Prueba manual: correr la migración dos veces seguidas →
      confirmar que la segunda corrida reporta todo como "ya existía",
      cero duplicados.
- [ ] Prueba manual: entidad que ya existe en el servidor con una
      edición más reciente que la copia local (simular con `curl`
      antes de migrar) → confirmar que la migración la saltea sin
      pisarla.
- [ ] Prueba manual: interrumpir la migración a mitad de camino
      (cerrar la app) → confirmar que una corrida nueva completa lo
      que faltó sin duplicar lo que ya había subido.
- [ ] Prueba manual: mientras la migración corre, confirmar que las
      secciones Overtime/Dailys/Kanban/Notes de la UI no cambian de
      vista/mes/proyecto/carpeta solas.

**Nota**: la validación manual contra la app real (Tauri) queda
pendiente — solo se validó `tsc`/`eslint`/`vite build`/`cargo check`
en esta sesión, sin poder interactuar con la UI de escritorio
directamente.
