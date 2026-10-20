# Requirements — Consistencia visual de temas

Estado: implementado. Verificado visualmente en los 4 temas. Motivado por
un bug real encontrado y arreglado en
`src/components/OvertimeList.tsx` (commit `5f23e73`, ver §1) y por la
auditoría de código hardcodeado documentada en este spec a fecha
2026-07-31.

## 1. Contexto

Logday soporta 4 temas de color (`dark`, `light`, `high-contrast`,
`visual-rest`), definidos como variables CSS por tema en `src/App.css`
(`--bg-*`, `--border-*`, `--text-*`, `--accent`, `--accent-strong`,
`--accent-soft`, `--accent-ink`, `--accent-inline`, `--accent-link`,
`--accent-code`). El tema `visual-rest` usa un acento verde; los otros tres
usan variantes de índigo/morado.

Gran parte de la UI usa clases Tailwind hardcodeadas (`text-indigo-400`,
`bg-indigo-500/10`, etc.) en vez de las variables de tema. Para que estas
clases se vean correctas en `high-contrast`/`visual-rest`,
`src/App.css:128-158` define 6 reglas CSS que interceptan por selector de
atributo (`[class*="text-indigo-"]`, `[class*="bg-indigo-"]`, etc.) y
repintan el color al acento del tema activo, con `!important`.

Este mecanismo tiene dos límites conocidos:

1. Solo aplica a `high-contrast`/`visual-rest` — `light`/`dark` no lo
   necesitan porque coinciden visualmente con el índigo hardcodeado por
   coincidencia de diseño.
2. Solo intercepta clases Tailwind cuyo nombre contiene el substring
   literal (`border-indigo-`, etc.). Cualquier código que hardcodee el
   color por fuera de una clase Tailwind así nombrada —CSS plano,
   `style={{}}` inline, configuración pasada a una librería en JS, o una
   utilidad Tailwind direccional como `border-l-indigo-500`— no es
   alcanzado por ninguna regla, y el color se queda fijo en índigo sin
   importar el tema.

El bug ya arreglado (`OvertimeList.tsx` usaba `border-l-indigo-500`, cuyo
infijo `-l-` rompe el match del selector `[class*="border-indigo-"]`) es
una instancia del límite #2. La auditoría para este spec encontró más
instancias del mismo límite, en código que ni siquiera usa clases
Tailwind.

## 2. Requisitos — color de acento fuera del alcance del mecanismo actual

- CUANDO se muestra un enlace de referencia a código de tarea (`#CODIGO`)
  dentro de una nota, el sistema DEBERÁ usar el color de acento del tema
  activo (`var(--accent-link)` en reposo, `var(--accent)` en hover) en vez
  de un valor `rgb(129 140 248)` fijo.
  — Afecta: `src/App.css:372-382` (`.task-code-link`, 3 valores: `color`,
  `border-bottom`, `:hover`).

- CUANDO el usuario pasa el mouse sobre el "drag handle" de un bloque del
  editor de notas, lo activa, o arrastra un bloque, el sistema DEBERÁ
  mostrar los estados de hover/activo/dragging y el indicador de línea de
  destino ("drop indicator") con el color de acento del tema activo, no con
  `rgba(129, 140, 248, ...)` fijo.
  — Afecta: `src/App.css:754-827` (bloque completo del drag handle: hover,
  active/dragging, outline de `.ProseMirror.dragging`, outline de nodo
  seleccionado, gradiente de `.drag-drop-indicator`, `.block-drop-flash` —
  11 valores en total).

- CUANDO el usuario arrastra una imagen o bloque sobre el editor de notas y
  se muestra el cursor de "drop" de TipTap, el sistema DEBERÁ pintarlo con
  el color de acento del tema activo en vez de `rgba(129, 140, 248, 0.55)`
  fijo.
  — Afecta: `src/components/NoteEditor.tsx:525`
  (`Dropcursor.configure({ color: ... })`).

- CUANDO el usuario abre el editor de un diagrama Mermaid y ve el toggle
  código/visual, el estado activo del toggle DEBERÁ usar el color de
  acento del tema activo en vez de `#6366f1` fijo.
  — Afecta: `src/components/MermaidEditorModal.tsx:176`.

- CUANDO el usuario usa el editor visual de diagramas (nodos de proceso,
  terminal, círculo, decisión, estado, inicio/fin, y las conexiones entre
  ellos), todos los elementos que indican selección o son parte del estilo
  base del diagrama (bordes de nodo, sombra de selección, handles de
  conexión, líneas y flechas de edges) DEBERÁN usar el color de acento del
  tema activo en vez de `#6366f1`/`#818cf8`/`rgba(99,102,241,...)` fijos.
  — Afecta: `src/components/visual-editors/FlowVisualEditor.tsx` —
  `baseStyle()` (border + boxShadow, usado por todos los tipos de nodo),
  `handleStyle` (handles de conexión, usado en los 8 puntos de conexión de
  los distintos nodos), `DecisionNode` (duplica la lógica de `baseStyle`
  para el nodo rombo), `StartEndNode`, `DEFAULT_EDGE` (color de línea y de
  flecha de las conexiones).

## 3. Requisito — estabilidad del color "indigo" en eventos de calendario

- El calendario permite categorizar eventos con una paleta fija de 6
  colores (`indigo`, `amber`, `emerald`, `rose`, `sky`, `violet`), definida
  en `EVENT_COLOR_DOT`/`EVENT_COLOR_BADGE` en `src/components/CalendarView.tsx`
  y duplicada en `src/components/DashboardView.tsx`. Es una elección de
  categorización del usuario, no debe depender del tema activo.
- CUANDO un evento está categorizado con el color "indigo" y el tema activo
  es `high-contrast` o `visual-rest`, el sistema DEBERÁ seguir mostrando el
  punto/badge en el tono índigo original de la paleta — el mismo
  comportamiento que ya tiene la opción "violet" de la misma paleta, que no
  cambia con el tema.
  — Estado actual: el mecanismo de `App.css:128-158` intercepta las clases
  `bg-indigo-400`, `border-indigo-500/40 bg-indigo-500/10 text-indigo-300`
  de la opción "indigo" (por coincidencia de substring, no a propósito) y
  las repinta al acento del tema, mientras que `violet` no se toca. Esto
  produce una inconsistencia entre dos opciones de la misma paleta.

## 4. Requisito opcional — variable `--bg-secondary` no definida

- El fondo de la barra de herramientas del editor de notas (y de un select
  de lenguaje de código) DEBERÁ tener un color de fondo visible en los 4
  temas.
  — Estado actual: `var(--bg-secondary)` se usa en `src/App.css:553`
  (`.code-block-lang-select`) y en `src/components/NoteEditor.tsx:1902,2263`
  y `src/components/RichTextEditor.tsx:397` (clases
  `bg-[var(--bg-secondary)]`), pero esta variable **no está definida en
  ningún bloque de tema** (`:root`, `light`, `high-contrast`,
  `visual-rest`). Sin variable definida y sin fallback, `background-color`
  resuelve a transparente en los 4 temas por igual — no es un problema de
  "cambia mal entre temas" sino de "está roto en todos", pero se incluye
  aquí por bajo costo y por aparecer en el área ya auditada. Es opcional:
  puede omitirse de la implementación sin afectar los demás requisitos.

## 5. Fuera de alcance

Decisión explícita del usuario: este spec cubre únicamente consistencia
visual del color de acento. Quedan fuera, documentados pero no
planeados:

- **Sincronización en vivo con el tema del sistema operativo.** Hoy,
  cuando el tema seleccionado es `system`, `applyThemeToDOM()`
  (`src/store/appStore.ts:297-320`) resuelve `prefers-color-scheme` una
  sola vez (al iniciar la app o al seleccionar `system` en Configuración).
  No hay ningún listener de `matchMedia(...).addEventListener('change', ...)`
  — si el usuario cambia la preferencia de su SO mientras Logday está
  abierto, la UI no se actualiza sola.
- **Mapeo de la ventana nativa de Tauri para `high-contrast`/`visual-rest`.**
  `setTheme()` (`src/store/appStore.ts:1654-1658`) llama a
  `getCurrentWindow().setTheme(...)` de Tauri pasando solo `'dark'` o
  `'light'` — nunca un valor específico para los otros dos temas, así que
  la barra de título nativa siempre se renderiza en modo claro para
  `high-contrast`/`visual-rest`.
- **Persistencia del tema en `config.json`.** Hoy el tema vive solo en
  `localStorage['theme']` (`src/store/appStore.ts:354,1655`); el
  `AppConfig` persistido por Tauri (`src/types/index.ts:68-80`) no tiene
  campo de tema. Sí existe en el backup manual de exportación
  (`BackupSettings.theme`, `src/types/index.ts:82-91`), que no se toca.
- **Colores neutros no ligados al acento** — paleta de resaltado de
  sintaxis (`.tok-*`/`.hljs-*` en `App.css`), sombras hardcodeadas en
  rgba negro, overlays slate en menús de código. Confirmado que son
  elecciones de diseño intencionales (un tema de sintaxis fijo es un
  patrón común), no bugs de tema — no cambian de forma incorrecta entre
  temas porque no pretenden seguir el acento.
- **Colores en el PDF exportado** (`src/lib/exportNote.ts`,
  `getPdfTokenColor()`) — genera un documento estático; no es UI viva que
  deba reaccionar al tema en pantalla.
- **Reescribir o eliminar el mecanismo de override de
  `src/App.css:128-158`.** Sigue cubriendo correctamente ~15+ componentes
  hoy (confirmado por auditoría) — este spec agrega arreglos puntuales a
  lo que el mecanismo no alcanza, no lo reemplaza. Ver
  [`design.md`](./design.md) para el razonamiento completo de esta
  decisión.
