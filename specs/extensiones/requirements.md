# Extensiones — Requirements

Estado: en progreso.

## Contexto

Logday va a sumar funciones que no todo el mundo usa, por ejemplo:

- **Integraciones**, que conectan Logday con otro servicio: enviar el
  daily al chat del equipo, Jira, OpenProject, Granola, Obsidian,
  Excalidraw…
- **Herramientas**, que agregan funciones dentro de Logday: Agenda,
  DevTools…

Si todas estuvieran siempre a la vista, la app se llenaría de pantallas
y opciones que la mayoría no necesita. Este spec define la **base de
extensiones**: cómo se ofrecen, se activan, se configuran y aparecen en
la interfaz. Cada extensión concreta tiene después su propio spec. La
primera es "Chat del equipo" (`logday-server/specs/daily-al-chat/`).

Una extensión **no es un plugin de terceros**. Es código de Logday que
viene incluido, apagado por defecto, y que cada usuario activa. No se
instala ni se descarga nada, y no hay una API pública para terceros. Ver
la decisión "Integraciones incluidas que no dependen del sync" en el
vault.

Este spec es de Desktop, que es donde llega la primera extensión. Web y
Mobile siguen el mismo modelo, con los mismos identificadores, cuando
tengan su primera extensión.

## Requisitos (EARS)

### Catálogo

- R1. Opciones DEBERÁ tener una sección "Extensiones" ("Extensions" en
  inglés) en su barra lateral, con las extensiones disponibles en Desktop en dos grupos:
  "Integraciones" y "Herramientas".
- R2. Cada extensión DEBERÁ mostrar un icono, un nombre, una
  descripción de una línea, en qué apps de Logday existe y un
  interruptor para activarla.
- R3. Todas las extensiones DEBERÁN venir apagadas en una instalación
  nueva.
- R4. El catálogo DEBERÁ mostrar solo extensiones implementadas en
  Desktop. Las que existen solo en otra app NO DEBERÁN aparecer.

### Activar y desactivar

- R5. Cuando el usuario activa una extensión, DEBERÁ aparecer su
  configuración debajo de la tarjeta, y su interfaz en el resto de la
  app.
- R6. Cuando la extensión envía datos a un servicio externo, al
  activarla por primera vez el usuario DEBERÁ aceptar un aviso que diga
  qué datos se envían y a quién. DEBERÁ guardarse la fecha de esa
  aceptación. Si no acepta, la extensión NO DEBERÁ activarse.
- R7. Cuando el usuario desactiva una extensión, DEBERÁ desaparecer toda
  su interfaz, y DEBERÁ dejar de ejecutar cualquier proceso propio
  (temporizadores, envíos programados, peticiones de red). Su
  configuración DEBERÁ conservarse, para que al reactivarla siga igual.
- R8. Cada extensión con configuración DEBERÁ ofrecer "Quitar
  configuración", que borra su configuración y sus secretos, previa
  confirmación. Los secretos son los de claves fijas y también los que
  dependen de su configuración (por ejemplo, uno por variable secreta en
  el Cliente HTTP).
- R9. La activación y la configuración no secreta DEBERÁN guardarse en
  las preferencias locales del equipo y NO DEBERÁN sincronizarse. Es el
  mismo criterio de "Preferencias de UI siempre locales". Una extensión
  que además tenga configuración en la cuenta (por ejemplo, el modo
  cuenta del chat) la define en su propio spec.
- R10. Los secretos de una extensión (tokens, URLs de webhook) DEBERÁN
  guardarse solo en el llavero del sistema operativo. NUNCA DEBERÁN ir
  en `config.json`, en `localStorage`, en los archivos de datos, en los backups de
  configuración ni en el sync.

### Dónde aparece cada extensión

- R11. Una extensión con vista propia (por ejemplo, Agenda o DevTools)
  DEBERÁ aparecer como una sección del menú lateral solo mientras esté
  activada, en el menú de secciones de los dos estilos (Barra de íconos
  y Lista con nombres) y en el colapsado. Va en el orden del usuario: al
  activarla se agrega al final, visible, y al desactivarla conserva su
  lugar por si vuelve. Si no cabe, o si el usuario la oculta, va en
  "Más" (`specs/navegacion-secciones` NS7, NS11, NS12).
  (Cambiado el 30 oct 2026: como lista aparte, debajo de la fila de
  botones, no se leía como una sección más. Cambiado otra vez el 31 oct
  2026, con `specs/navegacion-secciones`: la fila se retiró porque ya no
  cabían las secciones.)
- R12. Una extensión sin vista propia DEBERÁ aparecer solo en los puntos
  de la app donde actúa. Por ejemplo, "Enviar al chat" junto a Copiar en
  el daily.
- R13. Si la pantalla de inicio es la vista de una extensión y esa
  extensión está desactivada, la app DEBERÁ abrir en Inicio.
- R14. Al desactivar una extensión cuya vista está abierta, la app
  DEBERÁ volver a Inicio.
- R21. Una extensión activa con panel de configuración DEBERÁ tener su
  propia entrada en la barra lateral de Opciones, debajo de
  "Extensiones", con su icono y su nombre. Al desactivarla, la entrada
  DEBERÁ desaparecer y, si estaba abierta, Opciones DEBERÁ volver al
  catálogo.
  - Una extensión DEBERÁ poder abrir Opciones directamente en su página
    (por ejemplo, el botón "Opciones" de la vista del Pomodoro).
- R26. Una extensión DEBERÁ poder mostrar un estado pequeño y siempre
  visible en el menú lateral, abajo (encima de "Opciones" o, en la Barra
  de íconos, al pie del panel), tanto con el menú expandido como
  colapsado (por ejemplo, el contador del Pomodoro).
  MIENTRAS no tenga nada que mostrar, NO DEBERÁ ocupar sitio. Su código
  NO DEBERÁ cargarse con la extensión apagada (R16) y un error en él
  DEBERÁ quedar aislado (R15).
- R22. Una extensión DEBERÁ poder mostrar eventos de solo lectura en el
  Calendario de Logday (por ejemplo, las reuniones de Google Calendar),
  distintos de los eventos propios. Esos eventos NO DEBERÁN guardarse en
  disco ni sincronizarse, y DEBERÁN desaparecer al desactivar la
  extensión.
- R23. Las extensiones DEBERÁN poder enterarse de lo que pasa en la app
  (se creó o actualizó una tarea, se guardó una hora extra) con eventos
  que emiten las acciones del store, también cuando el cambio lo hace el
  agente por MCP. Un oyente que falla NO DEBERÁ afectar a la acción.
- R24. Una extensión DEBERÁ poder tener su propio tipo de bloque en las
  notas (un bloque de código con su lenguaje, como ```excalidraw), que
  ella dibuja y edita. Con la extensión apagada, el bloque se ve como un
  bloque de código normal y no se pierde nada. Hay dos modos: el bloque
  que la extensión dibuja entero y edita en un editor aparte (Excalidraw),
  y el modo inline, en el que el código se ve y se edita en la nota y la
  extensión le pone una barra encima y una franja debajo (Cliente HTTP).
- R25. Una extensión DEBERÁ poder registrar un atajo de teclado global y
  tener su propia ventana (por ejemplo, la captura rápida). La ventana se
  crea al activarla y se destruye al desactivarla, y NO DEBERÁ escribir
  en disco por su cuenta: le pide a la ventana principal que lo haga con
  las acciones del store (R18).

### Robustez

- R15. Un error dentro de una extensión NO DEBERÁ cerrar la app. La
  vista o el punto donde actúa la extensión DEBERÁ mostrar un aviso de
  error, con la opción de desactivarla, y el resto de la app DEBERÁ
  seguir funcionando.
- R16. El código de una extensión desactivada NO DEBERÁ cargarse al
  abrir la app.
- R17. Las peticiones de red de una extensión DEBERÁN salir desde Rust,
  solo a los hosts que la extensión declara. Nunca desde el webview a
  hosts arbitrarios. Excepción: el Cliente HTTP (`specs/cliente-http`)
  envía a la URL que escribe el usuario, y solo cuando él pulsa Enviar;
  sigue saliendo desde Rust, solo por http y https y con sus límites.

### Datos

- R18. Si una extensión crea o modifica contenido de Logday (tareas,
  notas, dailys, eventos), DEBERÁ hacerlo con las acciones normales del
  store, para que pase por el sync y LWW/CRDT como cualquier cambio del
  usuario.
- R19. Una extensión que necesite datos propios sincronizados DEBERÁ
  definir antes su contrato con `logday-server` en un spec de ese repo.
  Mientras no lo tenga, sus datos son solo locales.

### Textos

- R20. Los nombres, descripciones y avisos de cada extensión DEBERÁN
  estar en español e inglés, en español con tú y sin voseo.
