# Fechas de creación, edición y completado — Requirements

Estado: en progreso. Etapa 1 (leer los dos formatos) implementada; etapa 2
(escribir instantes) pendiente.

Decisión cross-cliente en el vault: `02 Decisiones/Fechas de creación y
edición como instantes ISO.md`.

## Contexto

`created` y `completedAt` de las tareas, y `created` y `updated` de las
notas ("marcas") llegan en dos formatos al mismo campo:

- **Instante UTC** con el formato de `toISOString()`
  (`2026-10-28T01:00:00.000Z`). Lo escribe Mobile y será el formato de todos.
- **`YYYY-MM-DD` legado**: lo que Desktop y Web escribían. Es esa fecha de
  calendario en la zona local de quien lo lee. No se migra nunca.

Antes de esta etapa Desktop solo entendía el segundo: la vista previa de un
enlace a una nota editada en Mobile cerraba la app (`RangeError`), las
fechas se veían crudas en UTC, las tareas completadas el domingo de noche no
contaban en "hechas esta semana" y el orden por fecha salía mal.

Las fechas de calendario (`due`, horas extra, dailys, ausencias, eventos)
no cambian: siguen siendo `YYYY-MM-DD` local.

## Requisitos (etapa 1: leer ambos formatos)

- R1. El sistema DEBERÁ aceptar en cada marca un instante o un `YYYY-MM-DD`.
  Un `YYYY-MM-DD` DEBERÁ leerse como esa fecha en la zona local; nunca
  pasando por `new Date('YYYY-MM-DD')`, que lo toma como UTC.
- R2. CUANDO se muestre una marca (panel de la tarea, lista y editor de
  notas, actividad reciente del Dashboard, vista previa de enlaces), el
  sistema DEBERÁ mostrarla como su día local, con el mismo aspecto que antes.
- R3. CUANDO se ordene por una marca (tareas por creación, hechas por
  completado, notas por creación o edición, carga de tareas y notas,
  Dashboard), el sistema DEBERÁ ordenar por el momento que representa, no
  comparando strings de formatos mezclados. Una marca vacía o inválida
  queda como la más antigua.
- R4. CUANDO se filtre por rango de días ("hechas esta semana" del
  Dashboard, hechas recientes del Kanban), el sistema DEBERÁ comparar el día
  local de la marca. La semana va de lunes a domingo en hora local.
- R5. `completedAt` SOLO DEBERÁ contar si la tarea está `done`.
- R6. SI una marca está vacía o es inválida, el sistema NO DEBERÁ lanzar
  errores: no se muestra fecha (o se muestra el valor crudo donde ya era
  así) y se ordena como la más antigua.
- R7. Leer NO DEBERÁ normalizar ni reescribir ningún valor guardado: ni el
  parser del frontmatter ni los mapeos de sync cambian, para no generar
  PATCH espurios.
- R8. En esta etapa Desktop SIGUE escribiendo `YYYY-MM-DD` local.

## Etapa 2 (pendiente)

Escribir instantes con `nowInstant()` en `created`, `completedAt` y
`updated`, cuando Web y Mobile ya lean los dos formatos y la versión de
Desktop con la etapa 1 esté instalada.
