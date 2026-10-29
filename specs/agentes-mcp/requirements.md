# Agentes de IA (MCP) — Requirements

Estado: en progreso.

## Contexto

Extensión de Desktop (`mcp`, grupo Integraciones) para que un agente de
código, como Claude Code o Codex, lea y cree tareas y dailys en Logday
por el protocolo MCP (Model Context Protocol). Así se puede pedir, desde
la terminal, "crea una tarea para revisar el PR" o "agrega al daily de
hoy lo que hicimos".

Logday abre un servidor MCP local, solo en `127.0.0.1`, mientras la app
está abierta y la extensión activa. Las lecturas y escrituras pasan por
el store, como si las hiciera el usuario. La base (catálogo, aviso,
llavero, carga diferida) está en `specs/extensiones/`.

Lo que el agente lee termina en el proveedor del modelo (Anthropic,
OpenAI…), así que la extensión pide el aviso de la base al activarla.

## Requisitos (EARS)

### Servidor

- R1. MIENTRAS la extensión esté activa y tenga un token, Desktop DEBERÁ
  atender MCP por HTTP (transporte "Streamable HTTP") en
  `http://127.0.0.1:<puerto>/mcp`.
- R2. El servidor DEBERÁ escuchar solo en `127.0.0.1`, nunca en otras
  interfaces de red.
- R3. El puerto DEBERÁ ser configurable, con 47321 por defecto. SI el
  puerto está ocupado, la extensión DEBERÁ mostrarlo en su panel sin
  afectar al resto de la app.
- R4. CUANDO se desactive la extensión, se cierre la app o se cambie el
  puerto, el servidor DEBERÁ cerrarse (y, si sigue activa, abrirse en el
  puerto nuevo).

### Acceso

- R5. Cada petición DEBERÁ llevar `Authorization: Bearer <token>`. Sin
  el token correcto, el servidor DEBERÁ responder 401 sin tocar datos.
- R6. El token DEBERÁ generarse en el equipo (32 bytes aleatorios) y
  guardarse solo en el llavero del sistema (`ext:mcp:token`).
- R7. El token DEBERÁ mostrarse una sola vez, al generarlo, junto con
  los comandos para registrar el servidor en Claude Code y en Codex.
  Después solo se ve su pista y se puede regenerar, lo que invalida el
  anterior.
- R8. El servidor DEBERÁ rechazar con 403 las peticiones con cabecera
  `Origin` (las hace un navegador, no un agente) y las que tengan un
  `Host` distinto de `127.0.0.1:<puerto>` o `localhost:<puerto>`
  (protección contra DNS rebinding).
- R9. El servidor DEBERÁ rechazar cuerpos de más de 1 MiB, métodos
  distintos de POST y rutas distintas de `/mcp`.

### Herramientas

- R10. El servidor DEBERÁ ofrecer, en solo lectura:
  - `list_projects`: los proyectos;
  - `list_tasks`: tareas de todos los proyectos, filtrables por
    proyecto, estado y texto;
  - `get_task`: una tarea con su contenido;
  - `get_daily`: el texto del daily de una fecha (hoy por defecto);
  - `list_note_folders`, `list_notes` (filtrables por carpeta y texto,
    que busca también en el contenido y devuelve un trozo) y `get_note`;
  - `get_overtime`: las horas extra de un mes, con sus totales.
- R11. MIENTRAS el panel tenga activado "Permitir cambios", el servidor
  DEBERÁ ofrecer además:
  - `create_task`;
  - `update_task`: título, estado, vencimiento, etiquetas y contenido;
  - `append_to_daily`: agrega texto al final del daily de una fecha;
  - `create_note`: una nota con título y contenido, sin abrirla. Usa el
    mismo camino que importar notas (el `.md` y el sync).
- R11b. Las horas extra DEBERÁN ser solo de lectura: alimentan la
  nómina, y un error del agente ahí cuesta.
- R12. "Permitir cambios" DEBERÁ venir apagado. Mientras esté apagado,
  las herramientas de R11 NO DEBERÁN aparecer en la lista, y llamarlas
  DEBERÁ devolver un error que lo explique.
- R13. El servidor NO DEBERÁ ofrecer herramientas para borrar.
- R14. Las escrituras DEBERÁN usar las acciones normales del store
  (`createTask`, `updateTask`, `saveDailyEntry`), para que pasen por
  las reglas de fechas, el sync, Git y LWW/CRDT (R18 de la base).
- R15. SI una herramienta recibe un proyecto o un id que no existe, o un
  argumento inválido, DEBERÁ devolver un error de herramienta
  (`isError: true`) con un mensaje claro, sin escribir nada.

### Protocolo

- R16. El servidor DEBERÁ responder `initialize`, `ping`, `tools/list` y
  `tools/call`, y aceptar `notifications/initialized` con 202.
- R17. El servidor DEBERÁ responder con `application/json` (sin SSE) y
  negociar la versión del protocolo: la del cliente si la conoce, o la
  más reciente que soporta.
- R18. SI la app no responde a una petición en 30 s, el servidor DEBERÁ
  devolver un error JSON-RPC en vez de dejar al agente esperando.

### Panel

- R19. El panel de la extensión DEBERÁ mostrar el estado del servidor
  (escuchando en el puerto, puerto ocupado o sin token), el puerto, el
  interruptor "Permitir cambios" y el token (generar o regenerar).
- R20. Los textos DEBERÁN estar en español e inglés, en español con tú
  y sin voseo (R20 de la base).

## Fuera de alcance (por ahora)

- Editar notas existentes: su contenido va por el CRDT del editor, y
  escribir encima desde fuera puede chocar con la nota abierta.
- Crear o cambiar horas extra (R11b) y el calendario.
- Modo cuenta en `logday-server`, para usarlo con la app cerrada o desde
  otro equipo.
- Transporte stdio y SSE.
