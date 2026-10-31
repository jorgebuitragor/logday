# Google Calendar — Requirements

Estado: en progreso.

## Contexto

Extensión de Desktop (`google-calendar`, grupo Integraciones) para ver
las reuniones de Google Calendar dentro del Calendario de Logday, sin
salir de la app. Usa el mismo OAuth que "enviar como yo" en Chat del
equipo (`specs/chat-como-usuario/`): el cliente OAuth interno de la
organización (opción A), el navegador del sistema, PKCE y los tokens
solo en Rust.

Jorge la eligió el 28 oct 2026 como siguiente extensión. Es de solo
lectura: Logday no crea, cambia ni borra eventos en Google.

## Requisitos (EARS)

### Conectar

- G1. El panel DEBERÁ pedir el cliente OAuth de la organización (ID y
  secreto) y ofrecer "Usar el mismo de Chat del equipo" cuando ese ya
  esté guardado. Al reutilizarlo, el secreto DEBERÁ copiarse de una
  entrada del llavero a otra dentro de Rust, sin pasar por el webview.
- G2. "Conectar con Google" DEBERÁ pedir solo
  `calendar.events.readonly` (más `openid email` para mostrar la
  cuenta). Será una conexión aparte de la de Chat del equipo: cada
  permiso se acepta y se quita por separado.
- G3. El token de renovación DEBERÁ ir solo al llavero
  (`ext:google-calendar:google_refresh`) y el de acceso, solo a memoria
  en Rust. "Desconectar" DEBERÁ revocarlo y borrarlo.

### Mostrar

- G4. MIENTRAS la extensión esté activa y conectada, el Calendario de
  Logday DEBERÁ mostrar los eventos del calendario principal del usuario
  en el mes visible, distintos de los eventos propios de Logday y de
  solo lectura.
- G5. Al hacer clic en un evento de Google, DEBERÁ abrirse en Google
  Calendar en el navegador.
- G6. Los eventos de todo el día que duran varios días DEBERÁN verse en
  cada uno de esos días. Los cancelados NO DEBERÁN verse.
- G7. Desktop DEBERÁ pedir los eventos al cambiar de mes y refrescarlos
  cada 10 minutos. Si falla, DEBERÁ dejar los últimos que tenía y
  decirlo en el panel, sin afectar al Calendario.
- G8. Las fechas y horas DEBERÁN mostrarse en hora local
  (`specs/fechas-creacion-edicion`).

- G12. MIENTRAS la extensión esté activa, Inicio DEBERÁ tener al final
  la tarjeta "Reuniones de hoy" (`specs/extensiones` R27): hasta cinco
  eventos de hoy ("hora · título", los de todo el día primero), con
  "Siguiente" en el primero que aún no empezó, "+N más" hacia el
  Calendario y "Ver calendario →". Un evento con enlace se abre en Google
  Calendar. Sin cuenta conectada, la tarjeta lo dice y lleva a Opciones;
  si falla, deja los últimos que tenía con "Reintentar" (como G7). El
  panel DEBERÁ tener "Mostrar en Inicio", encendido por defecto.
  (Pedido de Jorge, 31 oct 2026.)

### Datos

- G9. Los eventos de Google NO DEBERÁN guardarse en disco ni
  sincronizarse: viven en memoria mientras la app está abierta.
- G10. Las peticiones DEBERÁN salir desde Rust, solo a
  `oauth2.googleapis.com` y `www.googleapis.com` (R17 de la base).

### Textos

- G11. Textos en español e inglés, con tú y sin voseo, y una guía paso a
  paso (incluido lo que debe agregar quien administra el Workspace: el
  permiso de Calendar en la pantalla de consentimiento).

## Fuera de alcance (por ahora)

- Enviar el daily unos minutos antes de la reunión "Daily". Depende del
  envío programado (fase 4 de `daily-al-chat`).
- Otros calendarios además del principal, crear o editar eventos, y
  Web y Mobile.
- Exponer los eventos por MCP (puede ir en la segunda parte de MCP).
