# Sync con servidor — Diseño

Estado: en diseño — no implementado.

## Capa de red: comandos Rust propios, no `fetch`/`WebSocket` del navegador

**Decisión revisada** (la primera versión de este documento proponía
`@tauri-apps/plugin-http`/`-websocket`; se descarta tras revisar
`src-tauri` — ver abajo por qué): REST vía comandos Tauri propios en
`src-tauri/src/lib.rs` usando `reqwest` (ya es dependencia del
proyecto — `Cargo.toml:22`), exactamente el mismo patrón que
`fetch_image_base64` (`src-tauri/src/lib.rs:220-238`, mismo comentario
de justificación: "Runs on the Rust side so it bypasses WebView CORS
restrictions"). No se agrega `@tauri-apps/plugin-http`: sería una
segunda forma de hacer lo mismo que el proyecto ya resuelve a mano.

**Por qué, no `fetch` nativo del webview**: `logday-server` no
implementa CORS a propósito (ver `arquitectura-inicial`, "un único
contenedor, cero configuración obligatoria" — un allowlist de
orígenes por instancia contradice ese objetivo). Un origen Tauri
haciendo `fetch` contra el host que el usuario configuró choca con la
falta de `Access-Control-Allow-Origin`. Un comando Rust no pasa por el
webview, así que no está sujeto a CORS en absoluto.

**WebSocket** (`/ws`, autenticación por mensaje, reconexión con
backoff): a diferencia de REST, acá no hay precedente en el repo. Dos
opciones:
1. Replicar el patrón "a mano" (tarea Rust en background con
   `tokio-tungstenite`, reenviando mensajes al frontend vía eventos
   Tauri) — más consistente con el resto del código, pero es
   significativamente más superficie de Rust nueva (conexión
   persistente, reconexión, manejo de errores, todo sin un plugin que
   ya lo resuelva).
2. **Elegida**: `@tauri-apps/plugin-websocket` — sí se agrega como
   dependencia, porque acá no hay una convención propia que romper (a
   diferencia de HTTP) y reimplementar reconexión+framing de WS a mano
   en Rust no se justifica cuando el plugin oficial ya lo cubre.

## Ubicación del código

Nuevo módulo `src/lib/sync.ts` (+ `src/lib/syncQueue.ts` para la cola,
ver abajo), paralelo a `src/lib/invoke.ts` — mismo rol: encapsula I/O
externo (red, en vez de filesystem) detrás de funciones puras que el
store consume, llamando a los nuevos comandos Rust vía `invoke()`
igual que el resto de `invoke.ts`. `appStore.ts` sigue siendo la única
fuente de verdad in-memory; `sync.ts` nunca muta estado directamente.

Nuevo componente `src/components/SyncModal.tsx`, hermano de
`GitModal.tsx` (patrón real en esta rama — el split a
`components/settings/*Tab.tsx` vive en `feature/1.1.0`, todavía sin
mergear a `develop`, así que este componente sigue el patrón actual:
modal propio con su flag `isSyncOpen`/`toggleSync` en `appStore.ts`,
no un tab). Cuando `feature/1.1.0` se mergee, migrar este componente
al nuevo layout de tabs es un refactor mecánico aparte, no bloqueante.

## Cola de escrituras offline

**Persistencia**: archivo JSON en `configDir` (donde ya vive la config
de la app), no solo en memoria — tiene que sobrevivir un cierre de la
app mientras hay escrituras pendientes de enviar. Estructura:

```ts
type QueuedWrite = {
  id: string;            // uuid de la entrada en cola, no el id de la entidad
  entity: EntityType;    // 'task' | 'note' | 'overtime_entry' | ...
  entityId: string;
  fields: Record<string, unknown>;
  updatedAt: string;      // rfc3339, generado al momento de la edición
  queuedAt: string;
};
```

**Drenado**: en orden de `queuedAt`, un `PATCH` a la vez (no en
paralelo — evita reordenar escrituras al mismo campo por timing de
red).

**Regla de sobreescritura vs. cola pendiente** (el matiz señalado en la
conversación con el usuario, ver `requirements.md`): al recibir la
respuesta de un `PATCH` ya drenado, el cliente sobreescribe su estado
local **campo por campo**, pero solo para los campos donde no exista
ya otra entrada en cola con `queuedAt` posterior para ese mismo
`(entity, entityId, field)`. Si existe, se descarta ese campo de la
respuesta — la entrada más nueva en cola es, por definición, la
edición vigente del usuario, y su propio `PATCH` (cuando se drene) va
a traer el estado final real. Sin esta regla, una respuesta tardía de
una escritura vieja podría pisar una edición más reciente todavía no
enviada.

## Reconexión WebSocket

Backoff exponencial con techo: `1s, 2s, 4s, 8s, 16s, 30s` (cap), reset
a `1s` en cuanto una conexión se establece con éxito. Reintento
indefinido mientras haya sesión configurada — no hay límite de
intentos, es una app de escritorio de uso diario, no un job con
timeout.

## CRDT: `Note.content` y contenido de entradas diarias

El editor de notas ya usa Tiptap (`@tiptap/core` + extensiones,
`RichTextEditor.tsx`, `NoteEditor.tsx`). Tiptap tiene una extensión
oficial de colaboración basada en Yjs
(`@tiptap/extension-collaboration`) — encaja directo, no hay que
construir el puente Tiptap↔Yjs a mano:

- Cada nota/entrada diaria con contenido CRDT mantiene un `Y.Doc`
  propio en memoria mientras se edita.
- `@tiptap/extension-collaboration` conecta ese `Y.Doc` al editor —
  las ediciones del usuario ya quedan expresadas como operaciones Yjs
  automáticamente, sin lógica propia de diffing.
- Al guardar: se serializa el estado del `Y.Doc`
  (`Y.encodeStateAsUpdate`) y se manda al endpoint CRDT dedicado
  (`POST /notes/:id/content`, ver `esquema-datos/design.md` del repo
  `logday-server` — separado del `PATCH` de metadata LWW).
- Al recibir una actualización remota (vía `/sync/changes` o WS), se
  aplica al `Y.Doc` local (`Y.applyUpdate`) — Tiptap re-renderiza solo
  lo que cambió, sin pisar la posición del cursor si el usuario está
  editando en simultáneo.
- El Markdown que se guarda en disco (formato local existente, sin
  cambios) se deriva del estado del editor Tiptap, igual que hoy — el
  `Y.Doc` es la fuente de verdad para colaboración, el Markdown sigue
  siendo la fuente de verdad para el archivo local.

Dependencia nueva: `yjs` (paquete npm, no hay wrapper de Tauri
necesario acá — es lógica pura en JS, no I/O de red directo).

## Fuera de este diseño

- Migración/primer sync completo de una instalación con meses de
  archivos locales — spec aparte, mencionado en `requirements.md`.
- Manejo de múltiples `Y.Doc` en memoria simultáneamente si el usuario
  tiene muchas notas abiertas — se asume que solo el documento
  actualmente abierto en el editor mantiene su `Y.Doc` vivo; el resto
  se hidrata on-demand al abrir.
