# Primer sync / migración de datos existentes — Diseño

Estado: implementado. Los tres bloqueos que dejaban esto "en diseño"
(offline queue completo, CRDT, mapeo de `DailyEntry`) ya estaban
resueltos en el código para cuando se implementó esto — los specs
habían quedado desactualizados respecto a sesiones de trabajo
posteriores a cuando se escribieron. Ver "Alcance ampliado" abajo:
esta implementación también cubre contenido CRDT de `Note` y
`DailyEntry` completo, que la v0 de este spec dejaba para una fase
futura separada por depender de CRDT — CRDT ya existía, así que se
incluyó de una vez.

## Algoritmo, por entidad

```
1. GET /tasks (o el endpoint equivalente) — set de ids ya en el servidor.
2. Para cada entidad local cuyo id NO está en ese set:
     POST con xToCreatePayload(entidad) — igual que un create nuevo,
     mismo mapeo de src/lib/syncMapping.ts, mismas funciones de
     src/lib/sync.ts ya usadas por syncCreateTask.
3. Entidades cuyo id sí está en el servidor: se saltean, sin tocar
   nada — las reconcilia "Cursor y reconciliación" con timestamps
   reales, no esto (ver requirements.md "Regla de conflicto").
```

Nada nuevo del lado de `sync.ts`/`syncMapping.ts` — la migración
reutiliza exactamente las funciones `xToCreatePayload` y
`createXRemote` que ya existen para el flujo normal de creación (ver
`specs/sync-servidor` "Mapeo de entidades" y "Escritura y cola
offline"). Lo único nuevo es la lógica de "traer la lista, filtrar por
lo que falta, iterar" — un archivo aparte, no una entidad más en
`syncQueue.ts` (esto no es una escritura que deba sobrevivir un cierre
de la app a mitad de camino de la misma forma que la cola: si se
interrumpe, la siguiente corrida vuelve a pedir la lista completa y
retoma desde ahí, no hace falta persistir progreso).

## Por qué no reusar `syncQueue.ts`

La cola (`QueuedWrite`) modela "esto se escribió mientras estaba
desconectado, hay que drenarlo en orden." La migración es un caso
distinto: se ejecuta estando **conectado**, no encola nada — cada
entidad se manda directo, y si falla una, se sigue con la siguiente
(no hay orden que preservar entre entidades distintas, a diferencia de
ediciones sucesivas al mismo campo). Meterla en la cola complicaría el
drenado (que sí necesita orden estricto) sin ganar nada.

## Ubicación del código

Nuevo módulo `src/lib/syncMigration.ts`, con una función por entidad
(`migrateTasks(get, set)`, etc.) y un orquestador
`migrateExistingData(get, set)` que las corre en secuencia — no en
paralelo, mismo motivo que el resto de este spec: evita saturar al
servidor con ráfagas grandes y hace el progreso reportable de forma
simple (una entidad a la vez, un contador que avanza).

Acción nueva en `appStore.ts`: `syncMigrateExisting: () => Promise<void>`,
más estado para progreso (`syncMigrationStatus: 'idle' | 'running' |
'done' | 'error'`, contador `syncMigrationProgress: { done, total,
migrated, skipped, failed }`) que la UI del tab Sync lee para mostrar
el progreso en vivo.

## UI

Un botón "Sincronizar datos existentes" en `SyncSettingsTab.tsx`,
visible solo cuando `syncConnectionStatus === 'connected'` — mismo
tab, no un modal aparte. Mientras `syncMigrationStatus === 'running'`,
el botón se deshabilita y muestra el contador
(`{done}/{total} · {skipped} ya existían`). Al terminar, un toast
(`showToast`, mismo mecanismo que el resto de la app) con el resumen.

## Orden de entidades

Sin requisito real de orden entre entidades distintas (no hay
dependencias cruzadas — a diferencia de, por ejemplo, tener que crear
un proyecto antes que sus tasks, acá cada entidad es independiente).
Se migran en el orden que ya usa "Mapeo de entidades": `Task`, `Note`
(metadata), `OvertimeEntry`, `OvertimeMonthMeta`, `CalendarEvent`,
`AbsenceDay`.

## Manejo de fallos

Un fallo de red en una entidad puntual (no el `GET` inicial de la
lista, que si falla aborta esa entidad completa con un error visible)
no detiene la migración de las demás — se cuenta como "no subida
todavía" y sigue con la siguiente. El usuario puede volver a tocar el
botón después; como el primer paso siempre vuelve a pedir la lista
completa del servidor, las que ya se subieron en la corrida anterior
se saltean solas (ya están en el set), y solo se reintentan las que
quedaron pendientes.

## Alcance ampliado — Note-content y DailyEntry

A diferencia de la v0 de este spec (que dejaba esto para una fase
futura, bloqueada por CRDT), la implementación real también migra:

- **`Note.content`**: para cada nota nueva (metadata recién creada) o
  cuya fila remota ya exista pero con `content` vacío (metadata
  migrada en una corrida anterior interrumpida antes de llegar al
  contenido), se bootstrapea un `Y.Doc` nuevo desde el texto plano
  local (`applyTextEdit(doc, '', note.content)`, mismo helper que usa
  `NoteEditor.tsx` para una nota sin `.ydoc` previo) y se manda con
  `pushNoteContentRemote`. Si el remoto ya tiene contenido no vacío,
  se saltea entero — no se pisa.
- **`DailyEntry`**: mismo criterio que `Note.content` pero sin
  metadata separada — por cada fecha local con texto, si el remoto no
  tiene esa fecha o la tiene con `content` vacío, se bootstrapea un
  `Y.Doc` y se manda por `putDailyEntryContentRemote`.

## Enumeración de lo local — no reusar las acciones `loadX` del store

Confirmado durante la implementación: `loadTasks(project)`,
`loadNotes(folder)` y `loadOvertimeMonth(yearMonth)` **reemplazan**
el recorte visible actual (`tasks`/`notes` quedan scopeados a
`activeProject`/`activeNoteFolder`, `overtimeEntries`+`overtimeMonth`
cambian con cada mes recorrido) — llamarlas en loop durante una
migración de fondo le cambiaría al usuario lo que está viendo ahora
mismo en Kanban/Notes/Overtime. `syncMigration.ts` en cambio lee el
disco directo para estas tres (funciones puras exportadas de
`appStore.ts`: `projectDir`/`readTaskFromPath`,
`notesDir`/`noteFolderDir`/`readNoteFromPath`/`scanNoteFolders`,
`overtimeBaseDir`/`overtimeMonthFilePath`), sin pasar por ningún
`set()` de esas acciones. `CalendarEvent`/`AbsenceDay`/`DailyEntry` sí
reusan sus acciones (`loadCalendarEvents`/`loadAbsenceDays`/
`loadDailyMonths`+`loadDailyMonth`) porque esas no reemplazan ningún
recorte visible — son siempre-completas o (`dailyEntries`) se mergean
sin tocar qué mes está activo.

## Ciclo de imports

`syncMigration.ts` importa funciones puras de `appStore.ts`
(`projectDir`, `readTaskFromPath`, etc.) — pero `appStore.ts` también
necesita llamar al orquestador de `syncMigration.ts` desde la acción
`syncMigrateExisting`. Para evitar un ciclo estático de módulos, esa
acción usa `await import('../lib/syncMigration')` (dinámico) en vez
de un `import` normal — se resuelve recién cuando la acción corre, con
ambos módulos ya inicializados. Los tipos (`SyncGet`/`SyncSet`,
`MigrationProgress`) sí se importan de forma estática/normal en
ambas direcciones porque un `import type` se borra en compilación y
no genera ninguna dependencia real en tiempo de ejecución.

## Fuera de este diseño

- Concurrencia/paralelismo en el envío — secuencial alcanza para una
  operación de una sola vez; si en la práctica resulta muy lenta con
  datasets grandes, revisar entonces, no de entrada.
