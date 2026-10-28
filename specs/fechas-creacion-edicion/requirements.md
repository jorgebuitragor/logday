# Fechas de creación, edición y completado — Requirements

Estado: implementado. Etapa 1 (leer los dos formatos) y etapa 2 (escribir
instantes, reglas D1 y D2) hechas.

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
- R8. En la etapa 1 Desktop seguía escribiendo `YYYY-MM-DD` local. La
  etapa 2 lo reemplaza (R9).

## Requisitos (etapa 2: escribir instantes)

Las reglas D1 y D2 son decisiones de Jorge y valen igual en Desktop, Web y
Mobile.

- R9. CUANDO el sistema escriba `created` o `completedAt` de una tarea, o
  `created` o `updated` de una nota, DEBERÁ escribir un instante de
  `nowInstant()` (`toISOString()`). Los `YYYY-MM-DD` legados NO DEBERÁN
  migrarse ni reescribirse: una marca guardada solo cambia cuando R10–R15
  lo piden.
- R10. CUANDO se cree una tarea, `created` DEBERÁ ser el instante actual; si
  nace en `done`, `completedAt` DEBERÁ ser ese mismo instante.
- R11 (D2). CUANDO una tarea pase de no-`done` a `done`, `completedAt`
  DEBERÁ ser el instante actual, aunque la tarea traiga un valor viejo de
  otro cliente. MIENTRAS siga en `done`, DEBERÁ conservar su valor. CUANDO
  salga de `done`, DEBERÁ limpiarse.
- R12 (D1). CUANDO se cree, duplique (nota o carpeta) o importe una nota,
  `created` y `updated` DEBERÁN ser el mismo instante actual.
- R13 (D1). CUANDO cambie el título, los tags, la carpeta o el fijado de una
  nota, `updated` DEBERÁ sellarse al momento.
- R14 (D1). MIENTRAS se edite el contenido de una nota, `updated` DEBERÁ
  sellarse como mucho una vez cada 60 s por nota. El `.md` DEBERÁ seguir
  guardando el contenido en cada autoguardado: solo se limita el sello.
- R15 (D1). CUANDO se salga de una nota (cambiar de nota, cerrarla, salir de
  Notas, desmontar el editor o cerrar la ventana), el sistema DEBERÁ sellar
  `updated` SOLO si hubo ediciones de contenido desde el último sello.
- R16. Releer un `.md` o recibir una marca por sync NO DEBERÁ cambiar su
  valor, ni generar un PATCH (el parser, la sync entrante, la papelera y la
  migración copian valores, no los inventan).
