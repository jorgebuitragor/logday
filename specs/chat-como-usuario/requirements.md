# Chat del equipo: enviar como yo (Google Chat) — Requirements

Estado: en progreso (implementado; falta la prueba con un cliente OAuth real).

## Contexto

Hoy "Chat del equipo" (`specs/chat-del-equipo/`) envía el daily por un
webhook entrante: el mensaje aparece publicado por un bot con el nombre
del webhook (por ejemplo, "Logday"). Jorge quiere poder enviarlo **a su
nombre**, como si lo escribiera él.

Con Google Chat se puede, usando la API de Chat con la cuenta del
usuario (OAuth): el mensaje aparece como enviado por la persona, y Chat
muestra al lado el nombre de la app que lo envió. Slack y Teams tienen
mecanismos propios y quedan fuera.

Se decidió el 28 oct 2026:

- Quedan dos formas de enviar: **como bot (webhook)**, la de hoy, y
  **como yo (Google Chat, OAuth)**.
- Se descartó enviar por correo a la dirección del espacio: el mensaje
  llega como una tarjeta de correo y necesita un clic en el programa de
  correo cada vez.

## Requisitos (EARS)

### Elegir cómo enviar

- C1. CUANDO el proveedor sea Google Chat, el panel DEBERÁ ofrecer
  "Como bot (webhook)" y "Como yo". Para Slack y Teams solo DEBERÁ
  existir el webhook.
- C2. El webhook DEBERÁ seguir funcionando igual que hoy, y "Como bot"
  DEBERÁ seguir siendo la opción por defecto.

### Conectar la cuenta

- C3. "Conectar con Google" DEBERÁ abrir el navegador del sistema en la
  página de permisos de Google, con el permiso más acotado
  (`chat.messages.create`: crear mensajes, sin leer nada).
- C4. Desktop DEBERÁ recibir la respuesta en `127.0.0.1` (un puerto
  libre solo durante el inicio de sesión) y usar PKCE. Si el usuario
  cancela, o pasan 5 minutos sin respuesta, DEBERÁ cerrar ese puerto y
  decirlo sin romper nada.
- C5. El token de renovación DEBERÁ guardarse solo en el llavero
  (`ext:team-chat:google_refresh`). El token de acceso DEBERÁ vivir solo
  en memoria, en Rust. Ninguno de los dos DEBERÁ llegar al webview.
- C6. El panel DEBERÁ mostrar con qué cuenta se conectó (su correo) y
  ofrecer "Desconectar", que revoca el permiso en Google y borra el
  token del llavero.
- C7. Al elegir "Como yo" por primera vez, DEBERÁ pedirse un aviso de
  consentimiento propio: Logday podrá publicar mensajes en Google Chat
  en nombre del usuario, solo cuando lo pida.

### Elegir el espacio

- C8. El usuario DEBERÁ indicar el espacio pegando su enlace (el de la
  barra de direcciones al abrirlo en el navegador). Desktop DEBERÁ sacar
  de ahí el id (`spaces/…`) y rechazar con un mensaje claro un enlace
  que no sea de un espacio de Google Chat. No se pide permiso para
  listar espacios.

### Enviar

- C9. "Enviar al chat" y "Enviar prueba" DEBERÁN publicar el mismo texto
  que hoy, con `spaces.messages.create`, como el usuario conectado.
- C10. Las peticiones DEBERÁN salir desde Rust, solo a
  `oauth2.googleapis.com` y `chat.googleapis.com` (R17 de la base).
- C11. SI el token de acceso venció, Desktop DEBERÁ renovarlo y
  reintentar una vez. SI Google rechaza la renovación (permiso revocado
  o cuenta deshabilitada), el panel DEBERÁ pedir volver a conectar.
- C12. Los errores DEBERÁN decir qué pasó en lenguaje sencillo: sin
  permiso en ese espacio o no eres miembro (403/404), la organización no
  permite la app (403 de administración) o límite de envíos (429), con
  el código de Google para soporte.

### Textos

- C13. Los textos DEBERÁN estar en español e inglés, con tú y sin voseo.
  La guía paso a paso de `SetupGuide` DEBERÁ tener su versión para
  "Como yo": conectar, copiar el enlace del espacio y enviar una prueba.

## Decisión: de quién es el cliente OAuth

Google exige un **cliente OAuth** (de un proyecto de Google Cloud, con la
API de Chat activada y configurada) para que una app pida permisos.
**Jorge eligió la A el 28 oct 2026.** Estas eran las dos opciones:

- **A. Cada organización crea el suyo (elegida).** Quien administra
  el Google Workspace (por ejemplo, la DSI de la FCV) crea un proyecto,
  lo marca como app **interna** y pega en Logday el id y el secreto del
  cliente, una vez por organización.
  - Las apps internas no pasan por la verificación de Google.
  - Encaja con Logday self-hosted: cada organización es responsable de
    lo suyo, y Jorge no opera un cliente para todos.
  - Contra: alguien con permisos en Google Cloud tiene que hacerlo, con
    una guía para administradores.
- **B. Un cliente de Logday incluido en la app.** El usuario solo inicia
  sesión.
  - Contra: para usuarios fuera de la organización de Jorge, la app sale
    "no verificada" (y limitada a 100 usuarios de prueba) hasta que
    Google la verifique. Además, Jorge queda como responsable de esa
    app ante Google, y el administrador de cada Workspace igual puede
    bloquearla.

## Fuera de alcance

- Enviar como el usuario en Slack o Teams.
- Leer mensajes, listar espacios o publicar tarjetas.
- El envío programado (fase 4 de `daily-al-chat`) en modo "como yo".
- Web y Mobile.
