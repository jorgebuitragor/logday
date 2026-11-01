# Ayuda contextual — Requirements

Estado: en progreso.

## Contexto

Varias pantallas de Logday Desktop hacen cosas que no se ven a simple vista, y no hay dónde consultarlas:

- **DevTools tiene 20 herramientas y 10 atajos, y ningún lugar los lista.** Tampoco se explica que "Traer de una nota" elige la herramienta según el lenguaje del bloque, ni que lo pegado solo vive en la memoria.
- **Los atajos de la lista de tareas solo se descubren pulsando `?`.** `TaskShortcutsSheet` existe, pero ningún botón la abre (`TaskList.tsx:234`).
- **Dailys, Horas extra y Pomodoro tienen funciones escondidas:**
  - Dailys: `#` para el código de una tarea, el panel "Previo", la exportación con clic derecho en el mes;
  - Horas extra: el desglose automático y los íconos del pie sin texto;
  - Pomodoro: los atajos ⌘⇧→, ⌘⇧← y ⌘⇧T.
- **El recorrido de la bienvenida** (specs/onboarding) explica la app en general, no cada pantalla.

Jorge pidió el 31 oct 2026 "botones de ayuda (información) para saber cómo funcionan ciertas pantallas o procesos", con DevTools como ejemplo. El agente de diseño (`logday-design`) propuso el patrón y el inventario de abajo, y Jorge los aprobó tal cual para el primer PR.

## Requisitos (EARS)

### El patrón

- AY1. DEBERÁ haber un solo componente de ayuda, `HelpButton` (`src/components/shared/HelpButton.tsx`), que usen las pantallas de la app y las extensiones. Ninguna pantalla arma su propia ayuda. *(Desde AY24 es `useHelpPopover`, en `src/components/shared/HelpPopover.tsx`, y lo usa el botón del menú lateral.)*
- AY2. *(Reemplazado por AY24 el 31 oct 2026.)* El botón DEBERÁ:
  - mostrar el ícono `CircleHelp`;
  - ir justo después del título de la vista o de la sección, en todas las pantallas;
  - no ir dentro del encabezado (`<h1>`/`<h2>`), para no sumarse a su nombre.
- AY3. CUANDO se pulsa el botón, se DEBERÁ abrir una ayuda breve en un popover anclado al botón. No tiene fondo oscuro ni tapa la pantalla que explica.
- AY4. La ayuda DEBERÁ tener un título y de 2 a 5 puntos o pasos. PODRÁ tener además:
  - una lista de atajos;
  - una nota;
  - acciones al pie, como "Ver el recorrido" o "Ver todos los atajos".
- AY5. CUANDO la ayuda tiene "Ver el recorrido", al pulsarlo DEBERÁ cerrarse la ayuda y abrirse `TourModal` en la escena que corresponde a la pantalla.
- AY6. Solo DEBERÁ haber una ayuda abierta a la vez. Al cambiar de sección, la ayuda se cierra.

### Teclado y foco

- AY7. Al abrirse la ayuda, el foco DEBERÁ ir a ella. Tab recorre solo sus controles, hasta que se cierre.
- AY8. Esc, el botón Cerrar o un clic fuera DEBERÁN cerrar la ayuda, y el foco vuelve al botón.
  - Esc cierra solo la ayuda, aunque esté dentro de Opciones.
  - Con el clic fuera, el foco vuelve al botón solo si estaba dentro de la ayuda.
- AY9. Las teclas pulsadas dentro de la ayuda NO DEBERÁN llegar a los atajos de la pantalla de detrás: por ejemplo, Espacio no arranca el Pomodoro y ⌘⇧C no copia en DevTools. Los atajos globales de la app (⌘N, ⌘1…⌘9) siguen funcionando.
- AY10. SI el contenedor de la pantalla se desplaza con la ayuda abierta, la ayuda se DEBERÁ cerrar.

### Accesibilidad

- AY11. El botón DEBERÁ:
  - tener un nombre accesible "Ayuda: {pantalla}";
  - anunciar que abre un diálogo y si está abierto;
  - tener un objetivo de al menos 28×28 px;
  - mostrar el foco visible.
- AY12. La ayuda DEBERÁ:
  - ser un diálogo con su título como nombre y su intro, si la tiene, como descripción;
  - tener listas y teclas semánticas (`ol`, `ul`, `dl`, `kbd`);
  - usar solo los tokens del tema, salvo el acento de los enlaces, en los 8 temas y en los personalizados;
  - quedarse en el fotograma final con `prefers-reduced-motion` o `.no-animations`.

### Contenido

- AY13. Los atajos que nombra la ayuda DEBERÁN salir de la config y del sistema, no escribirse a mano:
  - las letras configuradas en `shortcuts`;
  - ⌘ en macOS y Ctrl en Windows y Linux;
  - los atajos propios de DevTools y Pomodoro, con su función de formato.
- AY14. Los textos DEBERÁN estar en español y en inglés, sin voseo, con los nombres reales de los botones de cada pantalla. Ninguna función prometida que no exista.
- AY15. La ayuda NO DEBERÁ repetir una guía que la pantalla ya tenga en línea. Por ejemplo, las de Google Calendar, OpenProject y Chat del equipo.

### Pantallas de este PR

- AY16. **DevTools:** una ayuda en la cabecera de la herramienta que tenga:
  - lo general (elegir herramienta, entrada y resultado, traer de una nota, guardar en una nota, lo que se guarda);
  - la lista de sus atajos;
  - en Expresiones regulares, Cron, Lista para SQL IN, Comparar listas, Comparar textos, Código QR, Código de barras y JWT, un apartado "En esta herramienta" encima.
- AY17. **Tareas:** la misma ayuda en Lista, Kanban y Calendario, con "Ver todos los atajos", que abre `TaskShortcutsSheet`, y "Ver el recorrido".
- AY18. **Dailys:** una ayuda en la cabecera de la lista, con "Ver el recorrido".
- AY19. **Horas extra:** una ayuda en la cabecera de la lista, con "Ver el recorrido".
- AY20. **Pomodoro:** una ayuda en la cabecera de la vista, con sus atajos.

### Arreglos que van en el mismo PR

- AY21. La cabecera de la lista de Horas extra DEBERÁ decir "Horas extra" y no "Extras", como el menú (NS8, specs/navegacion-secciones).
- AY22. `TaskShortcutsSheet` DEBERÁ mostrar ⌘ en macOS y Ctrl en Windows y Linux.

## Fuera de alcance

- **La ayuda de Notas, Opciones → Sync, Agentes de IA (MCP) y Git** va en un PR posterior.
  - Git, además, no hace lo que dice: el commit cada hora solo corre con Opciones abierto (`GitSettingsTab.tsx:58-69`), "Push al sincronizar" no se usa en ningún lado, y el recorrido promete "commits y push automáticos". Lo decide Jorge antes de escribir su ayuda.
- ~~**Un atajo de teclado para abrir la ayuda de la pantalla actual.**~~ Entró el 31 oct 2026: es ⌘/ (AY27). `?` sigue siendo de la lista de tareas, y ⌘? de la ayuda del sistema en macOS.
- **Un campo `help` en `ExtensionDefinition`** para que Opciones dibuje el botón en la página de cada extensión. Por ahora, cada extensión usa `HelpButton` en su propio componente.
- **Una ayuda propia de Inicio, Navegación y Captura rápida:** sus textos ya explican lo que hacen. Desde el 31 oct 2026, en Inicio y en las secciones sin ayuda propia el botón muestra la ayuda general (AY26).
- **Enlaces a documentación externa:** no hay documentación pública.

## Decisiones (31 oct 2026)

Jorge aprobó la propuesta del agente de diseño, y el orquestador cerró los puntos que quedaban abiertos:

- el ícono es `CircleHelp`, no `Info`: `Info` ya significa "Acerca de" en Opciones, aviso en los toasts y nota en las opciones de Pomodoro;
- el botón va junto al título en todas las pantallas;
- la forma es un popover anclado: un modal tapa lo que explica, y un panel lateral no cabe a 800 px;
- no hay atajo para abrir la ayuda en este PR;
- Horas extra se llama "Horas extra" también en su cabecera;
- `TaskShortcutsSheet` muestra Ctrl fuera de macOS;
- Notas, Sync, MCP y Git quedan fuera de este PR.

## Cambio del 31 oct 2026

- AY23. Opciones → Preferencias DEBERÁ tener el interruptor "Botones de ayuda" (encendido por defecto, local, sin sync). Apagado, no se dibuja ningún botón de ayuda. Lo pidió Jorge al probar la app de QA.
  - Desde AY24 se llama "Botón de ayuda" ("Help button"), con la descripción "Muestra «Ayuda» en el menú lateral, con la ayuda de la pantalla en la que estás." Apagado, tampoco funciona ⌘/.

## Cambio del 31 oct 2026: un solo botón en el menú lateral

Pedido por Jorge: el botón (?) se solapaba con los de las cabeceras angostas. En vez de un botón junto al título de cada pantalla, hay uno solo en el menú lateral, que muestra la ayuda de la pantalla activa. Reemplaza AY2, y ajusta AY8, AY10 y AY16–AY20 en lo que dicen de dónde va el botón.

- AY24. DEBERÁ haber un solo botón "Ayuda" en el menú lateral, con el ícono `CircleHelp`, y ningún botón de ayuda en las cabeceras:
  - en la Lista con nombres, una fila "Ayuda" justo encima de "Opciones", con su mismo estilo;
  - en la Barra de íconos y en el menú colapsado, un ícono encima de Buscar, con su mismo estilo y con el tooltip de la columna (nombre y atajo);
  - con el nombre accesible "Ayuda: {pantalla}", `aria-haspopup="dialog"` y `aria-expanded`.
- AY25. CUANDO se pulsa, DEBERÁ mostrar la ayuda de la sección activa, con el contenido de AY16–AY20:
  - Tareas, la misma en Lista, Kanban y Calendario; "Ver todos los atajos" abre `TaskShortcutsSheet` de la vista activa;
  - Dailys, Horas extra, DevTools y Pomodoro;
  - en DevTools, "En esta herramienta" es el de la última herramienta abierta.
- AY26. En las secciones sin ayuda propia (Inicio, Notas y las demás extensiones), DEBERÁ mostrar una ayuda general, "Cómo funciona Logday":
  - moverse: ⌘0…⌘9, Buscar con "Ir a", el clic derecho en las secciones y "Más";
  - crear: nueva tarea, nueva nota y el daily de hoy, con las teclas de la config;
  - ⌘/, y "Ver el recorrido".
- AY27. ⌘/ (Ctrl+/ fuera de macOS) DEBERÁ abrir o cerrar la ayuda de la pantalla activa, como el botón, también con el foco en un campo.
  - No funciona con AY23 apagado ni durante la bienvenida.
  - Se muestra en el tooltip del botón, en Opciones → Atajos (fijo, como "Ir a una sección") y en la ayuda general.
  - "/" no se puede elegir como tecla de otro atajo.
  - Con la ayuda abierta con ⌘/, al cerrarla el foco vuelve adonde estaba (AY8 dice "al botón" para cuando se abre con el botón).
- AY28. La ayuda DEBERÁ abrirse a la derecha del menú lateral, fuera de él y sobre el contenido, alineada por abajo con el botón. Si no cabe, se ajusta a la ventana. Si el botón no se ve, se abre en la esquina inferior izquierda.
- AY29. AY10 aplica solo a lo que mueve el botón: desplazar la pantalla de al lado no cierra la ayuda, porque el botón está fijo en el menú.

Los títulos de las cabeceras de Tareas, Kanban, Calendario, Dailys y Horas extra siguen recortándose con "…" y sus botones sin encogerse: es una mejora aparte, que se queda.


## Cambio del 31 oct 2026: la pantalla del Cliente HTTP

La extensión Cliente HTTP pasó de ser una herramienta de DevTools a tener su propia sección (specs/cliente-http HT33). Pedido por Jorge.

- AY30. La sección del Cliente HTTP DEBERÁ tener su ayuda propia, "Cómo funciona el Cliente HTTP", con el botón "Ayuda: Cliente HTTP" (AY25):
  - la columna "Peticiones", que reúne los bloques ```` ```http ```` de todas las notas, y cómo crear una;
  - el formulario, las variables `{{nombre}}` y el entorno activo;
  - los entornos y los secretos (Opciones → Cliente HTTP, el llavero, las confirmaciones);
  - que lo que se cambia en la pantalla no toca la nota;
  - que los bloques de las notas también se envían desde la nota, con ⌘↵;
  - y sus atajos: ⌘↵ (Ctrl+Enter fuera de macOS), Enter en la URL y Esc.
- Con esto, DevTools vuelve a no tener nada del Cliente HTTP en su ayuda: sin "En esta herramienta" de Cliente HTTP ni las filas `help.k.runHttp` y `help.k.tabsHttp`.
