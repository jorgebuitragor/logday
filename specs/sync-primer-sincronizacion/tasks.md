# Primer sync / migración de datos existentes — Tareas

Estado: **bloqueado** — no empezar hasta que estén resueltos (ver
`requirements.md` "Depende de"):

- [ ] `specs/sync-servidor` "Cursor y reconciliación" implementado.
- [ ] `specs/sync-servidor` "Escritura y cola offline" replicado a
      `Note`, `OvertimeEntry`, `OvertimeMonthMeta`, `CalendarEvent`,
      `AbsenceDay` (hoy solo `Task` lo tiene).
- [ ] `specs/sync-servidor` fase CRDT implementada (para la fase
      futura de migrar contenido, no bloquea migrar metadata).
- [ ] `DailyEntry` mapeado — tipo local, funciones de
      (de)serialización, integrado a escritura/cola. No existe
      todavía en ninguna fase de `sync-servidor`.

## Implementación (cuando se desbloquee)

- [ ] `src/lib/syncMigration.ts`: una función por entidad
      (`migrateTasks`, `migrateNotes`, `migrateOvertimeEntries`,
      `migrateOvertimeMonthMeta`, `migrateCalendarEvents`,
      `migrateAbsenceDays`) — cada una trae la lista completa del
      servidor, filtra por id no presente, y hace `POST` de las que
      faltan usando `xToCreatePayload`/`createXRemote` ya existentes.
- [ ] Orquestador `migrateExistingData(get, set)` que corre las seis en
      secuencia, actualizando progreso.
- [ ] `appStore.ts`: acción `syncMigrateExisting`, estado
      `syncMigrationStatus`/`syncMigrationProgress`.
- [ ] `SyncSettingsTab.tsx`: botón "Sincronizar datos existentes"
      (habilitado solo si `syncConnectionStatus === 'connected'`),
      contador de progreso, toast de resumen al terminar.
- [ ] i18n: strings nuevos en `extras` (es/en), mismo namespace que el
      resto del tab Sync.

## Validación

- [ ] Prueba manual: instalación con datos locales previos (tasks,
      notas, etc. creados antes de este spec) + servidor vacío →
      correr migración → confirmar en el servidor (`curl`) que todo
      llegó, con los mismos `id` que en disco.
- [ ] Prueba manual: correr la migración dos veces seguidas →
      confirmar que la segunda corrida no duplica nada (todo aparece
      como "ya existía").
- [ ] Prueba manual: entidad que ya existe en el servidor con una
      edición más reciente que la copia local (simular con `curl`
      antes de migrar) → confirmar que la migración la saltea sin
      pisarla, y que la copia local queda como estaba (la reconciliación
      es quien la corrige, no este flujo).
- [ ] Prueba manual: interrumpir la migración a mitad de camino
      (cerrar la app) → confirmar que una corrida nueva completa lo
      que faltó sin duplicar lo que ya había subido.
