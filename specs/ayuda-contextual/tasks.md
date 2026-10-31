# Ayuda contextual — Tasks

Estado: en progreso.

## Hecho (rama `feature/ayuda-contextual`)

### Patrón compartido

- [x] `HelpButton`, `HelpSection`, `HelpShortcuts` y `HelpNote` en `src/components/shared/HelpButton.tsx` (AY1–AY4). Además, `HelpPanel` (el popover sin estado) y `helpFooter` (el pie), aparte para probarlos sin DOM.
  - Botón `CircleHelp` con `ICON_BTN min-h-7 min-w-7`, `aria-label` y `title` "Ayuda: {screen}", `aria-haspopup="dialog"`, `aria-expanded` y `aria-controls` (AY2, AY11).
  - Popover en portal a `document.body` con `usePositionedMenu` (`closeOnEscape: false`), debajo del botón y alineado a su derecha, con `Z_MODAL_NESTED` (AY3).
  - `role="dialog"`, `aria-modal`, `aria-labelledby` (el `<h2>`) y `aria-describedby` (la intro, si la hay) (AY12).
- [x] Teclado y foco (AY7–AY10), con la lógica pura en `src/components/shared/helpKeyboard.ts`:
  - el foco va al contenedor cuando el popover ya es visible (el hook lo mide con `visibility: hidden`);
  - trampa de Tab (`nextTrapIndex`);
  - Esc en `window` en captura, con `preventDefault` y `stopPropagation` (`closeOnEscape`);
  - el foco vuelve al botón con Esc, Cerrar y el botón; con el clic fuera, solo si estaba dentro y el clic no lo llevó a otro control;
  - el clic en el botón alterna: su `mousedown` no cuenta como "fuera";
  - la raíz del portal corta la propagación de React de `keydown`, salvo los atajos globales (`passesToApp`), y la de `contextmenu`;
  - se cierra al desplazarse fuera del popover (`scrollCloses`).
- [x] "Ver el recorrido" monta `TourModal` en la escena pedida; las acciones del pie cierran antes la ayuda, sin devolver el foco al botón. Al cerrar el recorrido, el foco vuelve al botón (AY5).
- [x] `KBD` y `TEXT_LINK` en `controlClasses.ts`. DevTools reexporta `TEXT_LINK` (`ui/classes.ts`) y `KeyedText` usa `KBD`.
- [x] Sección `help` en `i18n.ts` (es y en, 23 claves), las claves `help.*` y `<tool>.help*` en `devtools` (38) y las `help*` en `pomodoro` (9). Tipo `HelpKey`.
- [x] `App.css`: `.help-popover` sin animación con `prefers-reduced-motion` (AY12).

### Pantallas

- [x] DevTools (AY16): `DevtoolsHelp` (`devtools/ui/Help.tsx`) en `ToolFrame`, en la fila del título y fuera del `<h2>`, así que vale para el título ancho y para el `ToolSwitcher`.
  - `TOOL_HELP` y `HELP_SHORTCUTS` en `ui/meta.ts`; las teclas con `shortcut(spec)`.
  - Orden: "En esta herramienta" (si la tiene), `help.p1…p5` y los atajos.
- [x] Tareas (AY17): `TasksHelp` (`components/help/ScreenHelp.tsx`) en Lista, Kanban y Calendario, con "Ver todos los atajos" y "Ver el recorrido" (escena 1). Kanban y Calendario montan `TaskShortcutsSheet` con su propio estado.
- [x] Dailys (AY18): `DailysHelp` en `DailyList`, con `{newDaily}` y `{absence}` de la config y "Ver el recorrido" (escena 0).
- [x] Horas extra (AY19): `OvertimeHelp` en `OvertimeList`, con "Ver el recorrido" (escena 0).
- [x] Pomodoro (AY20): `PomodoroHelp` (`pomodoro/Help.tsx`) en la cabecera de la vista, con sus atajos de `shortcutLabel(key, mac)` y `spaceKey`.
- [x] Las teclas de Tareas y Dailys salen de `components/help/helpKeys.ts` (`tasksHelpKeys`, `dailysHelpKeys`, `modKey`), como `tourKeys` (AY13).

### Arreglos

- [x] `overtime.title` (es) dice "Horas extra" (AY21, NS8).
- [x] `TaskShortcutsSheet` muestra Ctrl fuera de macOS (AY22): `shortcutSheet(language, isMac)` cambia `{mod}` por ⌘ o Ctrl.

### Pruebas (`src/components/shared/HelpButton.test.tsx`, 44; hoy `HelpPopover.test.tsx`)

- [x] El botón: nombre "Ayuda: {screen}" en es y en, `aria-haspopup`, `aria-expanded`, `aria-controls`, 28×28, foco visible, ícono oculto, sin `bg-indigo-*`; cerrado no dibuja la ayuda.
- [x] El popover: diálogo con `aria-labelledby`, `aria-describedby` solo con intro, `tabindex="-1"`, el orden título, contenido y pie; solo tokens del tema salvo `TEXT_LINK`; `ul`/`ol`/`dl`/`kbd`; la nota con el ícono oculto.
- [x] El pie: cada acción cierra antes la ayuda y "Ver el recorrido" va al final; `TourModal` abre en la escena pedida.
- [x] Teclado: la trampa de Tab; Espacio, ⌘⇧C, ⌘↵, ⌥⌘↓ y ⌘⇧→ no salen de la ayuda, y ⌘N, ⌘T, ⌘F, ⌘0, ⌘1 y Ctrl+D sí; Esc llama a `preventDefault` y `stopPropagation` antes de cerrar; el desplazamiento propio no la cierra.
- [x] `App.css`: la regla de `prefers-reduced-motion`, la de `.no-animations` y el fotograma final de `fade-in`.
- [x] Las teclas de la config: con otra letra para nueva tarea, nuevo daily y ausencia, la ayuda la muestra como `<kbd>`; ⌘ en macOS y Ctrl fuera; cada hueco de los textos tiene su tecla en los dos idiomas.
- [x] `TaskShortcutsSheet`: Ctrl fuera de macOS, ⌘ en macOS y ningún `{mod}` sin cambiar.
- [x] DevTools: el botón va tras el `</h2>`; el orden de las secciones; sin "En esta herramienta" en JSON; ⇧⌘F, ⌘↵, ⌥⌘↓/⌥⌘↑ y ⌥⌘1…⌥⌘4 en macOS y Ctrl+Shift+F, Ctrl+Shift+Backspace fuera; las 8 herramientas de `TOOL_HELP` con sus claves; los límites (`MAX_MATCHES`, `REGEX_TIMEOUT_MS`, 1000 de Oracle) y los nombres de los botones que citan, sacados de i18n.
- [x] Tareas, Dailys y Horas extra: el nombre de cada botón, de 2 a 5 puntos, los botones que nombran ("Hoy", "Fecha", "Previo", "Nueva") y AY21.
- [x] Pomodoro: sus atajos en macOS y fuera, y "Opciones" como en la cabecera.
- [x] Paridad es/en de `help`, `devtools.help.*`, `<tool>.help*` y `pomodoro.help*`, los mismos huecos en los dos idiomas y ningún texto con voseo (AY14).
- [x] `pnpm test` (500), `pnpm build` y `pnpm lint` (21 warnings, los de base).

### Prueba en el navegador (31 oct 2026, Tauri simulado)

- [x] DevTools: abre, el foco entra, Tab queda dentro, Esc cierra y devuelve el foco al botón.
- [x] Pomodoro: con la ayuda abierta, Espacio no arranca el temporizador; ⌘2 sigue llevando a Tareas.
- [x] Tareas: "Ver todos los atajos" abre la hoja.
- [x] Arreglado en la prueba:
  - el recuadro se abría hacia la izquierda y tapaba la columna de herramientas de DevTools: ahora se abre hacia la derecha del botón;
  - en Dailys, a 800×600, el botón de ayuda se montaba sobre "Fecha": ese botón queda solo con el ícono (el nombre sigue para los lectores);
  - con poca altura, los enlaces del pie quedaban fuera de vista: el pie queda fijo abajo.

## Hecho: un solo botón en el menú lateral (31 oct 2026, AY24–AY29)

- [x] Sin botones de ayuda en las cabeceras de Tareas (Lista, Kanban, Calendario), Dailys, Horas extra, DevTools (`ToolFrame`) y Pomodoro (`View.tsx`). `ToolFrame` y la vista del Pomodoro quedan como en `develop`; en Tareas, Kanban, Calendario y Horas extra se quedan el `truncate` del título y el `shrink-0` de los botones.
- [x] Dailys: "Fecha" y "Hoy" vuelven a mostrar su nombre a 288 px; más angosta, primero uno y luego el otro quedan solo con el ícono (`@[14.5rem]/dlh`, `@[12.5rem]/dlh`), y a 200 px el título se lee entero. Fuera el `min-w-[2.75rem]` del título. Medido en Chromium con la letra por defecto (design, "Las cabeceras").
- [x] `HelpButton.tsx` pasa a `HelpPopover.tsx`, con `useHelpPopover(content)` para cualquier disparador (AY1).
- [x] `SidebarHelpButton` (`components/help/SidebarHelp.tsx`): fila "Ayuda" encima de "Opciones" en la Lista con nombres; ícono encima de Buscar en la Barra de íconos y el colapsado, con el tooltip de la columna (AY24). Oculto con la opción apagada (AY23), y se vuelve a montar al cambiar de sección (AY6).
- [x] `useSectionHelp` (`ScreenHelp.tsx`) y `helpTopicFor` (`helpTopics.ts`): la ayuda de cada sección y la general (AY25, AY26). Los cuerpos de DevTools y Pomodoro se cargan con `lazy`.
- [x] DevTools lee la herramienta de `lastTool`, sin `DevtoolsContext`.
- [x] "Ver todos los atajos" manda `logday:show-task-shortcuts`; Lista, Kanban y Calendario lo escuchan con su vista activa (`taskShortcutsRequest.ts`).
- [x] Popover a la derecha del menú, alineado por abajo con el botón, o en la esquina inferior izquierda sin botón (`helpAnchor`, `data-help-edge`) (AY28). El desplazamiento solo lo cierra si mueve el botón (AY29).
- [x] ⌘/ en `App.tsx` (`isHelpShortcut`, `requestHelpToggle`), también con el foco en un campo; apagado con la opción y durante la bienvenida; sale del portal para cerrar la ayuda; el foco vuelve adonde estaba (AY27).
- [x] ⌘/ en el tooltip del botón (y a la derecha de la fila), en Opciones → Atajos y en la ayuda general. "/" no se acepta como tecla de otro atajo.
- [x] Textos: `help.menuLabel`, `generalTitle`, `general1…5`, `settings.shortcutHelp`, y la opción "Botón de ayuda" con su descripción nueva (es y en).
- [x] Pruebas: `components/help/SidebarHelp.test.tsx` (nuevo), `shared/HelpPopover.test.tsx` y `sidebar/SectionNav.test.tsx`:
  - el botón en la fila y en la columna, con su nombre, ARIA, `aria-keyshortcuts` y clases; en la Barra de íconos y el colapsado encima de Buscar, y en la Lista encima de Opciones; oculto con la opción apagada en los tres;
  - `helpTopicFor` en cada sección, y el título, la pantalla, la escena y las acciones de cada ayuda;
  - la general: las teclas de la config como `<kbd>`, Ctrl fuera de macOS y los nombres que cita;
  - `isHelpShortcut` (⌘/, Ctrl+/, ⇧ con "/", y no ⌘?, ⌥ ni "/" solo), que sale del portal y que no choca con los atajos de la app ni de DevTools; la fila de Opciones → Atajos;
  - los eventos `logday:toggle-help` y `logday:show-task-shortcuts`, y que cada vista lo escucha con su vista activa;
  - `helpAnchor` y el nuevo `scrollCloses`; que ninguna cabecera tiene ya botón de ayuda;
  - DevTools con `lastTool` desde el store.
- [x] `pnpm test` (528), `pnpm build` y `pnpm lint` (21 warnings, los de base).

## Pendiente

### Prueba visual (la hace la sesión principal)

- [ ] En el navegador (Tauri simulado) o en la app de QA, a 800×600, en los dos estilos del menú y con el menú colapsado:
  - el botón "Ayuda" se ve encima de "Opciones" (Lista) o de Buscar (columna), con el estilo de sus vecinos; el tooltip de la columna dice "Ayuda: {pantalla}" y ⌘/;
  - la ayuda se abre a la derecha del menú, sobre el contenido, alineada por abajo con el botón, y no se sale de la ventana con poca altura;
  - cada sección muestra su ayuda: Tareas en Lista, Kanban y Calendario; Dailys; Horas extra; DevTools con "En esta herramienta" de la herramienta abierta (Expresiones regulares, por ejemplo); Pomodoro; y la general en Inicio, Notas y otra extensión;
  - "Ver todos los atajos" abre la hoja en Lista, Kanban y Calendario (una sola); "Ver el recorrido" abre la escena que toca;
  - ⌘/ abre y cierra la ayuda desde cualquier sección, también con el foco en un campo o en una nota (y el foco vuelve ahí); no hace nada con la opción apagada; en el teclado en español, ⇧⌘7 en una nota hace la lista numerada y no abre la ayuda;
  - abrir y cerrar con el botón, Esc, Cerrar y clic fuera; Esc no cierra Opciones si la ayuda está encima; Tab no sale del popover; Espacio no inicia el Pomodoro y ⇧⌘C no copia en DevTools con la ayuda abierta; ⌘1…⌘9 y ⌘N sí;
  - desplazar la lista de tareas o la herramienta con la ayuda abierta no la cierra;
  - las cabeceras: Dailys a 288 px con "Fecha" y "Hoy" y a 200 px con el título entero; Tareas, Kanban, Calendario y Horas extra angostas, sin solapes.
- [ ] Los 8 temas y uno personalizado: el contraste del botón y del texto, y los enlaces en los temas tintados.
- [ ] Con `prefers-reduced-motion` y las animaciones de la app apagadas: sin animación al abrir.
- [ ] VoiceOver: el nombre del botón, el estado expandido, el atajo, el título y la intro al abrir, y las teclas.
- [ ] Windows o Linux: Ctrl+/ y las teclas con Ctrl, también en `TaskShortcutsSheet`.

## Diferencias con el diseño

- **AY9, cómo se cortan las teclas:** el diseño pone `onKeyDown={(e) => e.stopPropagation()}` en el contenedor y dice que los atajos globales siguen porque escuchan en `window`. No es así: React escucha los eventos de un portal en su contenedor (`document.body`), y su `stopPropagation()` para también el evento nativo antes de `window`, donde escucha `App.tsx`. Por eso la raíz del portal corta la propagación de todo salvo ⌘ o Ctrl con una sola tecla, sin ⇧ ni ⌥ (`passesToApp`): son los atajos globales (letras de `shortcuts` y ⌘0…⌘9), y ninguno de la pantalla de detrás tiene esa forma (Espacio, ⌘⇧…, ⌥⌘…, ⌘↵).
- **También el recorrido y el clic derecho:** la raíz del portal envuelve también el `TourModal` que abre "Ver el recorrido", porque sus eventos suben igual por el árbol de React de la pantalla; y corta el `contextmenu`, que en Lista, Kanban y Calendario abriría el menú de "Nueva tarea" de la vista.
- **`sql-list.help2`:** dice "En «Más opciones», escribe la columna…" ("In "More options", type the column…"): la Columna y "Partir en grupos de" están dentro de "Más opciones" (`SqlListTool.tsx:26,89-99`).
- **`prefers-reduced-motion`:** `animate-fade-in` solo se apagaba con `.no-animations`. Se agregó en `App.css` `.help-popover { animation: none; }` para `prefers-reduced-motion`.
- **Estado abierto del botón:** con las variantes `aria-expanded:bg-[var(--bg-hover)] aria-expanded:text-[var(--text-primary)]`, sin quitar clases de `ICON_BTN`.
- **`screen` de DevTools:** `extensions.devtools.name` ("DevTools"); la sección `devtools` no tiene `name`.
- **Clic fuera:** el foco vuelve al botón solo si estaba dentro y el clic no lo llevó a otro control (por ejemplo, un campo), para no quitárselo.
- **Archivos:** las ayudas de Tareas, Dailys y Horas extra van en `components/help/` (`ScreenHelp.tsx`, `helpKeys.ts`); la de DevTools en `devtools/ui/Help.tsx`, y la del Pomodoro en `pomodoro/Help.tsx`, para tocar lo mínimo las vistas. Los cuerpos (`ScreenHelpBody`, `DevtoolsHelpBody`, `PomodoroHelpBody`) se exportan para las pruebas.
- **`aria-controls`:** va siempre, también con la ayuda cerrada.
- **`KBD` en `SearchModal`, `ToolNav` y `NotePicker`:** no se cambió. Su clase no es la misma (no lleva `font-sans`), y cambiarla cambia cómo se ven.

### Del cambio al menú lateral (31 oct 2026)

- **Dailys:** el encargo pedía quitar el container query, el `sr-only` de "Hoy" y el `px-1.5` si ya no hacían falta. Hacen falta sin el botón de ayuda: con los nombres, los cuatro botones miden ~188 px y a 200 px caben ~167 (la cabecera de `develop` también se salía). Se quedan con otros umbrales, para que a 288 px se vean "Fecha" y "Hoy"; solo se quitó el `min-w-[2.75rem]`.
- **El foco al cerrar** una ayuda abierta con ⌘/ vuelve adonde estaba, no al botón del menú, que el usuario no tocó.
- **El desplazamiento** ya no cierra la ayuda salvo que mueva el botón (AY29): el botón está fijo en el menú, y cerrarla al desplazar la lista impediría leerla mientras se mira la pantalla.
- **⌘/ con ⇧ también vale** (teclado en español), salvo que el editor ya haya usado la tecla.
- **El nombre en la ayuda general** es el de la sección ("Ayuda: Notas"), no "Logday": el botón siempre dice en qué pantalla se está.
- **Archivos:** `HelpButton.tsx` pasa a `HelpPopover.tsx` (ya no es un botón); las pruebas del menú lateral van en `components/help/SidebarHelp.test.tsx`, para que `HelpPopover.test.tsx` no pase el límite de líneas del lint.

## Después (otro PR)

- [ ] Ayuda de Notas, Opciones → Sync y Agentes de IA (MCP), con los textos del diseño del agente (31 oct 2026).
- [ ] Git: Jorge decide si se arregla el commit cada hora (hoy solo corre con Opciones abierto, `GitSettingsTab.tsx:58-69`) y "Push al sincronizar" (no se usa), o si se quitan y se corrige el texto del recorrido (`tour.s5c`). Después, su ayuda.
- [ ] Campo `help` en `ExtensionDefinition`, para que Opciones dibuje el botón en la página de cada extensión.
- [ ] Usar `KBD` en `SearchModal`, `ToolNav` y `NotePicker`, si se quiere `font-sans` también allí.
