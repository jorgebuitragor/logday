# Ayuda contextual — Tasks

Estado: en progreso.

## Pendiente (rama `feature/ayuda-contextual`)

### Patrón compartido

- [ ] `HelpButton`, `HelpSection`, `HelpShortcuts` y `HelpNote` en `src/components/shared/HelpButton.tsx` (AY1–AY4).
  - Botón `CircleHelp` con `ICON_BTN min-h-7 min-w-7`, `aria-label`, `aria-haspopup`, `aria-expanded` y `aria-controls` (AY2, AY11).
  - Popover en portal con `usePositionedMenu` (`closeOnEscape: false`), debajo del botón y alineado a su derecha, con `Z_MODAL_NESTED` (AY3).
  - `role="dialog"`, `aria-modal`, `aria-labelledby` y `aria-describedby` (AY12).
- [ ] Teclado y foco (AY7–AY10):
  - el foco va al popover al abrirse;
  - trampa de Tab;
  - Esc en captura con `stopPropagation`;
  - el foco vuelve al botón;
  - el clic en el botón alterna, sin cerrar y volver a abrir;
  - el popover corta la propagación de React de `keydown`;
  - se cierra al desplazarse fuera del popover.
- [ ] "Ver el recorrido" abre `TourModal` en la escena pedida, y las acciones del pie cierran antes la ayuda (AY5).
- [ ] `KBD_CLS` pasa a `controlClasses.ts` como `KBD`, y `TEXT_LINK` también se mueve ahí; DevTools lo reexporta. `KeyedText` usa `KBD`.
- [ ] Sección `help` en `i18n.ts`, en es y en (design, "Textos").

### Pantallas

- [ ] DevTools (AY16):
  - el botón en `ToolFrame`, en la fila del título o del `ToolSwitcher`;
  - las claves `help.*` y `<tool>.help1…3`;
  - `TOOL_HELP` en `ui/meta.ts`;
  - las teclas con `shortcut(spec)`.
- [ ] Tareas (AY17): el botón en Lista, Kanban y Calendario, con "Ver todos los atajos" y "Ver el recorrido" (escena 1). Kanban y Calendario montan `TaskShortcutsSheet` con su propio estado.
- [ ] Dailys (AY18): el botón en `DailyList`, con `{newDaily}` y `{absence}` tomados de la config, y "Ver el recorrido" (escena 0).
- [ ] Horas extra (AY19): el botón en `OvertimeList`, con "Ver el recorrido" (escena 0).
- [ ] Pomodoro (AY20): el botón en la cabecera de la vista, con las claves `help*` en la sección `pomodoro` y sus atajos.

### Arreglos

- [ ] `overtime.title` (es) dice "Horas extra" (AY21, NS8).
- [ ] `TaskShortcutsSheet` muestra Ctrl fuera de macOS (AY22).

### Pruebas

- [ ] `HelpButton`:
  - abre y cierra con el botón, Esc, Cerrar y clic fuera;
  - el foco vuelve al botón;
  - Tab no sale del popover;
  - "Ver el recorrido" monta `TourModal` en la escena pedida.
- [ ] Esc dentro de Opciones cierra la ayuda y no Opciones; Espacio dentro de la ayuda no inicia el Pomodoro; ⌘⇧C dentro de la ayuda no copia en DevTools (AY8, AY9).
- [ ] Las teclas del texto salen de la config: con otra letra para nueva tarea o nuevo daily, la ayuda la muestra; ⌘ en macOS y Ctrl fuera (AY13, AY22).
- [ ] Paridad es/en de las claves nuevas (`help`, `devtools.help.*`, `<tool>.help*`, `pomodoro.help*`), y ningún texto con voseo (AY14).
- [ ] Cada herramienta de `TOOL_HELP` tiene sus claves, y las 8 de AY16 están.
- [ ] `pnpm test`, `pnpm build` y `pnpm lint` (sin warnings nuevos).

### Prueba en el navegador y en la app de QA

- [ ] Prueba en el navegador (Tauri simulado), a 800×600:
  - cada ayuda cabe y no tapa el título;
  - DevTools en ventana angosta, con el `ToolSwitcher`;
  - dentro de Opciones, por encima del modal.
- [ ] Los 8 temas y uno personalizado: el contraste del botón y del texto, y los enlaces en los temas tintados.
- [ ] Con `prefers-reduced-motion` y las animaciones de la app apagadas: sin animación al abrir.
- [ ] VoiceOver: el nombre del botón, el estado expandido, el título y la intro al abrir, y las teclas.
- [ ] Windows o Linux: las teclas con Ctrl.

## Después (otro PR)

- [ ] Ayuda de Notas, Opciones → Sync y Agentes de IA (MCP), con los textos del diseño del agente (31 oct 2026).
- [ ] Git: Jorge decide si se arregla el commit cada hora (hoy solo corre con Opciones abierto, `GitSettingsTab.tsx:58-69`) y "Push al sincronizar" (no se usa), o si se quitan y se corrige el texto del recorrido (`tour.s5c`). Después, su ayuda.
- [ ] Campo `help` en `ExtensionDefinition`, para que Opciones dibuje el botón en la página de cada extensión.
- [ ] Usar `KBD` en `SearchModal`, `ToolNav` y `NotePicker`, si no se hizo en este PR.
