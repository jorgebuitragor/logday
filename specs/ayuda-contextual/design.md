# Ayuda contextual — Design

Estado: en progreso.

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

- **Posición:** debajo del botón, alineado a su borde derecho, a 6 px.
  - Se logra con un `AnchorRect` sintético: `{ left: r.right, right: r.right, top: r.bottom + 6, bottom: r.bottom + 6 }`, con `anchorOptions: { sideX: 'left', gap: 0 }`.
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
| help.p5 | Lo que pegas solo vive en la memoria: sigue ahí al cambiar de herramienta y se borra al cerrar Logday. Solo se recuerdan la última herramienta y sus opciones. Para borrarlo antes, usa «Vaciar todas las herramientas», al pie. | What you paste lives only in memory: it stays when you switch tools and is cleared when you close Logday. Only the last tool and its options are remembered. To clear it sooner, use "Clear all tools" at the bottom. |
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
2. `HelpSection` sin título, con `help.p1…p5`;
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
