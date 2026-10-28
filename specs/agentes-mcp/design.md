# Agentes de IA (MCP) — Design

## Piezas

```
Claude Code / Codex
   │  POST http://127.0.0.1:47321/mcp  (Bearer token)
   ▼
Rust: src-tauri/src/extensions/mcp.rs
   - tiny_http en un hilo, solo 127.0.0.1
   - valida método, ruta, Host, Origin, token y tamaño (R5, R8, R9)
   - emite `mcp://request` {id, body} al webview y espera `mcp_reply`
   ▼
Webview: src/extensions/mcp/
   - protocol.ts: JSON-RPC y métodos MCP (R16, R17)
   - tools.ts: herramientas, con dependencias inyectadas (R10–R15)
   - storeTools.ts: esas dependencias contra el store y el disco
```

Rust solo hace de transporte y de portero. La lógica MCP vive en
TypeScript porque las escrituras tienen que pasar por el store (R14) y
así se prueba con vitest sin levantar un servidor.

## Rust (`mcp.rs`)

- **Dependencia:** `tiny_http`. Es síncrono y pequeño; cada petición se
  atiende en su propio hilo para que una lenta no bloquee a las demás.
- **Estado:** `McpState` gestionado por Tauri, con el servidor activo
  (puerto, token, `Arc<Server>`) y un mapa `id → Sender` de peticiones
  pendientes.
- **Comandos:**
  - `mcp_server_start(port, reloadToken?)`: cierra el anterior y abre
    el servidor. El token se lee del llavero (`ext:mcp:token`) la primera
    vez y con `reloadToken` (al regenerarlo); si no, usa el que guardó en
    memoria. Así cambiar el puerto no relee el llavero: en macOS, si la
    firma de la app cambió (cada build de QA), leerlo abre un aviso que
    pide la contraseña, y mientras no se responde el servidor queda
    cerrado. Errores: `secret_not_found`, `port_in_use`,
    `server_error`.
  - `mcp_server_stop()`: `unblock()` del servidor y suelta las
    peticiones pendientes.
  - `mcp_reply(id, body)`: `body` es la respuesta JSON-RPC, o `null`
    para una notificación (202 sin cuerpo).
- **Validación** (función pura `check_request`, con pruebas):
  1. ruta `/mcp` (sin contar la query) → si no, 404;
  2. método POST → si no, 405 con `Allow: POST`;
  3. sin `Origin` → si no, 403;
  4. `Host` igual a `127.0.0.1:<puerto>` o `localhost:<puerto>` → si
     no, 403;
  5. `Authorization: Bearer <token>`, comparado en tiempo constante →
     si no, 401 con `WWW-Authenticate: Bearer`;
  6. cuerpo de hasta 1 MiB → si no, 413.
- **Espera:** 30 s con `recv_timeout`. Si vence, 503 con un error
  JSON-RPC `-32603` ("Logday no respondió").
- La ventana se oculta al cerrarla (no se destruye), así que el webview
  sigue atendiendo mientras la app esté abierta.

R17 de la base habla de peticiones salientes. Este servidor es entrante
y solo local: no abre conexiones a ningún host.

## Webview

### Módulo (`index.ts`)

- `start()` (R4): escucha `mcp://request`, y si hay token arranca el
  servidor en el puerto de la configuración. Devuelve cómo parar:
  deja de escuchar y llama a `mcp_server_stop`.
- El estado del servidor (abriendo, escuchando, puerto ocupado, sin
  token, error) va a un store pequeño del módulo que lee el panel.
  "Abriendo" se ve mientras se espera a `mcp_server_start`, que puede
  quedar esperando el aviso del llavero.
- `restartMcpServer()`: lo usa el panel al cambiar el puerto o el token.

### Configuración

En `extensions.mcp.settings`, local y sin secretos (base R9, R10):

```ts
interface McpSettings {
  port: number;          // 47321 por defecto
  allowWrites: boolean;  // false por defecto (R12)
  hint?: string;         // pista del token, de ext_secret_set
}
```

### Token (R6, R7)

- Se genera en el webview con `crypto.getRandomValues` (32 bytes, en
  hex) y se guarda con `ext_secret_set`, que devuelve la pista.
- El panel lo muestra en ese momento, dentro de los comandos de
  registro, y no lo guarda en el estado ni en la configuración. Como el
  webview nunca vuelve a leerlo del llavero, se cumple R10 de la base
  sin excepciones.
- Regenerar = generar uno nuevo y reiniciar el servidor.

### Comandos de registro

```sh
claude mcp add --transport http logday http://127.0.0.1:47321/mcp \
  --header "Authorization: Bearer <token>"
```

Codex, en `~/.codex/config.toml`:

```toml
[mcp_servers.logday]
url = "http://127.0.0.1:47321/mcp"
http_headers = { Authorization = "Bearer <token>" }
```

### Protocolo (`protocol.ts`)

- `handleMcpMessage(raw, ctx)` → `string | null` (`null` = 202).
- JSON inválido → `-32700`; un arreglo (batch, quitado en 2025-06-18)
  o un mensaje sin `jsonrpc: "2.0"` → `-32600`; método desconocido →
  `-32601`; parámetros inválidos → `-32602`.
- `initialize`: versiones soportadas `2025-06-18`, `2025-03-26` y
  `2024-11-05`. Responde la del cliente si está en la lista, o la
  primera. `capabilities: { tools: { listChanged: false } }` y
  `serverInfo: { name: "logday", version }`.
- `tools/call`: los errores de la herramienta van en el resultado con
  `isError: true` (R15), no como error JSON-RPC. El resultado útil va
  como texto JSON en `content` y también en `structuredContent`.

### Herramientas (`tools.ts`)

| Herramienta | Argumentos | Notas |
| --- | --- | --- |
| `list_projects` | — | |
| `list_tasks` | `project?`, `status?`, `query?`, `limit?` (50, máx. 200) | Sin contenido; `query` busca en título, código y etiquetas. Incluye los subproyectos de `project`. |
| `get_task` | `id` | Con contenido. |
| `get_daily` | `date?` (`YYYY-MM-DD`, hoy) | |
| `create_task` | `title`, `project?` (`inbox`), `content?`, `due?`, `tags?`, `status?` | No abre el panel de la tarea (`open: false`). |
| `update_task` | `id`, y al menos uno de `title`, `status`, `due` (`null` lo quita), `tags`, `content` | Pasa `prev` leído de disco, para que D2 y el sync vean el cambio real. |
| `append_to_daily` | `text`, `date?` (hoy) | Agrega en una línea nueva al final, con `saveDailyEntry(date, nuevo, base)`. |

- Las fechas de calendario son locales (`localISODate`), como en el
  resto de la app.
- Las tareas se leen de disco (`readTaskFromPath` por proyecto), no del
  store, porque `tasks` solo tiene las del proyecto activo.
- Si el daily de esa fecha está abierto en el editor, el texto agregado
  queda en disco y en el CRDT, y se ve al volver a abrirlo. Al guardar,
  el editor mezcla con su base, así que no se pierde.

## Pruebas

- Rust: `check_request` (cada rechazo y el caso válido) y la
  comparación del token.
- vitest: `protocol.ts` (initialize y versiones, errores JSON-RPC,
  notificaciones, tools/list según "Permitir cambios") y `tools.ts` con
  dependencias falsas (filtros, validación, errores de R15, que las
  escrituras llamen a las acciones con los argumentos correctos).
- Manual (QA): registrar el servidor en Claude Code contra la app de QA,
  listar, crear y editar una tarea y agregar al daily.

## Alternativas descartadas

- **Un binario aparte que lea y escriba los Markdown:** funcionaría con
  la app cerrada, pero se salta el store (fechas, sync, CRDT) y choca
  con la app abierta.
- **stdio:** el agente tendría que lanzar Logday, o un puente aparte.
  Claude Code y Codex aceptan HTTP.
- **El token en la configuración local o leído de vuelta del llavero:**
  rompería R10 de la base. Mostrarlo una vez, como un token de GitHub,
  basta.
- **Un SDK de MCP en Rust (`rmcp`):** trae mucho más de lo que hace
  falta para cuatro métodos, y dejaría la lógica lejos del store.
