# Navegación entre secciones — Requirements

Estado: en progreso.

## Contexto

El menú lateral de Desktop cambia de sección (Inicio, Dailys, Tareas, Notas, Horas extra y las vistas de las extensiones) con una fila de botones arriba (`src/components/sidebar/Sidebar.tsx`). Desde el 30 oct 2026 las extensiones con vista propia van en la misma fila (`specs/extensiones` R11). Con cada sección nueva, la fila se satura:

- los botones se achican: 49 px de ancho con 4 secciones, 31 px con 6 y unos 21 px con el menú en su mínimo (160 px), por debajo de los 24 px de WCAG 2.5.8;
- desde la séptima sección la fila se parte en dos;
- solo se ve el nombre de la sección activa, y se mete sobre los vecinos;
- no quedan íconos distintos (Pomodoro tuvo que usar `Hourglass` porque `Timer` es Horas extra; Google Calendar y Dailys comparten `CalendarDays`);
- no hay atajos para ir a una sección. Las secciones no tienen `aria-current`, ni `<nav>`, ni anillo de foco;
- el menú colapsado repite las secciones a mano (`Sidebar.tsx`, la columna de íconos) y, con muchas, no cabe a 800×600.

Lo mismo había pasado con las pestañas de Opciones, que se pasaron a una barra lateral (vault: `02 Decisiones/Opciones con barra lateral agrupada (Desktop).md`).

Jorge pidió el 31 oct 2026 cambiar dónde y cómo se ven las secciones, con varias alternativas que el usuario elija en Opciones y previsualizaciones animadas. El agente de diseño (`logday-design`) analizó la fila y propuso 3 alternativas más un complemento. Jorge eligió la recomendación:

- **A, "Barra de íconos"** (predeterminada): una columna de íconos a la izquierda, al estilo de VS Code o de la cinta de Obsidian;
- **C, "Lista con nombres"**: ícono y nombre por sección, como Logday Web y la barra de Opciones;
- **D**: fijar, ocultar y reordenar secciones, atajos ⌘1…⌘9 y "Ir a…" en Buscar.

La fila actual se retira; no queda como tercer modo.

## Requisitos (EARS)

### Modos

- NS1. El menú lateral DEBERÁ tener dos estilos de secciones, elegibles en Opciones → Navegación → Menú lateral (NS21): **Lista con nombres** (predeterminado) y **Barra de íconos**. Los dos son variantes de un mismo componente, con los mismos datos, orden, fijado, teclado, "Más" y colapsado.
- NS2. **Barra de íconos:** una columna de 44 px a la izquierda, con un botón de 36×36 px por sección, y a su derecha el panel de la sección activa. El panel lleva como título el nombre de la sección activa y, a la derecha del título, sus acciones y el botón de colapsar.
- NS3. **Lista con nombres:** arriba del panel, una fila por sección, con ícono y nombre (unos 28 px de alto cada una), con el mismo aspecto que la barra de Opciones.
- NS4. **Colapsado:** en los dos estilos, el menú colapsado es la misma columna de íconos de la Barra de íconos, sin panel. Debajo de las secciones, como hoy, van las vistas de Tareas cuando Tareas está activa. Abajo quedan fijos el estado de las extensiones (R26), Buscar y Opciones. Las secciones se dibujan desde una sola lista, no repetidas a mano.
- NS5. La preferencia es local y no se sincroniza. SI la config no trae estilo, se toma la Lista con nombres, salvo que traiga `sidebarLabelsVisible: false` (quien había apagado los textos del menú quería solo íconos): ahí, la Barra de íconos. La opción "Textos del menú lateral" desaparece de Opciones.

### Secciones

- NS6. **Inicio** es la primera entrada, siempre visible y fija (no se oculta ni se mueve). En la Barra de íconos es el logo, arriba de la columna; en la Lista, una fila "Inicio". El logo de la cabecera, en la Lista, sigue llevando a Inicio.
- NS7. Las demás secciones (las 4 fijas y las extensiones activas con vista) siguen el orden del usuario. Por defecto: Dailys, Tareas, Notas, Horas extra y las extensiones en el orden del registro (R11).
  - Al activar una extensión con vista, se agrega al final, visible. Al desactivarla desaparece del menú, pero su lugar en el orden se conserva por si vuelve.
  - Una sección guardada que ya no existe se ignora.
- NS8. Horas extra se llama "Horas extra" (no "Extras") en la Lista, en los tooltips, en "Más" y en Opciones, para no confundirla con las extensiones.

### Fijar, ocultar y reordenar

- NS9. Opciones → Navegación → Menú lateral DEBERÁ tener una lista "Secciones del menú" con todas las secciones (salvo Inicio), en su orden, con:
  - un asa para arrastrar y, además, los botones "Mover arriba" y "Mover abajo" (arrastrar no puede ser la única forma);
  - un interruptor por sección para mostrarla en el menú u ocultarla en "Más";
  - "Restablecer orden", que vuelve al orden y la visibilidad por defecto.
- NS10. El clic derecho sobre una sección del menú DEBERÁ ofrecer "Quitar del menú" (o "Fijar en el menú" si está en "Más"), "Mover arriba" y "Mover abajo".
- NS11. Cualquier sección, fija o de extensión, se puede ocultar. Una sección oculta sigue a un clic en "Más" y con su atajo.

### "Más"

- NS12. MIENTRAS haya secciones ocultas o que no caben, el menú DEBERÁ mostrar un botón "Más" al final de las secciones, que abre un menú con esas secciones, con ícono, nombre y atajo.
  - Barra de íconos: caben las que entran en la altura de la columna, descontando lo fijo de abajo. Las demás pasan a "Más", sin cambiar su orden.
  - Lista: las secciones visibles ocupan como máximo el 40 % del alto del menú; las que no caben pasan a "Más".
- NS13. SI la sección activa está en "Más", el botón "Más" DEBERÁ verse como activo y anunciarla ("Más secciones: DevTools"). Dentro del menú, la activa va marcada.

### Teclado y accesibilidad

- NS14. Las secciones DEBERÁN estar en un `<nav aria-label="Secciones">` con un solo tab stop (roving tabindex):
  - ↑/↓ (y ←/→) recorren las secciones; Inicio/Fin van a la primera y a la última;
  - Enter o Espacio activan;
  - la activa lleva `aria-current="page"`;
  - el foco se ve, con `FOCUS_RING` (`components/shared/controlClasses.ts`).
- NS15. Atajos: ⌘0 (Ctrl+0 en Windows y Linux) va a Inicio, y ⌘1…⌘9 a las secciones según el orden del usuario, contando también las que están en "Más" (las ocultas, no). Funcionan también con el foco en un campo.
- NS16. En la Barra de íconos, cada botón DEBERÁ mostrar un tooltip propio con el nombre y el atajo ("Tareas ⌘2"), con unos 300 ms de retraso, al pasar el puntero o al recibir el foco del teclado. El nombre accesible del botón es el de la sección, aunque no haya tooltip.
- NS17. El botón de colapsar DEBERÁ tener nombre accesible ("Ocultar el menú" / "Hide sidebar").
- NS18. "Más" sigue el patrón `menu`: ↓, Enter o Espacio lo abren; ↑/↓ recorren; Enter activa; Esc lo cierra y devuelve el foco al botón.
- NS19. Buscar DEBERÁ ofrecer "Ir a <sección>" para cada sección, incluidas las de "Más", cuando lo escrito coincide con su nombre.

### Selector con previsualización

- NS20. El estilo se elige en un grupo de radios con dos tarjetas. Cada una tiene una miniatura del menú, su nombre y una línea de descripción.
  - La miniatura se dibuja con los tokens del tema activo (sin imágenes).
  - Se anima unos 3 s al pasar el puntero, al recibir el foco y una vez al elegirla; fuera de eso queda quieta.
  - CON `prefers-reduced-motion: reduce` o las animaciones de la app apagadas, la miniatura no se mueve y muestra su fotograma final.

### Opciones → Navegación

- NS21. Opciones DEBERÁ tener una entrada **Navegación** ("Navigation"), con el ícono `PanelLeft`, segunda del grupo App: General, Navegación, Preferencias y Atajos. Reúne, en este orden:
  1. **Menú lateral:** el estilo (NS20) y "Secciones del menú" (NS9);
  2. **Pantalla de inicio**, con su selector de siempre;
  3. **Vista de notas** (Lista o Árbol);
  4. **Vista de tareas al abrir** (NS22).

  General queda con Idioma, Tema y Tipografía; Preferencias, sin la vista de notas. "Ordenar secciones…" (en "Más") abre Opciones directamente en Navegación. En Atajos, una fila de solo lectura "Ir a una sección" muestra ⌘0…⌘9 (Ctrl+0…Ctrl+9 en Windows y Linux) (NS15).
- NS22. Tareas DEBERÁ abrir, al iniciar la app, en la vista elegida en Opciones → Navegación → "Vista de tareas al abrir": Lista (predeterminada), Kanban o Calendario.
  - Es una preferencia local (`tasksViewDefault` en `config.json`), no se sincroniza.
  - Elegirla en Opciones cambia también la vista actual, como la vista de notas.
  - Cambiar de vista mientras se usa la app no la modifica, y la vista actual no se guarda: cada inicio vuelve a la elegida.
  - SI no hay preferencia guardada o no es una de las tres, Tareas abre en la Lista, como antes.

### Fuera de alcance (por ahora)

- Cambios en Web y Mobile. Web ya es una lista con nombres. En Mobile, cuando haya extensiones con vista, la barra inferior usará una pestaña "Más".
- Unificar el orden de las secciones entre Desktop, Web y Mobile.
- Mover el menú a la derecha, arriba o abajo.
- Cambiar los atajos ⌘1…⌘9 por otros.

## Decisiones (31 oct 2026)

- Jorge eligió A (predeterminado), C y D, y retirar la fila.
- **Cambio del 31 oct 2026:** al probar la app de QA, Jorge pidió que la **Lista con nombres** sea el estilo por defecto. La Barra de íconos queda como alternativa.
- Las tomó el orquestador, siguiendo al agente de diseño, y Jorge puede cambiarlas:
  - Inicio pasa a ser una entrada propia (NS6);
  - "Extras" pasa a llamarse "Horas extra" en el menú (NS8);
  - también las 4 fijas se pueden ocultar en "Más" (NS11);
  - el orden de las secciones no se unifica entre plataformas por ahora.
- Jorge aprobó la entrada Navegación en Opciones y la vista de tareas al abrir (NS21, NS22).
  - La vista de notas sigue recordando la última usada; la de tareas no, porque Jorge pidió que Tareas abra siempre en la elegida.
