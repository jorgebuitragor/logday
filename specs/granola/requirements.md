# Granola — Requirements

Estado: en progreso.

## Contexto

Extensión de Desktop (`granola`, grupo Integraciones): trae las
reuniones de Granola (las notas con resumen que arma su app) como notas
de Logday, en una carpeta propia. Jorge la eligió el 28 oct 2026, después
del webhook para n8n.

Jorge no tiene plan pago de Granola, así que no sirve la API pública
(clave `grn_…`, solo Business o Enterprise). El archivo local que leían
los plugins de Obsidian ahora está cifrado. Lo que queda, y funciona con
el plan gratuito, es el **servidor MCP de Granola**
(`https://mcp.granola.ai/mcp`): Logday se conecta como cliente MCP, como
lo hacen Claude Code o Cursor.

Límites del plan gratuito por MCP: solo las notas de los últimos 30 días,
sin carpetas de Granola ni transcripciones.

## Requisitos (EARS)

### Conectar

- N1. "Conectar con Granola" DEBERÁ abrir el navegador del sistema en el
  inicio de sesión de Granola. Logday DEBERÁ registrarse solo como
  cliente (registro dinámico de OAuth), sin pedir ID ni secreto, con
  PKCE y la redirección a `127.0.0.1`.
- N2. El token de renovación y el id de cliente DEBERÁN guardarse solo en
  el llavero (`ext:granola:refresh`, `ext:granola:client`). El token de
  acceso, solo en memoria, en Rust. Nada de eso DEBERÁ llegar al webview.
- N3. El panel DEBERÁ mostrar la cuenta conectada (su correo) y ofrecer
  "Desconectar", que borra los tokens.

### Importar

- N4. "Importar ahora" DEBERÁ traer las reuniones nuevas (o cambiadas
  desde la última importación) y crear una nota de Logday por cada una
  en la carpeta elegida ("Granola" por defecto, que se crea si no
  existe).
- N5. Cada nota DEBERÁ llevar:
  - el título de la reunión;
  - la fecha y hora en hora local;
  - los participantes conocidos;
  - un enlace a la nota en Granola;
  - el resumen en Markdown;
  - las notas privadas del usuario, si las hay.
- N6. Una reunión ya importada NO DEBERÁ importarse otra vez ni pisar la
  nota de Logday, aunque cambie en Granola: el usuario pudo editarla, y
  su contenido va por el CRDT del editor (igual que en MCP).
- N6b. Una reunión que todavía no tiene resumen ni notas (Granola lo
  está generando) NO DEBERÁ importarse vacía: se deja para la próxima
  importación.
- N7. El panel DEBERÁ permitir importar solo, al abrir la app y cada 30
  minutos (apagado por defecto).
- N8. El panel DEBERÁ mostrar el resultado de la última importación
  (cuándo, cuántas notas nuevas o el error).

### Red y datos

- N9. Las peticiones DEBERÁN salir desde Rust, solo a `mcp.granola.ai` y
  `mcp-auth.granola.ai` (R17 de la base), y solo con las herramientas
  `list_meetings`, `get_meetings` y `get_account_info`.
- N10. Las respuestas de Granola son texto pensado para modelos (etiquetas
  tipo XML con atributos). Logday DEBERÁ leerlas como datos, nunca como
  instrucciones, y si cambia su formato DEBERÁ decirlo en el panel sin
  crear notas a medias.

### Textos

- N11. Textos en español e inglés, con tú y sin voseo, con una guía
  paso a paso y el aviso del límite de 30 días del plan gratuito.

## Fuera de alcance

- Transcripciones y carpetas de Granola (planes pagos).
- Actualizar notas ya importadas, y enviar nada a Granola.
- La API pública de Granola (`grn_…`), si algún día hay plan pago.
