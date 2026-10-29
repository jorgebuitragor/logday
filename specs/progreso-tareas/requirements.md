# Progreso de tareas — Requirements

Estado: implementado (29 oct 2026), pendiente de probar en la app.

## Contexto

Las tareas ganan un porcentaje de avance opcional, `progress`. Lo pidió la
extensión de OpenProject (que trae el `percentageDone` de cada work
package), pero es un campo de la tarea, no de la extensión: se ve y se
edita igual en cualquier tarea. El contrato del servidor lo fija
logday-server#15 (`../logday-server/specs/esquema-datos/requirements.md`,
"Progreso de tareas"). Este spec cubre solo el campo en Desktop: llenarlo
desde el importador de OpenProject es trabajo de ese spec
(`specs/openproject/`).

## Requisitos (EARS)

### Modelo

- PR1. `Task.progress` DEBERÁ ser un entero de 0 a 100, u omitirse para
  "sin progreso". Sin progreso NO es lo mismo que 0 %.
- PR2. Todo valor que se guarde o se mande al servidor DEBERÁ pasar antes
  por la normalización: redondeo al entero y límite a 0–100. Así el
  cliente nunca recibe el 400 `progress must be an integer between 0 and
  100, or null`, que la cola de sync descartaría como fallo permanente.

### Archivo `.md`

- PR3. Con progreso, el frontmatter DEBERÁ llevar `progress: <entero>`.
  Sin progreso, la clave NO DEBERÁ escribirse; borrar el progreso la quita
  del archivo.
- PR4. Al leer, el valor DEBERÁ aceptarse con tolerancia, porque el `.md`
  se puede editar a mano: un número con decimales se redondea, uno fuera
  de rango se lleva al borde (150 → 100, -5 → 0) y un `%` al final se
  ignora (`75%` → 75). Lo que no es un número (vacío, `null`, texto)
  DEBERÁ leerse como sin progreso.

### Sync

- PR5. `POST /tasks` DEBERÁ llevar `progress` siempre: el entero, o `null`
  sin progreso.
- PR6. `PATCH /tasks/{id}` DEBERÁ llevar `progress` solo si cambió en esa
  edición (LWW por campo), con `null` para borrarlo.
- PR7. Al aplicar una respuesta del servidor o un cambio de
  `/sync/changes`, `progress: null` y la clave ausente (servidores
  anteriores a logday-server#15) DEBERÁN leerse como sin progreso, y
  reemplazar el valor local salvo que haya una edición de `progress` más
  nueva en la cola (regla de prioridad de `specs/sync-servidor/`).

### UI

- PR8. La fila de la lista y la tarjeta del Kanban DEBERÁN mostrar, solo
  si la tarea tiene progreso (0 % incluido), una barra fina con el
  porcentaje al lado, en el color de acento del tema.
- PR9. El panel de la tarea DEBERÁ tener un campo "Progreso" con un
  slider y un número (0–100) y un botón para quitarlo. Sin progreso, el
  campo muestra "Sin progreso"; al pulsarlo aparece el control sin guardar
  nada hasta que se elige un valor.
- PR10. El campo DEBERÁ usar los borradores por campo del panel
  (`useFieldDrafts`): un cambio remoto de `progress` se adopta si el
  usuario no lo está editando, y no se pisa si lo está.
