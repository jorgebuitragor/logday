# DevTools — Design

Estado: en progreso.

## Arquitectura

- **Módulo:** `src/extensions/devtools/`, cargado con `import()` solo con la extensión activa (R16). Exporta `View` (la sección del menú lateral, R11), `Settings` (su página en Opciones, D17) y `start`, cuya función de parada borra la memoria y corta un regex en curso (D9).
- **Funciones puras** en `tools/`, sin React ni DOM, todas probadas en vitest:
  - `formats.ts` (JSON, YAML, XML, CSV);
  - `encoding.ts` (Base64, URL, HTML, JWT);
  - `generators.ts` (UUID, contraseñas, lorem);
  - `hash.ts` (MD5 propio, SHA con `crypto.subtle`);
  - `time.ts` y `cron.ts`;
  - `regex.ts` (más `regexWorker.ts` y `regexRunner.ts`);
  - `diff.ts`, `lists.ts` y `codes.ts` (QR y barras).
  Todas devuelven `ToolResult` (`result.ts`): una salida, o un error con un código traducible y su línea y columna.
- **Por qué hay lectores propios de JSON y XML:** el `JSON.parse` de WebKit (el WebView de macOS) no da la posición del error, y `DOMParser` da mensajes distintos en cada motor. El lector propio da el mismo error en las tres plataformas y se prueba sin DOM.
- **Por qué el regex corre en un worker:** un patrón con repeticiones anidadas (`(a+)+$`) puede tardar minutos. En el hilo principal congelaría Logday entero; en un worker se termina a 1 s.
- **QR y barras:** las librerías solo codifican (la matriz del QR, los bits de las barras). El SVG lo arma `codes.ts`, siempre negro sobre blanco, y de ese SVG salen la vista previa, el copiado y el PNG (dibujado en un canvas al guardar). Para el QR, el texto se pasa ya en bytes UTF-8, porque el modo por defecto de la librería corta cada carácter a 8 bits.
- **Memoria (D9):**
  - Lo pegado vive en un `Map` del módulo (`model.ts`). Sobrevive a cambiar de sección y se borra al desactivar la extensión o al cerrar la app.
  - Lo que se recuerda va en `extensions.devtools.settings`: `lastTool`, `options` y cómo se muestra la lista (`layout`, `groupOrder`, `toolOrder`, `hidden`, `collapsed`; Adenda G, §G.4). Nada de lo pegado.
- **Lista resuelta:** `resolveToolList()` (`model.ts`, pura) arma la lista que se ve a partir de `TOOL_GROUPS` y las preferencias. La usan la columna, el selector de la ventana angosta, ⌥⌘↓/↑ y la página de Opciones, para que las cuatro vean el mismo orden.
- **Notas (D10):** `notes.ts` lee todas las notas de disco, porque el store solo tiene las de la carpeta abierta, y crea la nota con `createNoteWith` (R18).

# Texto para `specs/devtools/design.md` → sección "Interfaz"

## 1. Registro y punto de entrada

- En `registry.ts`, una entrada nueva: `{ id: 'devtools', category: 'tool', icon: Wrench, apps: ['desktop'], view: true, load: () => import('./devtools') }`. Hay que sumar `'devtools'` a `ExtensionId`.
  - No lleva `sendsDataExternally`, porque no envía nada fuera del equipo, así que tampoco pide el aviso de R6.
  - ~~No lleva `settings`: las opciones viven dentro de la vista, así que no tiene entrada propia en Opciones (R21).~~ Revertido el 31 oct 2026 (D17): lleva `settings: true` y el módulo exporta `Settings`, así que tiene su página en Opciones, debajo de Extensiones. Ver la Adenda G.
- El módulo exporta `View` y `Settings` (D17). App.tsx ya lo monta dentro de `flex flex-1 flex-col overflow-auto bg-[var(--bg-base)]` y de `ExtensionBoundary` (R15). La vista ocupa todo ese alto con `h-full min-h-0` y maneja su propio scroll, para que no haya dos barras de desplazamiento.
- Persistencia:
  - Lo que el usuario pega vive en un store en memoria del módulo (por ejemplo, un `create()` de zustand dentro de `src/extensions/devtools/`). Se conserva al cambiar de sección y se pierde al cerrar la app. **Nunca** va a `localStorage`, `sessionStorage`, `config.json` ni al store principal.
  - Lo que sí se recuerda va en `extensions.devtools.settings`, con `updateExtensionSettings` (es local y no se sincroniza): `{ lastTool, options: { json: { indent, mode }, uuid: { version, count, upper, noHyphens }, password: {...}, ... } }`, más las preferencias de la lista (Adenda G, §G.4).

## 2. Estructura y layout

La raíz de la vista es un contenedor con nombre. Las medidas se dan en rem, que escalan con `--app-font-size`: con letra más grande, el diseño se apila antes.

```
<div class="@container/devtools flex h-full min-h-0">        ← raíz de la vista
┌──────────────┬──────────────────────────────────────────────────────┐
│ NAV 200px    │ <section> HERRAMIENTA  (@container/tool, overflow-y-auto)
│ [🔍 Buscar ] │ ┌ Encabezado ─────────────────────────────────────────┐
│              │ │ [ic] JSON                    [Traer de una nota]    │
│ FORMATOS     │ │      Formatea, minifica y valida JSON.              │
│ {} JSON  ◀── │ ├ Opciones ───────────────────────────────────────────┤
│ ▤ YAML       │ │ Modo [Formatear|Minificar]  Indentación [2|4|Tab]   │
│ </> XML      │ ├ Cuerpo (1 col; 2 col desde @3xl/tool) ──────────────┤
│ ⇄ JSON↔YAML  │ │ ENTRADA        [Limpiar] │ RESULTADO [⇄][⧉][📄+]   │
│ ▦ JSON→CSV   │ │ ┌─────────────────────┐  │ ┌─────────────────────┐ │
│ CODIFICACIÓN │ │ │ textarea mono       │  │ │ pre read-only       │ │
│ …            │ │ └─────────────────────┘  │ └─────────────────────┘ │
│              │ │ ● JSON válido / ⚠ Línea 3, columna 14: …           │
│ ──────────── │ └─────────────────────────────────────────────────────┘
│ 🔒 nota priv.│
│ Vaciar todas │
└──────────────┴──────────────────────────────────────────────────────┘
```

**Columna de navegación** (desde `@xl/devtools`, unos 36rem, cerca de 612 px con letra de 17 px):
- Contenedor: `<nav aria-label={t('devtools','navLabel')}>` con `flex w-[200px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]`. Es la misma superficie que las columnas de lista (`DailyList.tsx:243`, `NoteList.tsx:354`).
- Ancho fijo, sin `ResizeHandle`.
- Arriba, con `px-2 pt-3 pb-2`, un buscador y, a su derecha, el botón de opciones (D17, Adenda G §G.1):
  - Input: `w-full rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-hint)] focus:border-indigo-500 focus:outline-none`.
  - Lleva `Search size={13}` a la izquierda (`pl-7`, ícono `absolute left-2.5 text-[var(--text-hint)]`) y un `<kbd>` con `⌘⇧F` a la derecha, con el estilo de `SearchModal.tsx:88`: `rounded-md border border-[var(--border-card)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[10px] text-[var(--text-hint)]`.
- Lista: `flex-1 overflow-y-auto px-2 pb-3 flex flex-col gap-1`, con un grupo por categoría en el orden del usuario; cada grupo desplegado lleva `pb-4` (con todo desplegado, el espacio es el de antes). En el modo A-Z no hay grupos (D18).
  - Encabezado de grupo: un botón que pliega el grupo (D21), con el chevron a la derecha. Clases, estados y teclado en la Adenda G, §G.2. Mientras se busca vuelve a ser texto: `px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)]`.
  - Ítem, igual que `navItem` de `SettingsModal.tsx:162`: `flex w-full items-center gap-2 rounded-lg py-1.5 pl-2.5 pr-2.5 text-left text-xs font-medium transition`.
    - Activo: `bg-indigo-500/15 text-indigo-400` con `aria-current="page"`.
    - Inactivo: `text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]`.
    - Ícono lucide de 14 px y `shrink-0`. La etiqueta usa `leading-snug`: pasa a dos líneas en vez de cortarse ("Expresiones regulares").
- Pie (`border-t border-[var(--border)] px-3 py-2.5`):
  - Nota de privacidad: `flex items-start gap-1.5 text-[10px] leading-snug text-[var(--text-hint)]` con `ShieldCheck size={11}`.
  - Debajo, un botón fantasma: `mt-1.5 rounded-md px-1.5 py-0.5 text-[10px] text-[var(--text-hint)] hover:bg-red-500/10 hover:text-red-400`. Dice "Vaciar todas las herramientas" y confirma con `ConfirmDeleteModal`, el patrón compartido.

**Ventana angosta** (por debajo de `@xl/devtools`): la columna se oculta (`hidden @xl/devtools:flex`). En el encabezado de la herramienta, el título pasa a ser un **selector de herramienta**:
- Botón: `flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]` con `ChevronDown size={13} text-[var(--text-hint)]`, y `aria-haspopup="dialog" aria-expanded`.
- Abre un popover anclado: `absolute z-30 mt-1.5 w-[260px] max-h-[60vh] rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl`, como el menú de `AppSelect`. Dentro van el mismo buscador y la misma lista agrupada.
- Se cierra con Esc, con clic fuera o al elegir una herramienta. Al cerrarse, el foco vuelve al botón.

**Menú lateral colapsado:** no cambia nada dentro de la vista, solo hay más ancho. Con la ventana mínima (800 px), en la práctica:
- Menú normal (224 px): la vista mide unos 572 px, así que se usa el selector y el cuerpo se apila.
- Menú colapsado (48 px): la vista mide unos 752 px, así que se ve la columna y el cuerpo se apila.
- A partir de 1280 px con el menú normal: la vista mide unos 1052 px y la herramienta unos 850, así que el cuerpo va en dos columnas.

**Cuerpo de la herramienta:** `grid gap-4 px-5 py-4 @3xl/tool:grid-cols-2` (48rem es unos 816 px con letra de 17 px). Las herramientas que necesitan más espacio para el resultado (JWT, regex, diff y timestamp) no usan dos columnas iguales: ver el punto 4.

## 3. Plantilla común de herramienta

Es un componente nuevo y compartido, `ToolFrame`, en `src/extensions/devtools/ui/`. No basta con lo que hay porque ninguna vista existente combina entrada, opciones, salida y acciones. Todas sus piezas, eso sí, salen de clases que ya existen.

**Encabezado** (`flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4`):
- Izquierda: tile del ícono `rounded-lg bg-indigo-500/10 p-2 text-indigo-400`, con el ícono de 16 px, igual que `ExtensionSettingsPage` (`SettingsModal.tsx:247`). Al lado, `<h2 id="devtools-tool-title" class="text-sm font-semibold text-[var(--text-primary)]">` y la descripción en `<p class="mt-0.5 text-[11px] text-[var(--text-hint)]">`.
- Derecha: "Traer de una nota", con `SECONDARY_CLS` + `text-xs` y `FileInput size={13}`. Solo aparece en las herramientas con entrada de texto (ver la tabla 6.2).

**Barra de opciones** (`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 pt-4 text-xs`):
- Cada opción lleva su etiqueta (`text-[var(--text-secondary)]`) y su control.
- Selector segmentado, el de `team-chat/Settings.tsx:119`: `role="radiogroup"` con `aria-label` y `flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5`. Los botones llevan `role="radio" aria-checked`, `rounded-md px-3 py-1.5 text-xs font-medium` y estos estados:
  - activo: `bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/40`;
  - inactivo: `text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]`.
  - **Nuevo:** las flechas ←/→ mueven la selección (roving tabindex: solo el activo tiene `tabIndex=0`). En team-chat no se hace así.
- Interruptor: `ToggleSwitch size="sm"` de `components/shared`, con `<label>` en el texto y `aria-labelledby`.
- Número: `INPUT_CLS` con `w-20 tabular-nums`, `type="number"` y `min`/`max`.

**Panel** (entrada o salida, `flex min-w-0 flex-col gap-1.5`):
- Fila de título, `flex items-center justify-between gap-2`:
  - Título: `<label for>` o `<h3>`, con `text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)]`.
  - A la derecha, las acciones del panel: botones de ícono `rounded-lg p-1.5 text-[var(--text-hint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`, ícono de 14 px, `aria-label` y `title` con el atajo ("Copiar (⌘⇧C)").
  - Las acciones principales de salida (Copiar y Guardar en una nota) llevan texto cuando el panel mide al menos 22rem (`@sm/tool:` muestra el `<span>`). Por debajo quedan solo con ícono.
- Entrada: `<textarea>` con `min-h-[12rem] h-[40vh] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 font-mono text-xs leading-relaxed text-[var(--text-body)] placeholder:text-[var(--text-hint)] focus:outline-none focus:ring-2 focus:ring-indigo-500/40`.
  - Es la misma base que `textarea` de `TaskEditor` (`resize-none rounded-lg border… focus:ring-2 focus:ring-indigo-500/40`), pero en mono.
  - El placeholder usa `--text-hint`, **no** `--text-faint`: en el tema claro, faint da 2,3:1.
  - **Obligatorio:** `spellCheck={false} autoCorrect="off" autoCapitalize="off" autoComplete="off"`. La autocorrección de WebKit en macOS cambia comillas y guiones, y rompe JSON y tokens.
  - Tab no se intercepta: sale del campo (no hay trampa de teclado). Los textos con tabulaciones se pegan.
- Salida de lectura: `<pre tabindex="0" class="min-h-[12rem] max-h-[60vh] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 font-mono text-xs leading-relaxed text-[var(--text-body)] select-text whitespace-pre">`, con `aria-label`.
  - `select-text` es necesario porque el `body` tiene `user-select: none` (`App.css`, `@layer base`).
  - El resaltado con `lowlight` se pinta con las clases `hljs-*` dentro de un `<code class="devtools-code">`. Ver el punto 8: los colores actuales de hljs no sirven en claro ni en sepia.
- Salida editable: algunas herramientas (los encoders) tienen una salida que se puede editar como entrada. Usan el mismo textarea con `readOnly` y fondo `bg-[var(--bg-surface)]`.

**Línea de estado**, bajo la entrada y a todo el ancho: `flex items-start gap-1.5 px-5 pb-4 text-[11px]`, con estas variantes:
- válido: `CircleCheck size={12} text-emerald-400` + texto `text-[var(--text-secondary)]` (como `quick-capture/Settings.tsx:113`);
- error: `CircleAlert size={12} mt-px` + texto `text-red-400` y `id="devtools-error"`;
- aviso: `TriangleAlert size={12} text-amber-400` + texto `text-[var(--text-secondary)]`;
- información: texto `text-[var(--text-hint)]`.

**Acciones comunes:**

| Acción | Dónde | Ícono | Comportamiento |
|---|---|---|---|
| Copiar | Salida (y cada fila en JWT, hashes, timestamp) | `Copy` → `Check` | `navigator.clipboard.writeText`. Durante 1,5 s pasa a `bg-emerald-500/10 text-emerald-400` con el texto "Copiado" (patrón de `DailyEditor.tsx:871`) y lo anuncia la región `aria-live`. Si falla: toast `error`. |
| Intercambiar | Entre paneles, en conversores y encoders | `ArrowLeftRight` (en dos columnas) / `ArrowDownUp` (apilado) | La salida pasa a la entrada y la dirección se invierte. Si la salida tiene error o está vacía, el botón se deshabilita (`disabled:opacity-50 disabled:cursor-not-allowed`). |
| Limpiar | Entrada | `Eraser` | Vacía la entrada de esa herramienta, sin confirmar: es una sola herramienta y se puede volver a pegar. El foco vuelve a la entrada. |
| Guardar en una nota | Salida | `FilePlus` | Ver 6.1. Se deshabilita si no hay salida válida. |
| Traer de una nota | Encabezado | `FileInput` | Ver 6.2. |
| Probar con un ejemplo | Estado vacío | `Sparkles` | Llena la entrada con un ejemplo inventado. |

## 4. Lo particular de cada herramienta

Íconos que se verificaron en `lucide-react@1.28`:
- Formatos: JSON `Braces`, YAML `FileCode`, XML `CodeXml`, JSON↔YAML `ArrowLeftRight`, JSON→CSV `Table2`.
- Codificación: Base64 `Binary`, URL `Link`, entidades HTML `Ampersand`, JWT `KeyRound`.
- Generadores: UUID `FingerprintPattern`, hashes `Hash`, contraseñas `LockKeyhole`, lorem `Pilcrow`.
- Fechas: timestamp `Clock`, cron `CalendarClock`.
- Texto: regex `Regex`, diff `Diff`.

Casi todas las herramientas **procesan en vivo**, con un debounce de 150 ms. `⌘↵` las fuerza.

**Formatos**
- **JSON:**
  - Opciones: Modo (Formatear o Minificar, en selector segmentado) e Indentación (2 espacios, 4 espacios o Tab; se deshabilita al minificar).
  - Siempre valida. Si es válido: "JSON válido · 3,2 KB".
  - Si hay error: "Línea 3, columna 14: se esperaba «,» o «}»", más un botón de texto "Ir al error" (`text-indigo-400 hover:underline`). El botón enfoca la entrada y hace `setSelectionRange` en ese punto.
  - La salida va resaltada como `json`.
  - Ojo: el `JSON.parse` de WKWebView (macOS) **no da la posición** del error. Hace falta un parser propio o una dependencia (ver Decisiones).
- **YAML:**
  - Opción: Indentación (2 o 4).
  - Error con línea y columna: `js-yaml` 3 da `mark.line` y `mark.column` empezando en 0, así que hay que sumar 1.
  - Aviso fijo cuando la entrada tiene `#`: "Al formatear se pierden los comentarios".
  - Con varios documentos (`---`): `loadAll`, y en el estado "3 documentos".
- **XML:**
  - Opción: Indentación (2, 4 o Tab).
  - Valida con `DOMParser`. Si aparece `<parsererror>`, se saca de él la línea y la columna.
  - La salida se resalta como `xml`, que hay que registrar en lowlight.
- **JSON ↔ YAML:**
  - Opciones: Dirección (JSON → YAML o YAML → JSON) e Indentación.
  - Lleva botón de intercambiar. El error se informa en el lenguaje de la entrada.
- **JSON → CSV:**
  - Opciones: Separador (Coma, Punto y coma o Tab) y el interruptor "Incluir encabezados", activo por defecto.
  - Las columnas son la unión de las claves, en el orden en que aparecen por primera vez. Una clave que falta deja la celda vacía. Un valor anidado (objeto o arreglo) va como JSON compacto dentro de la celda, con las comillas escapadas según RFC 4180.
  - Encima de la salida, el resumen: "{filas} filas · {columnas} columnas".
  - Errores: "Se esperaba un arreglo de objetos…" o "El elemento 4 no es un objeto".

**Codificación** (Base64, URL y entidades HTML comparten plantilla)
- Opción Dirección: Codificar o Decodificar. Los paneles se llaman "Texto" y "Codificado"; al cambiar de dirección se cambia el orden.
- Base64:
  - Interruptor "Variante para URL (base64url)".
  - Al decodificar se aceptan las dos variantes y la falta de relleno `=`.
  - Errores: el carácter inválido y su posición, o "no es texto UTF-8" cuando se decodifica un binario.
- URL: `encodeURIComponent` y `decodeURIComponent`. Error: "secuencia % mal formada en la posición N".
- HTML:
  - Interruptor "Codificar también los caracteres no ASCII", apagado por defecto. Apagado, solo se codifica `< > & " '`.
  - Al decodificar se aceptan entidades con nombre y numéricas.
- **JWT** (vista propia, sin dos columnas iguales: la entrada va arriba y los resultados debajo, a todo el ancho):
  - Entrada: textarea de 4 filas (`min-h-[6rem]`). Se quita el prefijo `Bearer ` y se avisa de ello. Los espacios y saltos de línea se ignoran.
  - **Aviso fijo** sobre los resultados, que no se puede cerrar: `flex items-start gap-2 rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-secondary)]` con `ShieldAlert size={13} className="text-amber-400 mt-px"`. Lleva texto neutro a propósito, para que se lea en todos los temas.
  - Tarjeta "Estado": un chip `rounded-full px-2 py-0.5 text-[11px] font-medium text-[var(--text-primary)]` con estos fondos:
    - Vigente: `bg-emerald-500/15` + punto `bg-emerald-400`;
    - Vencido: `bg-red-500/15`;
    - Aún no es válido: `bg-amber-500/25`;
    - Sin vencimiento: `bg-[var(--bg-hover)]`.
    - Al lado, en `text-[var(--text-secondary)]`: "Venció hace 2 horas" o "Vence en 3 días". El estado nunca depende solo del color.
  - Tarjeta "Fechas" (solo los claims que existan), como tabla `<table>` con `<th scope="row">`. Columnas: claim (`font-mono text-[var(--text-hint)]`), fecha local, UTC, relativo y botón de copiar. Si un claim no es numérico, se avisa en esa fila.
  - Tarjetas "Cabecera" y "Payload": `<pre>` de salida resaltado como JSON. Cada una tiene Copiar y van en dos columnas desde `@3xl/tool`.
  - "Firma": solo la longitud y el `alg` de la cabecera ("HS256 · 43 caracteres"), sin mostrarla entera. Lleva un botón para copiarla.
  - Errores: número de partes distinto de 3; si son 5, se dice que es un JWE; parte que no es Base64URL o no es JSON, diciendo cuál.

**Generadores** (no tienen entrada de texto. Al abrirlos por primera vez se genera un resultado, así que nunca están vacíos. "Generar" es la acción principal y responde a `⌘↵`)
- Botón Generar: `SECONDARY_CLS` con `RefreshCw size={13}`. No se usa `PRIMARY_CLS` por su contraste en sepia (ver el punto 8).
- **UUID:**
  - Opciones: Versión (v4 o v7) con la ayuda "v7 se ordena por fecha de creación"; Cantidad (1–1000, por defecto 1); Mayúsculas; Sin guiones.
  - Salida: un `<pre>` con un UUID por línea y un Copiar que copia todos.
  - Con cantidad 1, la salida se muestra grande (`text-sm`) en una fila con su botón de copiar.
- **Hashes:**
  - Hay entrada de texto, pero los resultados son una tabla con los 4 algoritmos a la vez, calculados en vivo.
  - Filas: algoritmo (`text-[var(--text-secondary)] w-20`), hash (`font-mono text-xs text-[var(--text-body)] break-all select-text`) y Copiar.
  - Opción: Mayúsculas.
  - Nota fija: "Se calcula sobre el texto en UTF-8, tal cual, con los saltos de línea". En MD5 y SHA-1 hay un `TriangleAlert` con `title`: "ya no son seguros para firmas ni contraseñas".
  - Con la entrada vacía, la tabla muestra "—" en `text-[var(--text-hint)]`, no los hashes de la cadena vacía.
- **Contraseñas:**
  - Opciones:
    - Longitud: `<input type="range">` de 8 a 128 (por defecto 20) más un número. Se reutiliza `.color-picker-slider` de `App.css` o se crea una clase hermana `devtools-range` (nueva).
    - Casillas: Minúsculas, Mayúsculas, Números, Símbolos y "Evitar caracteres parecidos".
  - Salida: una fila grande (`text-sm font-mono`) con Copiar y Generar.
  - Debajo: "≈ 118 bits de entropía · Fuerte". La fuerza va como texto, más una barra de 3 segmentos `h-1 rounded-full` en `bg-red-400`, `bg-amber-400` o `bg-emerald-400` sobre `bg-[var(--border)]`. La barra es decorativa (`aria-hidden`).
  - Con todas las casillas apagadas: error "Elige al menos un tipo de caracteres" y Generar deshabilitado.
  - Se genera con `crypto.getRandomValues` y muestreo por rechazo.
  - **Sin "Guardar en una nota"** (ver Decisiones).
- **Lorem ipsum:**
  - Opciones: Unidad (Párrafos, Frases o Palabras), Cantidad (1–100, por defecto 3) e interruptor "Empezar con «Lorem ipsum dolor sit amet…»".
  - La salida va sin resaltado y con `whitespace-pre-wrap` (en vez de `pre`).

**Fechas**
- **Timestamp Unix:**
  - Hay **un solo campo** que acepta las dos cosas: el número o la fecha. Es un input mono de una línea (`INPUT_CLS` + `font-mono text-sm`) y a la derecha el botón "Ahora" (`SECONDARY_CLS`, `Clock size={13}`).
  - Al lado del campo, un chip de detección: `rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]`. Dice "Timestamp en segundos", "en milisegundos", "Fecha ISO 8601" o "Fecha en tu hora local".
  - Opción Unidad: Automático, Segundos o Milisegundos. Sirve para cuando falla la heurística, que hace esto: entero de 13 dígitos o más → ms; de 10 o menos → s; entre medias, se elige el que dé una fecha entre 1970 y 2100.
  - Resultados: tabla con una fila por formato:
    - Unix (s);
    - Unix (ms);
    - UTC (`2026-10-30 19:05:00 UTC`);
    - Hora local (America/Bogota), con `Intl` y la zona del sistema: `jueves, 30 de octubre de 2026, 14:05:00 (UTC−05:00)`;
    - ISO 8601 con desfase (`2026-10-30T14:05:00-05:00`);
    - Relativo (`Intl.RelativeTimeFormat`: "hace 3 horas", "en 2 días").
  - Cada fila lleva Copiar. El valor va en `font-mono text-xs select-text` y la etiqueta en `text-[var(--text-secondary)]`.
  - Una fecha sin zona se toma como hora local, y así lo dice el chip.
- **Cron:**
  - Input mono de una línea. Al lado, el chip "5 campos (estándar)" o "6 campos (con segundos)", según se detecte.
  - "Qué hace": la frase de `cronstrue` en el idioma de la app (hay que importar `cronstrue/locales/es`), en `text-sm text-[var(--text-primary)]`.
  - "Próximas ejecuciones": `<ol>` con las 5 siguientes en hora local, en el formato de la fila "Hora local" del timestamp, y al lado lo relativo en `text-[var(--text-hint)]`. Debajo: "En tu hora local (America/Bogota)".
  - Error: el mensaje de `cronstrue`, traducido cuando se pueda.
  - Calcular las próximas ejecuciones necesita un parser (ver Decisiones).

**Texto**
- **Expresiones regulares** (layout propio: patrón arriba a todo el ancho; debajo, en dos columnas desde `@3xl/tool`, el texto a la izquierda y la vista resaltada y las coincidencias a la derecha):
  - Patrón: un input mono `text-sm` con adornos `/` y `/{flags}` en `text-[var(--text-hint)]` a los lados. Lleva `aria-describedby` hacia el error.
  - Modificadores: chips toggle `aria-pressed` (`rounded-md px-2 py-1 font-mono text-xs`, el mismo estilo activo e inactivo que el segmentado) para `g i m s u y`. Cada uno tiene un `title` que lo explica. Por defecto `g`.
  - Texto: el textarea de la plantilla.
  - **Resaltado:** no se pinta sobre el textarea (la técnica del espejo es frágil con el scroll y el ajuste de líneas). Va en un panel de lectura, "Coincidencias en el texto", con el texto y `<mark>`:
    - coincidencia par: `bg-[var(--accent-soft)]`; impar: `bg-amber-500/25`;
    - las dos con `rounded-sm text-[var(--text-primary)]` y `box-decoration-break: clone`;
    - coincidencia vacía: `inline-block w-0 border-l-2 border-[var(--accent)] h-[1em] align-middle`, con texto oculto "(vacía)";
    - al pasar el ratón o enfocar una fila de la tabla, su `<mark>` recibe `outline outline-2 outline-[var(--accent)]` y se hace scroll hasta él.
  - Tabla "Coincidencias": #, Coincidencia (mono, truncada a 80 caracteres con `title`), Posición (`tabular-nums`) y una columna por grupo ("Grupo 1" o el nombre del grupo con nombre). Un grupo sin participar muestra "—".
  - Encima: "{n} coincidencias" o "Sin coincidencias". Se muestran como mucho 1000, con el aviso "Se muestran las primeras 1000".
  - Corre en un **Worker**:
    - debounce de 150 ms;
    - un worker nuevo por ejecución, que se termina a los **1000 ms**;
    - si tarda más de 150 ms, se ve "Buscando…" con un spinner `h-3 w-3 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent`, el de `App.tsx:164` en pequeño.
- **Comparar textos:**
  - Dos entradas en dos columnas desde `@3xl/tool`: "Original" y "Modificado". Entre ellas va Intercambiar.
  - Opciones: Vista (Unificada o Lado a lado) e "Ignorar espacios en blanco".
  - Resultado: un bloque `rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] font-mono text-xs overflow-auto max-h-[60vh]` con una fila por línea en `grid grid-cols-[3rem_3rem_1rem_1fr]`:
    - dos números de línea, viejo y nuevo (`text-right tabular-nums text-[var(--text-hint)] select-none`);
    - el signo `+` o `−`;
    - el texto.
  - Colores: agregada `bg-emerald-500/15`; quitada `bg-red-500/15`; el texto siempre en `text-[var(--text-body)]`, porque el signo y el fondo bastan.
  - Dentro de una línea cambiada, el tramo cambiado se marca más fuerte (`bg-emerald-500/30` o `bg-red-500/30`), con `fast-diff` a nivel de caracteres.
  - Lado a lado: dos columnas sincronizadas.
  - Para que el diff sea por líneas, `fast-diff` se usa con el truco de líneas a caracteres. Hay que reutilizar la protección contra surrogates sueltos de `src/lib/noteContentSync.ts:53`.
  - Resumen en el estado: "+12 −3 líneas", o "Los dos textos son iguales".

## 5. Estados

| Estado | Qué se ve |
|---|---|
| **Vacío** (entrada sin texto) | El placeholder de la herramienta en la entrada ("Pega o escribe JSON"). El panel de salida muestra, centrado (`flex flex-col items-center justify-center gap-2 text-center`), "El resultado aparece aquí." en `text-xs text-[var(--text-hint)]` y un botón "Probar con un ejemplo" (`SECONDARY_CLS`, `Sparkles size={13}`). No hay línea de estado. Copiar, Guardar e Intercambiar quedan deshabilitados. Los generadores nunca están vacíos. |
| **Primera vez en la vista** | Abre la herramienta guardada en `lastTool`. Si no hay, JSON. |
| **Procesando** | Solo regex (más de 150 ms) y la entrada grande en modo manual: spinner pequeño + "Buscando…" o "Procesando…" en la línea de estado. La salida anterior queda con `opacity-60`. |
| **Inválido** | Línea de estado de error. La entrada lleva `aria-invalid="true"`, `aria-describedby` hacia el error y el borde `border-red-500/60`. La salida **conserva el último resultado válido** con `opacity-50` y la etiqueta "Resultado anterior", para que no salte mientras se escribe. Copiar y Guardar quedan deshabilitados. |
| **Éxito** | Línea de estado de validez: "JSON válido · 3,2 KB", "+12 −3 líneas", "4 coincidencias". |
| **Copiado** | El botón cambia a `Check` + "Copiado" con `bg-emerald-500/10 text-emerald-400` durante 1,5 s, y la región `aria-live` lo anuncia. Las filas (hashes, timestamp, JWT) solo cambian el ícono. |
| **Tiempo agotado (regex)** | En la línea de estado, `TimerOff size={12} text-amber-400` + "La búsqueda pasó de 1 s y se detuvo. El patrón puede tener repeticiones anidadas, como (a+)+." y un botón "Reintentar" (`text-indigo-400 hover:underline`). El panel de coincidencias se vacía y no muestra resultados viejos. Si el patrón o el texto cambian, se reintenta solo. |
| **Entrada grande** (más de 1 MB, o más de 5000 líneas por lado en el diff) | Se deja de procesar en vivo. Aviso en la línea de estado: "Entrada grande (2,3 MB). Para no frenar la app, procesa con ⌘↵", con un botón "Procesar". Si la salida pasa de 200 KB, se muestra sin colores, con la nota "Sin colores: el resultado es muy grande". Pegar 50 MB funciona, solo que no se procesa en vivo. |
| **Error de la extensión** | `ExtensionBoundary` ya muestra el aviso con "Desactivar" (R15). |

## 6. Puente con Logday

### 6.1 Guardar en una nota
- Llama a `createNoteWith({ title, content: formatFence(lang, output), folder: '' })`, el método del store que ya existe.
  - Título: `"{herramienta} — {fecha y hora local corta}"`, por ejemplo "JSON — 30 oct 2026, 14:05".
  - No navega a la nota.
- Después:
  - Toast `success` "Nota creada", con la descripción «{título}» y la acción "Abrir". La acción hace `setActiveNote` + `setSection('notes')`.
  - Además, en la fila de título del panel de salida, hasta que la salida cambie: "Guardado en «{título}» · Abrir" en `text-[11px] text-[var(--text-secondary)]`, con un botón de texto. Así el enlace sigue accesible aunque el toast desaparezca (WCAG 2.2.1).
  - Si falla: toast `error` "No se pudo crear la nota".
- Lenguaje de la cerca por herramienta:
  - `json`: JSON, YAML → JSON, JWT (`{ header, payload }`) y el regex (si se guardan las coincidencias);
  - `yaml`: YAML y JSON → YAML;
  - `xml`: XML;
  - `csv`: JSON → CSV;
  - `diff`: comparar textos (diff unificado);
  - `plaintext`: Base64, URL, HTML, UUID, hashes (`ALG  hash` por línea), timestamp (la tabla en texto), cron (expresión + frase + próximas) y lorem.
  - La de contraseñas no lleva el botón.
- Caso borde: si la salida tiene una línea que empieza por ```` ``` ````, `formatFence` cerraría la cerca. Se usa una cerca de 4 comillas invertidas (```` ```` ````) y lo mismo al leerla (ver 6.2).

### 6.2 Traer de una nota
- Disponible en JSON, YAML, XML, JSON↔YAML, JSON→CSV, Base64, URL, HTML, JWT, hashes, timestamp, cron, regex (va al texto) y diff (va a Original). No está en UUID, contraseñas ni lorem.
- Es un modal con `ModalOverlay align="start" className="pt-[15vh] px-4"` y `ModalPanel className="w-full max-w-xl rounded-2xl border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden"`, como `SearchModal`. Agrega `role="dialog" aria-modal="true" aria-labelledby` y una trampa de foco (**nuevo**: `ModalPanel` no lo tiene).
- **Paso 1, notas:**
  - Arriba, el input de búsqueda como en `SearchModal.tsx:76-90`, con `<kbd>ESC</kbd>`. Filtra por título.
  - Solo se listan las notas que tienen bloques de código, ordenadas por fecha de edición. Cada fila es como un resultado de `SearchModal`: título en `text-sm font-medium text-[var(--text-body)] truncate` y, debajo, "{n} bloques · {carpeta}" en `text-[10px] text-[var(--text-hint)]`.
  - Patrón combobox: `input role="combobox" aria-controls aria-activedescendant` + `role="listbox"`, con ↑/↓ y Enter.
- **Paso 2, bloques:**
  - Arriba, el botón "Volver a las notas" (`ChevronLeft`) y el título de la nota.
  - Una fila por bloque:
    - el chip del lenguaje: `rounded-md bg-[var(--bg-hover)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]`, o "Sin lenguaje";
    - las 3 primeras líneas en `pre` mono `text-[11px] text-[var(--text-secondary)] line-clamp-3`;
    - a la derecha, la acción.
  - La acción depende del lenguaje: `json` → "Abrir en JSON", `yaml`/`yml` → "Abrir en YAML", `xml`/`svg` → "Abrir en XML", `html` → "Abrir en Visor HTML" (desde D26, Adenda H; antes iba a XML). Si no hay herramienta para ese lenguaje (`plaintext`, `bash`, `sql`, `csv`…) → "Cargar en {herramienta actual}".
  - Se leen todos los bloques con un recorrido de cercas de cualquier lenguaje. Ojo: hoy `parseFencedBlocks` pide un lenguaje concreto, así que hace falta una variante que no lo exija.
- Al elegir un bloque:
  - se cierra el modal y se cambia de herramienta si hace falta;
  - el bloque reemplaza la entrada de esa herramienta y el foco va a la entrada;
  - la línea de estado dice "Cargado de «{título}»" hasta la siguiente edición.
  - No hay confirmación: el usuario lo pidió de forma explícita, y "Limpiar" ya es igual de fácil.
- Estados vacíos del modal: "Ninguna nota tiene bloques de código." y "Ninguna nota coincide con «{q}»".

## 7. Teclado y foco

**Atajos globales de la app que se respetan** (`App.tsx:105-147`, `SearchModal.tsx:42-54` y `types/config.ts:23`):
- `⌘N`, `⌘T`, `⌘D` y `⌘A`: configurables, y solo fuera de los campos.
- `⌘F`: configurable, y actúa **también dentro de los campos**. Abre la búsqueda global.
- `⌘⇧Space`: la captura rápida, global del sistema.
- Además, los del sistema en los campos (⌘C, ⌘V, ⌘X, ⌘Z, ⌘A) y los de ventana.

Los atajos globales se comparan con `e.key` en minúscula sin mirar Shift. Por eso todos los de DevTools usan **⌘⇧ + letra** (en Windows y Linux, Ctrl+Shift): con Shift, `e.key` llega en mayúscula y no choca con ninguno, aunque el usuario reconfigure los suyos.

| Atajo | Acción | Notas |
|---|---|---|
| `⌘⇧F` | Enfoca el buscador de herramientas (o abre el selector si la ventana es angosta) | Enter abre el primer resultado y enfoca su entrada. Esc limpia el buscador y, si ya está vacío, lo desenfoca. |
| `⌥⌘↓` / `⌥⌘↑` | Herramienta siguiente / anterior | En el orden que se ve (el del usuario o el A-Z, de `resolveToolList`), con vuelta al principio. Recorre también las de los grupos plegados; no las ocultas (D22). |
| `⌘↵` | Acción principal: Generar en los generadores; Procesar con entrada grande; Reintentar en regex | En las demás herramientas no hace nada (ya procesan en vivo). |
| `⌘⇧C` | Copiar la salida principal | Funciona aunque el foco esté en la entrada. |
| `⌘⇧S` | Guardar en una nota | Solo si la herramienta lo tiene y hay una salida válida. |
| `⌘⇧O` | Traer de una nota | |
| `⌘⇧X` | Intercambiar | |
| `⌘⇧⌫` | Limpiar la entrada | |

- El listener va en la raíz de la vista (`onKeyDown` del contenedor), no en `window`: solo actúa con la vista montada. Si `e.defaultPrevented`, no hace nada.
- Caso borde: en Windows, Ctrl+Shift+C e I abren el inspector de WebView2 **solo** en las builds de desarrollo. En release no pasa, pero conviene probarlo.
- Los atajos se ven en el `title` de cada botón ("Copiar (⌘⇧C)"). En Windows se muestran como "Ctrl+Shift+C", con `isMacPlatform()` de `quick-capture/model.ts`.
- **Orden de foco:** buscador de herramientas → botón de opciones → lista (un solo tab stop: roving tabindex, ↑/↓ mueve el foco por encabezados de grupo e ítems, Home y End van a los extremos, Enter o Espacio abren la herramienta o pliegan el grupo y el foco se queda donde está, ← y → según la Adenda G §G.2; el contenido está a un Tab) → "Traer de una nota" → opciones → entrada → acciones de la salida → salida (`pre tabindex=0`) → tabla de resultados → pie de la lista.
- Al abrir una herramienta con el ratón, el foco no se mueve. Con Enter desde el buscador, va a la entrada.
- Foco visible en todo lo nuevo: `focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`, como en `CaptureWindow.tsx:154`. El `theme-tinted` lo repinta con el acento (`App.css:253`).

## 8. Accesibilidad

**Roles y nombres:**
- `<nav aria-label="Herramientas de DevTools">`. Los ítems son `<button aria-current="page">`, como en Opciones. Cada grupo es un `<div role="group" aria-labelledby>` que apunta a su encabezado.
- La herramienta es un `<section aria-labelledby="devtools-tool-title">` con `<h2>`. Los paneles usan `<h3>` o `<label for>`.
- Las salidas son `<pre aria-label="Resultado">`. Las tablas (fechas, hashes, coincidencias) son `<table>` reales con `<th scope>`.
- Los selectores segmentados son `role="radiogroup"`. Los modificadores de regex son `aria-pressed`. Los interruptores son `ToggleSwitch` (`role="switch"`) con label.
- En el diff, cada línea agregada o quitada lleva un `<span class="sr-only">Agregada: </span>`. El signo `+`/`−` es `aria-hidden`.
- En regex, cada `<mark>` lleva el texto oculto "coincidencia {n}" al principio y al final.

**Regiones vivas:**
- Una sola región por vista: `<div class="sr-only" aria-live="polite" aria-atomic="true">`. En ella se escriben "Copiado", "Generado", "Nota creada: «…»", "Cargado de «…»" y el tiempo agotado del regex.
- Los errores de validación **no** usan `role="alert"`, porque sonarían en cada tecla. La región viva solo anuncia el error cuando cambia, tras 500 ms sin escribir, y el campo los asocia con `aria-describedby` y `aria-invalid`.
- Los errores que aparecen al pulsar algo (no se pudo copiar, no se pudo crear la nota) usan el toast `error`.

**Contraste** (WCAG 1.4.3 y 1.4.11, calculado con los tokens de `App.css`):

| Par | Oscuro | Claro | Alto contraste | Descanso visual | Sepia | OLED | Nórdico |
|---|---|---|---|---|---|---|---|
| `--text-body` / `--bg-input` (entrada) | 14,2 | 17,0 | 19,8 | 12,6 | 10,4 | 13,5 | 9,6 |
| `--text-secondary` / `--bg-base` | 11,2 | 9,5 | 18,9 | 12,2 | 7,3 | 11,1 | 8,9 |
| `--text-hint` / `--bg-base` (etiquetas, placeholder) | 5,0 | 4,4 ⚠ | 9,7 | 5,8 | 4,8 | 5,6 | 5,8 |
| `--text-faint` / `--bg-base` | 4,6 | **2,3 ✗** | 6,5 | 3,8 ✗ | 4,6 | 4,9 | 5,3 |
| Ítem activo `text-indigo-400` sobre `bg-indigo-500/15` | 5,4 | 4,8 | 6,3 | 6,2 | **2,9 ✗** | 7,0 | 4,2 ⚠ |
| `text-red-400` (errores) / `--bg-input` | 6,5 | 4,6 | 7,2 | 5,7 | **2,2 ✗** | 7,1 | 4,2 ⚠ |
| `text-emerald-400` / `--bg-input` | 9,4 | 4,8 | 10,3 | 8,2 | **1,5 ✗** | 10,2 | 6,1 |
| `--text-body` sobre `bg-*-500/15` (diff, chips) | 11–12 | 14–15 | 16–17 | 10–11 | 8,7–9,2 | 11–12 | 7,6–8,5 |
| Blanco sobre `PRIMARY_CLS` (`bg-indigo-600`, repintado a `--accent-soft` en temas tintados) | 13,5 | 6,3* | 15,6 | 11,5 | **1,5 ✗** | 15,0 | 8,3 |

\* El tema claro no está tintado, así que el botón conserva el `indigo-600`. Los temas personalizados de base clara están tintados y caen como sepia (1,4).

Reglas para DevTools a partir de la tabla:
- Nada con significado en `--text-faint`: placeholders y etiquetas van en `--text-hint`.
- Los resultados y los chips llevan texto `--text-primary` o `--text-body` sobre un fondo de color translúcido; el color nunca es lo único que informa.
- No se usa `PRIMARY_CLS`: las acciones van con `SECONDARY_CLS`.
- Hacen falta las correcciones de sepia del punto 9.1, en el mismo PR. Sin ellas, los errores y el "Copiado" no se leen en sepia.

**Resaltado de sintaxis:** los colores `hljs-*` de `App.css:787-832` son fijos y pensados para fondo oscuro. Sobre `--bg-surface` en claro dan entre 1,2 y 2,5:1, y en sepia entre 1,0 y 2,0:1.
- Propuesta (**tokens nuevos**): `--syntax-string`, `--syntax-number`, `--syntax-comment`, `--syntax-function`, `--syntax-property` y `--syntax-punct`.
  - Por defecto, los hex oscuros de hoy.
  - En `light` y `sepia`: `#166534`, `#991b1b`, `#475569`, `#155e75`, `#86198f` y `--text-secondary`. Dan entre 5,5 y 9,8:1.
  - Las reglas `hljs-*` se reescriben con esos tokens para `.prose-editor pre code` y para la clase nueva `.devtools-code`.
- Mejora también los bloques de código de las notas en el tema claro.
- Nórdico: el comentario `#94a3b8` da 3,9:1; con `#a9b2c1` (`--text-hint`) pasaría.

**Otros:**
- Objetivos de clic de 28 px o más (`p-1.5` + ícono de 14). Es Desktop: no aplica la regla de 44 px táctil.
- Con zoom o la letra grande (`--app-font-size`), los container queries en rem apilan el layout antes de que se rompa.
- `prefers-reduced-motion` y `.no-animations` ya anulan las transiciones. El spinner usa `animate-spin`, que queda cubierto por `.no-animations`.

## 9. Casos borde

- **Datos sensibles:**
  - nada se escribe en disco salvo lo que el usuario guarde en una nota a propósito;
  - el portapapeles del sistema (y sus historiales) queda fuera del alcance;
  - "Vaciar todas las herramientas" borra la memoria al momento;
  - un reload de la webview (desarrollo) también la borra.
- **Entrada enorme:** a partir de 1 MB se procesa a mano y a partir de 200 KB de salida se muestra sin colores. El textarea aguanta; el problema sería resaltar y procesar en cada tecla.
- **JSON:**
  - números que pasan de 2^53 pierden precisión con `JSON.parse`, y lo correcto sería avisar;
  - claves duplicadas: gana la última, y se puede avisar;
  - un BOM al principio se quita.
- **YAML:** se pierden los comentarios y las anclas o alias (se expanden); también se pierde el orden de las claves con merge (`<<`).
- **CSV:** fórmulas (`=`, `+`, `-`, `@` al inicio) que se interpretarían al abrir el archivo en Excel. Se puede ofrecer el interruptor "Proteger contra fórmulas" (prefijar `'`). Queda como decisión.
- **Base64:** al decodificar algo binario no se muestra basura, sino el aviso.
- **JWT:** `exp` en milisegundos por error (13 dígitos), que se avisa; tokens sin `typ`; payload que no es un objeto.
- **Timestamp:** negativos (antes de 1970), con decimales (se truncan, y se avisa) y fuera del rango de `Date` (±8,64e15 ms).
- **Cron:** macros (`@daily`, `@hourly`); `?` y `L` de Quartz; expresiones que nunca se ejecutan, como `0 0 30 2 *` (ninguna ejecución próxima).
- **Regex:**
  - sin `g`, solo se muestra la primera coincidencia y se aclara;
  - patrones que coinciden en vacío: se avanza `lastIndex` para no entrar en un bucle infinito;
  - flag `u` con surrogates;
  - un solo worker vivo a la vez.
- **Diff:** finales de línea `\r\n` frente a `\n`: se normalizan y se avisa "Los finales de línea eran distintos".
- **Idiomas:** el inglés es más corto; la etiqueta más larga en español, "Expresiones regulares", se parte en dos líneas en la columna de 200 px. Los formatos de fecha salen de `Intl` con el `language` de la app.

## 10. Textos (claves para la sección `devtools` de `i18n.ts`)

Interpolación con `{x}` y `.replace()`, como en `tasks.nTasks`. Siempre con tú, nunca con voseo.

Primero, en `extensions` (R20):

```ts
// es
'devtools.name': 'DevTools',
'devtools.description': 'Utilidades para desarrolladores sin conexión: formatea JSON, decodifica JWT, genera UUID, prueba expresiones regulares y más.',
'devtools.consent': 'Todo se procesa en este equipo y no se envía nada fuera. Lo que pegas no se guarda en disco: se borra al cerrar Logday.',
// en
'devtools.name': 'DevTools',
'devtools.description': 'Offline developer utilities: format JSON, decode JWTs, generate UUIDs, test regular expressions and more.',
'devtools.consent': 'Everything runs on this computer and nothing is sent out. What you paste is not saved to disk: it is cleared when you close Logday.',
```

Sección `devtools`:

```ts
// ───────────── es ─────────────
devtools: {
  // Vista y navegación
  navLabel: 'Herramientas de DevTools',
  searchPlaceholder: 'Buscar herramienta',
  searchEmpty: 'Ninguna herramienta coincide',
  switcherLabel: 'Cambiar de herramienta',
  privacyNote: 'Todo se procesa en este equipo. Lo que pegas no se guarda: se borra al cerrar Logday.',
  clearAll: 'Vaciar todas las herramientas',
  clearAllTitle: '¿Vaciar todas las herramientas?',
  clearAllMessage: 'Se borra lo que pegaste y los resultados de todas las herramientas. Las opciones se conservan.',
  clearAllConfirm: 'Vaciar',
  cancel: 'Cancelar',
  groupFormats: 'Formatos',
  groupEncoding: 'Codificación',
  groupGenerators: 'Generadores',
  groupDates: 'Fechas',
  groupText: 'Texto',

  // Herramientas: nombre, descripción, placeholder, palabras clave de búsqueda
  'json.name': 'JSON',
  'json.desc': 'Formatea, minifica y valida JSON.',
  'json.placeholder': 'Pega o escribe JSON',
  'json.keywords': 'formatear minificar validar indentar pretty format minify validate',
  'yaml.name': 'YAML',
  'yaml.desc': 'Valida y formatea YAML.',
  'yaml.placeholder': 'Pega o escribe YAML',
  'yaml.keywords': 'yml validar formatear validate format',
  'xml.name': 'XML',
  'xml.desc': 'Formatea y valida XML.',
  'xml.placeholder': 'Pega o escribe XML',
  'xml.keywords': 'html validar formatear validate format',
  'jsonYaml.name': 'JSON ↔ YAML',
  'jsonYaml.desc': 'Convierte entre JSON y YAML.',
  'jsonYaml.placeholderJson': 'Pega JSON para convertirlo en YAML',
  'jsonYaml.placeholderYaml': 'Pega YAML para convertirlo en JSON',
  'jsonYaml.keywords': 'convertir convert yml',
  'jsonCsv.name': 'JSON → CSV',
  'jsonCsv.desc': 'Convierte un arreglo de objetos en CSV. Las columnas son todas las claves que aparecen.',
  'jsonCsv.placeholder': 'Pega un arreglo de objetos, como [{"id": 1, "nombre": "Ana"}]',
  'jsonCsv.keywords': 'excel tabla hoja convertir table spreadsheet convert',
  'base64.name': 'Base64',
  'base64.desc': 'Codifica y decodifica texto UTF-8 en Base64, también en su variante para URL.',
  'base64.placeholderEncode': 'Escribe o pega el texto que quieres codificar',
  'base64.placeholderDecode': 'Pega el texto en Base64',
  'base64.keywords': 'codificar decodificar base64url encode decode',
  'url.name': 'URL',
  'url.desc': 'Codifica y decodifica texto para usarlo dentro de una URL.',
  'url.placeholderEncode': 'Escribe el texto que va dentro de la URL',
  'url.placeholderDecode': 'Pega el texto con %20, %C3%B1…',
  'url.keywords': 'percent encodeuricomponent query codificar encode decode',
  'html.name': 'Entidades HTML',
  'html.desc': 'Convierte caracteres especiales en entidades HTML y al revés.',
  'html.placeholderEncode': 'Escribe el texto con < > & "',
  'html.placeholderDecode': 'Pega el texto con &lt; &amp; &#233;…',
  'html.keywords': 'entities escape escapar codificar encode decode',
  'jwt.name': 'JWT',
  'jwt.desc': 'Decodifica la cabecera y el payload de un JWT y muestra sus fechas.',
  'jwt.placeholder': 'Pega un JWT (eyJ…). El prefijo «Bearer» se quita solo.',
  'jwt.keywords': 'token bearer jws decodificar decode exp',
  'uuid.name': 'UUID',
  'uuid.desc': 'Genera UUID v4 y v7, de uno o varios.',
  'uuid.keywords': 'guid id generar generate v4 v7',
  'hash.name': 'Hashes',
  'hash.desc': 'Calcula MD5, SHA-1, SHA-256 y SHA-512 de un texto.',
  'hash.placeholder': 'Escribe o pega el texto',
  'hash.keywords': 'md5 sha sha1 sha256 sha512 checksum digest resumen',
  'password.name': 'Contraseñas',
  'password.desc': 'Genera contraseñas aleatorias en este equipo.',
  'password.keywords': 'password clave generar generate random aleatoria',
  'lorem.name': 'Lorem ipsum',
  'lorem.desc': 'Genera texto de relleno.',
  'lorem.keywords': 'texto relleno placeholder dummy text',
  'timestamp.name': 'Timestamp Unix',
  'timestamp.desc': 'Convierte un timestamp Unix en fecha y una fecha en timestamp.',
  'timestamp.keywords': 'epoch unix fecha hora date time utc iso',
  'cron.name': 'Cron',
  'cron.desc': 'Explica una expresión cron y muestra sus próximas ejecuciones.',
  'cron.placeholder': 'Ej.: 0 9 * * 1-5',
  'cron.keywords': 'crontab programar schedule spring quartz',
  'regex.name': 'Expresiones regulares',
  'regex.desc': 'Prueba un patrón sobre un texto y ve las coincidencias y sus grupos.',
  'regex.keywords': 'regex regexp patrón pattern match grupos groups',
  'diff.name': 'Comparar textos',
  'diff.desc': 'Muestra las líneas que se agregaron y las que se quitaron entre dos textos.',
  'diff.keywords': 'diff diferencias comparar compare cambios',

  // Plantilla
  input: 'Entrada',
  output: 'Resultado',
  previousOutput: 'Resultado anterior',
  outputEmpty: 'El resultado aparece aquí.',
  tryExample: 'Probar con un ejemplo',
  copy: 'Copiar',
  copyItem: 'Copiar {name}',
  copied: 'Copiado',
  copyError: 'No se pudo copiar',
  swap: 'Intercambiar',
  swapHint: 'Usar el resultado como entrada',
  clear: 'Limpiar',
  run: 'Procesar',
  processing: 'Procesando…',
  generate: 'Generar',
  generated: 'Generado',
  now: 'Ahora',
  saveToNote: 'Guardar en una nota',
  bringFromNote: 'Traer de una nota',
  noteCreated: 'Nota creada',
  openNote: 'Abrir',
  savedInline: 'Guardado en «{title}»',
  noteCreateError: 'No se pudo crear la nota',
  noteTitle: '{tool} — {date}',
  loadedFrom: 'Cargado de «{title}»',

  // Opciones comunes
  mode: 'Modo',
  modeFormat: 'Formatear',
  modeMinify: 'Minificar',
  indent: 'Indentación',
  indent2: '2 espacios',
  indent4: '4 espacios',
  indentTab: 'Tab',
  direction: 'Dirección',
  encode: 'Codificar',
  decode: 'Decodificar',
  paneText: 'Texto',
  paneEncoded: 'Codificado',
  jsonToYaml: 'JSON → YAML',
  yamlToJson: 'YAML → JSON',
  uppercase: 'Mayúsculas',
  count: 'Cantidad',
  countRange: 'Entre {min} y {max}.',

  // Estados
  validFormat: '{format} válido',
  sizeSuffix: '{size}',
  errorAt: 'Línea {line}, columna {col}: {message}',
  goToError: 'Ir al error',
  largeInput: 'Entrada grande ({size}). Para no frenar la app, procésala con {shortcut}.',
  highlightOff: 'Sin colores: el resultado es muy grande.',
  bomRemoved: 'Se quitó la marca BOM del inicio.',
  bigNumber: 'Hay números con más de 15 dígitos: pueden perder precisión.',
  duplicateKey: 'La clave «{key}» está repetida: se conserva la última.',

  // YAML
  yamlCommentsLost: 'Al formatear se pierden los comentarios.',
  yamlDocuments: '{n} documentos',

  // CSV
  csvSeparator: 'Separador',
  sepComma: 'Coma',
  sepSemicolon: 'Punto y coma',
  sepTab: 'Tab',
  csvHeaders: 'Incluir encabezados',
  csvSummary: '{rows} filas · {cols} columnas',
  csvNotArray: 'Se esperaba un arreglo de objetos, como [{"a": 1}].',
  csvItemNotObject: 'El elemento {n} no es un objeto.',

  // Codificación
  base64UrlSafe: 'Variante para URL (base64url)',
  base64Invalid: 'No es Base64 válido: el carácter «{char}» de la posición {pos} no es del alfabeto.',
  base64NotText: 'Se decodificó, pero el resultado no es texto UTF-8. Puede ser un archivo binario.',
  urlInvalid: 'Hay una secuencia % mal formada en la posición {pos}.',
  htmlAll: 'Codificar también los caracteres no ASCII',

  // JWT
  jwtNotVerified: 'La firma no se verifica. Que el token se decodifique no significa que sea auténtico.',
  jwtStatus: 'Estado',
  jwtActive: 'Vigente',
  jwtExpired: 'Vencido',
  jwtNotYet: 'Aún no es válido',
  jwtNoExpiry: 'Sin vencimiento',
  jwtExpiredRel: 'Venció {relative}',
  jwtExpiresRel: 'Vence {relative}',
  jwtValidFromRel: 'Será válido {relative}',
  jwtDates: 'Fechas',
  jwtExp: 'Vence (exp)',
  jwtIat: 'Emitido (iat)',
  jwtNbf: 'Válido desde (nbf)',
  jwtClaimNotNumber: '«{claim}» no es un número de segundos.',
  jwtClaimInMs: '«{claim}» parece estar en milisegundos; el estándar usa segundos.',
  jwtHeader: 'Cabecera',
  jwtPayload: 'Payload',
  jwtSignature: 'Firma',
  jwtSignatureInfo: '{alg} · {n} caracteres',
  jwtBearerRemoved: 'Se quitó el prefijo «Bearer».',
  jwtParts: 'Un JWT tiene tres partes separadas por puntos y este tiene {n}.',
  jwtEncrypted: 'Parece un JWE (cifrado, de cinco partes): no se puede leer sin la clave.',
  jwtBadPart: 'La {part} no es JSON en Base64URL válido.',

  // UUID
  uuidVersion: 'Versión',
  uuidV7Hint: 'v7 se ordena por fecha de creación.',
  uuidNoHyphens: 'Sin guiones',

  // Hashes
  hashNote: 'Se calcula sobre el texto en UTF-8, tal cual, con los saltos de línea.',
  hashWeak: 'Ya no es seguro para firmas ni contraseñas.',
  hashAlgorithm: 'Algoritmo',
  hashValue: 'Hash',

  // Contraseñas
  pwLength: 'Longitud',
  pwChars: 'Caracteres',
  pwLower: 'Minúsculas (a-z)',
  pwUpper: 'Mayúsculas (A-Z)',
  pwDigits: 'Números (0-9)',
  pwSymbols: 'Símbolos (!@#…)',
  pwAvoidSimilar: 'Evitar caracteres parecidos (l, 1, I, O, 0)',
  pwEntropy: '≈ {bits} bits de entropía',
  pwWeak: 'Débil',
  pwFair: 'Aceptable',
  pwStrong: 'Fuerte',
  pwNoCharset: 'Elige al menos un tipo de caracteres.',

  // Lorem
  loremUnit: 'Generar',
  loremParagraphs: 'Párrafos',
  loremSentences: 'Frases',
  loremWords: 'Palabras',
  loremClassic: 'Empezar con «Lorem ipsum dolor sit amet…»',

  // Timestamp
  tsInput: 'Timestamp o fecha',
  tsPlaceholder: 'Ej.: 1767225600, 1767225600000 o 2026-01-01 08:00',
  tsUnit: 'Unidad',
  tsAuto: 'Automático',
  tsSeconds: 'Segundos',
  tsMillis: 'Milisegundos',
  tsDetectedSeconds: 'Timestamp en segundos',
  tsDetectedMillis: 'Timestamp en milisegundos',
  tsDetectedIso: 'Fecha ISO 8601',
  tsDetectedLocal: 'Fecha en tu hora local',
  tsUnixSeconds: 'Unix (segundos)',
  tsUnixMillis: 'Unix (milisegundos)',
  tsUtc: 'UTC',
  tsLocal: 'Hora local ({zone})',
  tsIso: 'ISO 8601',
  tsRelative: 'Relativo',
  tsDecimals: 'Se ignoraron los decimales.',
  tsInvalid: 'No se reconoce como timestamp ni como fecha. Prueba con 1767225600 o 2026-01-01 08:00.',
  tsOutOfRange: 'Esa fecha queda fuera del rango que se puede representar.',

  // Cron
  cronWhat: 'Qué hace',
  cronNext: 'Próximas ejecuciones',
  cronFields5: '5 campos (estándar)',
  cronFields6: '6 campos (con segundos)',
  cronZone: 'En tu hora local ({zone}).',
  cronNever: 'Esta expresión no se ejecuta en los próximos 5 años.',
  cronInvalid: 'Expresión cron no válida: {message}',

  // Regex
  regexPattern: 'Patrón',
  regexFlags: 'Modificadores',
  'flag.g': 'g: todas las coincidencias, no solo la primera',
  'flag.i': 'i: sin distinguir mayúsculas y minúsculas',
  'flag.m': 'm: ^ y $ marcan el inicio y el fin de cada línea',
  'flag.s': 's: el punto también incluye saltos de línea',
  'flag.u': 'u: modo Unicode',
  'flag.y': 'y: busca solo desde la última posición (sticky)',
  regexText: 'Texto',
  regexTextPlaceholder: 'Pega el texto donde quieres buscar',
  regexPreview: 'Coincidencias en el texto',
  regexMatches: '{n} coincidencias',
  regexOneMatch: '1 coincidencia',
  regexNoMatch: 'Sin coincidencias',
  regexOnlyFirst: 'Sin «g» solo se busca la primera.',
  regexCapped: 'Se muestran las primeras {n}.',
  regexColMatch: 'Coincidencia',
  regexColIndex: 'Posición',
  regexGroup: 'Grupo {n}',
  regexEmptyMatch: '(vacía)',
  regexMatchLabel: 'coincidencia {n}',
  regexRunning: 'Buscando…',
  regexInvalid: 'Patrón no válido: {message}',
  regexTimeout: 'La búsqueda pasó de {seconds} s y se detuvo. El patrón puede tener repeticiones anidadas, como (a+)+.',
  retry: 'Reintentar',

  // Diff
  diffOriginal: 'Original',
  diffModified: 'Modificado',
  diffView: 'Vista',
  diffUnified: 'Unificada',
  diffSplit: 'Lado a lado',
  diffIgnoreWs: 'Ignorar espacios en blanco',
  diffSummary: '+{added} −{removed} líneas',
  diffEqual: 'Los dos textos son iguales.',
  diffEol: 'Los finales de línea eran distintos (CRLF y LF): se compararon como iguales.',
  diffAdded: 'Agregada',
  diffRemoved: 'Quitada',

  // Traer de una nota
  pickerTitle: 'Traer de una nota',
  pickerSearch: 'Buscar nota',
  pickerEmpty: 'Ninguna nota tiene bloques de código.',
  pickerNoResults: 'Ninguna nota coincide con «{q}».',
  pickerBlocks: '{n} bloques',
  pickerOneBlock: '1 bloque',
  pickerBack: 'Volver a las notas',
  pickerNoLang: 'Sin lenguaje',
  pickerOpenIn: 'Abrir en {tool}',
  pickerLoadInto: 'Cargar en {tool}',
},

// ───────────── en ─────────────
devtools: {
  navLabel: 'DevTools tools',
  searchPlaceholder: 'Search tools',
  searchEmpty: 'No tools match',
  switcherLabel: 'Switch tool',
  privacyNote: 'Everything runs on this computer. What you paste is not saved: it is cleared when you close Logday.',
  clearAll: 'Clear all tools',
  clearAllTitle: 'Clear all tools?',
  clearAllMessage: 'Clears what you pasted and the results in every tool. Your options are kept.',
  clearAllConfirm: 'Clear',
  cancel: 'Cancel',
  groupFormats: 'Formats',
  groupEncoding: 'Encoding',
  groupGenerators: 'Generators',
  groupDates: 'Dates',
  groupText: 'Text',

  'json.name': 'JSON',
  'json.desc': 'Format, minify and validate JSON.',
  'json.placeholder': 'Paste or type JSON',
  'json.keywords': 'format minify validate indent pretty formatear minificar validar',
  'yaml.name': 'YAML',
  'yaml.desc': 'Validate and format YAML.',
  'yaml.placeholder': 'Paste or type YAML',
  'yaml.keywords': 'yml validate format validar formatear',
  'xml.name': 'XML',
  'xml.desc': 'Format and validate XML.',
  'xml.placeholder': 'Paste or type XML',
  'xml.keywords': 'html validate format validar formatear',
  'jsonYaml.name': 'JSON ↔ YAML',
  'jsonYaml.desc': 'Convert between JSON and YAML.',
  'jsonYaml.placeholderJson': 'Paste JSON to turn it into YAML',
  'jsonYaml.placeholderYaml': 'Paste YAML to turn it into JSON',
  'jsonYaml.keywords': 'convert convertir yml',
  'jsonCsv.name': 'JSON → CSV',
  'jsonCsv.desc': 'Turn an array of objects into CSV. The columns are every key that appears.',
  'jsonCsv.placeholder': 'Paste an array of objects, like [{"id": 1, "name": "Ana"}]',
  'jsonCsv.keywords': 'excel table spreadsheet convert tabla convertir',
  'base64.name': 'Base64',
  'base64.desc': 'Encode and decode UTF-8 text as Base64, including the URL-safe variant.',
  'base64.placeholderEncode': 'Type or paste the text to encode',
  'base64.placeholderDecode': 'Paste the Base64 text',
  'base64.keywords': 'encode decode base64url codificar decodificar',
  'url.name': 'URL',
  'url.desc': 'Encode and decode text to use inside a URL.',
  'url.placeholderEncode': 'Type the text that goes inside the URL',
  'url.placeholderDecode': 'Paste text with %20, %C3%B1…',
  'url.keywords': 'percent encodeuricomponent query encode decode codificar',
  'html.name': 'HTML entities',
  'html.desc': 'Turn special characters into HTML entities and back.',
  'html.placeholderEncode': 'Type text with < > & "',
  'html.placeholderDecode': 'Paste text with &lt; &amp; &#233;…',
  'html.keywords': 'entities escape encode decode entidades',
  'jwt.name': 'JWT',
  'jwt.desc': 'Decode the header and payload of a JWT and show its dates.',
  'jwt.placeholder': 'Paste a JWT (eyJ…). The "Bearer" prefix is removed for you.',
  'jwt.keywords': 'token bearer jws decode exp decodificar',
  'uuid.name': 'UUID',
  'uuid.desc': 'Generate one or more v4 and v7 UUIDs.',
  'uuid.keywords': 'guid id generate v4 v7 generar',
  'hash.name': 'Hashes',
  'hash.desc': 'Compute the MD5, SHA-1, SHA-256 and SHA-512 of a text.',
  'hash.placeholder': 'Type or paste the text',
  'hash.keywords': 'md5 sha sha1 sha256 sha512 checksum digest',
  'password.name': 'Passwords',
  'password.desc': 'Generate random passwords on this computer.',
  'password.keywords': 'password generate random contraseña clave',
  'lorem.name': 'Lorem ipsum',
  'lorem.desc': 'Generate placeholder text.',
  'lorem.keywords': 'placeholder dummy text relleno',
  'timestamp.name': 'Unix timestamp',
  'timestamp.desc': 'Turn a Unix timestamp into a date and a date into a timestamp.',
  'timestamp.keywords': 'epoch unix date time utc iso fecha',
  'cron.name': 'Cron',
  'cron.desc': 'Explain a cron expression and show its next runs.',
  'cron.placeholder': 'E.g. 0 9 * * 1-5',
  'cron.keywords': 'crontab schedule spring quartz programar',
  'regex.name': 'Regular expressions',
  'regex.desc': 'Test a pattern against a text and see the matches and their groups.',
  'regex.keywords': 'regex regexp pattern match groups patrón',
  'diff.name': 'Compare text',
  'diff.desc': 'Show the lines added and removed between two texts.',
  'diff.keywords': 'diff compare changes differences comparar',

  input: 'Input',
  output: 'Output',
  previousOutput: 'Previous output',
  outputEmpty: 'The result appears here.',
  tryExample: 'Try an example',
  copy: 'Copy',
  copyItem: 'Copy {name}',
  copied: 'Copied',
  copyError: "Couldn't copy",
  swap: 'Swap',
  swapHint: 'Use the output as input',
  clear: 'Clear',
  run: 'Run',
  processing: 'Processing…',
  generate: 'Generate',
  generated: 'Generated',
  now: 'Now',
  saveToNote: 'Save to a note',
  bringFromNote: 'Load from a note',
  noteCreated: 'Note created',
  openNote: 'Open',
  savedInline: 'Saved to "{title}"',
  noteCreateError: "Couldn't create the note",
  noteTitle: '{tool} — {date}',
  loadedFrom: 'Loaded from "{title}"',

  mode: 'Mode',
  modeFormat: 'Format',
  modeMinify: 'Minify',
  indent: 'Indentation',
  indent2: '2 spaces',
  indent4: '4 spaces',
  indentTab: 'Tab',
  direction: 'Direction',
  encode: 'Encode',
  decode: 'Decode',
  paneText: 'Text',
  paneEncoded: 'Encoded',
  jsonToYaml: 'JSON → YAML',
  yamlToJson: 'YAML → JSON',
  uppercase: 'Uppercase',
  count: 'How many',
  countRange: 'Between {min} and {max}.',

  validFormat: 'Valid {format}',
  sizeSuffix: '{size}',
  errorAt: 'Line {line}, column {col}: {message}',
  goToError: 'Go to error',
  largeInput: 'Large input ({size}). To keep the app responsive, run it with {shortcut}.',
  highlightOff: 'No colors: the output is too large.',
  bomRemoved: 'The BOM at the start was removed.',
  bigNumber: 'Some numbers have more than 15 digits: they may lose precision.',
  duplicateKey: 'The key "{key}" is repeated: the last one is kept.',

  yamlCommentsLost: 'Formatting removes comments.',
  yamlDocuments: '{n} documents',

  csvSeparator: 'Separator',
  sepComma: 'Comma',
  sepSemicolon: 'Semicolon',
  sepTab: 'Tab',
  csvHeaders: 'Include headers',
  csvSummary: '{rows} rows · {cols} columns',
  csvNotArray: 'Expected an array of objects, like [{"a": 1}].',
  csvItemNotObject: 'Item {n} is not an object.',

  base64UrlSafe: 'URL-safe variant (base64url)',
  base64Invalid: 'Not valid Base64: the character "{char}" at position {pos} is not in the alphabet.',
  base64NotText: 'Decoded, but the result is not UTF-8 text. It may be a binary file.',
  urlInvalid: 'There is a malformed % sequence at position {pos}.',
  htmlAll: 'Also encode non-ASCII characters',

  jwtNotVerified: 'The signature is not verified. A token that decodes is not necessarily genuine.',
  jwtStatus: 'Status',
  jwtActive: 'Active',
  jwtExpired: 'Expired',
  jwtNotYet: 'Not valid yet',
  jwtNoExpiry: 'No expiry',
  jwtExpiredRel: 'Expired {relative}',
  jwtExpiresRel: 'Expires {relative}',
  jwtValidFromRel: 'Valid {relative}',
  jwtDates: 'Dates',
  jwtExp: 'Expires (exp)',
  jwtIat: 'Issued (iat)',
  jwtNbf: 'Not before (nbf)',
  jwtClaimNotNumber: '"{claim}" is not a number of seconds.',
  jwtClaimInMs: '"{claim}" looks like milliseconds; the standard uses seconds.',
  jwtHeader: 'Header',
  jwtPayload: 'Payload',
  jwtSignature: 'Signature',
  jwtSignatureInfo: '{alg} · {n} characters',
  jwtBearerRemoved: 'The "Bearer" prefix was removed.',
  jwtParts: 'A JWT has three parts separated by dots, and this one has {n}.',
  jwtEncrypted: 'Looks like a JWE (encrypted, five parts): it cannot be read without the key.',
  jwtBadPart: 'The {part} is not valid Base64URL JSON.',

  uuidVersion: 'Version',
  uuidV7Hint: 'v7 sorts by creation time.',
  uuidNoHyphens: 'No hyphens',

  hashNote: 'Computed on the UTF-8 text as is, including line breaks.',
  hashWeak: 'No longer safe for signatures or passwords.',
  hashAlgorithm: 'Algorithm',
  hashValue: 'Hash',

  pwLength: 'Length',
  pwChars: 'Characters',
  pwLower: 'Lowercase (a-z)',
  pwUpper: 'Uppercase (A-Z)',
  pwDigits: 'Numbers (0-9)',
  pwSymbols: 'Symbols (!@#…)',
  pwAvoidSimilar: 'Avoid look-alike characters (l, 1, I, O, 0)',
  pwEntropy: '≈ {bits} bits of entropy',
  pwWeak: 'Weak',
  pwFair: 'Fair',
  pwStrong: 'Strong',
  pwNoCharset: 'Choose at least one character type.',

  loremUnit: 'Generate',
  loremParagraphs: 'Paragraphs',
  loremSentences: 'Sentences',
  loremWords: 'Words',
  loremClassic: 'Start with "Lorem ipsum dolor sit amet…"',

  tsInput: 'Timestamp or date',
  tsPlaceholder: 'E.g. 1767225600, 1767225600000 or 2026-01-01 08:00',
  tsUnit: 'Unit',
  tsAuto: 'Auto',
  tsSeconds: 'Seconds',
  tsMillis: 'Milliseconds',
  tsDetectedSeconds: 'Timestamp in seconds',
  tsDetectedMillis: 'Timestamp in milliseconds',
  tsDetectedIso: 'ISO 8601 date',
  tsDetectedLocal: 'Date in your local time',
  tsUnixSeconds: 'Unix (seconds)',
  tsUnixMillis: 'Unix (milliseconds)',
  tsUtc: 'UTC',
  tsLocal: 'Local time ({zone})',
  tsIso: 'ISO 8601',
  tsRelative: 'Relative',
  tsDecimals: 'Decimals were ignored.',
  tsInvalid: 'Not recognized as a timestamp or a date. Try 1767225600 or 2026-01-01 08:00.',
  tsOutOfRange: 'That date is outside the range that can be represented.',

  cronWhat: 'What it does',
  cronNext: 'Next runs',
  cronFields5: '5 fields (standard)',
  cronFields6: '6 fields (with seconds)',
  cronZone: 'In your local time ({zone}).',
  cronNever: 'This expression does not run in the next 5 years.',
  cronInvalid: 'Invalid cron expression: {message}',

  regexPattern: 'Pattern',
  regexFlags: 'Flags',
  'flag.g': 'g: all matches, not only the first',
  'flag.i': 'i: ignore case',
  'flag.m': 'm: ^ and $ match at the start and end of each line',
  'flag.s': 's: the dot also matches line breaks',
  'flag.u': 'u: Unicode mode',
  'flag.y': 'y: only search from the last position (sticky)',
  regexText: 'Text',
  regexTextPlaceholder: 'Paste the text to search in',
  regexPreview: 'Matches in the text',
  regexMatches: '{n} matches',
  regexOneMatch: '1 match',
  regexNoMatch: 'No matches',
  regexOnlyFirst: 'Without "g" only the first one is searched.',
  regexCapped: 'Showing the first {n}.',
  regexColMatch: 'Match',
  regexColIndex: 'Index',
  regexGroup: 'Group {n}',
  regexEmptyMatch: '(empty)',
  regexMatchLabel: 'match {n}',
  regexRunning: 'Searching…',
  regexInvalid: 'Invalid pattern: {message}',
  regexTimeout: 'The search took longer than {seconds} s and was stopped. The pattern may have nested repetition, like (a+)+.',
  retry: 'Retry',

  diffOriginal: 'Original',
  diffModified: 'Changed',
  diffView: 'View',
  diffUnified: 'Unified',
  diffSplit: 'Side by side',
  diffIgnoreWs: 'Ignore whitespace',
  diffSummary: '+{added} −{removed} lines',
  diffEqual: 'Both texts are the same.',
  diffEol: 'The line endings were different (CRLF and LF): they were compared as equal.',
  diffAdded: 'Added',
  diffRemoved: 'Removed',

  pickerTitle: 'Load from a note',
  pickerSearch: 'Search notes',
  pickerEmpty: 'No note has code blocks.',
  pickerNoResults: 'No note matches "{q}".',
  pickerBlocks: '{n} blocks',
  pickerOneBlock: '1 block',
  pickerBack: 'Back to notes',
  pickerNoLang: 'No language',
  pickerOpenIn: 'Open in {tool}',
  pickerLoadInto: 'Load into {tool}',
},
```

Notas de copy:
- El verbo va en el botón ("Generar", "Copiar", "Vaciar", "Reintentar").
- Los errores dicen qué pasó y dónde, y cuando se puede, cómo arreglarlo (`tsInvalid` y `regexTimeout` dan un ejemplo).
- `{part}` en `jwtBadPart` recibe "cabecera", "payload" o "firma" en minúscula. En inglés va "header", "payload" o "signature".
- "Flags" se queda como "Modificadores" en español porque la etiqueta se lee junto a los chips `g i m`.
- `{relative}` sale de `Intl.RelativeTimeFormat` ("hace 2 horas", "en 3 días"), por eso `jwtExpiredRel` es "Venció {relative}".

---

## 9.1 Hallazgos en el código actual que afectan a DevTools

**Importantes:**
1. **Sepia: los colores de estado no se leen.**
   - Dónde: `App.css:227-233`. Solo el tema `light` oscurece `text-red-400`, `text-emerald-400` y `text-amber-400`. En sepia dan 2,2, 1,5 y 1,3:1, y DevTools los usa para errores, Copiado y avisos.
   - Propuesta: sumar `:root[data-theme="sepia"]` a esas reglas con `#b91c1c` (rojo, 5,1:1), `#065f46` (verde, 6,0) y `#92400e` (ámbar, 5,6).
2. **Sepia y temas personalizados claros: `PRIMARY_CLS` deja el texto blanco sobre `--accent-soft`, a 1,5:1.**
   - Dónde: `App.css:245`, la regla `theme-tinted [class*="bg-indigo-"]`, que afecta a todos los paneles de extensiones.
   - Propuesta: en temas tintados, `bg-indigo-600` y `bg-indigo-500` se repintan a `var(--accent-strong)`, en vez del soft, cuando el texto es `text-white`. Otra opción es una clase `.btn-primary` con tokens propios. DevTools lo evita usando `SECONDARY_CLS`.
3. **Ítem activo `text-indigo-400` sobre `bg-indigo-500/15` en sepia, a 2,9:1** (también en Opciones y en el menú lateral). En nórdico da 4,2.
   - Propuesta: en sepia, `text-indigo-*` usa `--accent-strong` (4,6:1 sobre soft).
4. **Colores de sintaxis fijos para fondo oscuro** (`App.css:787-832`): ilegibles en claro y en sepia. Ver los tokens `--syntax-*` del punto 8.
5. **`ToastViewport` sin `aria-live`.** El toast "Nota creada" no se anuncia. Además, el toast con acción se cierra a los 6 s (`appStore.ts:2351`), poco para llegar con teclado.
   - Propuesta: `role="region" aria-live="polite"` en el contenedor (`ToastViewport.tsx:19`) y pausar el cierre al pasar el ratón o al enfocar.

**Menores:**
6. `ModalOverlay` y `ModalPanel` no tienen `role="dialog"`, `aria-modal` ni trampa de foco (`components/shared/ModalOverlay.tsx`). El selector "Traer de una nota" los necesita.
7. En el menú colapsado, los botones de `ExtensionSections.tsx` tienen `title`, pero no `aria-label` ni `aria-current`.
8. `CODE_LANGUAGE_OPTIONS` (`lib/codeHighlight.ts:21`) no incluye `xml`, `csv` ni `diff`, y lowlight (`NoteEditor.tsx:113`) tampoco los registra. Al guardar desde DevTools, esos bloques salen sin el lenguaje en el selector del editor, aunque no se rompen.
9. `parseFencedBlocks` exige un lenguaje concreto (`lib/fencedBlocks.ts:13`). "Traer de una nota" necesita una variante para cualquier lenguaje.


# Adenda de la interfaz (QR, códigos de barras y listas)

Completa y corrige la sección anterior; donde se contradicen, vale esta adenda, salvo lo que corrige la sección "Valores finales" de más abajo.

## A. Correcciones a la versión anterior, para alinearla con el spec y el código

- **Grupos e ids** (sustituye la lista del punto 2):

| Grupo (`ToolGroup`) | Etiqueta es / en | Herramientas (`ToolId`) e ícono |
|---|---|---|
| `formats` | Formatos / Formats | `json` Braces · `yaml` FileCode · `xml` CodeXml · `convert` ArrowLeftRight |
| `encoding` | Codificar / Encode | `base64` Binary · `url` Link · `html` Ampersand · `jwt` KeyRound |
| `generators` | Generadores / Generators | `uuid` FingerprintPattern · `hash` Hash · `password` LockKeyhole · `lorem` Pilcrow · `qr` QrCode · `barcode` Barcode |
| `time` | Fechas / Dates | `timestamp` Clock · `cron` CalendarClock |
| `text` | Texto / Text | `regex` Regex · `diff` Diff |
| `lists` (**nuevo**) | Listas / Lists | `sql-list` Database · `list-compare` GitCompareArrows |

  En total son 20 herramientas. Hay que sumar `'lists'` a `ToolGroup` y `'qr' | 'barcode' | 'sql-list' | 'list-compare'` a `ToolId`. Con 6 grupos, la lista de 200 px necesita scroll con la ventana mínima (600 px de alto). Ya estaba previsto con `overflow-y-auto`.
- **`convert`** junta JSON↔YAML y JSON→CSV:
  - Lleva la opción "Conversión" (selector segmentado): `JSON → YAML` · `YAML → JSON` · `JSON → CSV`.
  - Intercambiar solo se activa entre JSON y YAML. Con CSV queda deshabilitado, con el `title` "CSV → JSON no está disponible".
  - Las opciones de CSV (separador y encabezados) solo aparecen con `JSON → CSV`.
  - En las claves de i18n, `jsonYaml.*` y `jsonCsv.*` pasan a `convert.*`.
- **Límites del spec:**
  - Se procesa a mano desde **200 000 caracteres** (`MAX_LIVE_CHARS`, D8), no desde 1 MB, y no se aceptan más de 5 000 000 (`MAX_INPUT_CHARS`). Si se pega más, el texto se corta en ese tope y se avisa con `largeInputCut`.
  - El tiempo límite del regex es de **1,5 s** (D5): `regexTimeout` recibe `{seconds}` = 1,5.
  - UUID: de 1 a **100**. Contraseñas: de **4** a 128.
  - Cron: las próximas ejecuciones se calculan **solo con 5 campos**. Con 6 o 7 se describe y en lugar de la lista se muestra `cronNoNextForFields`.
- **Decisiones del reporte anterior que el spec ya resolvió y salen de la lista:**
  - 1: los errores de JSON ya tienen posición propia con `locateJsonError`, sin depender del WebView.
  - 2: el cron solo calcula con 5 campos.
  - 4: las notas se guardan en la raíz (D10).
  - 8: el regex corta a los 1,5 s, fijo.
  - El alargue de la cerca a ```` ya está en `notes.ts`.
- **Claves de i18n con el mismo id que el código:**
  - nombre, descripción, placeholder y palabras de búsqueda: `` `${toolId}.name|desc|placeholder|keywords` ``, por ejemplo `'sql-list.name'`, `'list-compare.desc'` (como `'quick-capture.name'` en `extensions`);
  - grupos: `` `group.${ToolGroup}` ``;
  - errores: `` `error.${ToolErrorCode}` ``.

  Con esto la vista arma las claves sin un mapa a mano. Reemplazan a `groupFormats`, `json.name` y demás del bloque anterior; el resto de las claves sigue igual. El bloque de textos de la sección D trae estas claves.
- **"Guardar en una nota" y "Traer de una nota":**
  - `qr` y `barcode` no tienen "Guardar en una nota": su salida es una imagen y se guarda como archivo (ver B).
  - `qr` sí tiene "Traer de una nota", para el texto o la URL.
  - `sql-list` y `list-compare` tienen los dos. La salida de `sql-list` se guarda como ```` ```sql ````, que ya tiene resaltado en el editor (`CODE_LANGUAGE_OPTIONS`). La de `list-compare` se guarda como `text`, con el resultado de la pestaña activa.
  - Al traer de una nota: `sql` → `sql-list`, en modo "SQL → lista". Hay que sumarlo a `LANGUAGE_TOOL`.
- **Atajos:** se suman a la tabla del punto 7, siempre con ⌘⇧ para no chocar con los globales:
  - en `qr` y `barcode`, `⌘⇧S` = "Guardar como PNG" y `⌘⇧C` = "Copiar SVG";
  - en `list-compare`, `⌥⌘1` a `⌥⌘4` cambian de pestaña de resultados, y `⌘⇧C` copia la pestaña activa.

## B. QR y código de barras

### B.1 Vista previa sobre tarjeta blanca fija (todos los temas)

Un lector necesita módulos oscuros sobre fondo claro, con buen contraste y la zona de silencio a la vista. Por eso la imagen **no** sigue el tema.

```
┌ Vista previa ────────────────────────────────────────────┐
│  ┌──────────────────────┐                                │
│  │ ▓▓▓▓▓▓▓ ▓ ▓▓▓▓▓▓▓    │ ← tarjeta bg-white (fija)      │
│  │ ▓     ▓ ▓ ▓     ▓    │   ring-1 ring-[var(--border-card)]
│  │ ▓ ▓▓▓ ▓   ▓ ▓▓▓ ▓    │   el margen del QR (zona de     │
│  │ …                    │   silencio) se ve en blanco     │
│  └──────────────────────┘                                │
│  Versión 3 · 29×29 módulos · 512 px      [Guardar PNG ▾] │
└──────────────────────────────────────────────────────────┘
```

- Tarjeta: `inline-flex items-center justify-center rounded-xl bg-white p-3 shadow-sm ring-1 ring-[var(--border-card)]`.
  - El `bg-white` es una **excepción explícita** a la regla de tokens: va fijo, como el `fill="#ffffff"` del logo del menú lateral (`Sidebar.tsx:510`). Así hay que documentarlo en el código.
  - El anillo con `--border-card` separa la tarjeta del fondo en los temas claros (blanco sobre `#f4f4f5`) y la enmarca en los oscuros.
  - En oscuro, alto contraste, OLED, nórdico y descanso visual, la tarjeta se ve como una "hoja" blanca. Es lo esperado y no se atenúa: atenuarla (con opacidad o filtros) bajaría el contraste de lo que se escanea en pantalla.
- Contenido: el SVG va **en línea**, generado como cadena por `qrcode-generator` (`createSvgTag`) o por JsBarcode sobre un `<svg>` sin montar. Siempre lleva módulos y barras `#000000` sobre `#ffffff`, también en la exportación.
  - QR: se muestra a `w-[min(16rem,100%)] h-auto` con `shape-rendering="crispEdges"`. La vista previa no cambia con la opción "Tamaño", que solo afecta al archivo.
  - Código de barras: tamaño natural, con `max-w-full h-auto` y `overflow-x-auto` en el contenedor si no cabe. Se escala de forma uniforme, nunca solo en ancho.
- Debajo de la tarjeta, en `text-[11px] text-[var(--text-hint)] tabular-nums`:
  - QR: "Versión {v} · {n}×{n} módulos · {px} px".
  - Código de barras: "{formato} · {ancho}×{alto} px".
- Accesibilidad: `<svg role="img" aria-label>`:
  - QR: "Código QR de: {texto}", con el texto cortado a 60 caracteres y "…".
  - Código de barras: "Código de barras {formato}: {contenido}".
  - Los rects internos van con `aria-hidden`.
- Estado vacío: en el lugar de la tarjeta, un recuadro `rounded-xl border border-dashed border-[var(--border-card)]` del mismo tamaño, con el ícono `QrCode` o `Barcode` de 28 px en `text-[var(--text-hint)]` y el texto "Escribe un texto para ver el código".
- Estado inválido: la tarjeta conserva el último código válido con `opacity-40` y `grayscale`, y encima, en `absolute` y `text-xs`, la etiqueta "No válido". Así nadie escanea por error un código que no corresponde a lo que está escrito.

### B.2 QR (`qr`)

- Layout: a la izquierda (o arriba, si es angosto), la entrada `textarea` de 4 filas con su contador; a la derecha, la vista previa y las acciones. Va en dos columnas desde `@2xl/tool`, porque la vista previa ocupa poco.
- Contador bajo la entrada, en `text-[11px] tabular-nums text-[var(--text-hint)]`: "{bytes} de {max} bytes".
  - `max` es la capacidad en modo byte de la versión 40 según el nivel: L = 2953, M = 2331, Q = 1663, H = 1273.
  - Por encima del 90 %, el contador pasa a `text-amber-400` con `TriangleAlert`.
- Opciones:
  - **Corrección de errores**, en selector segmentado `L · M · Q · H`, por defecto M. Cada botón lleva un `title`: "L: recupera ~7 %", "M: ~15 %", "Q: ~25 %", "H: ~30 % (aguanta un logo encima)".
  - **Tamaño** del archivo, en segmentado: 256 · 512 · 1024 px, por defecto 512.
  - **Margen**, en módulos: número de 0 a 8, por defecto 4. Con menos de 4 aparece el aviso `qrMarginLow`.
- Acciones de la vista previa, a la derecha de su fila de título:
  - "Guardar como PNG" (`ImageDown`) y "Guardar como SVG", con `SECONDARY_CLS`;
  - "Copiar SVG" (`Copy`), con el estado Copiado.
  - En angosto, los dos "Guardar" se juntan en un solo botón "Guardar ▾", con un menú `PNG / SVG` que usa el patrón de `AppSelect`.
- Errores:
  - texto demasiado largo para el nivel elegido: `error.qr-too-long`. Si cabría con un nivel menor, se sugiere: "Con el nivel L cabe".
  - texto vacío: es el estado vacío, no un error.

### B.3 Código de barras (`barcode`)

- Entrada: un input mono de una línea (`INPUT_CLS` + `font-mono text-sm`), no un textarea, porque un código es una línea.
- Formato: `AppSelect` con CODE128 (por defecto), CODE39, EAN-13, EAN-8, UPC-A, ITF-14 y Codabar. Debajo, la regla del formato en `text-[11px] text-[var(--text-hint)]` (claves `barcode.rule.*`).
- Validación según el formato, **antes** de llamar a JsBarcode, para dar mensajes propios:
  - EAN-13 / EAN-8 / UPC-A / ITF-14:
    - solo dígitos;
    - con la longitud sin el dígito de control (12, 7, 11 o 13), se calcula y se muestra como información: "Dígito de control: 7 (se agrega al final)";
    - con la longitud completa, se comprueba: "El dígito de control debería ser 7, no 3".
  - CODE39: A–Z, 0–9, espacio y `- . $ / + %`. Las minúsculas se pasan a mayúsculas y se avisa.
  - Codabar: dígitos y `- $ : / . +`, con inicio y fin A–D opcionales.
  - CODE128: ASCII imprimible. El primer carácter fuera de rango (una tilde, una ñ, un emoji) se nombra junto con su posición.
- Opciones:
  - **Alto**: número de 20 a 200 px, por defecto 80;
  - **Ancho de barra**: segmentado 1 · 2 · 3 · 4, por defecto 2;
  - **Mostrar el texto debajo**: `ToggleSwitch`, activo por defecto.
  - Los márgenes de JsBarcode quedan en 10 y el color sigue fijo en `#000` sobre `#fff`.
- Acciones: "Guardar como PNG", "Guardar como SVG" y "Copiar SVG", las mismas que en el QR, por consistencia. El encargo solo pedía guardar; copiar el SVG cuesta lo mismo.

### B.4 Guardar como archivo (QR y código de barras)

- Usa `save({ defaultPath, filters })` + `fs.writeBinary(path, base64)` para PNG y `fs.writeFile` para SVG, como `dailyMonthExport.ts:46-53`.
  - El PNG se obtiene dibujando el SVG en un `<canvas>` del tamaño elegido, con fondo blanco y `imageSmoothingEnabled = false`.
  - Nombre por defecto: `qr-{AAAAMMDD-HHmm}.png` y `barcode-{formato}-{contenido}.svg`, con el contenido limpio de caracteres no válidos y cortado a 40.
- Si el usuario cancela el diálogo, no pasa nada: ni toast ni anuncio.
- Si sale bien: toast `success` "Imagen guardada", con el nombre del archivo en la descripción, y en la región `aria-live`, "Imagen guardada".
- Si falla: toast `error` "No se pudo guardar la imagen".
- D9 sigue cumpliéndose: solo se escribe lo que el usuario guarda de forma explícita y en la ruta que elige.

## C. Listas

### C.1 Lista ↔ `IN` de SQL (`sql-list`)

```
Dirección [Lista → SQL | SQL → lista]                     [⇄]
Comillas [Simples | Ninguna]  Formato [Una línea | Un valor por línea]  ☑ IN (…)
▸ Más opciones
ENTRADA                              │ RESULTADO               [⧉][📄+]
┌───────────────────────┐ Separado   │ ┌─────────────────────────────┐
│ 1001                  │ por: líneas│ │ IN ('1001', '1002', 'O''B') │
│ 1002                  │ [Auto ▾]   │ └─────────────────────────────┘
└───────────────────────┘            │
● 3 valores · 1 duplicado quitado · 1 vacío quitado
```

- Las opciones están **escalonadas** para que la barra no tenga 9 controles:
  - Siempre a la vista: Dirección, Comillas (`Simples` · `Ninguna`), Formato (`Una línea` · `Un valor por línea`) y el interruptor "Envolver en IN (…)".
  - En "Más opciones", un botón de texto con `ChevronRight` que gira 90°, `aria-expanded` y `aria-controls`, que despliega una cuadrícula `grid grid-cols-[auto_1fr] gap-x-3 gap-y-2`, como en `quick-capture/Settings.tsx:128`:
    - Separador: `, ` · `,`.
    - Limpieza, con tres `ToggleSwitch` activos por defecto: Quitar duplicados, Quitar espacios al inicio y al final, Quitar vacíos.
    - Escapar `'` como `''`, activo por defecto.
    - Números sin comillas, apagado por defecto. Solo se activa con comillas simples.
    - Partir en grupos: interruptor + número `N`, por defecto 1000, más un input "Columna" (mono, con placeholder `columna`). Solo se activa con "Envolver en IN (…)".
  - Si hay alguna opción de "Más opciones" distinta de su valor por defecto, el botón lo dice: "Más opciones (2 cambiadas)". Así no queda oculto algo que cambia el resultado.
  - Se recuerda si "Más opciones" quedó abierto, como las demás opciones (D9).
- El separador de la entrada se detecta solo (líneas, tab, punto y coma o coma, en ese orden) y lo dice un chip: "Separado por: líneas". Al lado hay un `AppSelect` pequeño para forzarlo: Automático · Líneas · Coma · Tab · Punto y coma.
- Salida: `<pre>` resaltado como `sql`.
  - Con grupos, el resultado va **entre paréntesis**: `(col IN (…) OR col IN (…))`. Así no cambia la lógica si se pega detrás de un `AND`.
  - Si falta la columna, se usa `columna` y se avisa con `sqlNoColumn`.
- "SQL → lista":
  - acepta `IN ('a', 'b')`, `('a','b')`, `'a','b'` y valores sin comillas;
  - deshace los `''`;
  - respeta las comas dentro de las comillas;
  - devuelve un valor por línea, con la misma limpieza.
  - Error: una comilla sin cerrar, con su posición (`error.sql-unclosed-quote`).
- Estado en la línea de abajo: "{n} valores · {d} duplicados quitados · {v} vacíos quitados", y, con grupos, "· {g} grupos de hasta {N}".
  - Por encima de 1000 valores sin grupos, se avisa `sqlOracleLimit` con `TriangleAlert`, sin bloquear nada.

### C.2 Comparar listas (`list-compare`)

**Cómo no se vuelve pesada:** una sola salida a la vista, sin DOM por ítem y con cálculo perezoso.

```
LISTA A  ☐ Ignorar mayúsculas  ☐ Quitar espacios       LISTA B
┌──────────────────────┐                          ┌──────────────────────┐
│ textarea             │            [⇄]           │ textarea             │
└──────────────────────┘                          └──────────────────────┘
120 valores · ▸ 3 duplicados                      112 valores · sin duplicados

A 120 · B 112 · en las dos 108
┌ [Solo en A 12] [Solo en B 4] [En las dos 108] [Unión 124] ───────────┐
│ <pre> un valor por línea (solo la pestaña activa)   [⧉][→ SQL][📄+]   │
└──────────────────────────────────────────────────────────────────────┘
```

- Entradas: los dos textareas en dos columnas desde `@3xl/tool` y apilados por debajo. Entre ellas va "Intercambiar", que cambia A por B.
  - Bajo cada lista: "{n} valores" y, si hay, un botón de texto "▸ {d} duplicados" (`aria-expanded`). Despliega una lista compacta `max-h-32 overflow-auto font-mono text-[11px]` con `valor ×{veces}`, más "Copiar duplicados".
  - Las líneas vacías se ignoran siempre y no cuentan.
- Opciones: "Ignorar mayúsculas" y "Quitar espacios al inicio y al final" (`ToggleSwitch`), apagadas por defecto. Al ignorar mayúsculas, se muestra la forma de la primera vez que aparece cada valor.
- Resumen en una línea, en `text-xs text-[var(--text-secondary)] tabular-nums`: "A {a} · B {b} · en las dos {both}". No hay diagrama de Venn: los cuatro números en las pestañas ya lo cuentan, y un gráfico solo sumaría peso.
- Resultados en **pestañas**:
  - `role="tablist"` + `role="tab"` con `aria-selected` y `aria-controls`, más `role="tabpanel"` con `aria-labelledby`.
  - ←/→ mueven entre pestañas (roving), y Home y End van a los extremos.
  - Estilo: el del selector segmentado (`flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5`, activo `bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/40`). El número va en un chip `ml-1.5 rounded-full bg-[var(--bg-hover)] px-1.5 text-[10px] tabular-nums text-[var(--text-secondary)]`.
  - Una pestaña en 0 sigue activa, con su chip "0", y su panel dice "Ningún valor está solo en A" o el texto que toque.
  - En angosto, la barra de pestañas hace `overflow-x-auto`, sin partir las etiquetas.
  - Pestaña inicial: "Solo en A" si tiene valores; si no, la primera que tenga. Después se recuerda la última elegida (D9).
- Panel: **un solo `<pre>`** con los valores unidos por `\n` (un solo nodo de texto, liviano aunque sean decenas de miles), `max-h-[50vh] overflow-auto select-text`.
  - Se calculan los conjuntos una vez por cambio, con un debounce de 150 ms y `Map` normalizados. El texto de cada pestaña se arma solo al abrirla, y se guarda en memoria hasta que cambie la entrada.
  - Orden: el de aparición, primero A y luego B.
- Acciones del panel:
  - "Copiar" la pestaña activa;
  - **"Pasar a SQL IN"** (`Database`): abre `sql-list` con ese resultado como entrada y en modo "Lista → SQL". Usa el mismo mecanismo que `queueLoad` en `model.ts:116`;
  - "Guardar en una nota".
- Vacío: con una de las dos listas vacía, las pestañas se deshabilitan y el panel dice "Pega una lista en A y otra en B para compararlas".
- Grande: con más de 200 000 caracteres entre las dos, se aplica D8 (se procesa con el botón).

## D. Textos nuevos o cambiados (sección `devtools` de `i18n.ts`)

Siempre con tú, sin voseo. Se suman al bloque anterior. Las claves `json.name`, `jsonYaml.*`, `jsonCsv.*` y `groupX` cambian según la sección A.

```ts
// ───────────── es ─────────────
'group.formats': 'Formatos',
'group.encoding': 'Codificar',
'group.generators': 'Generadores',
'group.time': 'Fechas',
'group.text': 'Texto',
'group.lists': 'Listas',

'convert.name': 'Convertir',
'convert.desc': 'Convierte entre JSON y YAML, o un arreglo de objetos JSON en CSV.',
'convert.placeholder': 'Pega el JSON o el YAML que quieres convertir',
'convert.keywords': 'json yaml yml csv excel convertir convert',
conversion: 'Conversión',
csvToJsonUnavailable: 'CSV → JSON no está disponible',

'qr.name': 'Código QR',
'qr.desc': 'Genera un código QR a partir de un texto o una URL.',
'qr.placeholder': 'Escribe o pega el texto o la URL',
'qr.keywords': 'qr code codigo url enlace link',
qrCorrection: 'Corrección de errores',
'qrLevel.L': 'L: recupera alrededor del 7 %',
'qrLevel.M': 'M: recupera alrededor del 15 %',
'qrLevel.Q': 'Q: recupera alrededor del 25 %',
'qrLevel.H': 'H: recupera alrededor del 30 %. Aguanta un logo encima.',
qrSize: 'Tamaño',
qrMargin: 'Margen',
qrMarginUnit: 'módulos',
qrMarginLow: 'Con un margen menor de 4 módulos, algunos lectores no lo leen.',
qrCapacity: '{bytes} de {max} bytes',
qrInfo: 'Versión {version} · {modules}×{modules} módulos · {px} px',
qrFitsLower: 'Con el nivel {level} cabe.',
qrAlt: 'Código QR de: {text}',
previewEmpty: 'Escribe un texto para ver el código.',
previewInvalid: 'No válido',
preview: 'Vista previa',

'barcode.name': 'Código de barras',
'barcode.desc': 'Genera códigos de barras CODE128, CODE39, EAN-13, EAN-8, UPC-A, ITF-14 y Codabar.',
'barcode.placeholder': 'Escribe el contenido',
'barcode.keywords': 'barcode barras ean upc code128 code39 itf codabar',
barcodeFormat: 'Formato',
barcodeHeight: 'Alto',
barcodeBarWidth: 'Ancho de barra',
barcodeShowText: 'Mostrar el texto debajo',
barcodeInfo: '{format} · {width}×{height} px',
barcodeAlt: 'Código de barras {format}: {value}',
barcodeCheckDigit: 'Dígito de control: {digit} (se agrega al final).',
barcodeUppercased: 'Se pasó a mayúsculas: CODE39 no tiene minúsculas.',
'barcode.rule.CODE128': 'Letras, números y signos sin tildes (ASCII).',
'barcode.rule.CODE39': 'Mayúsculas, números, espacio y - . $ / + %.',
'barcode.rule.EAN13': '12 dígitos, o 13 con el de control.',
'barcode.rule.EAN8': '7 dígitos, o 8 con el de control.',
'barcode.rule.UPC': '11 dígitos, o 12 con el de control.',
'barcode.rule.ITF14': '13 dígitos, o 14 con el de control.',
'barcode.rule.codabar': 'Números y - $ : / . +, con A, B, C o D al inicio y al final si quieres.',

saveAsPng: 'Guardar como PNG',
saveAsSvg: 'Guardar como SVG',
saveImage: 'Guardar',
copySvg: 'Copiar SVG',
imageSaved: 'Imagen guardada',
imageSaveError: 'No se pudo guardar la imagen',

'sql-list.name': 'Lista para SQL IN',
'sql-list.desc': 'Convierte una lista de valores en el formato de un IN de SQL, y al revés.',
'sql-list.placeholder': 'Pega los valores, uno por línea o separados por comas',
'sql-list.placeholderReverse': "Pega el IN ('a', 'b') o la lista 'a','b'",
'sql-list.keywords': 'sql in where oracle lista comillas query',
listToSql: 'Lista → SQL',
sqlToList: 'SQL → lista',
quotes: 'Comillas',
quotesSingle: 'Simples',
quotesNone: 'Ninguna',
layout: 'Formato',
layoutOneLine: 'Una línea',
layoutPerLine: 'Un valor por línea',
wrapIn: 'Envolver en IN (…)',
moreOptions: 'Más opciones',
moreOptionsChanged: 'Más opciones ({n} cambiadas)',
separator: 'Separador',
cleanup: 'Limpieza',
removeDuplicates: 'Quitar duplicados',
trimSpaces: 'Quitar espacios al inicio y al final',
removeEmpty: 'Quitar vacíos',
escapeQuotes: "Escapar ' como ''",
numbersUnquoted: 'Dejar sin comillas los números',
splitGroups: 'Partir en grupos de',
column: 'Columna',
columnPlaceholder: 'columna',
inputSeparator: 'Separado por: {sep}',
'sep.auto': 'Automático',
'sep.lines': 'líneas',
'sep.comma': 'comas',
'sep.tab': 'tabs',
'sep.semicolon': 'punto y coma',
sqlSummary: '{n} valores',
sqlDupsRemoved: '{n} duplicados quitados',
sqlEmptyRemoved: '{n} vacíos quitados',
sqlGroups: '{g} grupos de hasta {size}',
sqlNoColumn: 'Falta el nombre de la columna: se usó «columna».',
sqlOracleLimit: 'Son más de 1000 valores. Oracle no acepta más de 1000 en un IN: parte la lista en grupos.',

'list-compare.name': 'Comparar listas',
'list-compare.desc': 'Muestra qué valores están solo en una lista, en las dos o en cualquiera.',
'list-compare.placeholderA': 'Pega la lista A, un valor por línea',
'list-compare.placeholderB': 'Pega la lista B, un valor por línea',
'list-compare.keywords': 'comparar listas diferencia interseccion union conjuntos compare sets',
listA: 'Lista A',
listB: 'Lista B',
ignoreCase: 'Ignorar mayúsculas',
listCount: '{n} valores',
listDuplicates: '{n} duplicados',
listNoDuplicates: 'sin duplicados',
copyDuplicates: 'Copiar duplicados',
compareSummary: 'A {a} · B {b} · en las dos {both}',
onlyA: 'Solo en A',
onlyB: 'Solo en B',
inBoth: 'En las dos',
union: 'Unión',
emptyOnlyA: 'Ningún valor está solo en A.',
emptyOnlyB: 'Ningún valor está solo en B.',
emptyBoth: 'Las listas no tienen valores en común.',
compareNeedBoth: 'Pega una lista en A y otra en B para compararlas.',
sendToSql: 'Pasar a SQL IN',
resultsLabel: 'Resultados',

// Errores por código (ToolErrorCode), con {line}/{column} en errorAt
'error.json-unexpected-token': 'Hay un carácter inesperado.',
'error.json-unexpected-end': 'El JSON termina antes de tiempo: falta cerrar algo.',
'error.json-bad-string': 'Hay un texto mal cerrado o con un escape no válido.',
'error.json-bad-number': 'Hay un número mal escrito.',
'error.json-trailing': 'Sobra contenido después del final del JSON.',
'error.yaml-invalid': 'El YAML no es válido.',
'error.xml-invalid': 'El XML no está bien formado.',
'error.csv-not-array': 'Se esperaba un arreglo de objetos, como [{"a": 1}].',
'error.csv-not-objects': 'Todos los elementos del arreglo deben ser objetos.',
'error.base64-invalid': 'No es Base64 válido.',
'error.url-invalid': 'Hay una secuencia % mal formada.',
'error.jwt-parts': 'Un JWT tiene tres partes separadas por puntos.',
'error.jwt-part-invalid': 'Una parte del JWT no es JSON en Base64URL válido.',
'error.timestamp-invalid': 'No es un timestamp válido.',
'error.date-invalid': 'No se reconoce la fecha. Prueba con 2026-01-01 08:00.',
'error.cron-invalid': 'La expresión cron no es válida.',
'error.regex-invalid': 'El patrón no es válido.',
'error.qr-too-long': 'El texto es demasiado largo para un QR con el nivel {level} ({bytes} de {max} bytes).',
'error.barcode-chars': 'El carácter «{char}» de la posición {pos} no se puede usar en {format}.',
'error.barcode-length': '{format} necesita {expected} dígitos, y hay {actual}.',
'error.barcode-check-digit': 'El dígito de control debería ser {expected}, no {actual}.',
'error.sql-unclosed-quote': 'Hay una comilla sin cerrar en la posición {pos}.',
largeInputCut: 'Se cortó la entrada en 5 000 000 caracteres.',
cronNoNextForFields: 'Las próximas ejecuciones solo se calculan para cron de 5 campos.',

// ───────────── en ─────────────
'group.formats': 'Formats',
'group.encoding': 'Encode',
'group.generators': 'Generators',
'group.time': 'Dates',
'group.text': 'Text',
'group.lists': 'Lists',

'convert.name': 'Convert',
'convert.desc': 'Convert between JSON and YAML, or a JSON array of objects into CSV.',
'convert.placeholder': 'Paste the JSON or YAML to convert',
'convert.keywords': 'json yaml yml csv excel convert convertir',
conversion: 'Conversion',
csvToJsonUnavailable: 'CSV → JSON is not available',

'qr.name': 'QR code',
'qr.desc': 'Generate a QR code from a text or a URL.',
'qr.placeholder': 'Type or paste the text or URL',
'qr.keywords': 'qr code url link codigo',
qrCorrection: 'Error correction',
'qrLevel.L': 'L: recovers about 7%',
'qrLevel.M': 'M: recovers about 15%',
'qrLevel.Q': 'Q: recovers about 25%',
'qrLevel.H': 'H: recovers about 30%. Tolerates a logo on top.',
qrSize: 'Size',
qrMargin: 'Margin',
qrMarginUnit: 'modules',
qrMarginLow: 'With a margin under 4 modules, some readers cannot scan it.',
qrCapacity: '{bytes} of {max} bytes',
qrInfo: 'Version {version} · {modules}×{modules} modules · {px} px',
qrFitsLower: 'It fits with level {level}.',
qrAlt: 'QR code for: {text}',
previewEmpty: 'Type a text to see the code.',
previewInvalid: 'Not valid',
preview: 'Preview',

'barcode.name': 'Barcode',
'barcode.desc': 'Generate CODE128, CODE39, EAN-13, EAN-8, UPC-A, ITF-14 and Codabar barcodes.',
'barcode.placeholder': 'Type the content',
'barcode.keywords': 'barcode ean upc code128 code39 itf codabar barras',
barcodeFormat: 'Format',
barcodeHeight: 'Height',
barcodeBarWidth: 'Bar width',
barcodeShowText: 'Show the text below',
barcodeInfo: '{format} · {width}×{height} px',
barcodeAlt: '{format} barcode: {value}',
barcodeCheckDigit: 'Check digit: {digit} (added at the end).',
barcodeUppercased: 'Converted to uppercase: CODE39 has no lowercase.',
'barcode.rule.CODE128': 'Letters, numbers and symbols without accents (ASCII).',
'barcode.rule.CODE39': 'Uppercase letters, numbers, space and - . $ / + %.',
'barcode.rule.EAN13': '12 digits, or 13 with the check digit.',
'barcode.rule.EAN8': '7 digits, or 8 with the check digit.',
'barcode.rule.UPC': '11 digits, or 12 with the check digit.',
'barcode.rule.ITF14': '13 digits, or 14 with the check digit.',
'barcode.rule.codabar': 'Numbers and - $ : / . +, optionally with A, B, C or D at the start and end.',

saveAsPng: 'Save as PNG',
saveAsSvg: 'Save as SVG',
saveImage: 'Save',
copySvg: 'Copy SVG',
imageSaved: 'Image saved',
imageSaveError: "Couldn't save the image",

'sql-list.name': 'List for SQL IN',
'sql-list.desc': 'Turn a list of values into a SQL IN clause, and back.',
'sql-list.placeholder': 'Paste the values, one per line or separated by commas',
'sql-list.placeholderReverse': "Paste the IN ('a', 'b') or the list 'a','b'",
'sql-list.keywords': 'sql in where oracle list quotes query',
listToSql: 'List → SQL',
sqlToList: 'SQL → list',
quotes: 'Quotes',
quotesSingle: 'Single',
quotesNone: 'None',
layout: 'Layout',
layoutOneLine: 'One line',
layoutPerLine: 'One value per line',
wrapIn: 'Wrap in IN (…)',
moreOptions: 'More options',
moreOptionsChanged: 'More options ({n} changed)',
separator: 'Separator',
cleanup: 'Cleanup',
removeDuplicates: 'Remove duplicates',
trimSpaces: 'Trim leading and trailing spaces',
removeEmpty: 'Remove empty values',
escapeQuotes: "Escape ' as ''",
numbersUnquoted: 'Leave numbers unquoted',
splitGroups: 'Split into groups of',
column: 'Column',
columnPlaceholder: 'column',
inputSeparator: 'Separated by: {sep}',
'sep.auto': 'Auto',
'sep.lines': 'lines',
'sep.comma': 'commas',
'sep.tab': 'tabs',
'sep.semicolon': 'semicolons',
sqlSummary: '{n} values',
sqlDupsRemoved: '{n} duplicates removed',
sqlEmptyRemoved: '{n} empty removed',
sqlGroups: '{g} groups of up to {size}',
sqlNoColumn: 'The column name is missing: "column" was used.',
sqlOracleLimit: 'More than 1000 values. Oracle does not accept more than 1000 in an IN: split the list into groups.',

'list-compare.name': 'Compare lists',
'list-compare.desc': 'Show which values are only in one list, in both, or in either.',
'list-compare.placeholderA': 'Paste list A, one value per line',
'list-compare.placeholderB': 'Paste list B, one value per line',
'list-compare.keywords': 'compare lists difference intersection union sets comparar',
listA: 'List A',
listB: 'List B',
ignoreCase: 'Ignore case',
listCount: '{n} values',
listDuplicates: '{n} duplicates',
listNoDuplicates: 'no duplicates',
copyDuplicates: 'Copy duplicates',
compareSummary: 'A {a} · B {b} · in both {both}',
onlyA: 'Only in A',
onlyB: 'Only in B',
inBoth: 'In both',
union: 'Union',
emptyOnlyA: 'No value is only in A.',
emptyOnlyB: 'No value is only in B.',
emptyBoth: 'The lists have no values in common.',
compareNeedBoth: 'Paste one list in A and another in B to compare them.',
sendToSql: 'Send to SQL IN',
resultsLabel: 'Results',

'error.json-unexpected-token': 'There is an unexpected character.',
'error.json-unexpected-end': 'The JSON ends too early: something is not closed.',
'error.json-bad-string': 'A string is not closed or has an invalid escape.',
'error.json-bad-number': 'A number is not written correctly.',
'error.json-trailing': 'There is extra content after the end of the JSON.',
'error.yaml-invalid': 'The YAML is not valid.',
'error.xml-invalid': 'The XML is not well formed.',
'error.csv-not-array': 'Expected an array of objects, like [{"a": 1}].',
'error.csv-not-objects': 'Every item in the array must be an object.',
'error.base64-invalid': 'Not valid Base64.',
'error.url-invalid': 'There is a malformed % sequence.',
'error.jwt-parts': 'A JWT has three parts separated by dots.',
'error.jwt-part-invalid': 'A part of the JWT is not valid Base64URL JSON.',
'error.timestamp-invalid': 'Not a valid timestamp.',
'error.date-invalid': 'The date is not recognized. Try 2026-01-01 08:00.',
'error.cron-invalid': 'The cron expression is not valid.',
'error.regex-invalid': 'The pattern is not valid.',
'error.qr-too-long': 'The text is too long for a QR code with level {level} ({bytes} of {max} bytes).',
'error.barcode-chars': 'The character "{char}" at position {pos} cannot be used in {format}.',
'error.barcode-length': '{format} needs {expected} digits, and there are {actual}.',
'error.barcode-check-digit': 'The check digit should be {expected}, not {actual}.',
'error.sql-unclosed-quote': 'There is an unclosed quote at position {pos}.',
largeInputCut: 'The input was cut at 5,000,000 characters.',
cronNoNextForFields: 'Next runs are only calculated for 5-field cron expressions.',
```

Los códigos de error `qr-too-long`, `barcode-chars`, `barcode-length`, `barcode-check-digit` y `sql-unclosed-quote` son **nuevos**: hay que sumarlos a `ToolErrorCode` en `tools/result.ts`. El texto de `errorAt` ("Línea {line}, columna {col}: {message}") envuelve los `error.*` que traen posición.

## E. Accesibilidad de lo nuevo

- **Contraste:**
  - El QR y el código de barras van en negro sobre blanco: 21:1 en todos los temas, porque la tarjeta es fija.
  - El anillo de la tarjeta (`--border-card`) es decorativo.
  - Los chips de conteo usan `--text-secondary` sobre `--bg-hover`, que da de 7 a 18:1 según el tema.
  - Siguen valiendo las condiciones de sepia del reporte anterior para los avisos `text-amber-400` del contador y del margen: hace falta la corrección del hallazgo 9.1-1.
- **Anuncios** por la región `aria-live` existente: "Imagen guardada", "Copiado" (SVG, pestaña, duplicados) y el cambio de conteo de las pestañas tras 500 ms ("Solo en A: 12").
- **Roles:**
  - las imágenes son `svg role="img"` con `aria-label`;
  - las pestañas usan el patrón ARIA completo (`tablist`, `tab`, `tabpanel`) con flechas;
  - "Más opciones" y "▸ duplicados" son botones con `aria-expanded` y `aria-controls`;
  - "Pasar a SQL IN" anuncia el cambio de herramienta: el `h2` de `sql-list` recibe el foco con `tabIndex=-1`.

## F. Casos borde nuevos

- **QR:**
  - texto con caracteres multibyte (emoji, tildes): se cuentan los bytes UTF-8, no los caracteres;
  - una URL sin esquema se codifica tal cual, sin agregar `https://`;
  - redes Wi-Fi con contraseña: es una entrada sensible más, que vive en memoria. El archivo solo existe si el usuario lo guarda.
- **Código de barras:**
  - un EAN-13 que empieza con 0 equivale a un UPC-A, lo cual es válido y no se avisa;
  - ITF-14 y EAN necesitan un margen claro a los lados, que va incluido en el margen de JsBarcode;
  - con el texto debajo apagado, el `aria-label` sigue diciendo el contenido.
- **`sql-list`:**
  - valores con `'` y escapar apagado: se avisa que el SQL puede quedar roto;
  - "Números sin comillas" con valores como `007`: se tratan como texto para no perder los ceros, y lo dice el estado;
  - NULL: se deja tal cual, sin comillas, solo si es exactamente `NULL` y está activo "Números sin comillas"; si no, va como texto `'NULL'` (queda como decisión);
  - grupos de 1000 con 1001 valores: salen 2 grupos.
- **`list-compare`:**
  - CRLF y LF se normalizan;
  - las listas pegadas desde Excel traen `\t` y espacios al final: conviene la sugerencia "Quitar espacios", sin activarla sola.

## Valores finales

El diseño se escribió mientras cambiaban el spec y el código. Donde no coinciden, mandan estos valores, que son los del código:

- **XML:** se valida y se formatea con el lector propio de `tools/formats.ts`, no con `DOMParser`.
- **Regex:** el tiempo límite es de **1 s** (`REGEX_TIMEOUT_MS`).
- **Cron:** las próximas ejecuciones se calculan con **5 o 6 campos** (`cronFieldCount`). `cronNoNextForFields` aplica a 7 campos y a `L`, `W` y `#`.
- **Topes:**
  - se procesa en vivo hasta 200 000 caracteres (`MAX_LIVE_CHARS`) y no se aceptan más de 5 000 000 (`MAX_INPUT_CHARS`);
  - UUID, de 1 a 100;
  - contraseñas, de 4 a 128, con 20 por defecto.
- **YAML:** un solo documento (`safeLoad`). Varios documentos con `---` dan error por ahora.
- **QR y códigos de barras:** el SVG lo arma `tools/codes.ts`, no `createSvgTag` ni el renderizador de JsBarcode.
- **Códigos de error:** `qr-too-long` y `barcode-invalid` (con el formato en `detail`). La vista muestra los mensajes específicos del diseño (`barcode-chars`, `barcode-length`, `barcode-check-digit`) a partir de su propia validación previa.
- **`sql-list`:** el escape de `'` como `''` va siempre. Sin él, el SQL quedaría roto, así que no se ofrece apagarlo.
- **Decisiones del diseño** (30 oct 2026), en todos los casos la recomendada:
  - `NULL` va sin comillas solo con "Números sin comillas" activo;
  - `list-compare` conserva el orden de aparición;
  - `barcode` también tiene "Copiar SVG";
  - el nombre es "Lista para SQL IN".
- **Correcciones de tema en este PR:**
  - colores de estado en sepia (hallazgo 9.1-1);
  - tokens `--syntax-*` en los temas claros (hallazgo 4).
  Quedan para después `PRIMARY_CLS` en los temas tintados, el ítem activo en sepia, el `aria-live` de los toasts, la trampa de foco de `ModalPanel` y los lenguajes `xml`, `csv` y `diff` en el editor de notas.

## Notas de la implementación de la vista

Lo que la vista hace distinto de lo escrito arriba, y por qué:

- **Lista para SQL IN:**
  - Comillas: `Simples · Dobles · Ninguna`. La Adenda solo nombraba simples y ninguna, pero D13 pide también las dobles.
  - Con "Envolver en IN (…)" y sin columna, sale `IN (…)`; con columna, `col IN (…)`. La columna se puede escribir aunque no se parta en grupos.
  - "Números sin comillas" deja sin comillas `NULL` (exacto) y los números sin ceros a la izquierda: `007` va como `'007'` y el estado lo explica (`sqlLeadingZero`).
- **Timestamp:** como tiene un solo campo, "Intercambiar" (D6) pasa de número a fecha ISO con desfase, o de fecha a segundos Unix.
- **JSON:** avisa los números de más de 15 cifras. No avisa las claves repetidas (§9), que pediría un lector propio con el árbol.
- **Codificar:** la salida es un `<pre>` de lectura, no un textarea de solo lectura.
- **Interruptores:** `ToggleSwitch` va dentro de un `<label>`, que le da el nombre accesible; el componente compartido no acepta `aria-labelledby`.
- **Ventana angosta:** la nota de privacidad y "Vaciar todas las herramientas" van al pie de la herramienta, porque la columna no se ve.
- **Claves de i18n:** `sep.newline` en lugar de `sep.lines`, para que coincida con `ListSeparator`. Se sumaron las que la vista necesitó (`jwtCol*`, `quotesDouble`, `oneValue`, `tabCount`, `pickerLoading`, `error.barcode-invalid`…) y se quitaron las que ya no usa (`csvNotArray`, `duplicateKey`, `yamlDocuments`, `escapeQuotes`, `jsonYaml.*`, `jsonCsv.*`).
- **Funciones sumadas en `tools/`** (con pruebas en `tools3.test.ts`): opciones del CSV, posición de los errores de Base64 y URL, `htmlEncode` con no ASCII, `lorem` sin la frase clásica, `checkBarcode` y `gs1CheckDigit`, `detectSeparator`, `findUnclosedQuote`, `duplicateCounts` y `groupNames`. `ToolErrorCode` suma `sql-unclosed-quote`.

---

# Adenda G de la interfaz: opciones y grupos plegables (31 oct 2026)

Pedido por Jorge (D17–D24). Jorge aprobó el diseño con todas sus recomendaciones (requirements, "Decisiones (31 oct 2026)"). Esta adenda manda sobre §1, §2 y §7 donde no coincidan.

Se basa en lo que ya existe:
- la lista reordenable de Opciones → Navegación (`src/components/settings/SidebarSettings.tsx`) y su lógica pura (`src/components/sidebar/sectionOrder.ts`, `resolveSections`);
- la página de Pomodoro (`src/extensions/pomodoro/Settings.tsx`): subtítulos, ayudas, "Restablecer" sin confirmación que solo aparece si algo cambió;
- el botón de opciones de la vista de Pomodoro (`SlidersHorizontal` y `openExtensionSettings`);
- el encabezado plegable de "Completadas" (`src/components/tasks/TaskList.tsx`): `ChevronRight` con `rotate-90` y el contador en `--text-faint`;
- `Segmented` (`ui/controls.tsx`) y `Toggle` (`components/shared/FormControls.tsx`).

No hay tokens ni colores nuevos. La única pieza compartida nueva es el hook de arrastre (§G.3).

## G.1 Registro y entrada

- `registry.ts`, entrada `devtools`: se suma `settings: true`. `index.ts` exporta `Settings` (archivo nuevo `src/extensions/devtools/Settings.tsx`).
- La página la dibuja `ExtensionSettingsPage` (`SettingsModal.tsx`): ícono, nombre y descripción de la extensión, y debajo el panel. Se ordena con las demás extensiones activas por nombre.
- El panel se monta **fuera** de `DevtoolsContext`: no usa `useDevtools`. Lee `language` y `extensions.devtools.settings` del store, arma `tr` con `makeTr(language)` y usa las funciones puras de `model.ts` (§G.4).
- **Botón de opciones en la vista**, a la derecha del buscador de `ToolNav`. Como `ToolNav` también va en el selector de la ventana angosta, el botón aparece en los dos.
  - La fila del buscador pasa a `flex items-center gap-1`; el `relative` del input queda en un `div` con `min-w-0 flex-1`.
  - Botón: `ICON_BTN` + `min-h-7 min-w-7 justify-center`, con `SlidersHorizontal size={13} aria-hidden`.
  - `aria-label` y `title`: `set.openTitle`.
  - Acción: `openExtensionSettings(DEVTOOLS_ID)`. En el selector, antes cierra el popover.

## G.2 Columna de herramientas (`ToolNav`)

```
[🔍 Buscar        ⌘⇧F] [⚙]
FORMATOS               ⌄        ← desplegado (chevron rotado 90°)
{} JSON  ◀
▤  YAML
CODIFICAR           4  ›        ← plegado: con el contador
GENERADORES         6  ›
   # Hash  ◀                    ← plegado, pero la activa se sigue viendo
FECHAS                 ⌄
⏱  Timestamp
…
```

**Lista:** `flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-3`. Cada grupo desplegado lleva `pb-4`: con todo desplegado, el espacio entre grupos es el de antes (20 px) y los plegados quedan juntos.

**Encabezado de grupo** (modo Por grupos, sin texto en el buscador):
- `<button type="button" id="{idPrefix}-group-{group}" aria-expanded aria-controls="{idPrefix}-items-{group}">`, dentro del `div role="group" aria-labelledby` de siempre. El `id` pasa del `div` al botón. Los ítems van en `<div id="{idPrefix}-items-{group}">`.
- Clases: `flex w-full items-center justify-between gap-1 rounded-md px-2.5 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)] transition hover:text-[var(--text-secondary)] ${FOCUS_RING}`.
- A la izquierda, el nombre (`group.*`). A la derecha, en un `span` con `flex items-center gap-1`:
  - el contador, **solo plegado**: `font-normal tabular-nums text-[var(--text-faint)]`, con `aria-hidden`. Cuenta las herramientas visibles del grupo (sin las ocultas);
  - el chevron: `ChevronRight size={11} aria-hidden`, con `transition-transform motion-reduce:transition-none` y `rotate-90` desplegado.
- Para lectores de pantalla, siempre, tras el nombre: `<span className="sr-only">{groupCount}</span>` (", 4 herramientas"). Se anuncia como "Formatos, 4 herramientas, botón, contraído".
- El chevron va a la derecha para conservar la alineación de hoy: los títulos siguen en el mismo `pl-2.5` que los ítems.

**Herramienta activa en un grupo plegado:** se sigue viendo bajo su encabezado, con su estilo de activa y `aria-current="page"`. El grupo no se despliega ni cambia lo guardado. Cuando se cambia de herramienta, la anterior deja de verse. Así siempre se ve dónde se está, también tras ⌥⌘↓, "Traer de una nota" o al volver a la sección.

**Herramientas ocultas (D20):**
- Sin texto en el buscador, no se ven, salvo la activa: va al final, en el grupo "Ocultas" (`group.hidden`), con el encabezado como texto (no se pliega).
- Con texto en el buscador, las que coinciden van al final, en "Ocultas".
- Un grupo sin herramientas visibles no se dibuja.

**Búsqueda:** filtra y no tiene en cuenta los grupos plegados.
- Todos los grupos con coincidencias se ven desplegados, y sus encabezados vuelven a ser texto (como hoy, sin chevron ni contador).
- Al vaciar el buscador, vuelve el estado de antes. Buscar no cambia lo guardado.
- Enter abre el primer resultado en el orden que se ve. Las ocultas van al final, así que nunca le ganan a una visible.

**Modo A-Z (D18):** sin encabezados ni grupos: una sola lista con las visibles, ordenadas por `localeCompare(nombre, language)`. "Ocultas" funciona igual, al final. El contenedor de la lista conserva el `aria-label` del `nav`.

**Estado recordado:** `collapsed` (§G.4). La columna y el selector comparten el estado: plegar en uno se ve en el otro. Se escribe leyendo del store en ese momento, como `setOptions`, para que dos clics seguidos no se pisen.

**Teclado** (la lista sigue siendo un solo tab stop, con roving tabindex):
- La secuencia del roving es la de lo que se ve: encabezados de grupo (solo los que son botón) e ítems visibles. Los ítems de un grupo plegado no entran, salvo la activa que se ve.
- ↑/↓ mueven el foco, con vuelta. Home y End van a los extremos.
- En un encabezado:
  - Enter o Espacio pliegan o despliegan, y el foco se queda en el encabezado;
  - → despliega; si ya está desplegado, va al primer ítem;
  - ← pliega; si ya está plegado, no hace nada.
- En un ítem:
  - Enter o Espacio abren la herramienta (como hoy);
  - ← lleva el foco a su encabezado, sin plegar (la convención de un árbol, sin `role="tree"`).
- ↓ desde el buscador va a la activa, o al primero de la secuencia si la activa no se ve.
- Con texto en el buscador, los encabezados no entran en la secuencia (son texto).
- **⌥⌘↓ / ⌥⌘↑** (`View.tsx`) usan `resolveToolList(...).order` en lugar de `ALL_TOOLS`: el orden que se ve, con las de los grupos plegados y sin las ocultas (D22). Si la activa está oculta, ⌥⌘↓ va a la primera y ⌥⌘↑ a la última.

**Selector de la ventana angosta** (`ToolSwitcher`): es el mismo `ToolNav`, así que todo lo anterior vale igual dentro del popover. Con `max-h-[60vh]`, plegar ayuda más ahí.

**Anuncios:** plegar y desplegar no se anuncian aparte: lo dice `aria-expanded`.

## G.3 Página Opciones → Extensiones → DevTools

```
[ic] DevTools                                        ← ExtensionSettingsPage (ya existe)
     <descripción>

Lista de herramientas                                ← subtítulo
Mostrar las herramientas  [ Por grupos | A-Z ]       ← Segmented
Puedes plegar cada grupo en la columna.              ← ayuda (Por grupos) / set.azHint (A-Z)

Orden y visibilidad
Arrastra para ordenar. Las que ocultes siguen apareciendo al buscar.
┌───────────────────────────────────────────────────────────┐ ← una tarjeta por grupo
│ ⋮⋮  FORMATOS                                    [↑] [↓]   │   fila de grupo
├───────────────────────────────────────────────────────────┤
│     ⋮⋮ {}  JSON                    [↑] [↓]   (●) Mostrar  │   filas de herramienta
│     ⋮⋮ ▤   YAML                    [↑] [↓]   (●) Mostrar  │
│     ⋮⋮ </> XML                     [↑] [↓]   ( ) Mostrar  │   ← oculta: nombre en --text-hint
│     ⋮⋮ ⇄   Convertir               [↑] [↓]   (●) Mostrar  │
└───────────────────────────────────────────────────────────┘
┌ CODIFICAR …                                               ┐
                                          [↺ Restablecer orden]

─────────────────────────────────────────────────────────────
Opciones de las herramientas
Cada herramienta recuerda sus opciones, como la indentación o la longitud.
[↺ Restablecer las opciones de las herramientas]   ← solo si hay opciones guardadas
```

**Contenedor:** `space-y-4 text-xs`, como Pomodoro.
- Subtítulos: `<p className="font-medium text-[var(--text-secondary)]">`.
- Ayudas: `text-[11px] text-[var(--text-hint)]`.
- Cada bloque: `space-y-2`. El último va con `border-t border-[var(--border)] pt-4`.

**Mostrar las herramientas (D18):**
- `Segmented` de `ui/controls.tsx` con `label={tr('set.layout')}` y las opciones `set.layoutGroups` y `set.layoutAz`. Va en una fila `flex flex-wrap items-center gap-3` con el texto `set.layout` a la izquierda (`text-[var(--text-secondary)]`).
- Debajo, la ayuda: `set.layoutGroupsHint` en Por grupos, `set.azHint` en A-Z.

**Orden y visibilidad (D19, D20):**
- Tarjetas: `space-y-2`. Cada grupo es un `<ul>` con `rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] divide-y divide-[var(--border)]`, como `SidebarSettings`. Lleva `aria-label` con el nombre del grupo.
- Filas: `flex min-h-9 items-center gap-2 px-2 py-1 text-xs`.
- **Fila de grupo** (la primera del `<ul>`):
  - asa `GripVertical size={14}`, con `aria-hidden` y `title={set.dragGroup}`, clases del asa de `SidebarSettings` (`flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-[var(--text-hint)] active:cursor-grabbing`);
  - nombre con `PANEL_TITLE` y `min-w-0 flex-1 truncate`;
  - `ICON_BTN` con `ChevronUp` y `ChevronDown` (14 px): `aria-label` `set.moveGroupUpNamed` / `set.moveGroupDownNamed`, `title` `set.moveUp` / `set.moveDown`;
  - sin interruptor: un grupo con todas sus herramientas ocultas desaparece solo de la columna.
- **Fila de herramienta:**
  - `pl-7` (sangría bajo el grupo);
  - asa (`title={set.drag}`), ícono de `TOOL_ICON` (14 px, `shrink-0 text-[var(--text-muted)]`) y nombre (`min-w-0 flex-1 truncate`, `text-[var(--text-secondary)]`; oculta, `text-[var(--text-hint)]`);
  - `ICON_BTN` ↑ y ↓ dentro del grupo: `aria-label` `set.moveUpNamed` / `set.moveDownNamed`;
  - `<span className="ml-1 shrink-0"><Toggle label={tr('set.show')} srSuffix={nombre} … /></span>`;
  - no hay forma de pasarla a otro grupo.
- **Última visible:** el `Toggle` de la única herramienta visible va `disabled`, y bajo las tarjetas aparece `set.lastVisible` (`text-[11px] text-[var(--text-hint)]`).
- **Modo A-Z:** las asas y las flechas no se dibujan (no se desactivan, para no llenar la lista de controles grises). Siguen las tarjetas por grupo y los interruptores. La ayuda del bloque pasa a ser `set.azHint`.
- **Restablecer orden:** `SECONDARY_CLS` con `RotateCcw size={12}`, en `mt-2 flex justify-end`. Borra `groupOrder`, `toolOrder` y `hidden`; no toca `layout` ni `collapsed`. Solo se ve si alguna de las tres existe. Anuncia `set.resetOrderDone`.

**Arrastre** (la misma lógica de puntero de `SidebarSettings`, sin librería):
- Los grupos se arrastran entre grupos (por el asa de su fila) y las herramientas solo dentro de su tarjeta.
- Indicador: la fila o la tarjeta destino lleva `shadow-[inset_0_2px_0_var(--accent)]` (si sube) o `shadow-[inset_0_-2px_0_var(--accent)]` (si baja); la arrastrada, `opacity-50`.
- **Pieza nueva:** `useRowDrag` en `src/components/shared/useRowDrag.ts`, extraída de `SidebarSettings` (`rowIndexAt`, el estado `{ id, from, over }` y los manejadores del asa), con el selector de fila como parámetro (`[data-section-row]`, `[data-group-row]`, `[data-tool-row]`). Hace falta porque la página necesita tres listas (los grupos y las herramientas de cada uno); copiar el código tres veces no es mantenible. `SidebarSettings` pasa a usarla, sin cambiar lo que hace.

**Opciones de las herramientas (D23):**
- Subtítulo `set.toolOptions` y ayuda `set.toolOptionsDesc`.
- Botón `SECONDARY_CLS` con `RotateCcw size={13}` y `set.resetOptions`. Solo si `options` tiene alguna herramienta. Borra `options` (`update(DEVTOOLS_ID, { options: undefined })`) sin confirmación: no borra datos, solo vuelve a los valores por defecto (el mismo criterio que "Restablecer" en Pomodoro). Avisa con `showToast({ kind: 'success', title: set.resetOptionsDone })`.
- Si la vista está abierta detrás, las herramientas toman los valores por defecto al momento (`useToolOptions` lee del store).

**Estados:**
- Por defecto: sin "Restablecer orden" ni "Restablecer las opciones".
- Con cambios: aparecen los botones que correspondan.
- A-Z: sin asas ni flechas, con `set.azHint`.
- Última visible: el interruptor desactivado y `set.lastVisible`.
- Vacío, cargando y error no aplican: los datos son locales y se leen al momento. Si guardar falla, lo dice el manejo de error de `persistConfig` que ya tiene la app.
- Con la vista abierta detrás, la columna se actualiza al momento: las dos leen del mismo store.

**Teclado y anuncios:**
- Orden de Tab: Segmented → por tarjeta: ↑ y ↓ del grupo → por herramienta: ↑, ↓ e interruptor → Restablecer orden → Restablecer las opciones. Las asas no reciben foco (`aria-hidden`): las flechas son su alternativa.
- **Foco al mover (arreglo de accesibilidad, también en `SidebarSettings.tsx`):** las flechas no usan `disabled` en los extremos, porque al mover la fila al primer lugar el botón se desactivaba y el foco caía al `body` (WCAG 2.4.3). Llevan `aria-disabled="true"`, el clic no hace nada y las clases imitan el desactivado: `aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent`. Las filas tienen `key` estable (el id), así que el botón movido conserva el foco.
- Anuncios en `<p className="sr-only" aria-live="polite">`, como `SidebarSettings`: `set.moved` (herramienta, posición dentro de su grupo), `set.groupMoved`, `set.hiddenNow`, `set.shownNow` y `set.resetOrderDone`.
- Son unos 70 tab stops (6 grupos y 20 herramientas). Es aceptable porque repite el patrón de Opciones → Navegación.

## G.4 Modelo de datos

En `extensions.devtools.settings` (`config.json`, con `updateExtensionSettings`). Es local y no se sincroniza (D24, vault: "Preferencias de UI siempre locales, nunca sincronizadas"). Solo se escriben las claves que difieren de lo de por defecto; un valor `undefined` en el parche borra la clave (`withExtensionSettings`).

```ts
interface DevtoolsSettings {
  lastTool: ToolId;                                       // ya existía
  options: Partial<Record<ToolId, Record<string, OptionValue>>>; // ya existía
  layout: 'groups' | 'az';                                // por defecto 'groups'
  groupOrder?: ToolGroup[];                               // orden de los grupos
  toolOrder?: Partial<Record<ToolGroup, ToolId[]>>;       // orden dentro de cada grupo
  hidden?: ToolId[];                                      // las que se ocultan (exclusión)
  collapsed?: ToolGroup[];                                // los que se pliegan (exclusión)
}
```

**Lectura** (`readDevtoolsSettings`, ampliada): se descartan los ids desconocidos y los repetidos, y en `toolOrder[g]` las herramientas que no son de `g`. Si `hidden` deja todas ocultas (una edición a mano), se ignora.

**Funciones puras nuevas en `model.ts`**, con pruebas en vitest:
- `resolveToolList(settings, nameOf: (tool: ToolId) => string, locale: string)` devuelve:
  - `sections: { group: ToolGroup | null; tools: ToolId[] }[]`: los grupos en el orden del usuario, cada uno con sus visibles (en A-Z, una sola con `group: null`);
  - `hidden: ToolId[]`: las ocultas, en el mismo orden;
  - `order: ToolId[]`: el orden plano que se ve, para ⌥⌘↓/↑.
- `moveGroup(settings, group, delta)`, `moveGroupTo(settings, group, index)`, `moveTool(settings, tool, delta)`, `moveToolTo(settings, tool, index)`, `setToolHidden(settings, tool, hidden)` y `toggleGroupCollapsed(settings, group)`: devuelven el parche a guardar.

**Compatibilidad:** lo guardado hasta hoy (`{ lastTool, options }`) se lee como todo por defecto, y se ve igual que antes. No hace falta migración.

**Herramientas que dependen de otra extensión** (D25, specs/cliente-http A10, 31 oct 2026): `availableTools(httpEnabled)` da las que se pueden usar, y `resolveToolList`, `availableGroups`, `moveGroup`, `moveGroupTo`, `visibleToolCount`, `setToolHidden` e `isToolHidden` la reciben como último argumento. Lo que no está disponible no se ve en ningún sitio (tampoco entre las ocultas), las flechas de los grupos lo saltan y "no ocultar la última visible" cuenta solo las disponibles. Lo guardado de Cliente HTTP se conserva tal cual mientras está apagada. La usan la columna, el selector, el buscador, ⌥⌘↓/↑, `toolForBlock`, la ayuda (`ui/Help.tsx`) y la página de Opciones; la vista y la ayuda la sacan de `availableToolsIn(extensions)`.

**Herramientas o grupos nuevos en una versión futura** (D24, la regla de `resolveSections`):
- una herramienta que no está en `toolOrder[g]` va al final de su grupo, en el orden de `TOOL_GROUPS`, visible (porque `hidden` es una lista de exclusión);
- un grupo que no está en `groupOrder` va al final, desplegado (porque `collapsed` también lo es);
- una herramienta o un grupo que ya no existe se ignora al leer y desaparece de lo guardado en la siguiente escritura.

**`lastTool` oculta:** se abre igual y se ve en "Ocultas". **"Quitar configuración"**, en el catálogo de extensiones, ya lo borra todo. D9 no cambia: nada de lo pegado se guarda.

## G.5 Accesibilidad

- **Nombre, rol y valor (4.1.2):** los encabezados son botones con `aria-expanded` y `aria-controls`, dentro de un `role="group"` con nombre; el contador va en sr-only. Los interruptores de la página llevan el nombre de la herramienta (`srSuffix`); las flechas, `aria-label` con el nombre.
- **Teclado (2.1.1):** todo se puede hacer sin ratón. Plegar con Enter, Espacio, ← y →; ordenar con las flechas de la página.
- **Orden y foco (2.4.3, 2.4.7):** el foco nunca cae al `body` al mover ni al plegar (§G.3); foco visible con `FOCUS_RING`, que en `theme-tinted` toma el acento.
- **Contraste (1.4.3, 1.4.11):** no hay combinaciones nuevas. El encabezado sigue en `--text-hint` sobre `--bg-panel`. El contador usa `--text-faint`, definido en los siete bloques de tema de `App.css`; es decorativo (`aria-hidden`) y el número lo da el sr-only.
- **Movimiento (2.3.3):** el chevron no rota con `prefers-reduced-motion` (`motion-reduce:transition-none`).
- **Temas:** solo tokens y el acento; nada de colores fijos. Hay que mirarlo en claro, oscuro, sepia, alto contraste y uno tintado.

## G.6 Casos borde

- **Ocultar la herramienta abierta:** sigue abierta y pasa a "Ocultas" en la columna.
- **Ocultar todas las de un grupo:** el grupo desaparece de la columna. En la página sigue su tarjeta, para poder volver a mostrarlas.
- **Plegar el grupo de la activa:** la activa sigue viéndose. Con el foco en un ítem de ese grupo, el foco ya estaba en el encabezado (solo se pliega desde ahí).
- **Plegar todos:** la columna muestra solo encabezados (y la activa). ⌥⌘↓ sigue recorriendo todas.
- **Cambiar a A-Z con grupos plegados:** no hay grupos que plegar; `collapsed` se conserva para cuando se vuelva a Por grupos.
- **"Traer de una nota" a una herramienta oculta** (`toolForBlock`): se abre igual (D20).
- **Opciones abiertas con la vista detrás:** los cambios se ven al momento en la columna. Si el selector de la ventana angosta estaba abierto, el botón de opciones lo cerró antes.
- **Nombre largo** ("Expresiones regulares"): en la página, `truncate`; en la columna, dos líneas como hoy.
- **Idioma:** al cambiarlo, el A-Z se reordena con los nombres del idioma nuevo.

## G.7 Textos (sección `devtools` de `i18n.ts`)

Nuevos:

| Clave | es | en |
|---|---|---|
| `set.openTitle` | Abrir las opciones de DevTools | Open DevTools settings |
| `set.list` | Lista de herramientas | Tool list |
| `set.layout` | Mostrar las herramientas | Show tools |
| `set.layoutGroups` | Por grupos | By group |
| `set.layoutAz` | A-Z | A–Z |
| `set.layoutGroupsHint` | Puedes plegar cada grupo en la columna. | You can collapse each group in the column. |
| `set.azHint` | En la lista A-Z el orden es alfabético. Para ordenar, vuelve a Por grupos. | The A–Z list is sorted alphabetically. To reorder, switch back to By group. |
| `set.order` | Orden y visibilidad | Order and visibility |
| `set.orderDesc` | Arrastra para ordenar. Las que ocultes siguen apareciendo al buscar. | Drag to reorder. Hidden tools still show up when you search. |
| `set.show` | Mostrar | Show |
| `set.lastVisible` | Deja al menos una herramienta visible. | Keep at least one tool visible. |
| `set.drag` | Arrastrar {name} | Drag {name} |
| `set.dragGroup` | Arrastrar el grupo {name} | Drag the {name} group |
| `set.moveUp` | Mover arriba | Move up |
| `set.moveDown` | Mover abajo | Move down |
| `set.moveUpNamed` | Mover {name} arriba | Move {name} up |
| `set.moveDownNamed` | Mover {name} abajo | Move {name} down |
| `set.moveGroupUpNamed` | Mover el grupo {name} arriba | Move the {name} group up |
| `set.moveGroupDownNamed` | Mover el grupo {name} abajo | Move the {name} group down |
| `set.moved` | {name}, posición {n} de {total} | {name}, position {n} of {total} |
| `set.groupMoved` | Grupo {name}, posición {n} de {total} | {name} group, position {n} of {total} |
| `set.hiddenNow` | {name} ya no aparece en la lista. | {name} is no longer in the list. |
| `set.shownNow` | {name} vuelve a la lista. | {name} is back in the list. |
| `set.resetOrder` | Restablecer orden | Reset order |
| `set.resetOrderDone` | Orden restablecido. | Order reset. |
| `set.toolOptions` | Opciones de las herramientas | Tool options |
| `set.toolOptionsDesc` | Cada herramienta recuerda sus opciones, como la indentación o la longitud. | Each tool remembers its options, like indentation or length. |
| `set.resetOptions` | Restablecer las opciones de las herramientas | Reset tool options |
| `set.resetOptionsDone` | Opciones restablecidas. | Options reset. |
| `group.hidden` | Ocultas | Hidden |
| `groupCount` | , {n} herramientas | , {n} tools |
| `groupCountOne` | , 1 herramienta | , 1 tool |
| `help.p6` | Haz clic en el nombre de un grupo para plegarlo o desplegarlo. Para ordenar u ocultar herramientas, usa el botón de opciones junto al buscador. | Click a group's name to collapse or expand it. To reorder or hide tools, use the settings button next to the search box. |

Cambiado:

| Clave | es | en |
|---|---|---|
| `help.p5` | Lo que pegas solo vive en la memoria: sigue ahí al cambiar de herramienta y se borra al cerrar Logday. Solo se recuerdan la última herramienta, sus opciones y cómo ordenaste la lista. Para borrarlo antes, usa «Vaciar todas las herramientas», al pie. | What you paste lives only in memory: it stays when you switch tools and is cleared when you close Logday. Only the last tool, its options and how you arranged the list are remembered. To clear it sooner, use "Clear all tools" at the bottom. |

Notas:
- "Mover arriba", "Mover abajo" y "Restablecer orden" son las mismas palabras de `sectionNav`, para que el término sea el mismo en las dos listas.
- En inglés, Opciones es "Settings", como `sectionNav.settings` y `optionsTitle` de Pomodoro.
- `help.p6` va en la ayuda general, tras `help.p5` (`GENERAL_HELP` en `ui/Help.tsx`).

# Adenda H: Visor HTML (31 oct 2026)

Pedido por Jorge (D26), con la vista previa aislada. Esta adenda manda sobre §4 y §6.2 donde no coincidan.

## H.1 Registro

- Id `html-preview` (`html` ya es Entidades HTML), al final de Formatos (D24). Nombre "Visor HTML" / "HTML viewer"; ícono `AppWindow`.
- Tiene "Traer de una nota" (`PICKER_TOOLS`) y "En esta herramienta" (`TOOL_HELP`, `html-preview.help1–3`). No tiene "Guardar en una nota": la salida es una imagen, no un texto.
- `LANGUAGE_TOOL`: `html`, `htm` y `xhtml` pasan a `html-preview` (antes `html` iba a XML, que no acepta `<br>` ni atributos sin comillas); `svg` sigue en XML. Un bloque sin lenguaje que empieza con `<!DOCTYPE html` o `<html` también va al visor.
- Se recuerdan `width` (`mobile`, `tablet`, `full`; por defecto `full`) e `indent` (`2`, `4`, `tab`). "Cargar recursos externos" es estado del componente: apagado cada vez que se abre la herramienta.

## H.2 Pantalla (`views/HtmlPreviewTool.tsx`)

- `ToolFrame` con la barra de opciones: Ancho (`Segmented`: Móvil, Tablet, Completo, con `title` "375 px" y "768 px"), Indentación y el `Toggle` "Cargar recursos externos".
- Cuerpo: el grid de siempre (`@3xl/tool:grid-cols-2`, declarado en el `<section>` de `View.tsx`, que es el contenedor `@container/tool`): en ventana angosta, el editor arriba y la vista previa debajo.
- Panel "HTML": `PanelHeader` con Formatear (`AlignLeft`), Minificar (`FoldVertical`), Copiar (⌘⇧C) y Limpiar (⌘⇧⌫); el `textarea` de las demás herramientas (`textareaCls`, `h-[60vh] min-h-[16rem]`); debajo, "3,2 KB · 42 líneas".
- Panel "Vista previa": `HtmlPreview` del mismo alto, o `EmptyOutput` ("La vista previa aparece aquí." y "Probar con un ejemplo") si no hay HTML. Si el ancho no cabe, "Escalada al 62 %" en el encabezado. Debajo, el aviso con `ShieldCheck` (o `TriangleAlert` con los externos).
- La vista previa usa `useDebounced(input, 250)`. Por encima de `MAX_LIVE_CHARS` (D8) se rehace con "Procesar" o ⌘↵, como las demás.
- Zona de estado: hasta 3 avisos de estructura (`checkHtml`) con su línea, y "Hay N avisos más de estructura".

## H.3 Formatear, minificar y avisos (`tools/htmlFormat.ts`)

Puras y tolerantes, sobre el tokenizador compartido (`src/lib/htmlTokenizer.ts`) y un árbol aproximado:
- vacíos (`br`, `img`…) sin cierre; `<x/>` solo cierra en SVG y MathML;
- `<li>`, `<p>`, `<td>`, `<tr>`, `<option>`… se cierran solos con el siguiente, hasta un contenedor (`ul`, `table`…);
- un cierre cierra la abierta más cercana con su nombre; las que quedan en medio, sin cierre propio, son "sin cerrar".

Formatear: un bloque por línea con su sangría; el contenido de línea (texto y `a`, `b`, `span`…) queda junto en una línea, con los espacios juntados. `pre` y `textarea` no se tocan; `style` y `script` se vuelven a sangrar. No agrega los cierres que faltan. Minificar: sin comentarios, sin los espacios junto a un bloque y con uno solo entre palabras; `pre`, `textarea`, `style` y `script` intactos (estos dos, sin los espacios de los bordes). Los atributos se escriben como estaban (comillas, mayúsculas, sin comillas).

## H.4 Aislamiento (`components/shared/HtmlPreview.tsx`, `lib/htmlPreviewDoc.ts`)

`HtmlPreview({ html, allowExternal, width, title, heightClass, onScale })` es compartido: el Cliente HTTP lo usará para las respuestas `text/html` (paquete B de su rediseño). Tres capas:

1. **`<iframe sandbox="" srcdoc>`**, sin ningún `allow-*`: no corren scripts (tampoco las URL `javascript:`), no se envían formularios, no se abren ventanas ni se navega la de la app, y el documento tiene un origen opaco (no ve nada de la app). `referrerpolicy="no-referrer"`, fondo blanco en cualquier tema.
2. **CSP** en una `<meta>` que es lo primero del `<head>`: `default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; base-uri 'none'; form-action 'none'`. Con los externos, `https:` en estilos, imágenes, fuentes y medios; nunca scripts ni `http:`. Más `x-dns-prefetch-control: off` y `referrer: no-referrer`.
   - El documento lo abrimos nosotros: `<!DOCTYPE html><html><head>` + las metas + un `<style>` + el HTML del usuario, sin cerrar el `<head>`. El navegador ignora el `<!DOCTYPE>`, `<html>` y `<head>` del usuario (pasa sus atributos de `<html>` al nuestro), y lo de su `<head>` queda después de la CSP. Si empieza con contenido, cierra el `<head>` y abre el `<body>` solo. Siempre en modo estándar.
   - Una CSP del usuario no relaja la nuestra: con varias políticas, un recurso tiene que cumplirlas todas. Y sin scripts nadie puede quitarla del DOM.
3. **Saneado** (`sanitizePreviewHtml`), porque la CSP no cubre la navegación (`navigate-to` no existe en WebKit): un clic en `<a href="https://…">` navegaría el propio iframe.
   - `href` (y `xlink:href`, y cualquier `x:href`) pasa a `data-logday-href` en todos los elementos menos `<link>`; en `a` y `area` se suma un `title` con el destino, y un estilo los sigue mostrando como enlaces (`cursor: not-allowed`). Se conservan las referencias internas de SVG (`<use href="#icono">`), que no navegan. Los `#ancla` de los enlaces también se quitan: en un `srcdoc` se resuelven contra la URL de la app y cargarían la app en el iframe.
   - Se quitan `<base>` (además de `base-uri 'none'`), los `<meta http-equiv>` que no sean `content-security-policy`, `content-type`, `content-language` o `x-ua-compatible` (refresh, set-cookie…) y los `<link>` que no sean hojas de estilo o que sean pistas de recursos (`dns-prefetch`, `preconnect`, `preload`…: la CSP no siempre frena el DNS). `srcdoc` y `ping` se renombran, y también `attributeName` cuando anima un `href` (`<set attributeName="href" to="https://…">`: SMIL corre sin scripts).
   - El tokenizador sigue los estados del estándar en lo que decide qué es una etiqueta. Donde no imita al navegador (el árbol, el contenido SVG/MathML) se equivoca hacia el lado seguro: dentro de `<svg>`/`<math>` no hay texto crudo, y en lo que no es texto ni etiqueta (comentarios, contenido de `style`/`script`/`textarea`, CDATA) una segunda pasada (`neutralizeLoose`) renombra `href`, `srcdoc`, `http-equiv`, `ping` y `attributeName` por si el navegador ve ahí una etiqueta.
- **CSP de la app:** `src-tauri/tauri.conf.json` tiene `"csp": null` (y la config de QA de `AGENTS.md` no la cambia), así que no hay `frame-src` ni `child-src` que frene el iframe. Si algún día se pone una, los `srcdoc` no se piden a ninguna URL, pero conviene comprobarlo en WebKit y WebView2.
- **Ancho simulado:** con Móvil o Tablet, el iframe mide 375 o 768 px. Un `ResizeObserver` mide el marco; si no cabe, `transform: scale(ancho disponible / ancho)` desde la esquina, y el alto se divide por la escala para llenar el marco.
- **Pruebas:** `src/lib/htmlPreviewDoc.test.ts` (CSP primera y con o sin externos, `<base>`, `meta refresh`, todas las formas de `href`, SVG, comentarios, HTML con y sin `<html>`/`<head>`, vacío) y `src/extensions/devtools/htmlTool.test.tsx` (formatear, minificar, avisos, el `sandbox=""` del iframe con `react-dom/server` y la herramienta dibujada).

## H.5 Textos (sección `devtools` de `i18n.ts`)

| Clave | es | en |
|---|---|---|
| `html-preview.name` | Visor HTML | HTML viewer |
| `html-preview.desc` | Escribe o pega HTML y mira cómo se ve, sin ejecutar scripts ni cargar nada de internet. | Type or paste HTML and see how it looks, without running scripts or loading anything from the internet. |
| `html-preview.placeholder` | Pega o escribe HTML | Paste or type HTML |
| `htmlSource` / `htmlPreview` | HTML / Vista previa | HTML / Preview |
| `htmlPreviewFrame` | Vista previa del HTML (el `title` del iframe) | HTML preview |
| `htmlPreviewEmpty` | La vista previa aparece aquí. | The preview shows up here. |
| `htmlWidth`, `htmlWidthMobile`, `htmlWidthTablet`, `htmlWidthFull` | Ancho, Móvil, Tablet, Completo | Width, Mobile, Tablet, Full width |
| `htmlExternal` | Cargar recursos externos | Load external resources |
| `htmlIsolated` | Vista previa aislada: sin scripts ni recursos externos. | Isolated preview: no scripts or external resources. |
| `htmlIsolatedExternal` | Vista previa aislada: sin scripts. Las imágenes, los estilos y las fuentes de https:// se descargan de internet. | Isolated preview: no scripts. Images, styles and fonts from https:// are downloaded from the internet. |
| `htmlScaled` | Escalada al {pct} % | Scaled to {pct}% |
| `htmlStats` | {size} · {lines} línea(s) | {size} · {lines} line(s) |
| `htmlFormatted`, `htmlMinified` | HTML formateado. / HTML minificado. (anuncio) | HTML formatted. / HTML minified. |
| `htmlUnclosed` | La etiqueta <{tag}> de la línea {line} no se cierra. | The <{tag}> tag on line {line} is never closed. |
| `htmlStray` | Línea {line}: </{tag}> no cierra ninguna etiqueta abierta. | Line {line}: </{tag}> doesn't close any open tag. |
| `htmlMoreIssues` | Hay {count} avisos más de estructura. | There are {count} more structure warnings. |
| `html-preview.help1` | La vista previa no ejecuta scripts ni envía formularios, y los enlaces no se abren: sirve para ver cómo se ve la página, no para usarla. | The preview doesn't run scripts or send forms, and links don't open: it's for seeing how the page looks, not for using it. |
| `html-preview.help2` | No carga nada de internet: las imágenes y los estilos externos no aparecen. «Cargar recursos externos» trae imágenes, estilos y fuentes por https (nunca scripts) y se apaga al salir de la herramienta. | Nothing is loaded from the internet: external images and styles don't show up. "Load external resources" brings images, styles and fonts over https (never scripts) and turns off when you leave the tool. |
| `html-preview.help3` | Formatear y Minificar cambian el texto del editor. Con Móvil o Tablet, la página se dibuja a 375 o 768 px de ancho y se escala si no cabe. | Format and Minify change the text in the editor. With Mobile or Tablet, the page is drawn 375 or 768 px wide and scaled down if it doesn't fit. |
