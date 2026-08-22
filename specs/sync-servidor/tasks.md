# Sync con servidor — Tareas

Estado: en diseño — nada implementado todavía. Depende de que
`logday-server` implemente
[`lww-por-campo`](https://github.com/jorgebuitragor/logday-server/tree/feature/lww-por-campo/specs/lww-por-campo)
(rama `feature/lww-por-campo`, todavía no mergeada) antes de que el
`PATCH` parcial exista del lado servidor.

## Decisiones (ya tomadas, ver `requirements.md`/`design.md`)

- [x] Decidir capa de red: `@tauri-apps/plugin-http` +
      `@tauri-apps/plugin-websocket` (ejecutan del lado Rust, evitan
      CORS por completo) — no `fetch`/`WebSocket` del navegador,
      porque `logday-server` no implementa CORS a propósito.
- [x] Decidir dónde vive el código: `src/lib/sync.ts` +
      `src/lib/syncQueue.ts`, paralelo a `invoke.ts`; nuevo
      `SyncSettingsTab.tsx` hermano de `GitSettingsTab.tsx`.
- [x] Decidir persistencia de la cola offline: archivo JSON en
      `configDir`, no solo en memoria.
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

- [ ] Agregar `@tauri-apps/plugin-http`, `@tauri-apps/plugin-websocket`
      (+ permisos correspondientes en `src-tauri/capabilities/default.json`).
- [ ] Agregar `yjs`, `@tiptap/extension-collaboration`.

### Config y auth

- [ ] `SyncSettingsTab.tsx`: URL del servidor, login, estado de
      conexión, logout.
- [ ] `src/types/sync.ts`: tipos de config (URL, token, estado).
- [ ] `src/lib/sync.ts`: login (`POST /auth/login`), refresh de token,
      persistencia del token vigente (dónde y cómo — definir mecanismo
      de storage seguro en Tauri, no `localStorage` plano).

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
