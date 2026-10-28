# Fechas de creación, edición y completado — Design

## Helpers (`src/lib/localDate.ts`)

Los mismos nombres que en Web y Mobile:

| Función | Qué hace |
|---|---|
| `nowInstant()` | `new Date().toISOString()`. Lo usan los escritores de la etapa 2. |
| `isDateOnly(v)` | `/^\d{4}-\d{2}-\d{2}$/`. |
| `parseStamp(v)` | `YYYY-MM-DD` → medianoche local de ese día; instante → su `Date`; vacío, inválido o una fecha que no existe → `null`. |
| `stampToLocalDate(v)` | `YYYY-MM-DD` local: el legado sale tal cual, el instante como su día local; vacío o inválido → `''`. |
| `stampSortKey(v)` | Milisegundos de época de `parseStamp`, o `0`. |

## Dónde se usan

- **Mostrar** (R2): `formatLongDate` (`taskListing.ts`, panel de la tarea),
  `NoteList`, `NoteEditor` y la actividad reciente de `DashboardView` usan
  `stampToLocalDate`. La vista previa de enlaces usa `formatPreviewDate`
  (`src/lib/linkPreviewDate.ts`), que parte de `parseStamp` y devuelve
  `null` en vez de lanzar.
- **Ordenar** (R3): `newestFirst` y `doneTasks` (`taskListing.ts`),
  `sortNotes` (`noteSort.ts`), `loadTasks` y `loadNotes` (`appStore.ts`) y
  `DashboardView` restan `stampSortKey`.
- **Rangos** (R4, R5): `completedLocalDate(task)` (`taskListing.ts`) da el
  día local de `completedAt` solo si la tarea está `done`. Lo usan
  `countDoneThisWeek` / `localWeekRange` (Dashboard) y la ventana de hechas
  recientes del Kanban, que comparan `YYYY-MM-DD` contra `YYYY-MM-DD`.

## Escribir (etapa 2, `src/lib/entityStamps.ts`)

| Función | Qué hace | Quién la usa |
|---|---|---|
| `newTaskStamps(status)` | `created` = ahora; `completedAt` = el mismo instante si nace `done` (R10). | `createTask` |
| `nextCompletedAt(prev, next)` | D2 (R11): transición a `done` → ahora; sigue en `done` → conserva; fuera de `done` → nada. Sin `prev` conserva lo que traiga o sella. | `updateTask` |
| `newNoteStamps()` | `created = updated = ahora` (R12). | `createNote`, `importNotesFromPaths`, `importNotesFromContent`, `duplicateNote`, `duplicateNoteFolder` |
| `noteSaveKind(prev, next)` | `meta` si cambió título, tags, carpeta o fijado; `content` si solo el contenido; `none` si nada. | `stampNoteSave` |
| `NoteUpdatedThrottle` | Límite de D1 por nota (R13–R15). | store (`noteUpdatedThrottle`) |
| `stampNoteSave(prev, next, throttle, { leaving })` | La nota a guardar, con `updated` sellado o con el del store. | `updateNote` |

`moveNote` sella `updated` al momento (R13) y lo registra en el límite.
`toggleNotePin`, `renameNote` y los tags pasan por `updateNote`, que los ve
como `meta`.

### El límite de D1

- **Vive en el store, no en el editor.** El editor autoguarda cada 600 ms y
  antes cada guardado sellaba `updated`: un PATCH de metadatos por guardado
  (más su eco) y la nota saltando en "ordenar por edición". Con el límite en
  `updateNote`, el `.md` sigue guardando el contenido en cada autoguardado y
  cualquier llamador (editor, lista, menú) respeta la misma regla.
- **Por nota y por sesión.** `NoteUpdatedThrottle` recuerda cuándo selló
  cada nota y si quedó contenido sin sellar. Un guardado de contenido sella si
  pasaron 60 s desde el último sello (o si la nota no se ha sellado en esta
  sesión); si no, queda pendiente. Crear, duplicar, importar o mover registran
  su sello, así que editar justo después de crear no vuelve a sellar. Un
  cambio de metadatos sella siempre y cubre lo pendiente. Un guardado sin
  cambios conserva el `updated` del store: no hay PATCH.
- **Sello final.** `updateNote(note, { leaving: true })` sella lo pendiente.
  El editor lo usa al desmontarse (cambio de nota por `key`, cerrar la nota,
  salir de Notas) para el guardado que tenía en espera; si no había ninguno,
  llama a `flushNoteUpdated(id)`, que espera el guardado en curso de esa nota
  (si no, releería la versión de antes y la escribiría encima) y reescribe la
  nota con el sello. Cerrar la ventana solo la oculta (`lib.rs`), así que el
  editor escucha `tauri://close-requested` (el evento crudo, no
  `onCloseRequested`, que destruiría la ventana) y `beforeunload` para hacer
  lo mismo. Salir de la app desde la bandeja (`app.exit`) no da tiempo a JS:
  el contenido ya está guardado, pero el último sello pendiente se pierde.
- Borrar una nota olvida su estado en el límite.

## Decisiones

- **Un `YYYY-MM-DD` es la medianoche local** para ordenar: frente a un
  instante del mismo día, el instante queda como más reciente. Es lo más
  cercano a "ese día" sin inventar una hora.
- **No se normaliza al leer** (R7): convertir el legado a instante inventaría
  una hora y cambiaría el valor guardado, lo que el sync vería como una
  edición de cada tarea y nota.
- **`formatPreviewDate` aparte del componente**, para probarlo sin React y
  porque el componente no puede exportar funciones sin romper Fast Refresh.

- **D2 sella al volver a `done` aunque se esté deshaciendo un "reabrir".**
  Ya era así: el deshacer restaura `status` pero no `completedAt`, que no
  cambió en el valor que se pasó a `updateTask`.

## Pruebas

`localDate.test.ts` (helpers, incluido un instante de las 8 p. m. en
Bogotá), `taskListing.test.ts` (orden mixto, `completedLocalDate`, frontera
de semana con un instante del domingo a las 10 p. m.), `noteSort.test.ts`
(orden mixto) y `linkPreviewDate.test.ts` (no lanza con un instante).

Etapa 2: `entityStamps.test.ts` (D2: transición, sigue en `done`, reabrir y
valor viejo; D1 con timers falsos: un sello cada 60 s, sello final al salir,
metadatos al momento, por nota; crear y duplicar escriben instantes) y
`markdown.test.ts` (un instante y un legado sobreviven a escribir y releer
el `.md`).
