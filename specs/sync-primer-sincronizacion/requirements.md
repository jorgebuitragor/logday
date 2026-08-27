# Primer sync / migración de datos existentes — Requirements

Estado: implementado. Los tres bloqueos de "Depende de" (offline queue
completo, CRDT, mapeo de `DailyEntry`) ya estaban resueltos en el
código cuando se retomó este spec — quedaron desactualizados respecto
a sesiones de trabajo posteriores a cuando se escribieron, no
reflejaban el estado real. Alcance también ampliado respecto a la v0:
"Alcance por entidad" dejaba fuera el contenido de `Note` y toda
`DailyEntry` por depender de CRDT — ya no aplica, ver `design.md`
"Alcance ampliado".

## Contexto

`specs/sync-servidor` cubre la escritura y lectura de cambios
**desde que el usuario conecta** — todo lo que se crea, edita o borra
en Desktop después de tocar "Conectar" llega al servidor (o al revés,
una vez esté "Cursor y reconciliación"). Pero una instalación de
Logday Desktop típica no arranca vacía: tiene meses de `Task`, `Note`,
`OvertimeEntry`/`OvertimeMonthMeta`, `CalendarEvent`, `AbsenceDay` y
entradas diarias ya en disco. Nada de eso llega al servidor solo por
conectar — sync-servidor únicamente reacciona a acciones nuevas del
usuario.

`specs/sync-servidor/design.md` ("Fuera de este diseño") y
`requirements.md` ("Fuera de este spec") dejaron esto explícitamente
para un spec aparte:

> Migración de datos existentes (usuarios que ya tienen meses de
> archivos locales) hacia un servidor recién configurado — primer
> sync completo, probablemente requiere su propio spec.

Este es ese spec.

## Depende de (histórico — los tres ya resueltos al implementar)

- **`sync-servidor` completo**: "Cursor y reconciliación" y
  "Escritura y cola offline" para las 6 entidades — resuelto,
  confirmado leyendo `appStore.ts` (`syncCreateNote`/
  `syncCreateOvertimeEntry`/`syncCreateCalendarEvent`/
  `syncCreateAbsenceDay`/`syncPatchOvertimeMonthMeta` siguen el mismo
  patrón try/catch/enqueue que `syncCreateTask`, y `reconcileSync` ya
  existe y corre en cada `syncNow`/reconexión).
- **CRDT**: resuelto — `src/lib/noteContentSync.ts` y
  `src/lib/dailyContentSync.ts` ya implementan el mecanismo completo
  (`Y.Text` bajo la key `"content"`, verificado contra el protocolo
  real de `logday-server`/`logday-web`).
- **`DailyEntry` sin mapear**: resuelto — `DailyEntryApiResponse` en
  `syncMapping.ts`, `putDailyEntryContentRemote`/
  `listDailyEntriesRemote` en `sync.ts`, y toda la sincronización
  normal (no solo migración) de `DailyEntry` ya funciona.

## Contexto técnico ya confirmado

- Los `id` locales de `Task`/`Note`/etc. ya son UUIDs (`uuidv4()` al
  crear) — no hace falta remapear ids al empujarlos al servidor.
- `POST /tasks` (y el resto de los `create` en `logday-server`) hacen
  upsert por LWW de **toda la fila**, no por campo: si el `id` ya
  existe del lado del servidor, exige que el `updated_at` entrante sea
  estrictamente posterior al guardado, si no responde `409 Conflict`
  (`internal/task/store.go` `upsertTask`). Migración NO genera un
  `updated_at` de "ahora" para decidir ese conflicto — ver "Regla de
  conflicto" abajo, por qué eso sería peligroso.
- No existe `GET /tasks/{id}` (ni el equivalente para las otras
  entidades) — solo `GET /tasks` (lista completa, sin paginar,
  confirmado en `logday-server`). Cualquier chequeo de "¿esto ya
  existe en el servidor?" tiene que hacerse contra la lista completa,
  no una consulta puntual. `sync.ts` no tenía wrappers cliente para
  estos `GET` (solo `syncChangesRemote`, el delta) — se agregaron
  `list*Remote` nuevos para las 7 entidades, uso exclusivo de esta
  migración (el flujo normal de sync sigue usando el delta).

## Requisitos (EARS)

### Disparo

- El sistema NO DEBERÁ migrar datos existentes automáticamente al
  conectar por primera vez — es una acción explícita del usuario
  (botón en el tab Sync), visible y repetible, no un efecto secundario
  silencioso de tocar "Conectar".
- El sistema DEBERÁ permitir volver a ejecutar la migración las veces
  que el usuario quiera (no es una operación de una sola vez) — cubre
  el caso de un archivo restaurado de un backup, una entidad creada
  mientras la app estaba desconectada del servidor por otro motivo, o
  simplemente confirmar que todo subió bien.

### Regla de conflicto: nunca decidir, nunca pisar con una fecha inventada

- Al migrar una entidad, el sistema DEBERÁ primero traer la lista
  completa de esa entidad desde el servidor (`GET /tasks`, `GET
  /notes`, etc.) y migrar **únicamente** las entidades locales cuyo
  `id` no aparezca ahí — nunca intentar sobreescribir una entidad que
  ya existe del lado del servidor.
- Razón (no es solo una optimización): el `updated_at` que viajaría en
  un `POST` de migración no tiene de dónde salir honesto — el modelo
  local no guarda cuándo se editó por última vez una `Task`/`Note`
  (`created: YYYY-MM-DD` es la única fecha que existe, sin timestamp
  de edición). Generar `updated_at: ahora` haría que la migración
  siempre gane cualquier conflicto de upsert por LWW-de-fila-completa,
  aunque el servidor tuviera una edición genuina y más reciente de
  otro dispositivo ya sincronizado — se perdería esa edición en
  silencio. Restringir la migración a "solo lo que no existe todavía"
  evita el problema de raíz en vez de intentar adivinar una fecha.
- Toda entidad que exista en ambos lados (local y servidor) queda sin
  tocar por este flujo — "Cursor y reconciliación" (ya resuelto para
  cuando este spec se implemente, ver "Depende de") es quien la
  reconcilia con las reglas de LWW normales, con timestamps reales de
  ediciones futuras, no con una fecha inventada por la migración.

### Progreso y resultado visibles

- El sistema DEBERÁ mostrar que la migración está en curso (no una
  operación silenciosa en segundo plano sin ningún indicio) y cuántas
  entidades se subieron vs. cuántas se saltearon por ya existir.
- El sistema DEBERÁ seguir permitiendo uso normal de la app (leer,
  crear, editar localmente) mientras la migración corre — no bloquear
  la UI.
- Si la migración se interrumpe (se cierra la app, se cae la
  conexión), el sistema DEBERÁ dejar un resultado parcial consistente
  — nada corrupto ni duplicado — y permitir que una nueva corrida
  complete lo que faltó (ver "Disparo": repetible).

### Alcance por entidad

- El sistema DEBERÁ migrar `Task`, `OvertimeEntry`,
  `OvertimeMonthMeta`, `CalendarEvent`, `AbsenceDay`, metadata de
  `Note` (título, carpeta, tags, `pinned`), **y también** el contenido
  CRDT de `Note` y `DailyEntry` completo (ampliado respecto a la v0
  de este spec — ver `design.md` "Alcance ampliado" para el mecanismo:
  bootstrapea un `Y.Doc` desde el texto plano local y lo manda por el
  mismo canal CRDT que usa una edición normal).
- Para `Note`/`DailyEntry`: si el id/fecha ya existe remoto pero sin
  contenido (una migración anterior que se interrumpió después de
  crear la metadata pero antes de mandar el contenido), el sistema
  DEBERÁ completar el contenido faltante sin volver a tocar la
  metadata ya existente. Si el remoto ya tiene contenido no vacío, se
  saltea entero — nunca se pisa.

## Fuera de este spec

- Cualquier UI de resolución manual de conflictos — mismo principio
  rector que `sync-servidor`, ver "Regla de conflicto" arriba: el
  cliente nunca pisa nada que ya exista del lado del servidor durante
  la migración.
- Migrar desde/hacia un `logday-server` con datos de **otro usuario**
  — este spec asume una cuenta nueva o una cuenta ya usada por este
  mismo dispositivo, no fusión de datos entre usuarios distintos.
