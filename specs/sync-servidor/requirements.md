# Sync con servidor — Requirements

Estado: en diseño

## Contexto

Logday Desktop es hoy 100% local: cada entidad (`Task`, `Note`,
entradas diarias, `OvertimeEntry`, `CalendarEvent`, `AbsenceDay`) vive
como archivo Markdown en `{basePath}/...`, leído/escrito vía Tauri
(`src/lib/invoke.ts`) y mantenido en un único store (`src/store/appStore.ts`).
El único mecanismo de sync existente es el wrapper sobre `git`
(`src/types/git.ts`, `GitSettingsTab`) — sin servidor, sin resolución
de conflictos propia más allá de lo que el propio `git` ofrezca.

Este spec agrega integración opcional con `logday-server` (repo
separado, self-hosted, ver su `specs/arquitectura-inicial/requirements.md`)
como mecanismo de sync entre dispositivos. **No reemplaza** el
almacenamiento local en Markdown — el servidor es un nodo de
sincronización adicional, nunca la fuente de verdad única (mismo
principio local-first que ya define el servidor). Tampoco reemplaza el
sync por `git`, que sigue existiendo como alternativa independiente
para quien prefiera versionar su carpeta sin depender de un servidor.

Depende del protocolo ya definido en el repo `logday-server`:
`sync-incremental/requirements.md` (cursor, `/sync/changes`, WS) y
`lww-por-campo/requirements.md` (escritura vía `PATCH` parcial, el
servidor resuelve conflictos y devuelve la fila completa — el cliente
nunca decide ni pregunta al usuario). Este spec asume esos contratos,
no los redefine.

## Requisitos (EARS)

### Principio rector

- El cliente NO DEBERÁ mostrarle al usuario ningún diálogo de
  "resolver conflicto" en ningún flujo de este spec. Toda resolución
  de conflicto ocurre en el servidor (LWW por campo + CRDT para texto
  largo); el rol del cliente es enviar lo que cambió y aceptar sin
  preguntar lo que el servidor devuelva como estado resultante.
- Cuando la app esté sin conexión al servidor de sync (o sin uno
  configurado), DEBERÁ seguir siendo 100% funcional — ninguna acción
  local DEBERÁ bloquearse o degradarse esperando red.

### Configuración de conexión

- El cliente DEBERÁ permitir configurar, desde Ajustes, la URL de un
  servidor propio y credenciales de login — análogo a `GitSettingsTab`
  existente, no una ventana de onboarding separada.
- El sync DEBERÁ ser opt-in: sin servidor configurado, el
  comportamiento es idéntico al actual (sin cambios visibles).
- El cliente DEBERÁ persistir localmente el token de sesión vigente y
  reautenticar automáticamente al expirar, sin pedirle credenciales al
  usuario en cada arranque.

### Mapeo de entidades

- Cada tipo de entidad local (`Task`, `Note`, `OvertimeEntry`,
  `OvertimeMonthMeta`, `CalendarEvent`, `AbsenceDay`, entrada diaria)
  DEBERÁ mapear 1:1 a su endpoint REST correspondiente en el servidor,
  siguiendo el esquema documentado en `esquema-datos/requirements.md`
  del repo `logday-server`.
- Los campos que son estado puramente local del dispositivo
  (`Task.filePath`, `Task.linked_paths`, `Note.filePath`) NO DEBERÁN
  enviarse al servidor ni esperarse en sus respuestas — ya están
  explícitamente excluidos del lado servidor.
- El `id` de cada entidad DEBERÁ seguir generándose client-side (UUID)
  como ya ocurre hoy, sin cambios — el servidor nunca asigna IDs de
  entidad.

### Escritura hacia el servidor

- Al editar una entidad, el cliente DEBERÁ identificar qué campos
  cambiaron en esa acción puntual del usuario y enviarlos vía
  `PATCH /<entidad>/:id` junto con un único `updated_at` (momento real
  de la edición local) — nunca la fila completa "por las dudas". Ver
  `lww-por-campo/design.md` (repo `logday-server`) para el contrato
  exacto.
- Al crear una entidad nueva, el cliente DEBERÁ enviarla completa vía
  `POST /<entidad>` (sin cambios respecto al protocolo ya definido).
- Al recibir la respuesta de cualquier `PATCH`/`POST`, el cliente
  DEBERÁ sobreescribir su estado local de esa entidad con la fila
  completa que devuelve el servidor, sin excepción — incluidos campos
  que el propio cliente no modificó en esa acción. Es la única regla
  de reconciliación que el cliente necesita conocer para escrituras.
- Al eliminar una entidad, el cliente DEBERÁ llamar
  `DELETE /<entidad>/:id` y aplicar el soft-delete localmente
  (ocultarla, no purgar el archivo local hasta confirmar el tombstone
  vía sync).

### Contenido de texto largo (CRDT)

- `Note.content` y las entradas diarias (`content`) DEBERÁN
  sincronizarse mediante una librería CRDT compatible con Yjs en el
  cliente (`yjs`, paquete npm) — no como texto plano — porque el
  servidor ya implementa el lado servidor con `Deln0r/ygo`,
  específicamente elegido por ser wire-compatible con Yjs. Usar
  cualquier otra representación en el cliente rompe el merge y
  degrada ese campo a LWW de facto.
- El cliente DEBERÁ mantener el documento Yjs como fuente de verdad
  para la edición en curso de esos campos, derivando el Markdown
  guardado en disco a partir de su estado — no al revés.

### Cola de escrituras offline

- Toda escritura realizada sin conexión al servidor DEBERÁ persistirse
  localmente de inmediato (comportamiento actual, sin cambios) y
  encolarse para enviarse cuando vuelva la conectividad.
- Al reconectar, el cliente DEBERÁ drenar la cola en orden de creación
  y aplicar la regla de "Escritura hacia el servidor" a cada una — sin
  lógica especial por haber estado offline: el mismo `PATCH` +
  sobreescritura con la respuesta cubre este caso también.
- Una escritura encolada que pierda parcial o totalmente el LWW contra
  cambios que llegaron primero de otro dispositivo NO DEBERÁ generar
  ningún aviso ni bloqueo — es el mismo riesgo aceptado explícitamente
  en `lww-por-campo/requirements.md` ("Riesgo aceptado"), ahora vía
  cola en vez de escritura inmediata.

### Cursor y reconciliación

- El cliente DEBERÁ persistir localmente el último `seq` procesado y
  usarlo como cursor contra `GET /sync/changes` al reconectar y
  periódicamente.
- Al recibir la señal de "cursor inválido" (tombstones purgados), el
  cliente DEBERÁ descartar su cursor local y traer el estado completo
  desde cero, preservando cualquier escritura local todavía no
  confirmada por el servidor.
- Cada entidad recibida vía `/sync/changes` DEBERÁ aplicarse con la
  misma regla de "el servidor manda": reemplaza el estado local
  correspondiente sin comparación campo por campo del lado cliente.

### Tiempo real

- Con sesión activa, el cliente DEBERÁ mantener una conexión WebSocket
  a `/ws`, autenticando con el mensaje `{"type":"auth","token":"..."}`
  como define el protocolo del servidor.
- Al recibir un aviso de cambio remoto, el cliente DEBERÁ reconciliar
  vía `/sync/changes` desde su cursor — no aplicar el aviso
  directamente.
- Al perder la conexión WS, el cliente DEBERÁ reintentar con backoff
  (estrategia a definir en `design.md`) sin bloquear el uso local de
  la app.

## Fuera de este spec

- Elección concreta de estrategia de backoff para reconexión WS —
  `design.md`.
- UI/UX detallada de la pantalla de configuración de servidor —
  `design.md`.
- Migración de datos existentes (usuarios que ya tienen meses de
  archivos locales) hacia un servidor recién configurado — primer
  sync completo, probablemente requiere su propio spec.
- Multi-dispositivo dentro de la misma sesión de escritorio (no
  aplica: cada instalación de Logday Desktop es un único dispositivo).
- Cualquier UI de resolución manual de conflictos — deliberadamente
  fuera de alcance, ver "Principio rector".
