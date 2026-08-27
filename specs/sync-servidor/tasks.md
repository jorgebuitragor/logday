# Sync con servidor — Tareas

Estado: implementado. Las 7 entidades (Task, Note, OvertimeEntry,
OvertimeMonthMeta, CalendarEvent, AbsenceDay, DailyEntry) sincronizan
create/patch/delete, cursor+reconciliación, tiempo real (WS) y — para
Note/DailyEntry — contenido largo vía CRDT, todo validado contra un
server real. Migración de datos existentes y renovación automática de
sesión también implementadas (ver "Estado final" al final de este
archivo). `logday-server` ya implementa
[`lww-por-campo`](https://github.com/jorgebuitragor/logday-server/tree/main/specs/lww-por-campo)
(mergeado a `main`, release `v1.1.0`) — el `PATCH` parcial ya existe
del lado servidor, este spec ya no está bloqueado por eso.

## Decisiones (ya tomadas, ver `requirements.md`/`design.md`)

- [x] Decidir capa de red: REST vía comandos Rust propios con
      `reqwest` (ya es dependencia — mismo patrón que
      `fetch_image_base64`), no `@tauri-apps/plugin-http` (evita
      duplicar la forma de resolver CORS que el proyecto ya tiene).
      WS sí usa `@tauri-apps/plugin-websocket` — ahí no hay convención
      propia que romper. Ver "Capa de red" en `design.md` (decisión
      revisada tras encontrar `fetch_image_base64` en `src-tauri`).
- [x] Decidir dónde vive el código: `src/lib/sync.ts` +
      `src/lib/syncQueue.ts`, paralelo a `invoke.ts`; UI como tab
      `'sync'` inline en `SettingsModal.tsx` (`GitModal.tsx` es código
      huérfano, sin usar — el tab `'git'` inline es el patrón real de
      esta rama; el split a `*Tab.tsx` vive en `feature/1.1.0`, sin
      mergear).
- [x] Decidir persistencia de la cola offline: `localStorage`, mismo
      mecanismo que el resto del config del store (`gitConfig`, etc.)
      — no un archivo separado.
- [x] Decidir regla de prioridad cola vs. respuesta tardía: no
      sobreescribir un campo con la respuesta de un `PATCH` viejo si ya
      hay una entrada más nueva en cola para ese mismo campo.
- [x] Decidir backoff de reconexión WS: exponencial con techo en 30s,
      reintento indefinido.
- [x] Decidir mecanismo CRDT: `@tiptap/extension-collaboration` + `yjs`,
      aprovechando que el editor ya usa Tiptap. Ver "CRDT" más abajo
      (decisión revisada al implementar — el shared type de esa
      extensión no es compatible con el protocolo real del servidor).
- [x] Decidir principio de resolución de conflictos: el cliente nunca
      decide ni pregunta — siempre sobreescribe con lo que el servidor
      devuelve.

## Implementación

### Dependencias nuevas

- [x] Agregar `@tauri-apps/plugin-websocket` (+ permiso en
      `src-tauri/capabilities/default.json`). REST no agrega
      dependencia JS nueva — son comandos Rust.
- [x] Agregar `yjs`. `@tiptap/extension-collaboration` **no** se
      agregó — decisión revisada al implementar CRDT, ver esa sección
      más abajo y `design.md`.

### Comandos Rust (REST)

- [x] `src-tauri/src/lib.rs`: comando `sync_request(base_url, method,
      path, token, body)` — mismo patrón que `fetch_image_base64`,
      registrado en `invoke_handler`. `cargo check` en verde.
- [x] `src/lib/invoke.ts`: wrapper `syncRequest(...)`.

### Config y auth

- [x] Tab `'sync'` inline en `SettingsModal.tsx` (`GitModal.tsx` es
      código huérfano sin usar — el patrón real es el tab `'git'`
      dentro del propio modal, ver `design.md`): URL del servidor,
      login, estado de conexión, logout. i18n (`es`/`en`) agregado en
      `src/lib/i18n.ts` namespace `extras` + `settings.tabSync`.
- [x] Tipos de config (`SyncConfig`, `SyncConnectionStatus`) agregados
      a `src/types/index.ts` (monolítico en esta rama, no un archivo
      `sync.ts` separado — mismo criterio que `GitConfig`).
- [x] `src/lib/sync.ts`: `login`/`refreshToken` (`POST /auth/login` y
      `/auth/refresh` vía el comando Rust), `SyncApiError`.
- [x] Persistencia del token vigente en `localStorage`
      (`syncConfig`), mismo mecanismo que `gitConfig`.
- [x] `appStore.ts`: estado `syncConfig`/`syncConnectionStatus`/
      `syncErrorMsg`/`isSyncOpen`, acciones `syncConnect`/
      `syncDisconnect`/`toggleSync`/`openSettingsSyncTab`.
- [x] Bug encontrado y corregido: `reqwest` (Rust) exige esquema en la
      URL — `localhost:8080` (sin `http://`, lo natural de tipear)
      fallaba con "builder error for url". Fix:
      `normalizeServerUrl()` en `src/lib/sync.ts`, agrega `http://` si
      falta; `appStore.syncConnect` guarda la URL ya normalizada.
- `tsc --noEmit` y `cargo check` en verde en todo momento.

### Mapeo de entidades

- [x] Funciones de (de)serialización por entidad: `Task`, `Note`
      (metadata, sin `content`), `OvertimeEntry`, `OvertimeMonthMeta`,
      `CalendarEvent`, `AbsenceDay` — tipo local ↔ payload REST del
      servidor, excluyendo `filePath`/`linked_paths`.
      `src/lib/syncMapping.ts`: por entidad, `xToCreatePayload`
      (local → POST body completo), `xFieldsToPatchPayload`
      (`Partial<X>` → PATCH body, solo campos presentes — usa `'campo'
      in fields` para distinguir "no cambió" de "se limpió a null/''",
      igual que el `Field[T]` del servidor) y `xFromApiResponse`
      (respuesta → tipo local, sin `filePath`/`content`/`linked_paths`).
      `OvertimeMonthMeta` no tiene `xToCreatePayload` — el servidor no
      tiene POST propio, el primer PATCH crea si no existe (año-mes va
      en la URL, no en el tipo local). `tsc`/`eslint` en verde.

### Escritura y cola offline

Implementado y validado contra un server real para las 7 entidades:
Task fue la primera (create vía cola offline, patch en vivo, delete —
probados a mano por el usuario y confirmados por `curl` del lado del
servidor); Note, CalendarEvent, AbsenceDay y OvertimeEntry replicaron
el mismo patrón y también quedaron validadas. OvertimeMonthMeta y
DailyEntry, que habían quedado pendientes por un desajuste de modelo
local (`OvertimeMonthMeta` es un único objeto global
`{colaborador, cedula}` vs. un registro por `year_month` del lado
servidor — ver `specs/sync-primer-sincronizacion`), se resolvieron: el
mapeo/HTTP ya existía sin usar en `syncMapping.ts`/`sync.ts`, solo
faltaba el wiring (`dispatchQueuedWrite`, `applyRemoteChanges`, hook en
`setOvertimeMeta` con debounce). Local se trata como "la meta del mes
visible" — un cambio remoto de otro mes se ignora a propósito.
Validado contra el server real (logs + DB): `PATCH` de
overtime-month-meta y `PUT`/`DELETE`/`PUT` de daily-entries con fecha
real (create, editar, borrar, revivir).

- [x] `src/lib/syncQueue.ts`: cola persistida en **`localStorage`**
      (no `configDir` — corrección ya hecha en design.md, este bullet
      tenía el texto viejo), encolar al editar sin conexión, drenar en
      orden al reconectar. `QueuedWrite` incluye `op:
      'create'|'patch'|'delete'` — PATCH no crea-si-no-existe salvo
      `overtime_month_meta`, así que una entidad creada offline tiene
      que drenar como `create` (POST), no `patch`, o el servidor la
      rechaza con 404.
- [x] Detección de campos cambiados por acción de usuario — Task:
      `diffTaskFields` en `appStore.ts` compara `prev` vs. el objeto
      completo que llega a `updateTask` (que ya es el save-point real,
      se llama al blur del editor, no por keystroke) y arma el
      `Partial<Task>` de lo que de verdad cambió.
- [x] Integrar `POST`/`PATCH`/`DELETE` en las acciones existentes del
      store — hecho para las 5 entidades con mapeo local completo
      (`createTask`/`updateTask`/`deleteTask`,
      `createNote`/`updateNote`/`deleteNote`,
      `saveCalendarEvent`/`deleteCalendarEvent`,
      `saveAbsenceDay`/`deleteAbsenceDay`,
      `saveOvertimeEntry`/`deleteOvertimeEntry`): conectado y sin cola
      → envío directo, con "sobreescribir con la respuesta" vía
      `applyXResponse`; sin conexión o si el envío falla →
      `syncQueue.enqueue`. OvertimeMonthMeta usa el mismo patrón desde
      `setOvertimeMeta` (ver nota de arriba).
- [x] Regla de prioridad cola vs. respuesta tardía — `applyXResponse`
      (una por entidad) solo sobreescribe cada campo local si no hay
      una entrada en cola más nueva para ese mismo campo
      (`syncQueue.hasNewerQueuedField`), tanto al aplicar una
      respuesta en vivo como al drenar (`sendQueuedWrite` despacha a
      la función de la entidad correspondiente).
- [x] Bug encontrado y corregido al replicar a Note: `createNote()`
      local permite título vacío (se completa después), pero el
      servidor rechaza `title` vacío con 400 — un `catch` genérico
      trataba ese rechazo permanente como transitorio y lo dejaba
      encolado para siempre. Fix en dos partes: `syncCreateNote` manda
      `'Sin título'` en el payload cuando el título local está vacío
      (mismo placeholder que ya usa logday-web, no toca el archivo
      local), y `syncQueue.drainQueue` distingue fallo permanente
      (4xx, se descarta) de transitorio (excepción, corta el drenado).

### Cursor y reconciliación

Implementado y validado contra un server real para las 7 entidades:
Task primero (curl simulando un cambio remoto, reconectar, verlo
aparecer solo — ver nota de validación más abajo), luego Note,
CalendarEvent, AbsenceDay y OvertimeEntry con el mismo patrón.
OvertimeMonthMeta y DailyEntry, que en un momento se ignoraban a
propósito en `applyRemoteChanges` (desajuste de modelo el primero, sin
tipo local el segundo), ya se resolvieron y están wireados igual que
el resto — ver la nota en "Escritura y cola offline" arriba.

- [x] Persistir `seq` local — `localStorage`, clave `syncCursor`
      (`getSyncCursor`/`setSyncCursor` en `appStore.ts`), mismo
      mecanismo que el resto (`gitConfig`, `syncConfig`, la cola).
- [x] `GET /sync/changes` al reconectar (`reconcileSync`, llamado
      desde `syncConnect` después de drenar la cola local) y
      periódicamente (`setInterval` cada 30s mientras haya sesión,
      `startReconcileInterval`/`stopReconcileInterval` — stand-in
      hasta que exista WebSocket en la fase "Tiempo real"). Aplica
      cada entidad recibida sobreescribiendo el estado local
      (`applyRemoteTaskChange`/`applyRemoteNoteChange`/
      `applyRemoteCalendarEventChange`/`applyRemoteAbsenceDayChange`/
      `applyRemoteOvertimeEntryChange`, despachadas por
      `applyRemoteChanges` según `change.type`): entidad nueva (nunca
      vista acá) se crea localmente; existente se actualiza; borrada
      del lado del servidor borra el archivo/entrada local.
      OvertimeEntry vive en archivos por mes — el array en memoria
      solo se actualiza si el mes remoto es el que el usuario tiene
      abierto, para no pisarle la vista actual con datos de otro mes.
      Note: `content` nunca se toca acá — viaja por el mecanismo CRDT
      separado (ver sección "CRDT" más abajo), no por
      `/sync/changes`. Este pull preserva el contenido local, vacío
      para una nota nueva creada desde un cambio remoto.
- [x] Manejo de "cursor inválido": un `410` de `/sync/changes`
      descarta el cursor guardado y reintenta con `since=0` (full
      resync). Las escrituras locales no confirmadas quedan
      protegidas por la misma regla de prioridad que ya usa
      `applyTaskResponse` (cualquier campo con una entrada en la cola
      offline no se pisa con el valor remoto, sin importar hace
      cuánto se encoló — ver `EPOCH` en `appStore.ts`).

Validado a mano por el usuario: creada una task por `curl` (simulando
un cambio desde otro cliente, p. ej. logday-web) mientras Desktop
estaba desconectado; al reconectar, apareció sola sin que el usuario
hiciera nada más — confirma el sentido que faltaba (antes solo Desktop
→ servidor funcionaba, no al revés).

### Tiempo real

- [x] Conexión WS vía `@tauri-apps/plugin-websocket`, mensaje de auth
      inicial, backoff de reconexión (`1s..30s`, reset al primer
      mensaje que pruebe que la conexión sigue viva autenticada). El
      poll de 30s sigue activo como red de respaldo, no se retiró.
      `init()` reconecta solo si hay sesión guardada, sin volver a
      entrar a Ajustes tras reiniciar la app.
- [x] Al recibir aviso: dispara reconciliación vía `/sync/changes`
      (`reconcileSync`), no aplica el payload del aviso directamente.
      Bugs encontrados y corregidos validando contra el server real:
      un cierre "sucio" del socket (`CloseNow` tras auth fallido) lo
      serializa el plugin como string plano, no `{type:'Close'}` — sin
      manejarlo la conexión quedaba huérfana y bloqueaba todo
      reintento futuro; el backoff no se resetea en un cierre, solo en
      mensajes que confirman sesión viva, o un token inválido
      reintentaría cada 1s sin escalar; `beforeunload` desconecta el
      socket al recargar/cerrar el webview.

### CRDT (contenido de notas y entradas diarias)

El diseño original (`@tiptap/extension-collaboration` integrado en
`RichTextEditor.tsx`) se descartó al implementar — ver "Decisión
revisada" en `design.md`, sección CRDT, para el porqué (shared type
incompatible con el protocolo real del servidor). Lo implementado:

- [x] `Y.Doc` con un `Y.Text` plano (key `"content"`, misma key que
      `ygo` del lado servidor y `logday-web`) por nota/entrada diaria
      — no integrado al estado interno de Tiptap. `applyTextEdit`
      diffea Markdown anterior vs. nuevo en cada guardado y lo aplica
      al `Y.Text`, puerto directo de `applyTextareaEdit` de
      `logday-web`.
- [x] Serializar (`Y.encodeStateAsUpdate`) y mandar a
      `POST /notes/:id/content` (Note) / `PUT` de daily-entries
      (entrada diaria) al guardar, vía `contentSyncQueue.ts` —
      coalescida por entidad, no un update por keystroke.
- [x] Aplicar updates remotos (`Y.applyUpdate`) recibidos por
      `/sync/changes` o WS — como el `Y.Doc` no vive dentro de Tiptap,
      no hay posición de cursor que preservar en el sentido original
      del diseño; si el documento está abierto, se re-hidrata desde el
      estado actualizado.
- [x] Confirmado: la derivación a Markdown en disco sigue funcionando
      sin cambios de formato — el `Y.Doc` es un espejo que se
      actualiza al guardar, el Markdown sigue siendo la fuente de
      verdad del archivo local.

Validado manualmente: nota creada en Desktop con contenido visible en
`logday-web`, y edición hecha en `logday-web` reflejada en Desktop
(contenido + archivo `.ydoc` verificados a nivel de byte).

**Hueco conocido, no resuelto**: si el pull periódico de
`/sync/changes` corre entre que el usuario borra una entidad
localmente y el servidor confirma el `DELETE`, el registro puede
revivir localmente — no hay tombstone local que lo evite. No es
específico de CRDT, aplica al motor de sync en general.

### Sesión y migración (no estaban en el checklist original)

- [x] `withSyncAuth` renueva el access token en silencio contra el
      refresh token cuando vence, en vez de fallar con 401 sin
      recuperarse. Bugs encontrados y corregidos validando contra un
      server real: una llamada rezagada podía reusar un refresh token
      ya rotado por otra llamada, y el servidor revocaba el
      dispositivo entero; un error de red al renovar (no
      necesariamente un refresh token muerto) desconectaba la sesión
      igual que un 401 genuino — causaba cierres de sesión cada pocos
      minutos, coincidiendo con cada vencimiento del access token de
      15 min más cualquier hipo de red.
- [x] Migración de datos existentes: `src/lib/syncMigration.ts` sube a
      un servidor recién conectado todo lo que ya existía en local
      (tasks, notes con contenido CRDT, overtime, daily entries)
      sin pisar nada que el servidor ya tenga. Extiende el alcance de
      `sync-primer-sincronizacion/design.md` (esa spec dejaba
      contenido de Note/DailyEntry para una fase futura) — ver ese
      spec, ya actualizado para reflejar la implementación real.
- [x] Panel de sesiones activas en la pestaña Sync (`GET`/`DELETE
      /devices`, mismo endpoint que ya usa `logday-web`): lista
      dispositivos, marca la sesión actual comparando contra
      `syncConfig.deviceId`, revocar la propia sesión desconecta el
      sync local de inmediato.
- [x] Sincronización manual (botón "Sincronizar ahora", estilo
      Bitwarden): llama al mismo `reconcileSync`/drenado de cola que
      ya corre solo, con feedback visible y enfriamiento de 8s entre
      clicks.
- [x] Confirmación al desconectar (mismo patrón
      `useConfirmDelete`/`ConfirmDeleteModal` que el resto de la app).

### Validación

- [x] `tsc`/`cargo check`/`eslint`/`vite build` en verde en cada
      commit de esta rama.
- [ ] Prueba manual: dos instancias de la app (o una app + `curl`
      directo al servidor) editando la misma tarea en campos distintos
      sin verse, offline y reconectando, confirmando que ninguna
      edición se pierde y no aparece ningún diálogo de conflicto. No
      se hizo esta prueba puntual — lo más parecido validado fue
      Desktop + `curl`/`logday-web` en momentos distintos, no dos
      clientes escribiendo en simultáneo real.
- [ ] Prueba manual: dos notas editando el mismo párrafo en simultáneo
      contra un servidor real, confirmar merge CRDT visible (texto de
      ambos, no uno pisando al otro). Lo validado fue Desktop
      creando/editando y `logday-web` editando después (secuencial,
      no simultáneo) — el merge CRDT en sí nunca se estresó con
      escritura concurrente real.
- [ ] Prueba manual offline→online: editar sin red, cerrar la app,
      reabrir, reconectar — confirmar que la cola persistida se drena
      igual.

## Estado final (2026-08-27)

Todas las fases de este spec están implementadas: Config y auth,
Mapeo de entidades, Escritura y cola offline, Cursor y reconciliación,
Tiempo real, CRDT, y las extras que se sumaron en el camino (Sesión y
migración). Las 7 entidades sincronizan de punta a punta y quedaron
validadas contra un servidor real en algún momento del desarrollo —
ver el detalle de validación de cada sección arriba.

Lo que sigue genuinamente abierto, no por falta de tiempo sino porque
son huecos/decisiones reales:

- **Tombstone de deletes en carrera** (ver nota en "CRDT" arriba): un
  pull de `/sync/changes` que corre justo entre un delete local y su
  confirmación del servidor puede revivir el registro. Aplica a las 7
  entidades, no solo a las que tienen CRDT.
- **Las 3 pruebas manuales de "Validación"** sin marcar — multi-cliente
  concurrente real (misma entidad, dos escritores al mismo tiempo) y
  offline→online tras cerrar/reabrir la app nunca se estresaron
  literalmente como describe cada bullet.
- **Papelera compartida entre servicios** (no solo entre instalaciones
  Desktop) — deliberadamente fuera de este spec, ver
  `specs/papelera-reciclaje/requirements.md` de este repo y los specs
  equivalentes en `logday-server`/`logday-web`.

Este archivo dejó de actualizarse por varios commits seguidos (última
edición real: 2026-08-23, con trabajo real hasta el 2026-08-26) —
ver `git log --oneline -- specs/sync-servidor/` de este repo si hace
falta reconstruir qué pasó en qué commit. Iba en contra de la
convención del propio `specs/README.md` ("actualiza el spec en el
mismo PR que el código") — esta actualización es la puesta al día,
no una fase nueva.
