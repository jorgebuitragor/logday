# Chat del equipo (modo local) — Diseño

Estado: en progreso.

## Archivos

- `src/extensions/team-chat/`: `index.ts` (módulo), `model.ts`
  (configuración y errores), `api.ts` (comandos y
  `useTeamChatSettings`), `Settings.tsx` y `SendToChatButton.tsx`.
- `src-tauri/src/extensions/team_chat.rs`: validación, cuerpo, límite y
  los comandos `team_chat_validate_url` y `team_chat_send`.

## Configuración

En `AppConfig.extensions['team-chat'].settings`, sin secretos:

```jsonc
{
  "provider": "google_chat",            // google_chat | slack | teams
  "hint": "chat.googleapis.com …a1b2",  // de ext_secret_set / ext_secret_hint
  "last": {                             // R21
    "sentAt": "2026-10-28T13:50:00.000Z",
    "date": "2026-10-28",               // no está en el mensaje de prueba
    "test": true,                       // solo en el mensaje de prueba
    "status": "ok",                     // ok | error
    "error": { "code": "provider_error", "status": 500 }
  }
}
```

La URL está en el llavero, cuenta `ext:team-chat:webhook`.

## Guardar la URL

1. `team_chat_validate_url(provider, url)`: R10, sin red. Devuelve un
   código de error o nada.
2. `ext_secret_set('team-chat', 'webhook', url)`: la guarda y devuelve
   la pista.
3. Se guardan `provider` y `hint`, y el campo se vacía.

Cambiar de proveedor pide pegar la URL nueva: el botón Guardar necesita
una URL.

## Validación (R10)

Además de lo que dice el spec del chat:

- el host se compara sin distinguir mayúsculas;
- `*.dominio` exige al menos un subdominio (`logic.azure.com` solo no
  vale);
- se rechazan las URLs con usuario o contraseña
  (`https://chat.googleapis.com@otro.host/…`), las IPs y cualquier
  puerto que no sea el 443;
- Google Chat: la ruta es exactamente `/v1/spaces/<espacio>/messages`;
- Slack: `/services/…` o `/triggers/…`, con algo después;
- Teams: cualquier ruta. **Los hosts de Workflows no se han verificado
  con una URL real** (ver tasks).

La tabla de casos está en las pruebas de `team_chat.rs`.

## Envío (`team_chat_send(provider, text)`)

En orden, y sin red hasta el último paso:

1. proveedor conocido (`invalid_provider`);
2. texto no vacío y de 4000 caracteres Unicode como mucho
   (`empty_text`, `text_too_long`), R16;
3. URL en el llavero (`needs_reconfig` si no está, R14);
4. la URL vale para el proveedor (`needs_reconfig`, D3);
5. límite de 20 por hora, ventana deslizante en memoria
   (`rate_limited`), R17. Solo cuentan los envíos que llegan aquí;
6. `POST` con `reqwest`: timeout de 10 s, `redirect::Policy::none()`.
   2xx es éxito; si no, `provider_error` con el código HTTP. Sin
   respuesta: `timeout` o `network` (R18, R19).

El error que vuelve al webview es `{code, status}`. Nunca lleva la URL:
los errores de `reqwest` la incluyen en su texto, así que se reducen a
un código.

### Cuerpo

- Google Chat y Slack: `{"text": "…"}`.
- Teams:

```json
{
  "type": "message",
  "attachments": [{
    "contentType": "application/vnd.microsoft.card.adaptive",
    "contentUrl": null,
    "content": {
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "type": "AdaptiveCard",
      "version": "1.4",
      "body": [{ "type": "TextBlock", "text": "…", "wrap": true }]
    }
  }]
}
```

## Interfaz

- **Tarjeta en Opciones → Extensiones:** proveedor, URL (campo de tipo
  contraseña), pista de la URL guardada o "hay que volver a configurar"
  si el llavero ya no la tiene, "Enviar prueba" con el texto del spec en
  el idioma de la app, y el último resultado. "Quitar integración" es el
  "Quitar configuración" de la base.
- **Daily:** un botón con icono de enviar junto a Copiar en la cabecera
  del daily, solo si hay proveedor y URL guardados (R31). Si ese daily
  ya salió bien hoy, pide confirmar. Los fallos y el límite se avisan
  con un toast que incluye el código del proveedor.
