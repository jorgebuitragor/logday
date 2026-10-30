# Captura rápida — Requirements

Estado: en progreso.

## Contexto

Extensión de Desktop (`quick-capture`, grupo Herramientas): un atajo de
teclado del sistema abre una ventanita encima de cualquier app para
anotar una tarea o una nota sin traer Logday al frente. Se escribe, se
pulsa Enter y se vuelve a lo que se estaba haciendo.

El menú de la bandeja ya tiene "Nueva tarea" y "Nueva nota", pero
muestran la ventana principal entera y cambian de sección. Esto es
distinto: no saca al usuario de lo que tiene abierto.

Jorge la eligió el 29 oct 2026 como siguiente extensión, entre las ideas
nuevas de herramientas (la otra candidata era el informe del periodo).

## Requisitos (EARS)

### Atajo

- C1. MIENTRAS la extensión esté activa, Logday DEBERÁ registrar un
  atajo de teclado global (funciona aunque Logday no tenga el foco o
  tenga la ventana oculta). Por defecto: ⌘⇧Espacio en macOS y
  Ctrl+Shift+Espacio en Windows y Linux.
- C2. El panel DEBERÁ permitir cambiar el atajo pulsándolo. Un atajo
  DEBERÁ llevar al menos un modificador (⌘/Ctrl, ⌥/Alt o ⇧) y una tecla
  que no sea modificador.
- C3. SI el sistema no deja registrar el atajo (lo usa otra app, o el
  sistema no admite atajos globales, como Wayland en Linux), el panel
  DEBERÁ decirlo y sugerir otro. La extensión sigue funcionando desde la
  bandeja (C4).
- C4. MIENTRAS la extensión esté activa, el menú de la bandeja DEBERÁ
  tener "Captura rápida", con el atajo al lado si está registrado.
- C5. Al desactivar la extensión, el atajo DEBERÁ liberarse y la entrada
  de la bandeja DEBERÁ desaparecer.

### Ventana

- C6. El atajo DEBERÁ mostrar una ventana pequeña, sin bordes, siempre
  encima, fuera de la barra de tareas y centrada en la pantalla donde
  está el puntero, con el cursor ya en el campo de texto. La ventana
  principal NO DEBERÁ mostrarse ni cambiar de sección.
- C7. Pulsar el atajo con la ventana abierta DEBERÁ ocultarla.
- C8. La ventana DEBERÁ ofrecer el tipo (tarea o nota; por defecto el
  que elija el usuario en el panel) y el destino (proyecto para la
  tarea, carpeta para la nota; por defecto el del panel). Tab DEBERÁ
  pasar del texto al tipo y al destino sin tocar el ratón.
- C9. La primera línea DEBERÁ ser el título; las demás, el contenido.
  Shift+Enter DEBERÁ hacer un salto de línea.
- C10. Esc, o perder el foco, DEBERÁ ocultar la ventana sin guardar. El
  texto escrito DEBERÁ conservarse hasta la próxima vez que se abra
  mientras Logday siga abierto, para no perderlo por un clic fuera.
- C11. Al ocultarse, SI Logday no era la app activa al abrirla, el foco
  DEBERÁ volver a la app que se estaba usando, sin traer al frente la
  ventana principal.
- C12. La ventana DEBERÁ usar el idioma y el tema de la app.

### Guardar

- C13. Enter DEBERÁ guardar y ocultar la ventana. ⌘/Ctrl+Enter DEBERÁ
  guardar y abrir lo creado en la ventana principal.
- C14. Un título vacío NO DEBERÁ guardarse.
- C15. Lo capturado DEBERÁ crearse con las acciones normales del store
  de la ventana principal (R18 de la base): pasa por el sync, LWW y el
  CRDT, y emite los eventos de la app (R23), así que también llega al
  webhook saliente si está activo.
- C16. Tras guardar, la ventana DEBERÁ confirmar un momento dónde quedó
  ("Tarea creada en Trabajo") antes de ocultarse.
- C17. SI la ventana principal no confirma en 5 s, o falla al guardar,
  la ventana DEBERÁ quedarse abierta con el texto y un aviso, para
  reintentar.
- C18. SI Logday no está configurado todavía (sin carpeta de datos), la
  ventana DEBERÁ decirlo en vez de ofrecer guardar.

### Datos y robustez

- C19. La extensión NO DEBERÁ enviar nada fuera del equipo; por eso no
  pide el aviso de la base (R6).
- C20. Con la extensión apagada, el atajo, la ventana y su código NO
  DEBERÁN existir ni cargarse (R16).
- C21. Un error en la ventana de captura NO DEBERÁ afectar a la ventana
  principal (R15).

### Textos

- C22. Textos en español e inglés, con tú y sin voseo.

## Fuera de alcance

- Sintaxis rápida en el texto (`#etiqueta`, fechas como "mañana"). Un
  `#123` en un título no debe convertirse en etiqueta por accidente;
  se decide aparte si hace falta.
- Fecha de vencimiento, etiquetas o progreso en la ventana.
- Arrancar Logday con el sistema: la captura necesita la app abierta
  (aunque sea solo en la bandeja).
- Un comando de terminal (`logday --capture`) para asignarlo como atajo
  del sistema donde no hay atajos globales (Wayland).
- Adjuntar archivos o capturas de pantalla.
- Captura en Web y Mobile (en Mobile sería el menú Compartir o un widget,
  con su propia spec).

## Decisiones de Jorge (29 oct 2026)

- Atajo por defecto: ⌘⇧Espacio en macOS y Ctrl+Shift+Espacio en Windows
  y Linux, los propuestos. Quien lo tenga ocupado lo cambia en el panel.
- Destino por defecto: la raíz. Para una tarea es `inbox`, el proyecto
  que la app ya usa para las tareas sin proyecto; para una nota, sin
  carpeta.
