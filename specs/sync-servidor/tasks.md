# Sync con servidor — Tareas

Estado: en diseño — nada implementado todavía. `logday-server` ya
implementa
[`lww-por-campo`](https://github.com/jorgebuitragor/logday-server/tree/main/specs/lww-por-campo)
(mergeado a `main`, release `v1.1.0`) — el `PATCH` parcial ya existe
del lado servidor, este spec ya no está bloqueado.

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
      aprovechando que el editor ya usa Tiptap.
- [x] Decidir principio de resolución de conflictos: el cliente nunca
      decide ni pregunta — siempre sobreescribe con lo que el servidor
      devuelve.

## Implementación

### Dependencias nuevas

- [ ] Agregar `@tauri-apps/plugin-websocket` (+ permiso en
      `src-tauri/capabilities/default.json`). REST no agrega
      dependencia JS nueva — son comandos Rust.
- [ ] Agregar `yjs`, `@tiptap/extension-collaboration`.

### Comandos Rust (REST)

- [ ] `src-tauri/src/lib.rs`: comando(s) `sync_request` (o uno por
      verbo) que reciben método/path/body/token y hacen la llamada con
      `reqwest`, devolviendo status+body al frontend — mismo patrón
      que `fetch_image_base64`. Registrar en el `invoke_handler` junto
      a los demás comandos.
- [ ] `src/lib/invoke.ts`: wrapper(s) que llaman a ese comando,
      análogo a las funciones de `fs` existentes.

### Config y auth

- [ ] Tab `'sync'` inline en `SettingsModal.tsx` (`GitModal.tsx` es
      código huérfano sin usar — el patrón real es el tab `'git'`
      dentro del propio modal, ver `design.md`): URL del servidor,
      login, estado de conexión, logout.
- [ ] `src/types/sync.ts`: tipos de config (URL, token, estado).
- [ ] `src/lib/sync.ts`: login (`POST /auth/login` vía el comando
      Rust), refresh de token.
- [ ] Persistencia del token vigente en `localStorage`, mismo
      mecanismo que `gitConfig` — sin storage "seguro" distinto, ver
      `design.md`.

### Mapeo de entidades

- [ ] Funciones de (de)serialización por entidad: `Task`, `Note`
      (metadata, sin `content`), `OvertimeEntry`, `OvertimeMonthMeta`,
      `CalendarEvent`, `AbsenceDay` — tipo local ↔ payload REST del
      servidor, excluyendo `filePath`/`linked_paths`.

### Escritura y cola offline

- [ ] `src/lib/syncQueue.ts`: cola persistida en `configDir`, encolar
      al editar sin conexión, drenar en orden al reconectar.
- [ ] Detección de campos cambiados por acción de usuario (qué dispara
      un `PATCH`: cada save-point del store, no cada keystroke).
- [ ] Integrar `POST`/`PATCH`/`DELETE` en las acciones existentes del
      store (`appStore.ts`) para cada entidad, aplicando "sobreescribir
      con la respuesta" tras cada llamada exitosa.
- [ ] Regla de prioridad cola vs. respuesta tardía (ver Decisiones).

### Cursor y reconciliación

- [ ] Persistir `seq` local (dónde — archivo de config o junto a la
      cola).
- [ ] `GET /sync/changes` al reconectar y periódicamente; aplicar cada
      entidad recibida sobreescribiendo el estado local.
- [ ] Manejo de "cursor inválido": descartar cursor, full resync,
      preservando escrituras locales no confirmadas.

### Tiempo real

- [ ] Conexión WS vía `@tauri-apps/plugin-websocket`, mensaje de auth
      inicial, backoff de reconexión.
- [ ] Al recibir aviso: disparar reconciliación vía `/sync/changes`
      (no aplicar el payload del aviso directamente).

### CRDT (contenido de notas y entradas diarias)

- [ ] Integrar `@tiptap/extension-collaboration` en `RichTextEditor.tsx`
      con un `Y.Doc` por documento abierto.
- [ ] Serializar (`encodeStateAsUpdate`) y mandar a
      `POST /notes/:id/content` / equivalente de entradas diarias al
      guardar.
- [ ] Aplicar updates remotos (`Y.applyUpdate`) recibidos por
      `/sync/changes` o WS sin perder la posición del cursor si el
      documento está abierto.
- [ ] Confirmar que la derivación a Markdown en disco (formato local
      existente) sigue funcionando a partir del estado de Tiptap, sin
      cambios en el formato de archivo.

### Validación

- [ ] `pnpm lint` / `tsc` en verde.
- [ ] Prueba manual: dos instancias de la app (o una app + `curl`
      directo al servidor) editando la misma tarea en campos distintos
      sin verse, offline y reconectando, confirmando que ninguna
      edición se pierde y no aparece ningún diálogo de conflicto.
- [ ] Prueba manual: dos notas editando el mismo párrafo en simultáneo
      contra un servidor real, confirmar merge CRDT visible (texto de
      ambos, no uno pisando al otro).
- [ ] Prueba manual offline→online: editar sin red, cerrar la app,
      reabrir, reconectar — confirmar que la cola persistida se drena
      igual.
