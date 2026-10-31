# Ayuda contextual — Design

Estado: en progreso.

> Desde el 31 oct 2026 la ayuda se abre con un solo botón en el menú lateral (sección "Cambio del 31 oct 2026: un solo botón en el menú lateral", al final). Lo que este documento dice del botón junto al título de cada pantalla ("El botón", "Dónde va en cada pantalla", "botón más chico") es lo que hubo antes; el popover, el teclado, la accesibilidad y los textos siguen igual.

## Arquitectura

- **Componente compartido** (`src/components/shared/HelpButton.tsx`, nuevo):
  - `HelpButton` (el botón y el popover) y las piezas del contenido: `HelpSection`, `HelpShortcuts` y `HelpNote`.
  - Lo usan las vistas de la app y las extensiones, que lo importan de `components/shared/`, como ya importan `ConfirmDeleteModal`.
  - Los textos de cada pantalla los pasa quien lo usa: la app con `t(language, 'help', …)`, DevTools con su `tr` y Pomodoro con el suyo.
- **Posición:** usa `usePositionedMenu` (`src/hooks/usePositionedMenu.ts`) con `closeOnEscape: false`, porque Esc lo maneja el componente (AY8). El popover va en un portal a `document.body` con `Z_MODAL_NESTED` (`src/lib/zIndex.ts`), para quedar por encima de Opciones.
- **Teclas en el texto:**
  - Los textos llevan huecos `{nombre}` que se dibujan como `<kbd>` con `KeyedText` y `splitKeys` (`src/components/tour/`), los mismos del recorrido.
  - `KBD_CLS` sale de `tour/KeyedText.tsx` y pasa a `components/shared/controlClasses.ts` como `KBD`. `KeyedText` lo importa de ahí.
  - De paso, se puede usar en `SearchModal.tsx:106`, `ToolNav.tsx:96` y `NotePicker.tsx:130`, que repiten la misma clase. Esto es opcional en este PR.
- **De dónde salen las teclas (AY13):**
  - letras globales: `shortcutLabel(shortcuts.<x>.toUpperCase(), isMac)` de `components/sidebar/sectionOrder.ts`, como hace `tourKeys`;
  - DevTools: `shortcut(spec)` del contexto (`devtools/ui/text.ts:35`);
  - Pomodoro: su `shortcutLabel(key, mac)` (`pomodoro/text.ts:49`);
  - `{mod}`: ⌘ o Ctrl.
- **"Ver el recorrido":** `HelpButton` cierra el popover y monta `TourModal` (`components/tour/TourModal.tsx`) con `initialScene`. Escenas: 0 Tu día, 1 Tareas, 2 Notas, 3 Muévete rápido, 4 Tus datos.
- **i18n** (`src/lib/i18n.ts`), con las mismas claves en es y en:
  - sección nueva `help`: los textos comunes y los de Tareas, Dailys y Horas extra;
  - en `devtools`: las claves `help.*` y `<tool>.help1…3`;
  - en `pomodoro`: las claves `help*`.
- **DevTools:** `ui/meta.ts` gana `TOOL_HELP: Partial<Record<ToolId, DevtoolsKey[]>>`, con las claves de "En esta herramienta" de cada herramienta que lo tiene. El botón va en `ToolFrame`, así que lo tienen todas las herramientas sin tocar sus vistas.
- **Arreglos (AY21, AY22):**
  - `overtime.title` pasa a "Horas extra" en es; en ya dice "Overtime".
  - `TaskShortcutsSheet` arma "⌘ clic" y "⌘ Enter" con ⌘ o Ctrl según el sistema, en vez de escribir ⌘ fijo en la tabla.

## Interfaz

Se basa en el diseño del agente `logday-design` (31 oct 2026).

### El botón

```
  Horas extra (?)                         [+ Nueva]
  ^ título       ^ HelpButton, gap-1
```

- **Dónde:** justo después del título, como hermano y no dentro del `<h1>`/`<h2>`. Título y botón van en una fila `flex items-center gap-1`.
- **Clases:** `${ICON_BTN} min-h-7 min-w-7 justify-center` (`controlClasses.ts`), las mismas del botón de sonido de Pomodoro (`pomodoro/View.tsx:160-170`).
- **Ícono:** `CircleHelp`, de 14 px, con `aria-hidden`.
- **Estados:**

| Estado | Aspecto |
|---|---|
| Normal | `text-[var(--text-hint)]` |
| Hover | El de `ICON_BTN`: `bg-[var(--bg-hover)] text-[var(--text-primary)]` |
| Foco | `FOCUS_RING` |
| Abierto | `bg-[var(--bg-hover)] text-[var(--text-primary)]`, neutro, sin acento |

  No hay estado deshabilitado ni de carga: el contenido es estático.
- **ARIA:**
  - `type="button"`;
  - `aria-label` y `title` = `help.buttonLabel` ("Ayuda: {screen}");
  - `aria-haspopup="dialog"`, `aria-expanded` y `aria-controls`, con el id del popover.

### El popover

```
+------------------------------------------+
| Cómo funciona DevTools               [x] |   h2 + Cerrar
| EN ESTA HERRAMIENTA                      |   PANEL_TITLE (opcional)
| • …                                      |
| • …                                      |
| • Elige una herramienta… [⌘⇧F] …         |   puntos con <kbd>
| ATAJOS                                   |
| [⌘⇧F]   Buscar una herramienta           |   dl en dos columnas
| [⌘↵]    Procesar o generar               |
| (escudo) nota                            |   opcional
| Ver todos los atajos · Ver el recorrido  |   pie (opcional)
+------------------------------------------+
```

- **Posición:** debajo del botón, alineado a su borde izquierdo y hacia la derecha, a 6 px; si no cabe, se voltea. (Al principio iba alineado al borde derecho, pero tapaba la columna de herramientas de DevTools.)
  - Se logra con un `AnchorRect` sintético: `{ left: r.left, right: r.left, top: r.bottom + 6, bottom: r.bottom + 6 }`, con `anchorOptions: { sideX: 'right', gap: 0 }`.
  - Si no cabe, `placeMenuNearAnchor` lo voltea o lo ajusta a la ventana (`lib/menuPosition.ts:60`).
- **Contenedor:** `w-[320px] max-w-[calc(100vw-16px)] max-h-[min(70vh,440px)] overflow-y-auto rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-4 shadow-2xl`, como `DatePickerPopover`. A 800×600 caben unos 420 px de alto.
- **Animación:** `animate-fade-in`. Se apaga con `.no-animations` y, con la clase `help-popover`, con `prefers-reduced-motion` (`App.css`).
- **Cabecera:**
  - título `<h2 id>`, en `text-sm font-semibold text-[var(--text-primary)]`;
  - a la derecha, Cerrar: `ICON_BTN` con `X` de 14 px y `aria-label` = `help.close`;
  - entre los dos, `mb-3`.
- **Intro** (opcional): `<p id>`, en `text-xs leading-relaxed text-[var(--text-secondary)]`.
- **`HelpSection`:**
  - título opcional con `PANEL_TITLE` y `mb-1.5`;
  - lista en `space-y-1.5 text-xs leading-relaxed text-[var(--text-secondary)]`;
  - `kind="steps"` es `<ol class="list-decimal pl-4">`, y `kind="points"`, `<ul class="list-disc pl-4">`;
  - entre secciones, `mt-3`.
- **`HelpShortcuts`:**
  - título `help.shortcuts` con `PANEL_TITLE`;
  - `<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">`;
  - en `dt`, un `<kbd className={KBD}>` por tecla;
  - en `dd`, el texto en `text-[var(--text-secondary)]`.
- **`HelpNote`:** `mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-[var(--text-hint)]`, con ícono opcional de 11 px, como la nota de privacidad de DevTools (`devtools/View.tsx:250-254`).
- **Pie** (si hay acciones o `tourScene`):
  - `mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--border)] pt-2.5`;
  - botones con `TEXT_LINK` en `text-xs`. Esa clase se mueve de `devtools/ui/classes.ts` a `controlClasses.ts`, y DevTools la reexporta;
  - primero las acciones de la pantalla, al final "Ver el recorrido".

### API

```tsx
<HelpButton
  screen="DevTools"              // para "Ayuda: {screen}"
  title="Cómo funciona DevTools"
  intro?                         // string
  tourScene?                     // número de escena de TourModal
  actions?                       // { label: string; onClick: () => void }[]
>
  <HelpSection kind="points" title?="En esta herramienta" items={[…]} />
  <HelpShortcuts rows={[{ keys: ['⌘⇧F'], label: 'Buscar una herramienta' }]} />
  <HelpNote icon={ShieldCheck}>…</HelpNote>
</HelpButton>
```

- Los `items` son `ReactNode`. Quien usa el componente pasa `<KeyedText text={…} keys={…} />` cuando el texto tiene teclas.
- Una acción del pie cierra el popover antes de llamar a `onClick`, sin devolver el foco al botón, porque lo que abre (`TaskShortcutsSheet`) toma el foco. "Ver el recorrido" hace lo mismo con `TourModal`.

### Teclado y foco

| Acción | Qué pasa |
|---|---|
| Enter o Espacio en el botón | Abre la ayuda. El foco va al contenedor (`tabIndex={-1}`), y el lector de pantalla lee el título y la intro. |
| Tab y ⇧Tab | Recorren solo Cerrar y los botones del pie, en ciclo (trampa como `NotePicker.tsx:70`). Desde el contenedor, Tab va al primero. |
| Esc | Cierra la ayuda y el foco vuelve al botón. Se escucha en `window` en captura, con `preventDefault` y `stopPropagation`, como `TourModal.tsx:22-31`: así no cierra también Opciones (`SettingsModal.tsx:66`) ni limpia el buscador de DevTools. |
| Cerrar | Igual que Esc. |
| Clic fuera | Cierra. Si el foco estaba dentro, vuelve al botón. |
| Clic en el botón con la ayuda abierta | La cierra. El `mousedown` del botón no cuenta como "fuera"; si no, se cerraría y se volvería a abrir con el mismo clic. |
| Cualquier tecla dentro | La raíz del portal corta la propagación de React, porque los eventos de un portal suben por el árbol de React (AY9). Sin esto, Espacio arrancaría el Pomodoro (`pomodoro/View.tsx:67`) y ⌘⇧C copiaría en DevTools (`devtools/View.tsx:212`). React escucha el portal en `document.body`, así que cortar también para el evento antes de `window`: por eso pasan ⌘ o Ctrl con una sola tecla, sin ⇧ ni ⌥ (`passesToApp`), que son los atajos globales de `App.tsx`. La misma raíz envuelve el `TourModal` de "Ver el recorrido" y corta el `contextmenu`, que en Tareas abriría el menú de la vista. |

Los atajos de una tecla de la lista de tareas ya se apagan solos con la ayuda abierta, porque hay un `[role="dialog"]` en la página (`TaskList.tsx:211`).

### Accesibilidad

- **Popover:**
  - `role="dialog"` y `aria-modal="true"`, porque tiene trampa de foco;
  - `aria-labelledby`, con el título;
  - `aria-describedby`, con la intro si la hay.
- **Semántica:** listas `ol`/`ul`/`dl` y teclas en `<kbd>`. El ícono del botón y el de la nota llevan `aria-hidden`.
- **Objetivo del botón:** 28×28 px, más que el mínimo de 24 px de WCAG 2.2 (2.5.8). Es el tamaño de los botones de ícono de Desktop.
- **Contraste:**
  - el ícono en `--text-hint` sobre `--bg-panel` o `--bg-base` es contraste de no-texto (≥ 3:1) y pasa en los 8 temas; en el claro, #71717a sobre blanco da ~4,8:1;
  - el texto usa `--text-secondary` y `--text-hint` sobre `--bg-elevated`, los mismos pares que `TaskShortcutsSheet` y `DatePickerPopover`;
  - el único acento es `TEXT_LINK` (`text-indigo-400`): en los temas tintados se repinta a `--accent` (`App.css:319`), y en el claro se oscurece a #4f46e5 (`App.css:258`);
  - no hay `bg-indigo-*`, que en los temas tintados se vuelve `--accent-soft`.
- **Temas:** solo tokens (`--bg-elevated`, `--border-card`, `--border`, `--text-*`), así que funciona en los 8 temas y en los personalizados.

### Casos borde

- **Desplazamiento:** si el contenedor se desplaza, la ayuda se cierra. Se escucha `scroll` en `window` en captura e ignora el que viene del propio popover, que tiene su propio scroll. En DevTools la cabecera está dentro de una `section overflow-y-auto`, y un popover fijo quedaría flotando.
- **Ventana:** al cambiar el tamaño, el hook recoloca el popover. A 800×600 o con zoom del 200 %, `max-w` y `max-h` lo mantienen dentro de la ventana.
- **Dos ayudas:** abrir una cierra la otra, por el clic fuera.
- **Cambio de sección o de herramienta:** el botón se desmonta y la ayuda con él. En DevTools, ⌥⌘↓ no llega mientras la ayuda está abierta (AY9).
- **Dentro de Opciones:** queda por encima del modal (`Z_MODAL_NESTED`), y Esc solo la cierra a ella.
- **Recorrido:** al pulsar "Ver el recorrido", la ayuda se cierra antes de montar `TourModal`. Al cerrar el recorrido, el foco vuelve al botón de ayuda.
- **Texto largo o en inglés:** se desplaza dentro del popover. Los textos de este PR caben sin scroll a 800×600, salvo DevTools con "En esta herramienta", que puede necesitarlo.

### Dónde va en cada pantalla

| Pantalla | Archivo | Junto a | `screen` | `tourScene` | Acciones |
|---|---|---|---|---|---|
| DevTools | `devtools/ui/ToolFrame.tsx:34-44` | El `<h2>` (ancho) o el `ToolSwitcher` (angosto), dentro de la fila del título | `devtools.name` ("DevTools") | — | — |
| Tareas · Lista | `tasks/TaskList.tsx:260` | `<h1>` | `help.tasksScreen` | 1 | Ver todos los atajos |
| Tareas · Kanban | `tasks/KanbanBoard.tsx:204` | `<h1>`, que pasa a una fila `flex` | `help.tasksScreen` | 1 | Ver todos los atajos |
| Tareas · Calendario | `calendar/CalendarView.tsx:294` | `<h1>` | `help.tasksScreen` | 1 | Ver todos los atajos |
| Dailys | `daily/DailyList.tsx:246` | `<h2>` | `dailys.title` | 0 | — |
| Horas extra | `overtime/OvertimeList.tsx:106` | `<h2>` | `sectionNav.overtime` | 0 | — |
| Pomodoro | `pomodoro/View.tsx:150` | `<h2 id="pomodoro-title">` | `pomodoro.title` | — | — |

- **Nombre de la pantalla en Tareas:** "Tareas" en las tres vistas, porque la ayuda es la misma.
- **"Ver todos los atajos":** abre `TaskShortcutsSheet`. En Kanban y Calendario, la vista la monta con su propio estado, como `TaskList`.
- **Orden de Tab:** el botón va después del título (o del `ToolSwitcher`) y antes de la acción principal: "Traer de una nota", "Nueva tarea", "Nueva".

### Textos (es / en)

Los del diseño del agente, aprobados por Jorge. Los nombres entre comillas son los de los botones reales, en cada idioma. Los huecos `{…}` se dibujan como `<kbd>`.

**Comunes (sección `help`)**

| Clave | es | en |
|---|---|---|
| buttonLabel | Ayuda: {screen} | Help: {screen} |
| close | Cerrar | Close |
| shortcuts | Atajos | Shortcuts |
| seeTour | Ver el recorrido | See the tour |
| seeAllShortcuts | Ver todos los atajos | See all shortcuts |

**DevTools: general (sección `devtools`)**

Huecos: `{search}` = `shortcut('mod+shift+F')` y `{run}` = `shortcut('mod+enter')`.

| Clave | es | en |
|---|---|---|
| help.title | Cómo funciona DevTools | How DevTools works |
| help.p1 | Elige una herramienta en la columna de la izquierda o búscala con {search}. En una ventana angosta, haz clic en el nombre de la herramienta para cambiarla. | Pick a tool from the left column or search for it with {search}. In a narrow window, click the tool's name to switch. |
| help.p2 | Pega o escribe en Entrada y el Resultado aparece al momento. Si no sabes qué poner, usa «Probar con un ejemplo». Con una entrada muy grande, o en los generadores, usa {run}. | Paste or type in Input and the Output appears right away. If you're not sure what to enter, use "Try an example". With a very large input, or in generators, use {run}. |
| help.p3 | «Traer de una nota» carga un bloque de código de cualquier nota. Si el bloque dice su lenguaje (```json, ```sql…), se abre en la herramienta que le corresponde. | "Load from a note" loads a code block from any note. If the block names its language (```json, ```sql…), it opens in the matching tool. |
| help.p4 | «Guardar en una nota» crea una nota nueva con el resultado en un bloque de código. | "Save to a note" creates a new note with the output in a code block. |
| help.p5 | Lo que pegas solo vive en la memoria: sigue ahí al cambiar de herramienta y se borra al cerrar Logday. Solo se recuerdan la última herramienta, sus opciones y cómo ordenaste la lista. Para borrarlo antes, usa «Vaciar todas las herramientas», al pie. | What you paste lives only in memory: it stays when you switch tools and is cleared when you close Logday. Only the last tool, its options and how you arranged the list are remembered. To clear it sooner, use "Clear all tools" at the bottom. |
| help.p6 | Haz clic en el nombre de un grupo para plegarlo o desplegarlo. Para ordenar u ocultar herramientas, usa el botón de opciones junto al buscador. | Click a group's name to collapse or expand it. To reorder or hide tools, use the settings button next to the search box. |
| help.inTool | En esta herramienta | In this tool |

**DevTools: atajos**

Las teclas salen de `shortcut(spec)`. En macOS se ven como ⇧⌘F, ⌥⌘↓…; fuera, como Ctrl+Shift+F, Ctrl+Alt+↓….

| Clave | Teclas (`spec`) | es | en |
|---|---|---|---|
| help.k.search | `mod+shift+F` | Buscar una herramienta | Search for a tool |
| help.k.move | `alt+mod+down` / `alt+mod+up` | Herramienta siguiente o anterior | Next or previous tool |
| help.k.run | `mod+enter` | Procesar o generar | Run or generate |
| help.k.copy | `mod+shift+C` | Copiar el resultado | Copy the output |
| help.k.save | `mod+shift+S` | Guardar en una nota (en los códigos, guardar la imagen) | Save to a note (for codes, save the image) |
| help.k.open | `mod+shift+O` | Traer de una nota | Load from a note |
| help.k.swap | `mod+shift+X` | Usar el resultado como entrada | Use the output as input |
| help.k.clear | `mod+shift+backspace` | Limpiar la entrada | Clear the input |
| help.k.tabs | `alt+mod+1` … `alt+mod+4` | Cambiar de pestaña en Comparar listas | Switch tabs in Compare lists |

Base: `devtools/View.tsx:197-235`, `ui/OutputPanel.tsx:46,53`, `ui/CodeImage.tsx:84`, `views/ListCompareTool.tsx:95`.

**DevTools: "En esta herramienta"** (`TOOL_HELP`)

Solo estas 8 herramientas lo tienen. En las demás, la descripción bajo el título basta.

| Clave | es | en |
|---|---|---|
| regex.help1 | Escribe el patrón sin las barras / /: usa la sintaxis de JavaScript. | Type the pattern without the / / slashes: it uses JavaScript syntax. |
| regex.help2 | Sin «g» solo se busca la primera coincidencia. Se muestran hasta 1000. | Without "g" only the first match is found. Up to 1000 are shown. |
| regex.help3 | Si la búsqueda pasa de 1 s, se detiene para no trabar la app; suele ser un patrón con repeticiones anidadas, como (a+)+. | If the search takes over 1 s, it stops so the app doesn't freeze; it's usually a pattern with nested repeats, like (a+)+. |
| cron.help1 | Acepta 5 campos (minuto, hora, día del mes, mes, día de la semana) o 6, con los segundos al inicio, como en Spring y Quartz. | It accepts 5 fields (minute, hour, day of month, month, day of week) or 6, with seconds first, as in Spring and Quartz. |
| cron.help2 | Las próximas ejecuciones van en tu hora local. | Next runs are in your local time. |
| cron.help3 | Las expresiones con L, W o # se explican, pero sus próximas ejecuciones no se calculan. | Expressions with L, W or # are explained, but their next runs aren't calculated. |
| sql-list.help1 | Pega los valores uno por línea o separados por comas, punto y coma o tabs: el separador se detecta solo. | Paste values one per line or separated by commas, semicolons or tabs: the separator is detected. |
| sql-list.help2 | En «Más opciones», escribe la columna para obtener columna IN (…). Con más de 1000 valores, usa «Partir en grupos de»: Oracle no acepta más. | In "More options", type the column to get column IN (…). With more than 1000 values, use "Split into groups of": Oracle doesn't accept more. |
| sql-list.help3 | Cambia a «SQL → lista» para sacar los valores de un IN. | Switch to "SQL → list" to get the values out of an IN. |
| list-compare.help1 | Pega una lista en A y otra en B, un valor por línea. | Paste one list in A and another in B, one value per line. |
| list-compare.help2 | Las pestañas muestran lo que está solo en A, solo en B, en las dos o en cualquiera (Unión). | The tabs show what's only in A, only in B, in both, or in either (Union). |
| list-compare.help3 | «Pasar a SQL IN» lleva el resultado a la otra herramienta. | "Send to SQL IN" takes the result to that tool. |
| diff.help1 | Pega el original a la izquierda y el modificado a la derecha. | Paste the original on the left and the modified text on the right. |
| diff.help2 | Cambia entre Unificada y Lado a lado. | Switch between Unified and Side by side. |
| diff.help3 | «Ignorar espacios en blanco» no cuenta los cambios de espacios. Los finales de línea CRLF y LF se toman como iguales. | "Ignore whitespace" skips whitespace changes. CRLF and LF line endings count as equal. |
| qr.help1 | Más corrección de errores (H) aguanta un logo encima, pero cabe menos texto. | Higher error correction (H) survives a logo on top, but fits less text. |
| qr.help2 | Deja un margen de al menos 4 módulos para que todos los lectores lo lean. | Keep a margin of at least 4 modules so every reader can scan it. |
| qr.help3 | Guárdalo como PNG o SVG, o copia el SVG. | Save it as PNG or SVG, or copy the SVG. |
| barcode.help1 | Cada formato acepta caracteres distintos: la regla aparece bajo el campo. | Each format accepts different characters: the rule shows under the field. |
| barcode.help2 | En EAN, UPC e ITF-14 puedes omitir el dígito de control: se calcula y se agrega al final. | In EAN, UPC and ITF-14 you can leave out the check digit: it's calculated and added at the end. |
| jwt.help1 | Pega el token; el prefijo «Bearer» se quita solo. | Paste the token; the "Bearer" prefix is removed. |
| jwt.help2 | Se decodifica, pero la firma no se verifica: decodificarlo no prueba que sea auténtico. | It's decoded, but the signature isn't verified: decoding doesn't prove it's authentic. |

Base: `tools/regex.ts:28` y `MAX_MATCHES`, `tools/regexRunner.ts:7` (`REGEX_TIMEOUT_MS`), `tools/cron.ts:76-90`, `tools/lists.ts:14-16,103-125`, e `i18n.ts` (`devtools`: `diffEol`, `qrMarginLow`, `barcodeCheckDigit`, `jwtNotVerified`, `jwtBearerRemoved`).

La ayuda de DevTools se arma así, de arriba abajo:
1. `HelpSection` "En esta herramienta", si la herramienta está en `TOOL_HELP`;
2. `HelpSection` sin título, con `help.p1…p6` (`help.p6`, de specs/devtools D21);
3. `HelpShortcuts`.

**Tareas (sección `help`)**

Huecos:
- `{up}`, `{down}`, `{enter}`, `{x}`, `{t}`, `{m}` y `{w}`: valores fijos ↑, ↓, Enter, x, t, m y w;
- `{mod}`: ⌘ o Ctrl;
- `{newTask}`: la tecla configurada de nueva tarea.

| Clave | es | en |
|---|---|---|
| tasksScreen | Tareas | Tasks |
| tasksTitle | Cómo funcionan las tareas | How tasks work |
| tasks1 | Escribe en la captura rápida y pulsa Enter. Agrega #proyecto, @tag o una fecha al final, como mañana o 15/11. | Type in quick add and press Enter. Add #project, @tag or a date at the end, like tomorrow or 15/11. |
| tasks2 | En la Lista, muévete con {up} {down} y abre una tarea con {enter}. {x} la completa; {t}, {m} y {w} le ponen fecha de hoy, de mañana o de dentro de una semana. | In List, move with {up} {down} and open a task with {enter}. {x} completes it; {t}, {m} and {w} set it due today, tomorrow or in a week. |
| tasks3 | Con {mod} clic o ⇧ clic seleccionas varias, y los atajos actúan sobre todas. | {mod}-click or ⇧-click selects several, and shortcuts apply to all. |
| tasks4 | En Kanban, arrastra una tarjeta para cambiar su estado. En Calendario, arrastra una tarea a otro día para cambiar su fecha. | In Kanban, drag a card to change its status. In Calendar, drag a task to another day to change its date. |
| tasks5 | Clic derecho en una tarea abre su menú: fecha, estado, proyecto y duplicar. {newTask} crea una tarea desde cualquier sección. | Right-click a task for its menu: date, status, project, duplicate. {newTask} creates a task from any section. |

El pie lleva `help.seeAllShortcuts` y `help.seeTour`. Base: `TaskShortcutsSheet.tsx`, `QuickAddInput.tsx:107-119`, `TaskRow.tsx:107`, `TaskList.tsx:206-235` y `App.tsx:149`.

**Dailys (sección `help`)**

Huecos: `{newDaily}` y `{absence}`, las teclas configuradas para el daily de hoy y para marcar una ausencia.

| Clave | es | en |
|---|---|---|
| dailysTitle | Cómo funcionan los dailys | How dailies work |
| dailys1 | «Hoy» o {newDaily} crea el daily de hoy; «Fecha», el de otro día. | "Today" or {newDaily} creates today's daily; "Date" creates one for another day. |
| dailys2 | Escribe una actividad y pulsa Enter. Con # buscas una tarea por su código; si escribes parte del título de una tarea, te la sugiere. | Type an activity and press Enter. Type # to find a task by its code; type part of a task's title and it's suggested. |
| dailys3 | Arrastra las actividades para ordenarlas, o conviértelas en tarea con vencimiento ese día. | Drag activities to reorder them, or turn one into a task due that day. |
| dailys4 | «Previo» muestra el día hábil anterior, sin fines de semana, festivos de Colombia ni ausencias. El botón de copiar arma el mensaje para tu reunión diaria. | "Previous" shows the previous working day, skipping weekends, Colombian holidays and absences. The copy button builds the message for your daily meeting. |
| dailys5 | Clic derecho en el mes exporta sus dailys a PDF, Markdown o texto. {absence} marca un día como no laborado. | Right-click the month to export its dailies as PDF, Markdown or text. {absence} marks a day as not worked. |

El pie lleva `help.seeTour` (escena 0). Base: `DailyEditor.tsx:324-350,494,689-695,859-915`, `colombianHolidays.ts:123`, `DailyList.tsx:320,453-493` y `App.tsx:157-168`.

**Horas extra (sección `help`)**

| Clave | es | en |
|---|---|---|
| overtimeTitle | Cómo funcionan las horas extra | How overtime works |
| overtime1 | «Nueva» registra una extra con su fecha y sus horas de inicio y fin. Se guarda en el mes de su fecha. | "New" logs overtime with its date and start and end times. It's filed under the month of its date. |
| overtime2 | El desglose es automático: diurnas de 06:00 a 19:00, nocturnas de 19:00 a 06:00, y festivas los domingos y festivos de Colombia. | The breakdown is automatic: daytime 06:00–19:00, night 19:00–06:00, and holiday on Sundays and Colombian holidays. |
| overtime3 | Si dos horarios del mismo día se cruzan, te avisa antes de guardar. | If two entries on the same day overlap, you're warned before saving. |
| overtime4 | Abajo: la persona pone tu nombre y cédula en el reporte, el ojo muestra la vista previa y la flecha exporta a Excel el mes que estás viendo. | At the bottom: the person icon sets your name and ID for the report, the eye shows a preview, and the arrow exports the month you're viewing to Excel. |

El pie lleva `help.seeTour` (escena 0). Base: `overtimeCalc.ts:3-9,46`, `OvertimeList.tsx:251-281`, `OvertimeEditor.tsx:197-200`, `appStore.ts:3947`, e `i18n.ts` (`overtime.conflict*`).

Arreglo AY21: `overtime.title`, de 'Extras' a 'Horas extra' (es). En sigue 'Overtime'.

**Pomodoro (sección `pomodoro`)**

| Clave | es | en |
|---|---|---|
| helpTitle | Cómo funciona el Pomodoro | How Pomodoro works |
| help1 | Trabaja un bloque, descansa y repite; cada cierto número de bloques toca un descanso largo. Cambia las duraciones en Opciones. | Work a block, take a break, repeat; every few blocks you get a long break. Change durations in Settings. |
| help2 | Elige una tarea si quieres: es opcional y el pomodoro no escribe nada en ella. | Pick a task if you want: it's optional and the pomodoro doesn't write anything to it. |
| help3 | Mientras corre, el menú lateral y la bandeja muestran el tiempo y dejan pausarlo. | While it runs, the sidebar and the tray show the time and let you pause it. |
| help4 | Solo cuentan los bloques de trabajo que llegan al final, y el historial se guarda solo en este equipo. | Only work blocks that reach the end count, and the history stays on this computer. |

Atajos (`HelpShortcuts`):

| Clave | Teclas | es | en |
|---|---|---|---|
| helpKeySpace | `spaceKey` ("Espacio" / "Space") | Iniciar o pausar, fuera de un botón o un campo | Start or pause, outside a button or field |
| helpKeySkip | `shortcutLabel('→', mac)` | Saltar la fase | Skip the phase |
| helpKeyRestart | `shortcutLabel('←', mac)` | Reiniciar la fase | Restart the phase |
| helpKeyTask | `shortcutLabel('T', mac)` | Elegir una tarea | Pick a task |

Base: `pomodoro/View.tsx:62-83`, `SidebarStatus.tsx` e `i18n.ts` (`pomodoro.taskHint`, `historyNote`, `tray*`).

**`TaskShortcutsSheet` (AY22)**

Las filas "⌘ clic · ⇧ clic" y "⌘ Enter" se arman con ⌘ en macOS y con Ctrl fuera, en los dos idiomas. Quedan "Ctrl clic · ⇧ clic" y "Ctrl Enter", o "Ctrl click · ⇧ click" y "Ctrl Enter".

Antes de escribirlos en `i18n.ts`, se comprueba contra el código que cada botón y cada atajo que nombran existan con ese nombre (AY14).

## Cambio del 31 oct 2026: botón más chico

Jorge vio que el botón se solapaba con los de la cabecera al achicar la ventana (la lista baja hasta 200 px). Ahora:

- **Tamaño:** el botón mide 20×20 px y su ícono 13 px. Antes eran `ICON_BTN` con `min-h-7 min-w-7` (28 px) y un ícono de 14 px. No se encoge (`shrink-0`) y, con el espacio de alrededor, cumple la excepción de espaciado de WCAG 2.5.8.
- **Cabeceras de Tareas, Kanban, Calendario, Dailys y Horas extra:** el grupo del título lleva `min-w-0` y el título `truncate`, así que cuando falta espacio se recorta con "…". Los botones de la derecha llevan `shrink-0`, para que nunca se tapen ni se corten.
- **Dailys:** con la lista al mínimo no caben el título, la ayuda y los cuatro botones. "Hoy" queda solo con el ícono por debajo de 15rem (container query `@container/dlh`), los botones de la cabecera usan `px-1.5`, y el título conserva `min-w-[2.75rem]` para que la ayuda no se monte sobre "Fecha". Probado a 288 y 200 px en Dailys, Horas extra y Tareas: sin solapes ni botones cortados.

## Cambio del 31 oct 2026: un solo botón en el menú lateral

Pedido por Jorge (requirements AY24–AY29): el botón (?) se solapaba con los de las cabeceras angostas. Antes había un `HelpButton` de 20 px junto al título de cada pantalla; ahora hay uno solo en el menú lateral, y las cabeceras no tienen botón de ayuda.

### Arquitectura

- **`components/shared/HelpPopover.tsx`** (antes `HelpButton.tsx`):
  - `useHelpPopover(content)` tiene el estado, el teclado y el foco del popover, y devuelve las props del botón que lo abre (`triggerProps`), su nombre, `toggle` y el portal. Así el disparador puede ser cualquiera.
  - `HelpContent`: `{ screen, title, intro?, tourScene?, actions?, body }`.
  - `HelpPanel`, `HelpSection`, `HelpShortcuts`, `HelpNote` y `helpFooter` no cambian.
- **`components/help/SidebarHelp.tsx`:** `SidebarHelpButton`, con `variant="row"` (Lista con nombres) o `"column"` (Barra de íconos y colapsado). Recibe las clases de sus vecinos (`footerRow` de "Opciones" y `columnBtn` de Buscar) para verse igual.
  - Se vuelve a montar con `key={activeSection}`: al cambiar de sección, la ayuda abierta se cierra (AY6).
  - Con `helpButtonsEnabled` apagado no se dibuja, y sin él no hay quien escuche ⌘/.
- **`components/help/ScreenHelp.tsx`:** `useSectionHelp()` arma el `HelpContent` de la sección activa. Los textos de Tareas, Dailys, Horas extra y la general salen de la sección `help`; los títulos de DevTools y Pomodoro, de las suyas.
  - Los cuerpos de DevTools y Pomodoro se cargan con `lazy` al abrir la ayuda, para no cargar el código de una extensión solo por el menú (specs/extensiones R16). Son el `default` de `extensions/devtools/ui/Help.tsx` y `extensions/pomodoro/Help.tsx`.
- **`components/help/helpTopics.ts`:** `helpTopicFor(section)`, la función pura que dice qué ayuda va en cada sección: `tasks`, `dailys`, `overtime`, `ext:devtools` y `ext:pomodoro` tienen la suya; las demás, `general`.
- **DevTools sin su contexto:** la ayuda ya no está dentro de `DevtoolsView`, así que lee la herramienta de `extensions.devtools.settings.lastTool` (`readDevtoolsSettings`). La vista la guarda en cada cambio (`goTo`), así que es la que está abierta. `DevtoolsHelpBody` recibe `tool`, `tr` y `mac` por props.
- **"Ver todos los atajos":** la hoja de atajos sigue en el estado de cada vista. La ayuda manda el evento de ventana `logday:show-task-shortcuts` (`components/tasks/taskShortcutsRequest.ts`), como `logday:new-task`. Las tres vistas están montadas a la vez, así que `useTaskShortcutsRequest(currentView === '<vista>', …)` escucha solo en la activa.
- **⌘/:** el `keydown` global de `App.tsx` lo detecta con `isHelpShortcut` (`helpKeyboard.ts`) y manda `logday:toggle-help` (`requestHelpToggle`), que escucha el botón del menú.

### El botón

| Estilo | Dónde | Aspecto |
|---|---|---|
| Lista con nombres | Al pie, justo encima de "Opciones" | La fila de "Opciones" (`CircleHelp` de 14 px y "Ayuda"), más `FOCUS_RING`. Al pasar el puntero o con el foco, el atajo a la derecha, como en las secciones. |
| Barra de íconos y colapsado | En la columna, encima de Buscar | `columnBtn` con `CircleHelp` de 18 px, sin texto. El tooltip de la columna (`NavTooltip`, NS16) con "Ayuda: {pantalla}" y ⌘/. |

- **Abierto:** `aria-expanded:bg-[var(--bg-hover)] aria-expanded:text-[var(--text-primary)]`, sin acento.
- **ARIA:** `aria-label` "Ayuda: {pantalla}", `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` y `aria-keyshortcuts` (`Meta+/` o `Control+/`). Sin `title`: la fila tiene su texto y la columna su tooltip.
- **El tooltip** usa su propio id (`help-nav-tooltip`): `useNavTooltip` y `NavTooltip` aceptan uno, para no repetir el de las secciones si se ven los dos. Con la ayuda abierta no se muestra.
- **La pantalla en el nombre:** "Tareas", "Dailys", "Horas extra", "DevTools", "Pomodoro"; con la ayuda general, el nombre de la sección ("Ayuda: Inicio", "Ayuda: Notas").

### Posición

- A la derecha del menú, fuera de él: el contenedor del menú lleva `data-help-edge` (`HELP_EDGE_ATTR`), y el ancla es su borde derecho a la altura del botón (`helpAnchor`).
- `anchorOptions: { sideX: 'right', alignY: 'end', gap: 8 }`: alineada por abajo con el botón, que está al pie. Si no cabe, `placeMenuNearAnchor` la voltea o la ajusta a la ventana.
- Si el botón no se ve (no se dibuja o mide 0), `helpAnchor` da la esquina inferior izquierda.

### Teclado y foco

Lo de "Teclado y foco" de arriba sigue igual (Esc en captura, trampa de Tab, corte de `keydown` en el portal salvo ⌘ con una tecla, clic fuera), con tres cambios:

- **⌘/ también sale del portal** (`passesToApp`), para cerrar la ayuda con el mismo atajo.
- **El foco al cerrar:** si se abrió con ⌘/, vuelve adonde estaba (un campo, una nota); si se abrió con el botón, al botón.
- **El desplazamiento** (`scrollCloses(target, popover, trigger)`) solo la cierra si lo que se desplaza contiene el botón. Desplazar la lista de tareas o una herramienta no la cierra: el botón no se mueve.

### ⌘/

- `isHelpShortcut(e)`: ⌘ o Ctrl, sin ⌥, y `e.key === '/'`. Vale ⌘ o Ctrl en todos los sistemas, como los demás atajos de `App.tsx`.
  - Con ⇧ también: en el teclado en español "/" es ⇧7.
  - En el inglés, ⇧/ escribe "?", y ⌘? es la ayuda del sistema en macOS: no cuenta.
- Va en el `keydown` global, después de la comprobación de `isConfigured` (sin la bienvenida) y antes de ⌘0…⌘9. No hace nada si `helpButtonsEnabled` está apagado ni si el evento ya lo usó otro (`defaultPrevented`): en las notas, ⇧⌘7 es la lista numerada de TipTap.
- **Choques revisados:** ningún atajo de TipTap usa `Mod-/` (revisado en `node_modules/@tiptap`), ni los de DevTools (`HELP_SHORTCUTS` y `View.tsx`), Pomodoro o la lista de tareas (`?` sin ⌘). Opciones → Atajos no deja elegir "/" como tecla, igual que los dígitos.

### La ayuda general (sección `help`)

Huecos: `{home}`, `{first}`, `{last}` = ⌘0, ⌘1, ⌘9; `{search}`, `{newTask}`, `{newNote}`, `{newDaily}` = las teclas de la config; `{help}` = ⌘/ (`generalHelpKeys`).

| Clave | es | en |
|---|---|---|
| menuLabel | Ayuda | Help |
| generalTitle | Cómo funciona Logday | How Logday works |
| general1 | Muévete con el menú lateral: {home} va a Inicio y {first}…{last}, a las demás secciones, en el orden del menú. | Move around with the sidebar: {home} goes to Home and {first}…{last} to the other sections, in sidebar order. |
| general2 | {search} abre Buscar: encuentra tareas y dailys, y en «Ir a» saltas a cualquier sección, también a las de «Más». | {search} opens Search: it finds tasks and dailies, and under "Go to" you can jump to any section, including the ones in "More". |
| general3 | Clic derecho en una sección para moverla o quitarla del menú. Las que quitas, o no caben, quedan en «Más», y desde ahí se vuelven a fijar. | Right-click a section to move it or remove it from the sidebar. The ones you remove, or that don't fit, go into "More", where you can pin them again. |
| general4 | {newTask} crea una tarea, {newNote} una nota y {newDaily} el daily de hoy, desde cualquier sección. Las letras se cambian en Opciones → Atajos. | {newTask} creates a task, {newNote} a note and {newDaily} today's daily, from any section. You can change the letters in Settings → Shortcuts. |
| general5 | {help} abre o cierra esta ayuda. En Tareas, Dailys, Horas extra y algunas extensiones, como DevTools y Pomodoro, explica esa pantalla. | {help} opens or closes this help. In Tasks, Dailys, Overtime and some extensions, like DevTools and Pomodoro, it explains that screen. |

El pie lleva "Ver el recorrido" (escena 0). Base: `sectionOrder.ts` (`shortcutOrder`, `sectionForShortcut`), `sections.tsx` (`homeItem`, atajo 0), `SearchGoToSections.tsx` (`goToGroup`), `SectionMenus.tsx` (`remove`, `pin`, `moveUp`, `moveDown`), `runSearch` (tareas y dailys) y `App.tsx`.

Otros textos: `settings.shortcutHelp` ("Ayuda de la pantalla" / "Help for this screen"), y `helpButtonsTitle` y `helpButtonsDesc` de AY23.

### Las cabeceras

- Tareas, Kanban, Calendario, Horas extra, DevTools y Pomodoro vuelven a su cabecera sin botón. En Tareas, Kanban, Calendario y Horas extra se quedan el `truncate` del título y el `shrink-0` de los botones.
- **Dailys:** con los nombres de "Fecha" y "Hoy", la cabecera no cabe a 200 px ni sin el botón de ayuda (los cuatro botones con nombre miden ~188 px y caben ~167). Medido en Chromium con la letra por defecto (17 px):
  - a 288 px, el ancho por defecto, se ven "Fecha" y "Hoy" con su nombre y el título entero;
  - por debajo de ~280 px (`@[14.5rem]/dlh`), "Fecha" queda solo con el ícono; por debajo de ~245 px (`@[12.5rem]/dlh`), también "Hoy";
  - a 200 px, el título se lee entero;
  - los botones van con `px-1.5` y `gap-0.5`, y se quitó el `min-w-[2.75rem]` del título, que era para el botón de ayuda.
  - Los umbrales van en rem, así que crecen con el tamaño de letra de la app.


## Cambio del 31 oct 2026: la ayuda del Cliente HTTP (AY30)

- `helpTopics.ts`: `'ext:http-client'` → `'http-client'`. `ScreenHelp.tsx` carga con `lazy` el `default` de `extensions/http-client/ui/Help.tsx`, como DevTools y Pomodoro. El nombre en el botón es `extensions['http-client.name']` ("Ayuda: Cliente HTTP") y el título, `httpClient.helpTitle`.
- El cuerpo son los puntos `help1`…`help6` de la sección `httpClient`, con `KeyedText` (`{send}` es ⌘↵ o Ctrl+Enter, de `sendShortcut`), y los atajos de `httpHelpRows`. `{{baseUrl}}` se ve tal cual: `splitKeys` y `interpolate` solo cambian las claves que reciben.

| Clave | es | en |
|---|---|---|
| helpTitle | Cómo funciona el Cliente HTTP | How HTTP client works |
| help1 | A la izquierda, «Peticiones» reúne los bloques http de todas tus notas, agrupados por nota. Elige una para cargarla en el formulario; «Abrir la nota» te lleva a ella. | On the left, "Requests" gathers the http blocks from all your notes, grouped by note. Pick one to load it into the form; "Open the note" takes you to it. |
| help2 | Para crear una, escribe un bloque ```http en cualquier nota, o empieza con «Nueva petición» y usa «Guardar en una nota». | To create one, write an ```http block in any note, or start with "New request" and use "Save to a note". |
| help3 | En el formulario van el método, la URL, las cabeceras (una por línea, como Nombre: valor) y el cuerpo. Las variables van como {{baseUrl}} y salen del entorno activo, que eliges arriba a la derecha. | The form has the method, the URL, the headers (one per line, as Name: value) and the body. Variables go as {{baseUrl}} and come from the active environment, which you pick at the top right. |
| help4 | Los entornos y sus variables se definen en Opciones → Cliente HTTP. Los secretos van al llavero del sistema, nunca a la nota. Con un entorno protegido, POST, PUT, PATCH y DELETE piden confirmación, y también se pide si un secreto va a un host que no es de confianza. | Environments and their variables are set in Settings → HTTP client. Secrets go to the system keychain, never to the note. With a protected environment, POST, PUT, PATCH and DELETE ask for confirmation, and so does a secret going to a host that isn't trusted. |
| help5 | Lo que cambias aquí y la respuesta solo viven en la memoria: la nota de la que vino la petición no cambia. Para guardarla, usa «Guardar en una nota». | What you change here and the response only live in memory: the note the request came from doesn't change. To keep it, use "Save to a note". |
| help6 | Los bloques http también se envían desde la nota misma: pulsa Enviar en su barra, o {send} con el cursor dentro del bloque. | http blocks can also be sent from the note itself: press Send on their bar, or {send} with the cursor inside the block. |
| helpKeySend | Enviar la petición | Send the request |
| helpKeyUrl | Enviar, con el foco en la URL | Send, with the focus on the URL |
| helpKeyCancel | Cancelar el envío en curso | Cancel the request in progress |

Comprobado contra el código: ⌘↵ y Esc los maneja el `onKeyDown` de `RequestForm.tsx`, Enter el de la URL; ⌘↵ en el bloque de la nota es el de `MermaidAwareCodeBlock` (specs/cliente-http A3.3).
