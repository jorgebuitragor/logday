# Sync con servidor — Tareas

Estado: en progreso — "Config y auth" implementado, pendiente de
confirmación visual en la app real (ver "Punto de retomada" al final).
`logday-server` ya implementa
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

- [ ] `tsc` en verde (`pnpm install` en esta rama desde el merge de
      feature/1.1.0 — ver "Punto de retomada").
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

## Punto de retomada (2026-08-23, actualizado tras mergear feature/1.1.0)

"Config y auth" está implementado, compila, y **quedó confirmado
visualmente en la app real**: Ajustes → tab Sync conecta contra
`logday-server` local y muestra "Conectado" sin error.

**`feature/1.1.0` (33 commits — temas, ajustes de notas, links
dinámicos, mejoras en dailys, split de `SettingsModal.tsx`, migración
a pnpm) ya está mergeado a esta rama** (merge commit "Merge branch
'feature/1.1.0' into feature/sync-servidor"). El gestor de paquetes de
esta rama ahora es **`pnpm`** (adoptado del merge; la nota anterior
sobre usar `npm` quedó obsoleta — `package-lock.json` se eliminó).
`SettingsModal.tsx` ya no es un archivo único: vive partido en
`src/components/settings/*Tab.tsx`, y el tab Sync es
`SyncSettingsTab.tsx` ahí mismo, siguiendo ese mismo patrón (sin el
prop `active` de `GitSettingsTab` — Sync no tiene timers de fondo
todavía). Los tipos de sync viven en `src/types/sync.ts`, no en
`types/index.ts` (que ya no existe, partido por dominio).

1. Levantar `logday-server` (Docker o `go run`) y la app Tauri
   (`pnpm tauri dev` en `task-manager`, rama `feature/sync-servidor`).
2. Ajustes → tab Sync → conectar contra el server local
   (`admin@example.com` / `test-password-123` si se bootstrapeó con
   esas env vars) — ya confirmado que funciona.
3. Seguir con "Mapeo de entidades" en este mismo `tasks.md`, ahora
   considerando los tipos nuevos que trajo 1.1.0 (`types/absence.ts`,
   etc.) para las entidades que ya tienen contraparte ahí.
4. Si el login vuelve a fallar: el flujo completo de request es
   `SyncSettingsTab.tsx` → `appStore.syncConnect` →
   `src/lib/sync.ts login()` → `src/lib/invoke.ts syncRequest()` →
   comando Rust `sync_request` en `src-tauri/src/lib.rs` — revisar en
   ese orden.

Se acordó con el usuario trabajar por fases con checkpoints visuales
antes de cada fase siguiente — este checkpoint ya está confirmado, así
que "Mapeo de entidades" puede arrancar.
