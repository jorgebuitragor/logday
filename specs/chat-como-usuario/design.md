# Chat del equipo: enviar como yo (Google Chat) — Design

Con la opción A (cada organización pone su cliente OAuth), elegida el
28 oct 2026.

## Configuración

En `extensions['team-chat'].settings`, sin secretos, junto a lo de hoy:

```jsonc
{
  "provider": "google_chat",
  "sendAs": "bot",                         // bot | user (C1, C2)
  "google": {
    "clientId": "1234-abc.apps.googleusercontent.com",
    "space": "spaces/AAAA1234",           // C8
    "spaceLink": "https://chat.google.com/room/AAAA1234",
    "account": "jorge@fcv.org",            // C6, del id_token
    "consentAt": "2026-10-28T16:00:00.000Z" // C7
  }
}
```

En el llavero: `ext:team-chat:google_client_secret` y
`ext:team-chat:google_refresh`. Google trata el secreto de un cliente de
escritorio como público, pero igual va al llavero para no dejarlo en
`config.json`.

## Archivos

- `src-tauri/src/extensions/team_chat_google.rs`: inicio de sesión,
  tokens, revocación, envío y el enlace del espacio, con sus pruebas.
- `src/extensions/team-chat/`:
  - `GoogleUserSection.tsx`: los tres pasos del panel y el aviso;
  - `model.ts`: `sendAs`, `google` y qué falta;
  - `api.ts`: los comandos;
  - `guide.ts` y `SetupGuide.tsx`: las guías.
- "Quitar configuración" de la base borra también
  `google_client_secret` y `google_refresh` (los `secretKeys` del
  registro). No revoca el permiso en Google: para eso está
  "Desconectar".
- El navegador se abre con el plugin `opener`, no con `open_url`: en
  Windows, `cmd /c start` partiría la URL de Google en cada `&`.

## Cliente OAuth (opción A)

- Tipo de cliente: **Desktop app**.
- Pantalla de consentimiento: **Internal**, con el permiso
  `https://www.googleapis.com/auth/chat.messages.create`, más `openid` y
  `email` para mostrar la cuenta.
- API de Chat activada y configurada (nombre "Logday", avatar y
  descripción): Google lo exige incluso para la autenticación de
  usuario, y ese nombre es el que se ve junto al mensaje.
- Una guía para administradores dentro del panel, con los mismos
  criterios que `SetupGuide`.

## Inicio de sesión (Rust, `team_chat_google.rs`)

1. `team_chat_google_connect(clientId)`:
   - genera `code_verifier` y `state`;
   - abre `tiny_http` en `127.0.0.1:0` (puerto libre);
   - abre en el navegador
     `https://accounts.google.com/o/oauth2/v2/auth` con
     `redirect_uri=http://127.0.0.1:<puerto>`,
     `code_challenge_method=S256`, el `state`, `access_type=offline` y
     `prompt=consent`.
2. Espera una sola petición al puerto, con un plazo de 5 minutos (C4):
   - comprueba el `state`;
   - contesta con una página corta ("Ya puedes volver a Logday");
   - cierra el puerto.
3. Cambia el código por los tokens en
   `https://oauth2.googleapis.com/token`, con el secreto del llavero y
   el `code_verifier`:
   - guarda el `refresh_token` en el llavero;
   - deja el `access_token` y su vencimiento en memoria (C5);
   - saca la cuenta (`email`) del `id_token`.
4. Devuelve al webview solo la cuenta, o un código de error:
   `cancelled`, `timeout`, `state_mismatch` o `token_error`.

`team_chat_google_disconnect()`: llama a
`https://oauth2.googleapis.com/revoke` y borra el `refresh_token` (C6).

## Envío

`team_chat_send` ya recibe el proveedor y el texto. Con
`sendAs: "user"` va por `team_chat_google_send(space, text)`:

- si el `access_token` está vencido, o falta, se renueva con el
  `refresh_token`;
- `POST https://chat.googleapis.com/v1/{space}/messages`, con `{ text }`;
- si responde 401, se renueva el token y se reintenta una vez (C11);
- si la renovación falla con `invalid_grant`, se devuelve
  `needs_reconnect`;
- los errores (C12) usan los mismos códigos que el webhook
  (`provider_error` con el status, `rate_limited`, `needs_reconfig`)
  más `needs_reconnect` y `not_allowed` (403).

## El enlace del espacio (C8)

Se aceptan:

- `https://chat.google.com/room/<id>` y
  `https://chat.google.com/u/<n>/room/<id>`;
- `https://mail.google.com/chat/u/<n>/#chat/space/<id>`.

El id sale de ahí (letras, dígitos, `-` y `_`) y se guarda como
`spaces/<id>`. Cualquier otro host o forma es un error. La tabla de
casos va en las pruebas.

## Interfaz

- **Panel de Chat del equipo**, con Google Chat elegido: un selector
  "Cómo enviar".
  - Con "Como yo", la URL del webhook se cambia por:
    1. el cliente OAuth (id y secreto, plegado si ya está);
    2. "Conectar con Google" o, si ya está conectado, "Conectado como
       …" con "Desconectar";
    3. el enlace del espacio;
    4. "Enviar prueba".
- **`SetupGuide`** pasa a tener una guía para "Como yo" (conectar,
  copiar el enlace del espacio, probar) y otra para administradores
  (crear el cliente OAuth).
- **Aviso (C7):** se reutiliza el `ConsentModal` de la base, con su
  propio texto, y se guarda `google.consentAt`.

## Pruebas

- **Rust:**
  - el enlace del espacio (válidos e inválidos);
  - la URL de autorización (parámetros, PKCE S256);
  - el `state` que no coincide;
  - el mapeo de respuestas de Google a códigos (401 con reintento,
    `invalid_grant`, 403, 404, 429).
- **vitest:** la lectura de la configuración nueva y el panel según
  `sendAs`.
- **QA:** con un cliente interno de la FCV, conectar, enviar una prueba,
  desconectar y comprobar en Google que se revocó.

## Alternativas descartadas

- **Correo a la dirección del espacio:** sale a nombre del usuario, pero
  como tarjeta de correo y con un clic en el correo cada vez.
- **Listar los espacios** (`chat.spaces.readonly`): es otro permiso, de
  lectura. Pegar el enlace basta.
- **Que el webview haga el OAuth:** rompería R10 y R17 de la base.
