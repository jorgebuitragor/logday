# Webhook saliente (n8n) — Design

## Eventos de la app (punto de extensión nuevo, R23 de la base)

`src/lib/appEvents.ts`: un emisor muy pequeño, sin dependencias.

```ts
type AppEvent =
  | { type: 'task.created'; task: Task }
  | { type: 'task.updated'; prev: Task | undefined; next: Task }
  | { type: 'overtime.saved'; entry: OvertimeEntry };
onAppEvent(fn) → () => void;   // desuscribirse
emitAppEvent(event);           // lo llaman las acciones del store
```

- Lo llaman `createTask`, `updateTask` y `saveOvertimeEntry` del store,
  después de escribir en disco. Así también cuentan los cambios del
  agente por MCP (W8).
- Un oyente que lanza un error no corta a los demás ni a la acción: se
  registra y sigue.

## Rust (`outgoing_webhook.rs`)

- `outgoing_webhook_validate_url(url)`: W1, sin red.
- `outgoing_webhook_send(body)`:
  - lee la URL (y el secreto, si hay) del llavero;
  - limita a 60 envíos por hora;
  - POST con `Content-Type: application/json`, `User-Agent: Logday` y,
    con secreto, `X-Logday-Signature`;
  - 10 s de plazo y sin redirecciones;
  - errores: `needs_reconfig`, `rate_limited`, `timeout`, `network` y
    `provider_error` con el status. El cuerpo lo arma el webview; Rust
    solo lo firma y lo envía.
- `hmac_sha256(key, msg)`: HMAC con `sha2` (ya es dependencia), con
  prueba contra el vector de RFC 4231.

## Módulo

- `start()`: se suscribe a `onAppEvent` y, según los eventos elegidos,
  arma el cuerpo (`buildPayload`, función pura) y llama a
  `outgoing_webhook_send`. `task.completed` es un `task.updated` cuyo
  `prev.status` no era `done` y su `next.status` sí.
- `dailyActions`: el botón "Enviar a n8n" (W6), solo si hay URL guardada.
- El último resultado se guarda en `settings.last` (W10), como en Chat
  del equipo.

## Configuración

```jsonc
{ "hint": "n8n.midominio.com …a1b2", "secretHint": "…ff01",
  "events": ["task.completed", "overtime.saved"],
  "last": { "event": "task.completed", "at": "…", "status": "ok" } }
```
