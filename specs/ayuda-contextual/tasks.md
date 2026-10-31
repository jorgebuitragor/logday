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

### Pruebas (`src/components/shared/HelpButton.test.tsx`, 44)

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

## Pendiente

### Prueba en el navegador y en la app de QA

- [ ] Prueba en el navegador (Tauri simulado), a 800×600:
  - abrir y cerrar con el botón, Esc, Cerrar y clic fuera; el foco al abrir y de vuelta al botón;
  - Tab no sale del popover;
  - Espacio dentro de la ayuda no inicia el Pomodoro; ⇧⌘C y ⌥⌘↓ dentro de la ayuda no hacen nada en DevTools; ⌘1…⌘9 y ⌘N sí funcionan con la ayuda abierta;
  - clic derecho dentro de la ayuda o del recorrido no abre el menú de Tareas, Kanban ni Calendario;
  - desplazar la herramienta de DevTools o la vista del Pomodoro cierra la ayuda;
  - cada ayuda cabe y no tapa el título; en Dailys y Horas extra, con la lista angosta, el título, el botón y "Fecha"/"Hoy"/"Nueva" caben en la fila;
  - DevTools en ventana angosta, con el `ToolSwitcher`, y con "En esta herramienta" (puede necesitar scroll);
  - "Ver todos los atajos" en Lista, Kanban y Calendario, y "Ver el recorrido" en la escena que toca.
- [ ] Los 8 temas y uno personalizado: el contraste del botón y del texto, y los enlaces en los temas tintados.
- [ ] Con `prefers-reduced-motion` y las animaciones de la app apagadas: sin animación al abrir.
- [ ] VoiceOver: el nombre del botón, el estado expandido, el título y la intro al abrir, y las teclas.
- [ ] Windows o Linux: las teclas con Ctrl, también en `TaskShortcutsSheet`.

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

## Después (otro PR)

- [ ] Ayuda de Notas, Opciones → Sync y Agentes de IA (MCP), con los textos del diseño del agente (31 oct 2026).
- [ ] Git: Jorge decide si se arregla el commit cada hora (hoy solo corre con Opciones abierto, `GitSettingsTab.tsx:58-69`) y "Push al sincronizar" (no se usa), o si se quitan y se corrige el texto del recorrido (`tour.s5c`). Después, su ayuda.
- [ ] Campo `help` en `ExtensionDefinition`, para que Opciones dibuje el botón en la página de cada extensión.
- [ ] Usar `KBD` en `SearchModal`, `ToolNav` y `NotePicker`, si se quiere `font-sans` también allí.
