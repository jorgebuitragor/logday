# Fechas de creación, edición y completado — Design

## Helpers (`src/lib/localDate.ts`)

Los mismos nombres que en Web y Mobile:

| Función | Qué hace |
|---|---|
| `nowInstant()` | `new Date().toISOString()`. Para la etapa 2. |
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

## Decisiones

- **Un `YYYY-MM-DD` es la medianoche local** para ordenar: frente a un
  instante del mismo día, el instante queda como más reciente. Es lo más
  cercano a "ese día" sin inventar una hora.
- **No se normaliza al leer** (R7): convertir el legado a instante inventaría
  una hora y cambiaría el valor guardado, lo que el sync vería como una
  edición de cada tarea y nota.
- **`formatPreviewDate` aparte del componente**, para probarlo sin React y
  porque el componente no puede exportar funciones sin romper Fast Refresh.

## Pruebas

`localDate.test.ts` (helpers, incluido un instante de las 8 p. m. en
Bogotá), `taskListing.test.ts` (orden mixto, `completedLocalDate`, frontera
de semana con un instante del domingo a las 10 p. m.), `noteSort.test.ts`
(orden mixto) y `linkPreviewDate.test.ts` (no lanza con un instante).
