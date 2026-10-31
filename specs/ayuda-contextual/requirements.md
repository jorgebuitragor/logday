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

- AY1. DEBERÁ haber un solo componente de ayuda, `HelpButton` (`src/components/shared/HelpButton.tsx`), que usen las pantallas de la app y las extensiones. Ninguna pantalla arma su propia ayuda.
- AY2. El botón DEBERÁ:
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
- **Un atajo de teclado para abrir la ayuda de la pantalla actual.** `?` ya es de la lista de tareas, y ⌘? es la ayuda del sistema en macOS.
- **Un campo `help` en `ExtensionDefinition`** para que Opciones dibuje el botón en la página de cada extensión. Por ahora, cada extensión usa `HelpButton` en su propio componente.
- **Ayuda en Inicio, Navegación y Captura rápida:** sus textos ya explican lo que hacen.
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

