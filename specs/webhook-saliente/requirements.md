# Webhook saliente (n8n) — Requirements

Estado: en progreso.

## Contexto

Extensión de Desktop (`outgoing-webhook`, grupo Integraciones): Logday
avisa a una URL del usuario cuando pasan cosas (se crea o se completa una
tarea, se guarda una hora extra) y, a pedido, le manda el daily. Así se
arma en n8n (o Zapier, Make, un script…) lo que haga falta sin que Logday
integre cada servicio. Es la idea de "API con webhooks" de las
integraciones opcionales, en modo local.

Jorge la eligió el 28 oct 2026, después de Google Calendar y de la
segunda parte de MCP.

## Requisitos (EARS)

### Configurar

- W1. El panel DEBERÁ pedir la URL del webhook. Se acepta `https://`
  con cualquier host, y `http://` solo para `localhost` y `127.0.0.1`
  (n8n de pruebas en el mismo equipo).
- W2. La URL DEBERÁ guardarse solo en el llavero
  (`ext:outgoing-webhook:url`), porque suele llevar un token. El panel
  muestra su pista.
- W3. El panel DEBERÁ permitir un secreto opcional, también en el
  llavero. Con secreto, cada envío DEBERÁ llevar
  `X-Logday-Signature: sha256=<hex>`, el HMAC-SHA256 del cuerpo, para
  que el flujo compruebe que viene de Logday.
- W4. El usuario DEBERÁ elegir qué eventos se envían. Todos vienen
  apagados, salvo la prueba.

### Eventos

- W5. Eventos automáticos (si están elegidos):
  - `task.created`: se creó una tarea;
  - `task.completed`: una tarea pasó a hecha;
  - `overtime.saved`: se guardó una entrada de horas extra.
- W6. `daily.sent`: el botón "Enviar a n8n" junto a Copiar en el daily
  DEBERÁ enviar el mismo texto de Copiar. El daily no se envía solo,
  porque se guarda a cada rato mientras se escribe.
- W7. "Enviar prueba" DEBERÁ mandar un evento `test`.
- W8. Los eventos DEBERÁN salir también cuando el cambio lo hace el
  agente por MCP: se emiten desde las acciones del store, no desde la
  interfaz.

### Envío

- W9. Cada envío DEBERÁ ser un POST JSON:
  `{ "event", "at", "source": "logday-desktop", "data" }`, desde Rust,
  con 10 s de plazo, sin redirecciones y como mucho 60 envíos por hora.
- W10. Un envío que falla NO DEBERÁ afectar a la app ni reintentarse
  solo. El panel DEBERÁ mostrar el último resultado (evento, hora y
  código HTTP o error).

### Datos

- W11. Al activar la extensión DEBERÁ pedirse el aviso de la base (R6):
  se envían datos de Logday a un servicio que elige el usuario.
- W12. `data` DEBERÁ llevar lo mínimo útil:
  - tarea: id, título, proyecto, estado, vencimiento, etiquetas, código
    y `completedAt`, sin el contenido;
  - hora extra: la entrada con sus horas;
  - daily: la fecha y el texto.

### Textos

- W13. Textos en español e inglés, con tú y sin voseo, y una guía paso a
  paso para n8n (nodo Webhook, método POST, URL de producción y cómo
  verificar la firma).

## Fuera de alcance

- Reintentos y cola de envíos pendientes.
- Eventos de notas (su contenido va por el CRDT y se guarda a cada rato).
- Un webhook en `logday-server` (modo cuenta).
