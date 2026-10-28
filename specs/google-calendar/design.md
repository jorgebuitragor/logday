# Google Calendar — Design

## OAuth compartido (`src-tauri/src/extensions/google_oauth.rs`)

Lo de "como yo" pasa a un módulo común, que reciben las dos extensiones
con su id, sus permisos y sus entradas del llavero:

- `connect(app, ext, client_id, scopes)`: el login por loopback de
  `oauth_loopback.rs` (común con Granola: `127.0.0.1:0`, PKCE S256,
  `state`, el `opener` del navegador y 5 minutos de plazo).
  Guarda `ext:<ext>:google_refresh` y devuelve el correo.
- `access_token(app, ext, client_id, force)`: el de memoria (uno por
  extensión) o uno renovado.
- `disconnect(app, ext)`: revoca y borra.

`team_chat_google.rs` queda con lo propio del chat (enlace del espacio y
envío), con los mismos comandos de antes.

## Comandos de la extensión (`google_calendar.rs`)

- `google_calendar_connect(clientId)` y `google_calendar_disconnect()`.
- `google_calendar_copy_client()`: copia en el llavero
  `ext:team-chat:google_client_secret` → `ext:google-calendar:google_client_secret`
  (G1). El webview pone el `clientId` en su configuración.
- `google_calendar_events(clientId, timeMin, timeMax)`:
  `GET https://www.googleapis.com/calendar/v3/calendars/primary/events`
  con `singleEvents=true`, `orderBy=startTime`, `maxResults=250` y
  `fields` reducido a `items(id,status,summary,start,end,htmlLink)`.
  - Con 401 se renueva el token y se reintenta una vez.
  - Devuelve los eventos tal como vienen de Google, sin los cancelados.
  - Errores: `needs_reconnect`, `not_allowed` (403), `network`,
    `timeout` y `provider_error`.

## Eventos externos (punto de extensión nuevo, R22 de la base)

`src/extensions/externalEvents.ts` es un store pequeño (zustand):

```ts
interface ExternalEvent {
  id: string;
  source: ExtensionId;
  title: string;
  date: string;   // YYYY-MM-DD local
  time: string;   // HH:MM local, '' = todo el día
  url?: string;
}
// range: el mes visible que pide el Calendario; byDate: los eventos de cada fuente.
```

- El Calendario fija `range` (del primer al último día visible) al
  cambiar de mes, y dibuja `byDate[fecha]` junto a sus eventos, con un
  estilo propio (borde punteado e icono de la fuente). Al hacer clic se
  abre `url`.
- Cada fuente reemplaza sus eventos con `setSource(id, events)`, y los
  borra al parar (`clearSource`).
- No se guarda nada en disco (G9).

## Módulo de la extensión

- `start()`:
  - se suscribe a `range` y pide los eventos al cambiar (G7), y cada 10
    minutos;
  - convierte `start.dateTime` y `start.date` a fecha y hora locales con
    `parseGoogleEvent` (función pura, con pruebas);
  - en los de todo el día que duran varios días (`end.date` exclusivo)
    crea uno por día (G6);
  - devuelve cómo parar: cancela el intervalo y llama a `clearSource`.
- El estado de la última consulta (cuándo, cuántos o el error) va a un
  store del módulo que lee el panel.

## Configuración

En `extensions['google-calendar'].settings`:

```jsonc
{ "clientId": "…apps.googleusercontent.com", "secretHint": "…abcd", "account": "jorge@fcv.org" }
```

En el llavero, `ext:google-calendar:google_client_secret` y
`ext:google-calendar:google_refresh`; son los `secretKeys` del registro.

## Pruebas

- Rust: que el módulo común siga pasando las pruebas de "como yo", la
  URL de autorización con los permisos de Calendar y el mapeo de
  errores.
- vitest: `parseGoogleEvent` (con hora, todo el día, varios días,
  cancelado, sin título y zona horaria distinta), el store de eventos
  externos y la configuración.
