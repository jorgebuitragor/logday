# Primer sync / migración de datos existentes — Diseño

Estado: en diseño — no implementar todavía, ver "Depende de" en
`requirements.md`.

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
'done' | 'error'`, contador `syncMigrationProgress: { done: number,
total: number, skipped: number }`) que la UI del tab Sync lee para
mostrar la barra de progreso.

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

## Fuera de este diseño

- Concurrencia/paralelismo en el envío — secuencial alcanza para una
  operación de una sola vez; si en la práctica resulta muy lenta con
  datasets grandes, revisar entonces, no de entrada.
- Migración del contenido CRDT — ver requirements.md "Alcance por
  entidad", fase futura separada dentro de este mismo spec.
