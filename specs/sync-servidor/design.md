# Sync con servidor — Diseño

Estado: en diseño — no implementado.

## Capa de red: plugins Tauri, no `fetch`/`WebSocket` del navegador

**Decisión**: toda comunicación con `logday-server` pasa por
`@tauri-apps/plugin-http` (REST) y `@tauri-apps/plugin-websocket` (WS)
— ninguno de los dos está instalado hoy (`package.json` solo tiene
`-dialog`, `-fs`, `-notification`, `-opener`, `-shell`), hay que
agregarlos.

**Por qué, no `fetch`/`WebSocket` nativos del webview**: `logday-server`
no implementa CORS (verificado — cero referencias a `Access-Control` o
middleware CORS en el repo). Un origen Tauri (`tauri://localhost` o
`http://tauri.localhost` según plataforma) haciendo `fetch` contra el
host que el usuario configuró chocaría con la falta de
`Access-Control-Allow-Origin` en la mayoría de los navegadores/webviews
embebidos. Las dos alternativas:

1. Agregar CORS al servidor — **descartada**. Forzaría a cada instancia
   self-hosted a mantener un allowlist de orígenes (¿cuál? el desktop
   no tiene un origen fijo entre plataformas), contradiciendo el
   objetivo explícito de `arquitectura-inicial` de "un único
   contenedor, cero configuración obligatoria". El server ya sirve
   HTTP plano a propósito, sin manejar más superficie de la necesaria.
2. **Elegida**: los plugins oficiales de Tauri ejecutan la request
   HTTP/WS del lado Rust, no en el contexto del webview — no están
   sujetos a CORS del navegador en absoluto, porque no es el navegador
   quien hace la conexión. Mismo patrón arquitectónico que ya usa el
   proyecto para fs (`plugin-fs`, no APIs de browser).

## Ubicación del código

Nuevo módulo `src/lib/sync.ts` (+ `src/lib/syncQueue.ts` para la cola,
ver abajo), paralelo a `src/lib/invoke.ts` — mismo rol: encapsula I/O
externo (red, en vez de filesystem) detrás de funciones puras que el
store consume. `appStore.ts` sigue siendo la única fuente de verdad
in-memory; `sync.ts` nunca muta estado directamente, llama a acciones
existentes del store (mismo patrón que `invoke.ts` hoy).

Nuevo tab de Ajustes: `src/components/settings/SyncSettingsTab.tsx`,
hermano de `GitSettingsTab.tsx` — mismo lugar en el menú de Ajustes,
mismo patrón de componente (form + estado de conexión + acciones).

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
