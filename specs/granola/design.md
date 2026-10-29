# Granola — Design

## OAuth (descubierto el 28 oct 2026)

- Recurso: `https://mcp.granola.ai/mcp`
  (`/.well-known/oauth-protected-resource`, scope `mcp`).
- Servidor de autorización: `https://mcp-auth.granola.ai`, con
  `/oauth2/register` (registro dinámico), `/oauth2/authorize` y
  `/oauth2/token`, PKCE `S256` y clientes públicos
  (`token_endpoint_auth_method: none`).
- Al conectar:
  1. se abre el puerto en `127.0.0.1:0`;
  2. se registra un cliente con esa `redirect_uri`;
  3. se pide `scope=mcp offline_access` con `resource` (RFC 8707);
  4. se cambia el código por tokens.

El login por loopback (puerto, PKCE, `state`, navegador y espera) pasa a
`oauth_loopback.rs`, común con Google (`google_oauth.rs` lo usa).

## Cliente MCP (`granola.rs`)

- `granola_call(tool, args)`, solo para `list_meetings`, `get_meetings`
  y `get_account_info` (N9):
  1. `initialize` (Streamable HTTP, protocolo `2025-06-18`), guardando el
     `Mcp-Session-Id` si llega;
  2. `notifications/initialized`;
  3. `tools/call`.
- Las respuestas pueden venir como JSON o como SSE (`text/event-stream`).
  Se toma el mensaje JSON-RPC con el `id` pedido. Devuelve el texto de
  `content` unido.
- Con 401 se renueva el token y se repite una vez. Si la renovación
  falla: `needs_reconnect`.
- `granola_connect()` devuelve el correo (de `get_account_info`) y
  `granola_disconnect()` borra los tokens.

## Lectura (`parse.ts`, funciones puras con pruebas)

- `parseMeetingList(text)`: de cada `<meeting …>` toma `id`, `title`,
  `meeting_at`, `updated_at` y `url`; de `<pagination …>`, `has_more` y
  `next_cursor`.
- `parseMeetingDetails(text)`: además, `<known_participants>` (una línea
  por persona), `<private_notes>` (vacío si `status="empty"` o
  `"not_included"`) y `<summary>`.
- Decodifica las entidades XML (`&amp;`, `&lt;`, …). Un bloque sin `id`
  se ignora. Un texto sin `<meetings_data>` es `unexpected_format`
  (N10).

## Importar (`importer.ts`)

1. `list_meetings` con `updated_after` = la última importación (o, la
   primera vez, sin rango: el plan gratuito da 30 días), y `cursor`
   mientras `has_more` (como mucho 5 páginas).
2. Se quitan las ya importadas (`settings.imported`: id de Granola → id
   de nota).
3. `get_meetings` de a 10.
4. `createNoteWith` en la carpeta (con `createNoteFolder` si falta).
5. Se guardan `imported`, `lastImportAt` y `last`.

La nota se arma con `meetingToNote` (pura):

```md
**Fecha:** 27 oct 2026, 8:55 a. m.
**Participantes:** Jorge Buitrago, …
[Abrir en Granola](https://notes.granola.ai/d/…)

## Resumen
…

## Mis notas
…
```

## Configuración

```jsonc
{ "account": "…", "folder": "Granola", "auto": false,
  "lastImportAt": "…", "imported": { "<id granola>": "<id nota>" },
  "last": { "at": "…", "status": "ok", "created": 3 } }
```
