# Papelera de reciclaje — Requirements

Estado: implementado (baseline) — local por instalación y compartida
entre instalaciones de Logday Desktop del mismo usuario. Compartida
entre servicios (`logday-web`, mobile) queda pendiente, ver
"Fuera de alcance" abajo y los specs equivalentes en `logday-server` y
`logday-web` (`specs/papelera-compartida/requirements.md` en ambos).

## Contexto

Antes de esto, borrar un Task/Note/OvertimeEntry/entrada de Daily era
inmediato e irreversible (`fs.deleteFile`/reescritura directa del
archivo). Al validar el sync de contenido de notas se encontró además
un bug de resurrección (`applyRemoteTaskChange`/`applyRemoteNoteChange`/
etc. pueden recrear una entidad borrada si un pull de `/sync/changes`
corre antes de que el DELETE se confirme del lado servidor) — se dejó
ese bug como pendiente a propósito, y en su lugar se construyó esta
papelera real.

## Requisitos (EARS)

### Modelo

- El sistema DEBERÁ guardar cada entidad borrada como un snapshot JSON
  en `<basePath>/.trash/<entidad>/<key>.json` (`src/lib/trash.ts`) —
  mecanismo uniforme para las 4 entidades, en vez de "mover el
  archivo" (Task/Note, un archivo por entidad) vs. "sintetizar un
  registro" (OvertimeEntry/Daily, que viven dentro de un archivo
  compartido por mes).
- El sistema DEBERÁ preservar el DELETE al servidor exactamente como
  antes de esta feature — la papelera es un paso previo al borrado
  real, nunca un reemplazo del tombstone remoto.
- Una nota vacía (sin título ni contenido) descartada automáticamente
  (ver flujos de "descartar nota vacía" en `selectNoteFolder`/
  `setSection`/`NoteList`) NO DEBERÁ generar un registro de papelera —
  no es un borrado real del usuario.
- El snapshot de una `Note` NO DEBERÁ preservar su `.ydoc` (estado
  CRDT) — al restaurar, la nota vuelve a comportarse como una nota que
  todavía no tocó CRDT y se re-siembra su `Y.Text` desde `content` en
  el primer guardado (mismo camino de bootstrap que las notas
  anteriores a la fase CRDT).

### Retención

- El sistema DEBERÁ purgar para siempre lo que supere 60 días en la
  papelera, **solo si** el usuario tiene la purga automática
  habilitada (`trashAutoPurgeEnabled` en `AppConfig`, default
  habilitada) — el número de días (60) no es configurable, solo el
  on/off.
- El usuario DEBERÁ poder vaciar la papelera manualmente en cualquier
  momento, sin importar el estado de la purga automática.
- El sistema DEBERÁ correr una pasada de purga al iniciar la app (no
  esperar al primer tick del intervalo) y periódicamente mientras esté
  abierta (cada 6 horas — la ventana de 60 días no exige más
  frecuencia).

### Compartida entre instalaciones desktop

- El sistema DEBERÁ capturar un snapshot de papelera también cuando un
  delete de Task/Note/OvertimeEntry llega por `/sync/changes` desde
  OTRA instalación desktop del mismo usuario (no solo cuando el borrado
  es local) — sin ningún cambio del lado servidor, aprovechando que
  `/sync/changes` ya manda la fila completa de cada delete a todos los
  dispositivos.
- `daily_entry` NO DEBERÁ participar de esto — no tiene sync con el
  servidor todavía (ver `specs/sync-primer-sincronizacion`, "mismatch
  de modelo local").

### Restaurar

- Restaurar Task/Note/OvertimeEntry DEBERÁ volver a mandar un `CREATE`
  al servidor con el mismo `id` que tenía antes de borrarse —
  confirmado por código real (`internal/note|task|overtime/store.go`
  de `logday-server`, `ON CONFLICT(id) DO UPDATE ... deleted_at =
  NULL`) que esto revive el tombstone en vez de rechazarlo, no es un
  supuesto sin verificar.
- Restaurar una entrada de Daily NO DEBERÁ disparar ninguna llamada de
  red — no tiene sync hoy.

## Fuera de alcance (pendiente)

- Papelera compartida entre **servicios** (`logday-web`, mobile) — hoy
  cada servicio tendría su propia papelera local si la implementara;
  ver `specs/papelera-compartida/requirements.md` en `logday-server` y
  `logday-web` para el estado de esa extensión.
- Borrados masivos (`deleteDailyMonth` y equivalentes) — quedan
  permanentes, sin pasar por la papelera.
- Un endpoint de hard-delete real en el servidor — "vaciar papelera"
  hoy solo deja de mostrar el ítem localmente, el registro sigue
  soft-deleted en el servidor para siempre.
- El bug de resurrección de `applyRemoteTaskChange`/etc. (encontrado
  durante la validación de esta feature, pero es un problema distinto
  del motor de sync, no de la papelera) — sigue sin fix, a propósito.
