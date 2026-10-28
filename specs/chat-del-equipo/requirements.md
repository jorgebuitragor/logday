# Chat del equipo (modo local) — Requirements

Estado: en progreso.

## Contexto

Primera extensión de Desktop (`team-chat`, grupo Integraciones): enviar
el daily al chat del equipo por un webhook entrante de Google Chat,
Slack o Microsoft Teams (Workflows).

El contrato común (proveedores, validación de la URL, cuerpo, límites)
y los requisitos R1–R32 están en
`logday-server/specs/daily-al-chat/requirements.md`. Este spec es la
parte local de Desktop (fase 1 de ese spec) y no repite esos
requisitos: los cita. La base (catálogo, activación, aviso, llavero)
está en `specs/extensiones/`.

## Alcance de esta fase

Cumple, en modo local: R1, R9–R14, R15–R21, R30–R32 del spec del chat.

Fuera de esta fase:

- modo cuenta y elegir el modo (R2–R5, fase 2);
- envío programado (R22–R29, fase 4).

## Requisitos propios de Desktop

- D1. La URL del webhook DEBERÁ cruzar al lado Rust una sola vez, al
  guardarla, y NO DEBERÁ volver al webview. El envío lo hace un comando
  Rust que la lee del llavero.
- D2. El botón "Enviar al chat" DEBERÁ enviar el texto que devuelve
  `copyDailyFormat` para la fecha del daily abierto, después de guardar
  lo pendiente del editor, igual que Copiar.
- D3. Si el proveedor elegido no corresponde a la URL guardada (porque
  el usuario lo cambió sin pegar una URL nueva), el envío DEBERÁ
  rechazarse con "hay que volver a configurar", sin llamar a la red.
- D4. El panel DEBERÁ incluir una guía paso a paso, para alguien sin
  conocimientos técnicos, de cómo conseguir la URL del webhook en el
  proveedor elegido. Tiene que cubrir el último tramo (pegar, guardar y
  enviar una prueba), los bloqueos habituales (cuenta personal, canal
  privado, opción desactivada por la organización) y que la URL se cuida
  como una contraseña, y enlazar a la ayuda oficial del proveedor.
  DEBERÁ venir abierta mientras no haya una URL guardada.
