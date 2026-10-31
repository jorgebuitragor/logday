# Pomodoro — Design

Estado: en progreso.

## Arquitectura

- **Quién lleva el reloj:**
  - El estado del temporizador vive en el frontend: la fase, el instante de fin o lo que falta si está en pausa, los bloques del ciclo y la tarea. Está en un store chico propio de la extensión (`src/extensions/pomodoro/`), que comparten la vista, el contador del menú y la bandeja.
  - Se guarda en `extensions.pomodoro.settings` al cambiar de estado, no en cada segundo (PM12).
- **Lo que vigila el fin es nativo** (`src-tauri/src/extensions/pomodoro.rs`):
  - El frontend le pasa a Rust el instante de fin, los textos de la notificación (ya traducidos) y si avisar. Con eso un hilo, una vez por segundo:
    - actualiza el título de la bandeja (macOS) o su tooltip (Windows);
    - al llegar al fin, manda la notificación del sistema y emite `pomodoro:finished`.
  - Así el aviso llega aunque la ventana esté oculta y el WebView frenado (PM4, PM5).
  - El frontend también comprueba el fin al cargar, porque la app pudo estar cerrada (D5). Terminar una fase es idempotente, con la clave fase + instante de fin, así que el aviso nunca se repite.
- **El sonido** se genera con Web Audio al recibir `pomodoro:finished`, sin archivos.
- **La bandeja:**
  - Las entradas del Pomodoro las arma `build_tray_menu` a partir del estado que dejó el frontend (etiquetas traducidas que llegan desde JS, como en la captura rápida).
  - Sus clics emiten `pomodoro:tray-action`, que resuelve el frontend.
- **Punto de extensión nuevo, `SidebarStatus`:** un componente de la extensión que el menú lateral dibuja abajo, encima de "Opciones", en los modos expandido y colapsado. Lleva el metadato `sidebarStatus: true` en el registro (R16: se sabe sin cargar el módulo).
- **Tareas:** el selector lee las tareas de todos los proyectos de disco, porque el store solo tiene las del proyecto abierto. No escribe en ellas (PM7).
- **Opciones:** un panel `Settings` (`settings: true`). La vista lo abre con una acción nueva del store, `openExtensionSettings(id)`.

## Interfaz

Diseño de la extensión `pomodoro` de Desktop (PM1–PM14). Se basa en DevTools (`specs/devtools/design.md`, `src/extensions/devtools/ui/`), el menú lateral (`src/components/sidebar/Sidebar.tsx`, `ExtensionSections.tsx`), la bandeja (`src-tauri/src/lib.rs`, `build_tray_menu`) y los tokens de `src/App.css`. Lo marcado como **nuevo** no existe hoy en el código.

### 1. Registro y piezas

- En `registry.ts`: `{ id: 'pomodoro', category: 'tool', icon: Hourglass, apps: ['desktop'], view: true, settings: true, load: () => import('./pomodoro').then((m) => m.default) }`. Hay que sumar `'pomodoro'` a `ExtensionId`.
  - Sin `sendsDataExternally` (PM14).
  - **Ícono `Hourglass`**, no `Timer`: `Timer` ya es Horas extra (`Sidebar.tsx:572` y la fila de secciones). Con 14 px, `AlarmClock` se confundiría con él; el reloj de arena tiene otra silueta.
- El módulo exporta:
  - `View`: la vista propia (R11);
  - `Settings`: el panel de Opciones (ver 1.1);
  - `SidebarStatus` (**nuevo punto de extensión**, ver 3), con la prop `collapsed: boolean`;
  - `start`: lo que vigila el estado, y cuya parada quita el contador y la bandeja (PM13).
- **Clases:** `pomodoro/ui/classes.ts` copia `FOCUS_RING`, `SECONDARY_CLS`, `ICON_BTN` e `INPUT_CLS` de `devtools/ui/classes.ts`. Es lo que ya hace cada extensión: `SECONDARY_CLS` está repetido en 6 `Settings.tsx`. `NumberField` y `Toggle` (`devtools/ui/controls.tsx`) se reutilizan tal cual. Lo ideal es moverlos a `components/shared/` en vez de importar de otra extensión (ver 11).

#### 1.1 Dónde van las opciones: en Opciones → Extensiones (`settings: true`)

Decisión: las opciones van en un panel `Settings` de Opciones. En la vista quedan solo un atajo a ese panel y el botón de sonido. Por qué:

- **Son comportamiento, no parámetros de uso.** En DevTools, las opciones (indentación, versión de UUID) cambian el resultado de la herramienta que se tiene delante, por eso viven en la vista. Las del pomodoro (duraciones, arranque solo, sonido) cambian lo que pasa en segundo plano: en el menú lateral, en la bandeja y con la ventana oculta. Se fijan una vez. Es el caso de Captura rápida, que también trabaja en segundo plano y tiene su panel.
- **Densidad tranquila.** La vista es para mirar el tiempo. Siete controles más junto al anillo compiten con él.
- **R21 ya lo resuelve:** con la extensión activa, tiene su entrada en la barra lateral de Opciones.
- **Lo que sí se quiere a mano está en la vista:**
  - el botón de sonido (silenciar en el momento);
  - una línea de resumen ("25 · 5 · 15 min · largo cada 4") con el botón "Opciones", que abre Opciones en la página de Pomodoro.
  Para eso hace falta una acción nueva del store, `openExtensionSettings(id)`, como `openSettingsGitTab` (`appStore.ts:4182`). Ver 11.

### 2. Vista propia

La raíz es `<div class="@container/pomodoro flex h-full min-h-0 flex-col overflow-y-auto">`. App.tsx ya la monta en `bg-[var(--bg-base)]` dentro de `ExtensionBoundary`. Las medidas van en rem: escalan con `--app-font-size` (17 px por defecto).

Anchos reales, con la ventana mínima de 800×600 (`tauri.conf.json`):
- con el menú normal (224 px), la vista mide unos 576 px: layout **angosto**;
- con el menú colapsado (48 px), unos 752 px: **angosto**;
- desde unos 1100 px de ventana con el menú normal: layout **ancho**. El corte es `@4xl/pomodoro` (56rem, unos 952 px con letra de 17 px).

#### 2.1 Layout ancho (`@4xl/pomodoro` en adelante)

```
┌ Encabezado ────────────────────────────────────────────────────────────────┐
│ [⧗] Pomodoro                                          [🔔] [⚙ Opciones]    │
│     25 · 5 · 15 min · largo cada 4                                         │
├──────────────────────────────────────────────┬─────────────────────────────┤
│                                              │ HOY                         │
│              [◎ Trabajo]                     │ 4 pomodoros · 1 h 40 min    │
│             ╭───────────╮                    │ de foco                     │
│            │   18:42     │   anillo 16rem     │ ─────────────────────────── │
│             ╰───────────╯                    │ 09:10  25 min  Informe Q3   │
│  Bloque 2 de 4 ● ● ○ ○ [≡ Reiniciar el ciclo]│ 09:40  25 min  Sin tarea    │
│                                              │ 10:15  25 min  Informe Q3   │
│    [ ‖ Pausar ]  [⏭ Saltar]  [↺]             │ …                           │
│                                              │                             │
│  TAREA                                       │ Solo cuentan los bloques    │
│  ┌──────────────────────────────────────┐    │ que llegaron al final.      │
│  │ Informe Q3                [Abrir][✕] │    │                             │
│  │ Trabajo · En curso                   │    │                             │
│  └──────────────────────────────────────┘    │                             │
│  ✓ Terminó el pomodoro. Toca un descanso…    │                             │
│                                              │                             │
└──────────────────────────────────────────────┴─────────────────────────────┘
```

- Cuerpo: `grid flex-1 gap-6 px-5 py-6 @4xl/pomodoro:grid-cols-[minmax(0,1fr)_18rem]`.
- Columna del temporizador: `flex flex-col items-center gap-5`. La tarjeta de la tarea tiene un ancho máximo de `max-w-md w-full`.
- Columna de "Hoy": `<section aria-labelledby="pomodoro-today-title">` con `rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-4`, la tarjeta del panel de inicio (`DashboardView.tsx:304`). Ojo: `--bg-card` no existe en `App.css`, aunque se nombre en algunas guías. Su lista tiene scroll propio (`max-h-[60vh] overflow-y-auto`).

#### 2.2 Layout angosto (menos de `@4xl/pomodoro`)

Una sola columna, en este orden: encabezado, temporizador, ciclo, controles, tarea, estado y "Hoy" (tarjeta a todo el ancho, debajo). El anillo baja a `13rem`. Con 600 px de alto, el temporizador, los controles y la tarea entran sin scroll (unos 470 px). "Hoy" queda debajo y se llega con el scroll de la vista.

#### 2.3 Encabezado

Es el mismo que el de `ToolFrame`: `flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4`.
- Izquierda:
  - tile `rounded-lg bg-indigo-500/10 p-2 text-indigo-400` con `Hourglass size={16}`;
  - `<h2 id="pomodoro-title" tabIndex={-1} class="text-sm font-semibold text-[var(--text-primary)] focus:outline-none">Pomodoro</h2>`;
  - debajo, el resumen de duraciones en `mt-0.5 text-[11px] text-[var(--text-hint)] tabular-nums`.
- Derecha (`flex items-center gap-2`):
  - **Sonido:** `ICON_BTN` con `Bell`/`BellOff size={14}`, `aria-pressed={soundOn}`, nombre fijo "Sonido al terminar" y `title` "Sonido activado" o "Sonido desactivado". Apagado, el ícono va en `--text-hint`; encendido, en `--text-secondary`. Cambia el mismo ajuste que el panel de Opciones.
  - **Opciones:** `SECONDARY_CLS` con `SlidersHorizontal size={13}` y el texto "Opciones" (solo ícono por debajo de `@md/pomodoro`, con `sr-only`, como "Traer de una nota"). Abre Opciones en la página de Pomodoro.

#### 2.4 Temporizador: anillo

**Decisión: anillo, no barra.** Por qué:
- El temporizador es lo único que importa en la vista y se mira de lejos y de reojo. Un anillo que se vacía se entiende sin leer los números, y deja el tiempo en el centro, donde va la vista.
- Ocupa un cuadrado, así que entra igual en el layout ancho y en el angosto. Una barra necesita ancho y se ve como un indicador de carga.
- En el menú lateral sí va una **barra** de 2 px (ver 3): ahí la fila es horizontal y un anillo no cabe. Las dos son la misma información con el mismo color de fase.

Estructura:
```html
<div class="relative grid size-[13rem] place-items-center @4xl/pomodoro:size-[16rem]">
  <svg viewBox="0 0 100 100" class="absolute inset-0 -rotate-90" aria-hidden="true">
    <circle cx="50" cy="50" r="46" fill="none" stroke-width="3" style="stroke: var(--phase-track)" />
    <circle cx="50" cy="50" r="46" fill="none" stroke-width="3" stroke-linecap="round"
            pathLength="100" stroke-dasharray="100" stroke-dashoffset="{100 - restante%}"
            style="stroke: var(--phase-{fase})"
            class="transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none" />
  </svg>
  <div class="flex flex-col items-center gap-1.5">  ← chip de fase, tiempo y estado
</div>
```
- El arco muestra **lo que queda**: empieza lleno arriba (a las 12) y se vacía en el sentido del reloj, como un temporizador de cocina y como los números, que bajan.
- **Chip de fase**, encima del tiempo: `flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]`. Lleva el ícono de la fase (14 px) con `style="color: var(--phase-{fase})"` y el nombre de la fase en texto. El texto **nunca** va en el color de fase (ver 5).
  - Íconos: trabajo `Target`, descanso corto `Coffee`, descanso largo `Sofa`.
- **Tiempo:** `<p role="timer" class="text-5xl @4xl/pomodoro:text-6xl font-semibold tracking-tight tabular-nums text-[var(--text-primary)] leading-none">`.
  - Formato `m:ss` en minutos totales, sin horas: `25:00`, `4:59`, `120:00`. Así es igual en la vista, el menú y la bandeja.
  - Ver 8 para lo que lee el lector de pantalla.
- **Debajo del tiempo**, una línea de estado de `text-[11px] text-[var(--text-hint)]`: "En pausa desde las 14:05", "Listo" o nada mientras corre.

#### 2.5 Ciclo

Va debajo del anillo: `flex items-center gap-2 text-xs text-[var(--text-secondary)]`.
- El texto "Bloque 2 de 4" (`tabular-nums`). Durante un descanso, cuenta los bloques hechos: "Bloque 2 de 4 hecho".
- Los puntos, `aria-hidden`: `flex gap-1`, cada uno `size-2 rounded-full`.
  - hecho: relleno `var(--phase-work)`;
  - actual (solo en trabajo): borde `1.5px solid var(--phase-work)`;
  - pendiente: `bg-[var(--phase-track)]`.
  Con 10 bloques caben de sobra (unos 112 px).
- Después del último bloque antes del largo, el `title` del texto dice "Después de este bloque toca el descanso largo".
- "Reiniciar el ciclo" va al final de la fila de ciclo, en todos los anchos y una sola vez: `flex items-center gap-1 rounded-md border border-[var(--border-card)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${FOCUS_RING}`, con `ListRestart size={12}`. Sin confirmación: no borra el historial, solo pone el contador de bloques en cero.
  - *Cambio del 31 oct 2026:* antes era texto gris sin borde y, en el layout ancho, se iba al pie de "Hoy"; Jorge no lo encontró al probar la app de QA (PM2).

#### 2.6 Controles

`flex flex-wrap items-center justify-center gap-2`:

| Control | Clase | Ícono | Texto |
|---|---|---|---|
| Principal | `MAIN_BTN` (**nueva**, ver abajo) | `Play` / `Pause` (16) | "Iniciar el bloque", "Iniciar el descanso", "Pausar", "Reanudar" |
| Saltar | `SECONDARY_CLS` | `SkipForward` (13) | "Saltar". `title`: "Saltar al descanso (este bloque no cuenta)" o "Saltar el descanso" |
| Reiniciar la fase | `ICON_BTN` | `RotateCcw` (14) | Solo ícono, `aria-label` "Reiniciar la fase" |

- `MAIN_BTN` = `flex items-center gap-2 rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-5 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-indigo-500/15 ${FOCUS_RING}`, con el ícono en `text-indigo-400`.
  - Por qué no `PRIMARY_CLS`: en sepia y en los temas personalizados claros, su texto blanco queda a 1,5:1 (DevTools, hallazgo 9.1-2, sigue abierto).
  - Por qué el texto no va en `text-indigo-400`: en sepia, el acento como texto da 3,5:1 (hallazgo 9.1-3).
  - Con el texto en `--text-primary` sobre el tinte da entre 8,0 y 18:1 en los 7 temas. El borde y el ícono, en acento, pasan de 3:1.
- Mínimo de 28 px en los botones de ícono: `ICON_BTN` es `p-1.5` más 14 px de ícono, unos 26 px de ancho. Para llegar, se le suma `min-h-7 min-w-7`.

#### 2.7 Estados

| Estado | Anillo | Tiempo | Línea de estado | Principal | Saltar / Reiniciar fase |
|---|---|---|---|---|---|
| **Listo** (inicio, o tras "Reiniciar el ciclo") | Lleno, color de la fase | Duración completa, `--text-primary` | "Listo" | "Iniciar el bloque" (`Play`) | Saltar activo; Reiniciar fase deshabilitado (`disabled:opacity-50`) |
| **Corriendo** | Se vacía cada segundo | Cuenta atrás | Nada | "Pausar" (`Pause`) | Activos |
| **En pausa** | Fijo; el trazo pasa a `var(--text-hint)` | Fijo, `--text-secondary` | "En pausa desde las 14:05" (con fecha si es de otro día: "desde ayer a las 18:20") | "Reanudar" (`Play`) | Activos |
| **Terminado** (fin con la siguiente fase sin arrancar, PM3) | Lleno, con el color de la **siguiente** fase | Duración de la siguiente | `CircleCheck size={12}` + "Terminó el pomodoro. Toca un descanso de 5 min." o "Terminó el descanso. Cuando quieras, empieza el siguiente bloque." Se queda hasta iniciar o saltar | "Iniciar el descanso" o "Iniciar el bloque" | Saltar activo; Reiniciar fase deshabilitado |
| **Arranque solo** (PM3 con la opción activa) | Pasa directo a corriendo | — | Durante 10 s: "Empezó el descanso de 5 min." | "Pausar" | Activos |
| **Fin con Logday cerrado** (PM4) | Como Terminado | — | "Terminó a las 10:25, con Logday cerrado." | Como Terminado | Igual |
| **Opciones cambiadas a mitad de fase** | Sin cambio | Sin cambio | En Opciones, bajo los números: "Los cambios se aplican desde la siguiente fase." | — | — |
| **Error de la extensión** | — | — | `ExtensionBoundary` muestra "Desactivar" (R15) | — | — |

- La línea de estado reusa `StatusItem` de DevTools: `flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)]`, con el ícono en `text-emerald-400`, que ya está corregido para claro y sepia.
- No hay estado "cargando" visible: el estado sale de `extensions.pomodoro.settings`, que ya está en memoria. Mientras se calcula el primer cuadro, el tiempo muestra `--:--` en `--text-hint`.

#### 2.8 Selector de tarea (PM6)

Lo que se ve, debajo de los controles (`w-full max-w-md`):
- Título de panel: `<h3 class={PANEL_TITLE}>Tarea</h3>`.
- **Sin tarea:** un botón a todo el ancho, `flex w-full items-center gap-2 rounded-lg border border-dashed border-[var(--border-card)] px-3 py-2.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] ${FOCUS_RING}`, con `ListTodo size={14}`, el texto "Elegir una tarea" y, a la derecha, `<kbd>` "⌘⇧T". Debajo, en `text-[11px] text-[var(--text-hint)]`: "Opcional. El pomodoro no escribe en la tarea."
- **Con tarea:** la tarjeta `flex items-start gap-3 rounded-lg border border-[var(--border-card)] bg-[var(--bg-surface)] px-3 py-2.5`.
  - El título, en `text-sm font-medium text-[var(--text-primary)] line-clamp-2 select-text`.
  - Debajo, en `text-[10px] text-[var(--text-hint)]`: "{proyecto} · {En curso | Pendiente}", y el `taskCode` si lo tiene.
  - Acciones a la derecha (`ICON_BTN`):
    - `ExternalLink` "Abrir": `setActiveTask(task)` más `setSection('tasks')`, como `SearchModal.tsx:59`;
    - `Replace` "Cambiar la tarea": abre el selector;
    - `X` "Quitar la tarea".
  - Clic en el título: también abre el selector.

El selector es un popover anclado al botón o a la tarjeta, igual que el `ToolSwitcher` de DevTools: `absolute z-30 mt-1.5 w-full min-w-[18rem] max-h-[min(60vh,24rem)] overflow-hidden rounded-lg border border-[var(--border-card)] bg-[var(--bg-elevated)] shadow-xl`, con `role="dialog" aria-label="Elegir una tarea"`. Dentro:
- **Buscador** con el patrón combobox: `input role="combobox" aria-expanded aria-controls="pomodoro-task-list" aria-activedescendant` y la clase del buscador de DevTools, con `Search size={13}`.
  - Placeholder: "Busca por título, código o proyecto".
  - Filtra sin distinguir mayúsculas ni tildes.
- **Lista** `role="listbox"`:
  1. Primera opción fija: "Sin tarea" (`CircleSlash size={13}`), siempre visible, aunque haya búsqueda.
  2. Grupo "En curso" y grupo "Pendientes" (`role="group" aria-labelledby`), con el encabezado de grupo de Opciones (`px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-hint)]`).
  3. Cada opción (`role="option" aria-selected`) va con `px-2.5 py-1.5 rounded-md`:
     - el título en `text-xs text-[var(--text-body)] truncate`;
     - debajo, el proyecto en `text-[10px] text-[var(--text-hint)]`.
     - La activa (teclado o ratón) lleva `bg-[var(--bg-hover)]`; la elegida, `Check size={13}` a la derecha.
  - Orden dentro de cada grupo: primero los que vencen antes, luego los más recientes.
  - Se dibujan 50 como máximo. Si hay más: "Hay {n} más. Escribe para filtrar." en `text-[11px] text-[var(--text-hint)]`.
- **Tareas de cualquier proyecto:** el store solo tiene las del proyecto abierto (`appStore.ts`, `tasks` según `activeProject`). Se leen todas como `storeToolDeps.readAllTasks` (`mcp/storeTools.ts:46`), al abrir el selector. Solo entran `status` `todo` e `in-progress`.
- **Estados del selector:**
  - cargando (más de 150 ms): `Spinner` + "Cargando tareas…";
  - vacío: "No tienes tareas pendientes ni en curso.";
  - sin coincidencias: "Ninguna tarea coincide con «{q}».";
  - error: `StatusItem` de error, "No se pudieron leer las tareas.", con el botón de texto "Reintentar".
- **Teclado:**
  - ↑/↓ mueven la opción activa; Home y End van a los extremos;
  - Enter elige y cierra;
  - Esc cierra sin cambiar (y si hay búsqueda, primero la limpia);
  - Tab cierra y sigue el orden normal.
  - Al cerrar, el foco vuelve al botón o a la tarjeta.
  - Clic fuera cierra.

#### 2.9 Historial de hoy (PM9)

- Encabezado: `<h3 id="pomodoro-today-title" class={PANEL_TITLE}>Hoy</h3>`.
- Resumen: "4 pomodoros · 1 h 40 min de foco" en `text-sm font-medium text-[var(--text-primary)] tabular-nums`. Con uno: "1 pomodoro · 25 min de foco".
- Lista `<ol class="mt-3 divide-y divide-[var(--border)]">`, del más reciente al más antiguo. Cada fila es `grid grid-cols-[auto_auto_1fr] items-baseline gap-3 py-1.5 text-xs`:
  - la hora de fin, `tabular-nums text-[var(--text-secondary)]` (con `Intl` y el idioma de la app, por ejemplo 09:35);
  - la duración, "25 min", en `text-[var(--text-hint)] tabular-nums`;
  - la tarea, `truncate text-[var(--text-body)]` con `title` completo. Sin tarea: "Sin tarea" en `--text-hint`. Si la tarea ya no existe, el título guardado. No es un enlace: abrir la tarea está en la tarjeta de arriba, y una lista de enlaces a tareas viejas suma tab stops sin mucho valor.
- **Vacío:** "Hoy todavía no hay pomodoros terminados." en `text-xs text-[var(--text-hint)]`, centrado, con `Hourglass size={20}` en `--text-hint`.
- **Pie:** "Solo cuentan los bloques de trabajo que llegaron al final. Se guarda solo en este equipo." en `text-[10px] text-[var(--text-hint)]`, con `ShieldCheck size={11}`, como la nota de privacidad de DevTools.
- Al terminar un bloque, la fila nueva aparece arriba sin animación de altura. Si las animaciones están activas, hace un `opacity` de 150 ms.

#### 2.10 Panel en Opciones → Extensiones → Pomodoro

`ExtensionSettingsPage` (`SettingsModal.tsx:233`) ya pinta el ícono, el nombre y la descripción. El panel sigue el de Captura rápida: `space-y-4 text-xs`, y un grid `grid grid-cols-[auto_auto_1fr] items-center gap-x-3 gap-y-2`.

```
Duraciones
  Trabajo          [ 25 ] min
  Descanso corto   [  5 ] min
  Descanso largo   [ 15 ] min
  Descanso largo cada [ 4 ] bloques
  De 1 a 120 minutos; de 2 a 10 bloques.          (hint)
  ⓘ Los cambios se aplican desde la siguiente fase.  (solo con una fase en curso)

Arranque
  (◉) Empezar solos los descansos
  (○) Empezar solo el trabajo después del descanso

Aviso
  (◉) Sonido al terminar          [▶ Probar]
      Dos tonos cortos: bajan al terminar el trabajo y suben al terminar el descanso.
  Las notificaciones del sistema siguen la opción de Opciones → General.

Dónde se ve
  (◉) Mostrar el tiempo en la barra de menús      (Windows y Linux: "en la bandeja del sistema")
      Aunque lo apagues, el menú del ícono sigue con Pausar, Reanudar y Saltar.
  (◉) Mostrar el contador en el menú lateral

[Restablecer valores]   (solo si algo difiere de los valores por defecto)
─────────────────────────────────────────────
Restablecer
  Detiene el temporizador, devuelve estas opciones a los valores por defecto
  y borra el historial de pomodoros de este equipo.
  [↺ Restablecer el Pomodoro]                      (texto rojo)
```

- Los números usan `NumberField` (`w-16`, `tabular-nums`), que ajusta al rango al salir del campo. El `aria-label` es la etiqueta completa ("Trabajo, en minutos").
- Los interruptores usan `Toggle` (`ToggleSwitch size="sm"` dentro de `<label>`).
- Los subtítulos ("Duraciones", "Arranque", "Aviso") van en `text-[var(--text-secondary)] font-medium`, como "Atajo de teclado" en Captura rápida.
- "Probar" es `SECONDARY_CLS` con `Volume2 size={13}`. Toca el sonido de fin de trabajo y se deshabilita con el sonido apagado.
- "Restablecer valores" es `SECONDARY_CLS`. Sin confirmación: son cuatro números y unos interruptores.
- **Dónde se ve (PM15, 31 oct 2026):** dos `Toggle`. El texto del primero depende de la plataforma (`isMac`): en macOS el tiempo va en la barra de menús; en Windows (tooltip) y Linux (etiqueta del AppIndicator), "en la bandeja del sistema".
- **Restablecer (PM16, 31 oct 2026):** separado con `border-t`, con el subtítulo, una línea de ayuda y el botón con `RotateCcw size={13}` en texto `red-400` sobre borde normal, como "Quitar configuración" de Opciones → Extensiones. Abre `ConfirmDeleteModal` (`zIndex={Z_MODAL_NESTED}`, encima de Opciones) con `useConfirmDelete(confirmDestructiveActions)`: con la confirmación global apagada, restablece directo. La confirmación dice qué pasa y qué se borra: "Se detiene el temporizador y vuelve a Listo: bloque 1 de trabajo, sin tarea. Todas las opciones del Pomodoro vuelven a sus valores por defecto y se borra el historial de pomodoros (los últimos 14 días, guardados solo en este equipo). Tus tareas y el daily no cambian." Al terminar, un toast "Pomodoro restablecido." (o el error).

### 3. Contador del menú lateral (PM10)

**Cuándo se ve:** mientras haya una fase corriendo o en pausa (PM10) y, además, en el estado **Terminado**, hasta que se inicie o se salte la siguiente fase (ver decisión D1). En el estado Listo inicial no se ve. Al desactivar la extensión desaparece (PM13). Con "Mostrar el contador en el menú lateral" apagado (PM15) no se ve nunca, y no ocupa sitio.

**Dónde:** abajo, **justo encima de "Opciones"**, tanto expandido como colapsado.
- **Por qué abajo:** el menú crece hacia arriba desde un borde fijo. Nada de lo de arriba se mueve: ni la fila de secciones ni el árbol de proyectos. Solo el área con scroll del medio pierde unos 40 px. "Opciones" y la ruta de la carpeta quedan donde estaban, pegados al pie.
- **Por qué no en la fila de secciones:** sus celdas miden 42 px y, con DevTools y Pomodoro, ya son 6 de unos 33 px a 224 px de ancho. Un tiempo legible no cabe, y meterlo cambiaría la grilla al aparecer.
- Se ve en cualquier sección, también con la vista de Pomodoro abierta: ocultarlo ahí haría que el menú salte al entrar y salir. No lleva `aria-current`.

Lo pinta el **nuevo punto de extensión `SidebarStatus`**, montado con `ExtensionSlot` y `variant="inline"`. Así el código sigue cargándose solo con la extensión activa (R16) y un error queda aislado (R15).

#### 3.1 Menú expandido

Va dentro del pie (`mt-auto border-t … space-y-0.5`, `Sidebar.tsx:1406`), como **primer hijo**, antes del botón de Opciones:

```
┌──────────────────────────────────────┐
│ [◎] Trabajo              18:42   [‖] │  ← h-9
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔───────────────    │  ← barra de 2 px, restante
├──────────────────────────────────────┤
│ ⚙ Opciones                           │
│ ~/Documents/logday                   │
└──────────────────────────────────────┘
```

- Contenedor: `@container/pomocount relative flex h-9 items-center rounded-lg pl-3 pr-1 hover:bg-[var(--bg-hover)]`. Tiene la misma sangría que "Opciones" (`px-3`) para que los íconos queden alineados.
- **Botón principal** (abre la vista): `flex min-w-0 flex-1 items-center gap-2 text-left ${FOCUS_RING} rounded`:
  - el ícono de la fase (`Target`, `Coffee` o `Sofa`, 14 px), con `color: var(--phase-{fase})`; en pausa, `--text-hint`;
  - la etiqueta, `min-w-0 flex-1 truncate text-[var(--text-muted)]`, que se oculta por debajo de `@[11rem]/pomocount`. Dice:
    - corriendo: el nombre de la fase;
    - en pausa: "En pausa";
    - terminado: "{fase siguiente} listo" ("Descanso listo", "Trabajo listo");
  - el tiempo, `font-medium tabular-nums text-[var(--text-secondary)]`; en pausa y en terminado, `--text-hint`.
  - Al hacer clic: `setSection('ext:pomodoro')`. Si se usa el teclado, el foco va al `h2` de la vista.
- **Control de pausa:** `ICON_BTN` de `size-7` (28 px), con `Pause` o `Play` de 13 px.
  - `aria-label`: "Pausar el pomodoro", "Reanudar el pomodoro" o "Iniciar el descanso" / "Iniciar el bloque".
  - No abre la vista: hace `stopPropagation` y es un botón hermano, no anidado.
- **Barra:** `absolute inset-x-3 bottom-1 h-0.5 overflow-hidden rounded-full bg-[var(--phase-track)]`, con un hijo `h-full rounded-full` de ancho igual al % restante y `background: var(--phase-{fase})` (en pausa, `--text-hint`). Es `aria-hidden` y lleva `transition-[width] duration-1000 ease-linear motion-reduce:transition-none`.
- **Ancho:** el menú va de 160 a 420 px (`App.tsx:72`). A 160 px quedan unos 120 px útiles: ícono, tiempo y pausa (unos 80 px), y la etiqueta se oculta. A 224 px cabe "Descanso largo" completo.

#### 3.2 Menú colapsado (48 px)

Va después del `flex-1` y **antes de Buscar** (`Sidebar.tsx:594`): crece hacia arriba desde el grupo de abajo, igual que en el expandido.

```
  ┌──┐
  │◎ │  ← ícono de fase, 12 px
  │18:42│ ← text-[10px] tabular-nums
  │▔▔─│  ← barra 2 px
  ├──┤
  │ ‖ │  ← pausa, 28 px
  └──┘
  [🔍]
  [⚙]
```

- Grupo: `flex w-10 flex-col items-center rounded-lg border border-[var(--border)]`.
- Botón superior (abre la vista): `relative flex h-10 w-full flex-col items-center justify-center gap-0.5 rounded-t-lg hover:bg-[var(--bg-hover)] ${FOCUS_RING}`.
  - Dentro, el ícono de fase de 12 px y el tiempo en `text-[10px] font-medium leading-none tabular-nums text-[var(--text-secondary)]`.
  - `120:00` mide unos 33 px a 10 px y cabe en 40.
  - Abajo, la barra `absolute inset-x-1.5 bottom-1 h-0.5`.
- Botón inferior: pausa o reanudar, `flex h-7 w-full items-center justify-center rounded-b-lg border-t border-[var(--border)] text-[var(--text-hint)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${FOCUS_RING}`, con un ícono de 13 px.
- `title` y `aria-label` completos en los dos, porque no hay etiqueta visible (ver 8).
- **Alto:** el grupo suma 69 px. Ver el hallazgo 11-2: con 600 px de alto, la columna colapsada ya se desborda hoy en Tareas con dos extensiones con vista. Hace falta que la parte del medio tenga scroll.

#### 3.3 Aparición

- Aparece y desaparece sin animar la altura. Con animaciones activas, solo hace `opacity` 0→1 en 150 ms (`motion-reduce:transition-none`, y `.no-animations` ya lo anula).
- Pasar de una fase a otra **no** lo quita ni lo vuelve a poner: cambian el ícono, la etiqueta, el color y el tiempo dentro del mismo nodo, así que el alto no cambia nunca mientras está visible.

#### 3.4 Tarjeta en Inicio (PM17)

`HomeCard.tsx`, con `HomeCardShell` de Inicio (`specs/extensiones` R27) y `homeCard: { order: 10 }` en el registro.

- Cabecera: reloj de arena, "Pomodoro" y "Abrir →" (`aria-label` "Abrir Pomodoro"); con el teclado (`detail` 0) pide el foco para el título de la vista (`requestViewFocus`), como el contador del menú.
- Cuerpo: ícono de la fase con su color (solo gráfico, §5) y el estado (la fase si corre, "En pausa", "Trabajo listo" o "Descanso listo"); el tiempo en `text-2xl font-semibold tabular-nums`, con el texto para lectores de pantalla de la vista (`timeSr`); a la derecha, el botón principal (`togglePhase`). La barra de progreso es la del contador (pista `--phase-track`, gris en pausa).
- "Tarea: {título}" si hay una elegida, y al pie el resumen de hoy ("Hoy: 2 pomodoros · 50 min de foco") o "Aún no has hecho pomodoros hoy.".
- El botón principal tiene la forma tintada del botón de "Hoy" en Inicio, pero con el texto en `--text-primary` y el ícono `text-indigo-400`, por lo mismo que §2.6: `text-indigo-300` no se aclara en sepia.
- Región `sr-only aria-live="polite"` con `live.text` del store; la vista y la tarjeta no se montan a la vez (secciones distintas), así que no se lee dos veces.
- Devuelve `null` si la extensión no está corriendo (`active`) o si `showOnHome` está apagado.

### 4. Bandeja del sistema (PM11)

Como el fin lo vigila Rust (PM5), Rust también actualiza el título y el tooltip. Así siguen al día con la ventana oculta. Los textos llegan traducidos desde el frontend al iniciar la fase, como `quick_capture_configure` pasa `trayLabel` (`quick_capture.rs:178`).

#### 4.1 Título y tooltip

| Plataforma | Corriendo | En pausa | Terminado / Listo |
|---|---|---|---|
| macOS: `tray.set_title` junto al ícono | `18:42` | `‖ 18:42` (U+2016, un glifo de texto, no un emoji) | Sin título (`None`) |
| Windows: `set_tooltip` | `Logday · Trabajo · 18:42` | `Logday · Trabajo en pausa · 18:42` | `Logday` |
| Linux | `set_title` (la etiqueta del AppIndicator, que solo algunos escritorios muestran) y, además, la entrada de estado del menú (4.2) | Igual, con `‖` | Nada |

- **Sin emoji 🍅 en el título** (decisión D3): la barra de menús de macOS es monocroma, el ícono ya dice que es Logday y un emoji de color llama más la atención que cualquier otro elemento de la barra. Solo números, y `‖` para la pausa.
- En Windows y Linux el tooltip cambia cada segundo; en macOS, el título también.
- **Ancho fijo (31 oct 2026, PM11):** la fuente de la barra de menús tiene dígitos proporcionales, y el título movía el ícono cada segundo (a Jorge le distraía). Al crear la bandeja, `use_fixed_digits` pone en el botón la fuente del sistema con dígitos de ancho fijo (`NSFont monospacedDigitSystemFontOfSize:weight:`, regular, del tamaño que tenía); `setTitle:` la conserva. Además, los minutos se rellenan con U+2007 (espacio de cifra) hasta las cifras con que empezó la fase (`minuteDigits`): en una fase de 25 min, `10:00` → ` 9:59` no estrecha el título. Pasar a pausa (`‖ `) sí lo cambia, una vez.
- Sin fase en curso, en macOS se pone un título vacío: tray-icon 0.21 ignora `None` y dejaba el último tiempo.
- Con "Mostrar el tiempo en la barra de menús" apagado (PM15), el frontend manda `showTime: false` y Rust no pone título y deja el tooltip en "Logday". La entrada de estado del menú sigue.
- El tooltip de Windows tiene 128 caracteres como máximo: con el formato de arriba no se llega.

#### 4.2 Menú

Orden actual (`lib.rs:495-508`): Mostrar Logday, [Captura rápida], Nueva nota, Nueva tarea, separador, Salir. El bloque de Pomodoro va **entre "Nueva tarea" y "Salir"**, con su propio separador, para que las acciones de crear sigan juntas y "Salir" siga al final:

```
Mostrar Logday
Captura rápida      ⌘⇧Space
Nueva nota
Nueva tarea
───────────────
Trabajo · 18:42                ← deshabilitado (estado)
Pausar                         ← o Reanudar / Iniciar el descanso / Iniciar el bloque
Saltar
───────────────
Salir
```

| Estado | Entrada de estado (deshabilitada) | Acción 1 | Acción 2 |
|---|---|---|---|
| Corriendo | "Trabajo · 18 min" | "Pausar" | "Saltar" |
| En pausa | "Trabajo · en pausa · 18:42" | "Reanudar" | "Saltar" |
| Terminado | "Descanso corto listo · 5 min" | "Iniciar el descanso" / "Iniciar el bloque" | "Saltar" |
| Listo (inicial) | — | "Iniciar un pomodoro (25 min)" | — |
| Extensión desactivada | Sin bloque ni separador | | |

- **La entrada de estado** es la vía que funciona en las tres plataformas, incluido Linux, donde el tooltip no existe. Con el menú abierto se actualiza con `MenuItem::set_text`, sin rearmar el menú. Corriendo, muestra minutos enteros ("18 min") y cambia una vez por minuto, para no redibujar el menú cada segundo. En pausa, el tiempo exacto.
- El estado "Listo (inicial)" con "Iniciar un pomodoro" es la decisión D2.
- Ningún atajo de teclado en estas entradas (PM: sin atajo global).
- `ids`: `pomodoro_toggle` y `pomodoro_skip`. Actúan sin mostrar la ventana, a diferencia de "Nueva nota".

### 5. Color por fase

**Tokens nuevos**, en `App.css`, junto a `--syntax-*`:

```css
:root {
  --phase-work:  var(--accent);
  --phase-short: #34d399;
  --phase-long:  #38bdf8;
  --phase-track: var(--border);
}
:root[data-theme="light"]         { --phase-short: #047857; --phase-long: #0369a1; }
:root[data-theme="high-contrast"] { --phase-short: #6ee7b7; --phase-long: #7dd3fc; --phase-track: var(--bg-hover); }
:root[data-theme="visual-rest"]   { --phase-short: #7dd3fc; --phase-long: #c4b5fd; }
:root[data-theme="sepia"]         { --phase-work: #9a4f1f; --phase-short: #065f46; --phase-long: #1e40af; }
:root[data-theme="oled"]          { --phase-long: #c4b5fd; }
:root[data-theme="nordic"]        { --phase-short: #a3be8c; --phase-long: #c4a5c1; }
```

Por qué así:
- **Trabajo = el acento del tema.** Es la fase principal, y así sigue al tema y a los personalizados sin tocar nada.
- **Los descansos tienen un tono fijo por tema**, elegido para no parecerse al acento:
  - en descanso visual, el acento es verde, así que el corto va en celeste y el largo en violeta;
  - en OLED, el acento es celeste, así que el largo va en violeta;
  - en nórdico se usan el verde y el púrpura de su propia paleta (nord14 y nord15, este último aclarado).
- **Sepia:** el acento `#b5652f` da 3,5:1 sobre la base, pero solo 2,7 contra el riel. Se oscurece a `#9a4f1f`, del mismo tono.
- **Alto contraste:** el riel `--border` (`#5c5c5c`) es tan claro que el acento solo le saca 2,2:1. Se usa `--bg-hover`.
- **Temas personalizados:** toman `--phase-work` de su acento (es `var()`, que se resuelve con el acento en línea de `applyCustomThemeToDOM`). Los descansos salen de su base, clara u oscura. Si alguien elige un acento verde o celeste, el trabajo se parecerá a un descanso. Por eso el color nunca es lo único que informa.
- Son variables propias: `.theme-tinted` solo repinta clases `*-indigo-*` y no las toca.

**Uso:** los colores de fase solo pintan **gráficos**: el trazo del anillo, la barra, los puntos del ciclo y los íconos de fase. Nunca pintan texto: en claro, el acento como texto da 4,1:1 sobre la base y no llega a 4,5. El texto va siempre en `--text-primary` o `--text-secondary`.

**Sin depender del color:** cada fase tiene su propio **nombre en texto** (chip, menú, bandeja) y su **ícono** (`Target`, `Coffee` o `Sofa`). La pausa se nota por la palabra "En pausa", el ícono `Play` en el botón y `‖` en la bandeja, además del trazo gris.

**Contraste medido** (WCAG 1.4.11, mínimo 3:1 para gráficos). Cada celda da: sobre `--bg-base` (la vista) / sobre `--bg-panel` (el menú) / contra `--phase-track` (el riel).

| Fase | Oscuro | Claro | Alto contraste | Descanso visual | Sepia | OLED | Nórdico |
|---|---|---|---|---|---|---|---|
| Trabajo | 6,3 / 6,2 / 4,8 | 4,1 / 4,5 / 3,5 | 7,0 / 6,8 / 6,2 | 9,9 / 9,2 / 6,1 | 4,9 / 5,4 / 3,7 | 9,8 / 9,2 / 7,1 | 6,2 / 5,7 / 3,7 |
| Descanso corto | 9,7 / 9,6 / 7,5 | 5,0 / 5,5 / 4,3 | 13,8 / 13,4 / 12,1 | 11,1 / 10,3 / 6,8 | 6,3 / 6,9 / 4,7 | 10,9 / 10,3 / 7,9 | 6,1 / 5,6 / 3,6 |
| Descanso largo | 8,7 / 8,6 / 6,7 | 5,4 / 5,9 / 4,7 | 12,6 / 12,2 / 11,0 | 10,0 / 9,3 / 6,2 | 7,2 / 7,8 / 5,4 | 11,4 / 10,7 / 8,2 | 5,6 / 5,2 / 3,3 |
| Pausa (`--text-hint`) | 5,0 / — / 3,8 | 4,4 / — / 3,8 | 9,7 / — / 8,5 | 5,8 / — / 3,6 | 4,8 / — / 3,6 | 5,6 / — / 4,0 | 5,8 / — / 3,5 |

Texto de la vista:

| Par | Oscuro | Claro | Alto contraste | Descanso visual | Sepia | OLED | Nórdico |
|---|---|---|---|---|---|---|---|
| Tiempo, `--text-primary` / `--bg-base` | 16,7 | 18,1 | 21,0 | 16,7 | 13,0 | 17,9 | 10,8 |
| Chip de fase, `--text-secondary` / `--bg-base` | 11,2 | 9,5 | 18,9 | 12,2 | 7,3 | 11,1 | 8,9 |
| `MAIN_BTN`: `--text-primary` sobre el tinte del acento | 13,7 | 15,1 | 18,1 | 12,4 | 10,6 | 14,9 | 8,0 |
| Etiquetas y pistas, `--text-hint` / `--bg-base` | 5,0 | 4,4 ⚠ | 9,7 | 5,8 | 4,8 | 5,6 | 5,8 |

En claro, `--text-hint` da 4,4: igual que en DevTools, va solo en textos secundarios que se repiten en otro lado ("Listo", el resumen de duraciones). Nada con significado va en `--text-faint`.

### 6. Sonido (PM5)

- **Qué es:** dos tonos cortos y suaves (onda senoidal, unos 120 ms cada uno, con 80 ms de silencio entre ellos y fundido de entrada y salida). En total, menos de medio segundo. El volumen es moderado y fijo, y sigue al del sistema.
  - Al terminar el **trabajo**, los tonos **bajan** (por ejemplo, 880 → 660 Hz): toca soltar.
  - Al terminar un **descanso**, **suben** (660 → 880 Hz): toca volver.
  Se distinguen sin mirar la pantalla, y ninguno es una alarma.
- **Cómo se describe en la UI:** "Sonido al terminar", con la ayuda "Dos tonos cortos: bajan al terminar el trabajo y suben al terminar el descanso.", y el botón "Probar".
- **Dónde se apaga:**
  - en Opciones → Pomodoro → "Sonido al terminar" (el ajuste);
  - en el botón de campana del encabezado de la vista (el mismo ajuste, para silenciar en el momento).
  Va activado por defecto (PM5).
- **Sin doble sonido:** si el sonido propio está activo, la notificación del sistema se manda sin sonido, si la plataforma lo permite. Si no, suena el del sistema y el propio se omite. Va en la arquitectura.
- No hay sonido de tic-tac ni avisos a mitad de fase.
- Si las notificaciones globales están apagadas, el sonido sigue sonando. Son dos ajustes distintos y la ayuda del panel lo dice.

### 7. Teclado

**Atajos globales que se respetan** (`App.tsx:111-147`, `SearchModal.tsx:42`): ⌘N, ⌘T, ⌘D, ⌘A y ⌘F, que son configurables y se comparan con `e.key` en minúscula sin mirar Shift, y ⌘⇧Space (captura rápida). Igual que en DevTools, los atajos con modificador de la vista usan **⌘⇧** (Ctrl+Shift en Windows y Linux). Con Shift, `e.key` llega en mayúscula y no choca con ningún global, aunque el usuario los reconfigure.

| Atajo | Acción | Cuándo |
|---|---|---|
| `Espacio` | Iniciar, pausar o reanudar | Solo si el foco no está en un elemento interactivo (`input`, `textarea`, `button`, `[role=radio]`, `[role=combobox]`, `[role=option]`, `contenteditable`). Si el foco está en el botón principal, Espacio lo pulsa, con el mismo resultado. |
| `⌘⇧→` | Saltar a la fase siguiente | Siempre en la vista, fuera de los campos |
| `⌘⇧←` | Reiniciar la fase | Corriendo o en pausa |
| `⌘⇧T` | Abrir el selector de tarea | |
| `Esc` | Cerrar el selector de tarea | Con el selector abierto |

- El listener va en la raíz de la vista (`onKeyDown`), no en `window`: solo actúa con la vista montada, así que no choca con los de DevTools, que viven en la suya. Si `e.defaultPrevented`, no hace nada.
- Espacio sin modificador cumple WCAG 2.1.4 porque solo actúa con el foco dentro de la vista.
- "Reiniciar el ciclo" no tiene atajo: es raro y pone el contador en cero.
- Se muestran en el `title` de cada botón ("Saltar (⌘⇧→)"). En Windows y Linux, "Ctrl+Shift+→", con `isMacPlatform()` (`quick-capture/model.ts:129`).
- **Al abrir la vista** desde la fila de secciones o el contador, con el teclado, el foco va al `h2` (`tabIndex=-1`), como `useFocusOnOpen` de DevTools. Así Espacio funciona enseguida. Con el ratón, el foco no se mueve.
- **Orden de foco:**
  1. sonido;
  2. Opciones;
  3. "Reiniciar el ciclo" (en la fila de ciclo, desde el 31 oct 2026);
  4. botón principal;
  5. Saltar;
  6. Reiniciar la fase;
  7. tarea (elegir, o abrir, cambiar y quitar);
  8. la lista de "Hoy" (no tiene elementos con foco).
- **Foco visible** en todo: `FOCUS_RING` (`focus-visible:ring-2 ring-indigo-500`), que `.theme-tinted` repinta con el acento.
- **Menú lateral:** el contador son dos botones normales en el orden de tabulación, justo antes de Opciones. En el colapsado, antes de Buscar.

### 8. Accesibilidad

**El tiempo, sin leer cada segundo:**
```html
<div role="timer" aria-labelledby="pomodoro-phase" aria-describedby="pomodoro-state">
  <span aria-hidden="true">18:42</span>
  <span class="sr-only">18 minutos y 42 segundos</span>
</div>
```
- `role="timer"` tiene `aria-live="off"` implícito: no se anuncia solo. El lector lo lee cuando el usuario llega a él, con el nombre de la fase ("Trabajo") y el estado ("En pausa desde las 14:05").
- El texto `sr-only` evita que "18:42" se lea como una hora del día.

**Una sola región viva** por vista: `<div class="sr-only" aria-live="polite" aria-atomic="true">`. Solo dice:
- al iniciar: "Trabajo iniciado: 25 minutos.";
- al pausar: "En pausa. Quedan 18 minutos."; al reanudar: "Reanudado. Quedan 18 minutos.";
- en dos hitos, solo si la fase dura más que eso: "Quedan 5 minutos." y "Queda 1 minuto.";
- al terminar: el mismo texto que la notificación ("Terminó el pomodoro. Toca un descanso de 5 minutos.");
- al saltar, al reiniciar y al cambiar de tarea: "Saltaste al descanso corto.", "Fase reiniciada.", "Ciclo reiniciado. Bloque 1 de 4.", "Tarea: Informe Q3.".

Nada más: ni cada minuto ni cada segundo. La región vive en la vista. Fuera de la vista, el aviso del fin es la notificación del sistema.

**El contador del menú** no tiene región viva: está en todas las secciones y no debe hablar sobre el trabajo del usuario.
- El botón principal lleva un `aria-label` que se recalcula con el estado: "Trabajo, quedan 18 minutos. Abrir Pomodoro." Se redondea a minutos para que no cambie cada segundo mientras está enfocado; algunos lectores releen el nombre cuando cambia.
- El de pausa: "Pausar el pomodoro".

**Roles:**
- la vista es `<section aria-labelledby="pomodoro-title">`;
- "Hoy" es una `<section>` con `<h3>` y `<ol>`;
- el anillo, la barra y los puntos son `aria-hidden` (el texto ya lo dice todo);
- el botón de sonido usa `aria-pressed`;
- el selector de tarea usa el patrón combobox completo (2.8);
- los interruptores de Opciones son `ToggleSwitch` (`role="switch"`) dentro de `<label>`.

**Movimiento:**
- El anillo y la barra se mueven con `transition` lineal de 1 s, para que el avance se vea continuo. Con `prefers-reduced-motion` (`motion-reduce:transition-none`) o con `.no-animations` saltan una vez por segundo, sin interpolar.
- No hay parpadeo ni pulso en ningún estado, tampoco al terminar. Lo que llama la atención es la línea de estado, la notificación y el sonido, no algo que se mueva.
- El contador entra con `opacity`, nunca con altura (3.3).

**WCAG 2.2.2 (contenido que se actualiza solo):** el tiempo solo corre cuando el usuario lo inicia, y siempre se puede pausar, desde la vista, desde el menú y desde la bandeja.

**Objetivos:** 28 px o más (`size-7`). Es Desktop, así que no aplica la regla táctil de 44 px.

**Zoom y letra grande:** los cortes son container queries en rem, así que con `--app-font-size` grande el layout pasa antes a una columna. El anillo baja a `13rem` y el tiempo a `text-5xl`.

### 9. Textos

Se interpola con `{x}` y `.replace()`. Siempre con tú, nunca con voseo. "Toca un descanso" es el impersonal de PM5 ("es hora de"), no un imperativo.

#### 9.1 `extensions` (R20)

```ts
// es
'pomodoro.name': 'Pomodoro',
'pomodoro.description': 'Trabaja por bloques de 25 minutos con descansos, si quieres ligados a una tarea. Un contador en el menú lateral y en la bandeja te dice cuánto queda.',
// en
'pomodoro.name': 'Pomodoro',
'pomodoro.description': 'Work in 25-minute blocks with breaks, tied to a task if you like. A counter in the sidebar and the tray shows how much time is left.',
```

No lleva `pomodoro.consent`: no envía nada (PM14) y la tarjeta no lo muestra.

#### 9.2 Sección `pomodoro`

```ts
// ─── es ───
pomodoro: {
  title: 'Pomodoro',
  // Fases y estados
  phaseWork: 'Trabajo',
  phaseShort: 'Descanso corto',
  phaseLong: 'Descanso largo',
  readyWork: 'Trabajo listo',
  readyBreak: 'Descanso listo',
  stateReady: 'Listo',
  statePaused: 'En pausa',
  pausedSince: 'En pausa desde las {time}',
  pausedSinceYesterday: 'En pausa desde ayer a las {time}',
  pausedSinceDate: 'En pausa desde el {date}',
  timeSr: '{m} minutos y {s} segundos',
  // Controles
  startWork: 'Iniciar el bloque',
  startBreak: 'Iniciar el descanso',
  pause: 'Pausar',
  resume: 'Reanudar',
  skip: 'Saltar',
  skipWorkTitle: 'Saltar al descanso (este bloque no cuenta)',
  skipBreakTitle: 'Saltar el descanso',
  restartPhase: 'Reiniciar la fase',
  restartCycle: 'Reiniciar el ciclo',
  restartCycleTitle: 'Volver al primer bloque de trabajo. El historial no se borra.',
  // Ciclo
  cycle: 'Bloque {n} de {total}',
  cycleDone: 'Bloque {n} de {total} hecho',
  cycleLongNext: 'Después de este bloque toca el descanso largo',
  // Estado tras un fin
  endedWork: 'Terminó el pomodoro. Toca un descanso de {min} min.',
  endedWorkLong: 'Terminó el pomodoro. Toca un descanso largo de {min} min.',
  endedBreak: 'Terminó el descanso. Cuando quieras, empieza el siguiente bloque.',
  autoStartedBreak: 'Empezó el descanso de {min} min.',
  autoStartedWork: 'Empezó el siguiente bloque de {min} min.',
  endedWhileClosed: 'Terminó a las {time}, con Logday cerrado.',
  // Encabezado
  summary: '{work} · {short} · {long} min · largo cada {n}',
  options: 'Opciones',
  optionsTitle: 'Abrir las opciones del pomodoro',
  sound: 'Sonido al terminar',
  soundOnTitle: 'Sonido activado',
  soundOffTitle: 'Sonido desactivado',
  // Tarea
  taskLabel: 'Tarea',
  taskChoose: 'Elegir una tarea',
  taskHint: 'Opcional. El pomodoro no escribe en la tarea.',
  taskNone: 'Sin tarea',
  taskOpen: 'Abrir',
  taskOpenTitle: 'Abrir «{title}»',
  taskChange: 'Cambiar la tarea',
  taskClear: 'Quitar la tarea',
  taskPickerLabel: 'Elegir una tarea',
  taskSearch: 'Busca por título, código o proyecto',
  taskGroupInProgress: 'En curso',
  taskGroupTodo: 'Pendientes',
  taskStatusInProgress: 'En curso',
  taskStatusTodo: 'Pendiente',
  taskLoading: 'Cargando tareas…',
  taskEmpty: 'No tienes tareas pendientes ni en curso.',
  taskNoMatch: 'Ninguna tarea coincide con «{q}».',
  taskMore: 'Hay {n} más. Escribe para filtrar.',
  taskError: 'No se pudieron leer las tareas.',
  retry: 'Reintentar',
  taskDeleted: 'Esta tarea ya no existe. El bloque se guarda con su título.',
  taskCompleted: 'Completada',
  taskCompletedHint: 'La completaste durante el bloque. Este bloque cuenta para ella y el siguiente empieza sin tarea.',
  // Hoy
  todayTitle: 'Hoy',
  todaySummary: '{n} pomodoros · {focus} de foco',
  todaySummaryOne: '1 pomodoro · {focus} de foco',
  focusMin: '{m} min',
  focusHours: '{h} h {m} min',
  focusHoursExact: '{h} h',
  historyEmpty: 'Hoy todavía no hay pomodoros terminados.',
  historyNote: 'Solo cuentan los bloques de trabajo que llegaron al final. Se guarda solo en este equipo.',
  historyMinutes: '{m} min',
  // Opciones
  setDurations: 'Duraciones',
  setWork: 'Trabajo',
  setShort: 'Descanso corto',
  setLong: 'Descanso largo',
  setLongEvery: 'Descanso largo cada',
  setUnitMin: 'min',
  setUnitBlocks: 'bloques',
  setWorkAria: 'Trabajo, en minutos',
  setShortAria: 'Descanso corto, en minutos',
  setLongAria: 'Descanso largo, en minutos',
  setLongEveryAria: 'Bloques de trabajo antes del descanso largo',
  setRange: 'De 1 a 120 minutos; de 2 a 10 bloques.',
  setAppliesNext: 'Los cambios se aplican desde la siguiente fase.',
  setStart: 'Arranque',
  setAutoBreaks: 'Empezar solos los descansos',
  setAutoWork: 'Empezar solo el trabajo después del descanso',
  setAlert: 'Aviso',
  setSound: 'Sonido al terminar',
  setSoundDesc: 'Dos tonos cortos: bajan al terminar el trabajo y suben al terminar el descanso.',
  setSoundTest: 'Probar',
  setNotifHint: 'Las notificaciones del sistema siguen la opción de Opciones → General.',
  setReset: 'Restablecer valores',
  // Dónde se ve (PM15)
  setShowIn: 'Dónde se ve',
  setTrayTimeMac: 'Mostrar el tiempo en la barra de menús',
  setTrayTime: 'Mostrar el tiempo en la bandeja del sistema',
  setTrayTimeHint: 'Aunque lo apagues, el menú del ícono sigue con Pausar, Reanudar y Saltar.',
  setSidebarCounter: 'Mostrar el contador en el menú lateral',
  // Restablecer (PM16)
  setResetSection: 'Restablecer',
  setResetAllDesc: 'Detiene el temporizador, devuelve estas opciones a los valores por defecto y borra el historial de pomodoros de este equipo.',
  setResetAll: 'Restablecer el Pomodoro',
  resetTitle: '¿Restablecer el Pomodoro?',
  resetMessage: 'Se detiene el temporizador y vuelve a Listo: bloque 1 de trabajo, sin tarea. Todas las opciones del Pomodoro vuelven a sus valores por defecto y se borra el historial de pomodoros (los últimos 14 días, guardados solo en este equipo). Tus tareas y el daily no cambian.',
  resetConfirm: 'Restablecer',
  resetCancel: 'Cancelar',
  resetDone: 'Pomodoro restablecido.',
  resetError: 'No se pudo restablecer el Pomodoro.',
  // Menú lateral
  sidebarOpen: '{phase}, quedan {min} min. Abrir Pomodoro.',
  sidebarOpenLessThanMin: '{phase}, queda menos de 1 min. Abrir Pomodoro.',
  sidebarOpenPaused: '{phase} en pausa, quedan {time}. Abrir Pomodoro.',
  sidebarOpenReady: '{phase} listo. Abrir Pomodoro.',
  sidebarPause: 'Pausar el pomodoro',
  sidebarResume: 'Reanudar el pomodoro',
  sidebarStartBreak: 'Iniciar el descanso',
  sidebarStartWork: 'Iniciar el bloque',
  // Bandeja
  trayTooltip: 'Logday · {phase} · {time}',
  trayTooltipPaused: 'Logday · {phase} en pausa · {time}',
  trayStatus: '{phase} · {min} min',
  trayStatusLessThanMin: '{phase} · menos de 1 min',
  trayStatusPaused: '{phase} · en pausa · {time}',
  trayStatusReady: '{phase} listo · {min} min',
  trayPause: 'Pausar',
  trayResume: 'Reanudar',
  trayStartBreak: 'Iniciar el descanso',
  trayStartWork: 'Iniciar el bloque',
  traySkip: 'Saltar',
  trayStartIdle: 'Iniciar un pomodoro ({min} min)',
  // Notificaciones (PM5)
  notifWorkTitle: 'Terminó el pomodoro',
  notifWorkBody: 'Toca un descanso de {min} min.',
  notifWorkBodyLong: 'Toca un descanso largo de {min} min.',
  notifWorkBodyAuto: 'Ya empezó un descanso de {min} min.',
  notifWorkBodyLongAuto: 'Ya empezó un descanso largo de {min} min.',
  notifTaskPrefix: '{task}. ',
  notifBreakTitle: 'Terminó el descanso',
  notifBreakBody: 'Cuando quieras, empieza el siguiente bloque de {min} min.',
  notifBreakBodyAuto: 'Ya empezó el siguiente bloque de {min} min.',
  // Región viva
  liveStarted: '{phase} iniciado: {min} minutos.',
  livePaused: 'En pausa. Quedan {min} minutos.',
  liveResumed: 'Reanudado. Quedan {min} minutos.',
  liveFiveLeft: 'Quedan 5 minutos.',
  liveOneLeft: 'Queda 1 minuto.',
  liveSkipped: 'Saltaste a {phase}.',
  liveRestartPhase: 'Fase reiniciada.',
  liveRestartCycle: 'Ciclo reiniciado. Bloque 1 de {total}.',
  liveTask: 'Tarea: {title}.',
  liveTaskCleared: 'Sin tarea.',
},
```

```ts
// ─── en ───
pomodoro: {
  title: 'Pomodoro',
  phaseWork: 'Focus',
  phaseShort: 'Short break',
  phaseLong: 'Long break',
  readyWork: 'Focus ready',
  readyBreak: 'Break ready',
  stateReady: 'Ready',
  statePaused: 'Paused',
  pausedSince: 'Paused since {time}',
  pausedSinceYesterday: 'Paused since yesterday at {time}',
  pausedSinceDate: 'Paused since {date}',
  timeSr: '{m} minutes {s} seconds',
  startWork: 'Start block',
  startBreak: 'Start break',
  pause: 'Pause',
  resume: 'Resume',
  skip: 'Skip',
  skipWorkTitle: 'Skip to break (this block won’t count)',
  skipBreakTitle: 'Skip break',
  restartPhase: 'Restart phase',
  restartCycle: 'Restart cycle',
  restartCycleTitle: 'Go back to the first focus block. History isn’t deleted.',
  cycle: 'Block {n} of {total}',
  cycleDone: 'Block {n} of {total} done',
  cycleLongNext: 'A long break comes after this block',
  endedWork: 'Pomodoro done. Time for a {min}-min break.',
  endedWorkLong: 'Pomodoro done. Time for a {min}-min long break.',
  endedBreak: 'Break’s over. Start the next block when you’re ready.',
  autoStartedBreak: 'Your {min}-min break has started.',
  autoStartedWork: 'The next {min}-min block has started.',
  endedWhileClosed: 'It ended at {time} while Logday was closed.',
  summary: '{work} · {short} · {long} min · long every {n}',
  options: 'Settings',
  optionsTitle: 'Open Pomodoro settings',
  sound: 'Sound when done',
  soundOnTitle: 'Sound on',
  soundOffTitle: 'Sound off',
  taskLabel: 'Task',
  taskChoose: 'Choose a task',
  taskHint: 'Optional. The pomodoro doesn’t change the task.',
  taskNone: 'No task',
  taskOpen: 'Open',
  taskOpenTitle: 'Open “{title}”',
  taskChange: 'Change task',
  taskClear: 'Remove task',
  taskPickerLabel: 'Choose a task',
  taskSearch: 'Search by title, code or project',
  taskGroupInProgress: 'In progress',
  taskGroupTodo: 'To do',
  taskStatusInProgress: 'In progress',
  taskStatusTodo: 'To do',
  taskLoading: 'Loading tasks…',
  taskEmpty: 'You have no to-do or in-progress tasks.',
  taskNoMatch: 'No task matches “{q}”.',
  taskMore: '{n} more. Type to filter.',
  taskError: 'Couldn’t read your tasks.',
  retry: 'Retry',
  taskDeleted: 'This task no longer exists. The block keeps its title.',
  taskCompleted: 'Done',
  taskCompletedHint: 'You completed it during the block. This block counts for it, and the next one starts with no task.',
  todayTitle: 'Today',
  todaySummary: '{n} pomodoros · {focus} of focus',
  todaySummaryOne: '1 pomodoro · {focus} of focus',
  focusMin: '{m} min',
  focusHours: '{h} h {m} min',
  focusHoursExact: '{h} h',
  historyEmpty: 'No pomodoros finished today yet.',
  historyNote: 'Only focus blocks that ran to the end count. Stored on this computer only.',
  historyMinutes: '{m} min',
  setDurations: 'Durations',
  setWork: 'Focus',
  setShort: 'Short break',
  setLong: 'Long break',
  setLongEvery: 'Long break every',
  setUnitMin: 'min',
  setUnitBlocks: 'blocks',
  setWorkAria: 'Focus, in minutes',
  setShortAria: 'Short break, in minutes',
  setLongAria: 'Long break, in minutes',
  setLongEveryAria: 'Focus blocks before the long break',
  setRange: '1 to 120 minutes; 2 to 10 blocks.',
  setAppliesNext: 'Changes apply from the next phase.',
  setStart: 'Starting',
  setAutoBreaks: 'Start breaks automatically',
  setAutoWork: 'Start focus automatically after a break',
  setAlert: 'Alert',
  setSound: 'Sound when done',
  setSoundDesc: 'Two short tones: falling when focus ends, rising when a break ends.',
  setSoundTest: 'Play',
  setNotifHint: 'System notifications follow the setting in Settings → General.',
  setReset: 'Reset to defaults',
  setShowIn: 'Where it shows',
  setTrayTimeMac: 'Show the time in the menu bar',
  setTrayTime: 'Show the time in the system tray',
  setTrayTimeHint: 'Even when it’s off, the icon’s menu still has Pause, Resume and Skip.',
  setSidebarCounter: 'Show the counter in the sidebar',
  setResetSection: 'Reset',
  setResetAllDesc: 'Stops the timer, sets these options back to their defaults and deletes the pomodoro history on this computer.',
  setResetAll: 'Reset Pomodoro',
  resetTitle: 'Reset Pomodoro?',
  resetMessage: 'The timer stops and goes back to Ready: focus block 1, with no task. All Pomodoro options go back to their defaults and the pomodoro history is deleted (the last 14 days, stored only on this computer). Your tasks and daily don’t change.',
  resetConfirm: 'Reset',
  resetCancel: 'Cancel',
  resetDone: 'Pomodoro reset.',
  resetError: 'Couldn’t reset Pomodoro.',
  sidebarOpen: '{phase}, {min} min left. Open Pomodoro.',
  sidebarOpenLessThanMin: '{phase}, less than 1 min left. Open Pomodoro.',
  sidebarOpenPaused: '{phase} paused, {time} left. Open Pomodoro.',
  sidebarOpenReady: '{phase} ready. Open Pomodoro.',
  sidebarPause: 'Pause pomodoro',
  sidebarResume: 'Resume pomodoro',
  sidebarStartBreak: 'Start break',
  sidebarStartWork: 'Start block',
  trayTooltip: 'Logday · {phase} · {time}',
  trayTooltipPaused: 'Logday · {phase} paused · {time}',
  trayStatus: '{phase} · {min} min',
  trayStatusLessThanMin: '{phase} · under 1 min',
  trayStatusPaused: '{phase} · paused · {time}',
  trayStatusReady: '{phase} ready · {min} min',
  trayPause: 'Pause',
  trayResume: 'Resume',
  trayStartBreak: 'Start break',
  trayStartWork: 'Start block',
  traySkip: 'Skip',
  trayStartIdle: 'Start a pomodoro ({min} min)',
  notifWorkTitle: 'Pomodoro done',
  notifWorkBody: 'Time for a {min}-min break.',
  notifWorkBodyLong: 'Time for a {min}-min long break.',
  notifWorkBodyAuto: 'Your {min}-min break has started.',
  notifWorkBodyLongAuto: 'Your {min}-min long break has started.',
  notifTaskPrefix: '{task}. ',
  notifBreakTitle: 'Break’s over',
  notifBreakBody: 'Start the next {min}-min block when you’re ready.',
  notifBreakBodyAuto: 'The next {min}-min block has started.',
  liveStarted: '{phase} started: {min} minutes.',
  livePaused: 'Paused. {min} minutes left.',
  liveResumed: 'Resumed. {min} minutes left.',
  liveFiveLeft: '5 minutes left.',
  liveOneLeft: '1 minute left.',
  liveSkipped: 'Skipped to {phase}.',
  liveRestartPhase: 'Phase restarted.',
  liveRestartCycle: 'Cycle restarted. Block 1 of {total}.',
  liveTask: 'Task: {title}.',
  liveTaskCleared: 'No task.',
},
```

Notas para traducir y armar:
- En inglés, la fase de trabajo es **"Focus"**: "Work" se confunde con "trabajo" como sustantivo en "Work ready".
- Los textos de **la bandeja y las notificaciones** se pasan a Rust ya armados y en el idioma activo al iniciar cada fase. Rust solo reemplaza `{time}` y `{min}` cada segundo o cada minuto. Si el idioma cambia con una fase en curso, se vuelven a mandar.
- `{phase}` en minúscula dentro de frases ("Saltaste a {phase}"): se usa `phaseShort.toLowerCase()` en español. En inglés queda igual.
- En la notificación con tarea, el título de la tarea va recortado a 60 caracteres con "…". Los títulos de las notificaciones son más cortos que 40 caracteres en los dos idiomas.
- Plurales: solo "pomodoro" y "minuto" cambian. Se resuelven con las claves `*One` y con los hitos fijos.

### 10. Casos borde

- **Pausa larga** (horas o días): el tiempo queda fijo para siempre (PM12). La línea "En pausa desde…" dice cuánto lleva: con hora, con "ayer" o con fecha. Al reanudar no se pregunta nada. El contador del menú sigue visible mientras dure la pausa; por eso el D1 no lo deja vivo "para siempre" en otros estados.
- **Fin con la app cerrada o el equipo suspendido** (PM4):
  - la fase se da por terminada **una vez**;
  - si el fin pasó hace menos de 5 minutos, se avisa normal (notificación y sonido);
  - si pasó hace más, no se notifica ni suena (un aviso de una hora atrás confunde) y la vista muestra "Terminó a las 10:25, con Logday cerrado.";
  - en los dos casos, un bloque de trabajo **cuenta** en el historial, con su hora de fin real;
  - **la siguiente fase nunca arranca sola al recuperar**, aunque las opciones de arranque estén activas: queda Terminada. Así no se encadenan fases fantasma mientras el equipo dormía.
  Ver D5.
- **Cambio de día con una fase en curso:**
  - el bloque cuenta para el día en que **termina** (un bloque de 23:50 a 00:15 es de mañana);
  - "Hoy" se recalcula a medianoche aunque la vista esté abierta;
  - el ciclo (2 de 4) **no** se reinicia solo con una fase corriendo o en pausa;
  - si al abrir Logday o al cruzar la medianoche no hay nada corriendo ni en pausa, el ciclo vuelve a "Bloque 1" (D6).
- **Tarea borrada a mitad de bloque:** la tarjeta muestra el título guardado, `TriangleAlert size={12} text-amber-400` y "Esta tarea ya no existe. El bloque se guarda con su título." "Abrir" se deshabilita. Al terminar, el historial guarda el título y el proyecto, que se copian al elegir la tarea. Para el bloque siguiente queda "Sin tarea".
- **Tarea completada a mitad de bloque:** el bloque sigue y cuenta para ella. La tarjeta suma el chip "Completada" (`CHIP` de DevTools) y la ayuda. Al empezar el siguiente bloque, la selección pasa a "Sin tarea" (D7).
- **Cambiar de tarea a mitad de bloque** (PM6, "durante"): se permite sin preguntar. El bloque se anota a la tarea elegida **al terminar** (D8).
- **La tarea cambia de título o de proyecto:** la tarjeta lee el dato actual por `id`; el historial conserva lo que había al terminar.
- **Opciones cambiadas a mitad de fase:** la fase en curso mantiene su instante de fin. Lo nuevo se aplica desde la siguiente (aviso en el panel).
  - Si se baja "Descanso largo cada" por debajo del bloque actual (por ejemplo, de 4 a 2 estando en el 3), el descanso que viene es el largo y el ciclo vuelve a empezar después.
- **Saltar un bloque de trabajo:** no cuenta (PM9) y lo dice el `title` del botón. Sin confirmación: con ratón es un clic explícito, y el atajo lleva ⌘⇧.
- **Desactivar la extensión a mitad de fase** (PM13): se para sin preguntar y el bloque en curso no cuenta. El contador y el bloque de la bandeja desaparecen; el historial y las opciones quedan.
- **Varias ventanas:** solo existe la principal (la de Captura rápida no muestra el contador). Si Logday se abre dos veces, la segunda instancia no aplica.
- **Notificaciones globales apagadas:** no hay notificación, pero el sonido, la línea de estado y la bandeja funcionan igual.
- **Notificaciones sin permiso del sistema:** lo mismo. No se insiste en pedir el permiso desde la extensión: lo pide `useEventNotifier` al arrancar.
- **Duraciones extremas:**
  - con 120 min, `120:00` cabe en el colapsado (unos 33 de 40 px) y en el título de macOS;
  - con 1 min, no hay hito de 5 minutos y el de 1 minuto no se anuncia (la fase no dura más que eso).
- **Idioma:** las cadenas en inglés son más cortas. En español, la etiqueta más larga del contador es "Descanso largo" (unos 80 px a 12 px), que cabe desde 200 px de menú.
- **Temas personalizados con acento verde o celeste:** trabajo y descanso se parecen en color. El nombre y el ícono los separan (ver 5).

### 11. Hallazgos en el código actual que afectan a Pomodoro

**Importantes:**
1. **No hay punto de extensión para el menú lateral.** `ExtensionPoint` (`src/extensions/types.ts`) solo tiene `Settings`, `View`, `dailyActions` y los de bloque. PM10 necesita uno nuevo, `SidebarStatus` (`{ collapsed: boolean }`), y que `Sidebar.tsx` lo monte en el pie (expandido, antes de la línea 1407) y antes de Buscar (colapsado, línea 595), para cada extensión activa que lo tenga. Hace falta un metadato en el registro, por ejemplo `sidebarStatus: true`, para no cargar el módulo solo para saberlo (R16).
2. **El menú colapsado se desborda con 600 px de alto.**
   - Dónde: `Sidebar.tsx:507`, `flex h-full w-12 flex-col … gap-2` sin `overflow`.
   - Por qué importa: en la sección Tareas, con DevTools y Pomodoro activas, la columna mide unos 645 px sin el contador (13 botones de 34 px, 4 separadoras, 18 huecos de 8 px y el padding) y unos 714 px con él. Hoy, solo con DevTools, ya roza los 600.
   - Propuesta: envolver de "Panel" a las vistas de Tareas en `flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto`, y dejar fijos el contador, Buscar y Opciones.
3. **El menú de la bandeja está en español fijo.**
   - Dónde: `lib.rs:495-503` ("Mostrar Logday", "Nueva nota", "Nueva tarea", "Salir").
   - Por qué importa: en inglés quedarían "Pause"/"Skip" junto a "Nueva nota".
   - Propuesta: que el frontend mande todas las etiquetas al arrancar y al cambiar de idioma, como ya hace Captura rápida con `trayLabel`.
4. **El tooltip de la bandeja no existe en Linux, y el título no existe en Windows.** Así funcionan `tray-icon`/Tauri 2: `set_tooltip` no hace nada en Linux, y `set_title` no hace nada en Windows y en Linux depende del escritorio. Por eso el diseño suma la entrada de estado en el menú (4.2), que funciona en las tres plataformas. PM11 dice "tooltip en Windows y Linux": en Linux no se va a ver.
5. **El store solo tiene las tareas del proyecto abierto** (`tasks` según `activeProject`). El selector necesita leer todas, como `readAllTasks` de `mcp/storeTools.ts:46`. Conviene moverlo a `lib/` para no importar de otra extensión.
6. **No hay forma de abrir Opciones en la página de una extensión.** Existe `openSettingsGitTab` y `openSettingsSyncTab` (`appStore.ts:4182`, `4293`), pero no `openExtensionSettings(id)`. El botón "Opciones" de la vista lo necesita.

**Menores:**
7. **La ayuda de las notificaciones globales solo habla del calendario**: `notificationsEnabledDesc` (`i18n.ts:100`) dice "antes de tus eventos de calendario". Propuesta: "Envía alertas del sistema: recordatorios de eventos y avisos de extensiones como Pomodoro." (en: "Sends system alerts: event reminders and alerts from extensions such as Pomodoro.").
8. **`NumberField`, `Toggle` y `Segmented` viven en `devtools/ui/controls.tsx`**, y `SECONDARY_CLS` está copiado en 6 extensiones. Pomodoro los necesita. Propuesta: moverlos a `components/shared/` (y las clases, a un `shared/classes.ts`). Si no, se copian otra vez.
9. **Siguen abiertos los hallazgos de DevTools 9.1-2 y 9.1-3** (texto blanco de `PRIMARY_CLS` y `text-indigo-400` en sepia). Pomodoro los esquiva con `MAIN_BTN` y sin texto en el color de fase, pero siguen afectando al menú y a Opciones.
10. **`ToastViewport` sigue sin `aria-live`** (DevTools 9.1-5). Pomodoro no usa toasts para nada importante, a propósito: todo lo que hay que oír pasa por su región viva.
11. **En la fila de secciones**, con 4 fijas, DevTools y Pomodoro son 6 columnas: el límite antes de pasar a otra fila (`Sidebar.tsx:661`). A 160 px de menú quedan unos 23 px por celda: los íconos de 14 px caben, la etiqueta no. Una séptima extensión con vista abre una segunda fila, como ya está previsto.

### 12. Decisiones para Jorge

| # | Decisión | Recomendación |
|---|---|---|
| D1 | ¿El contador del menú sigue visible tras el fin de una fase, mientras la siguiente espera a que la inicies? PM10 dice "en curso o en pausa". | **Sí**, en estado Terminado, con "Descanso listo" y el botón de iniciar. Si desaparece justo al terminar, el menú salta en el momento en que más se mira, y se pierde el acceso rápido a "Iniciar el descanso". Desaparece al saltar, al reiniciar el ciclo o al desactivar. |
| D2 | ¿La bandeja ofrece "Iniciar un pomodoro" sin nada en curso? PM11 dice "sin fase en curso, no se muestra nada". | **Sí, solo esa entrada** (sin estado ni título). Arrancar desde la bandeja sin abrir la ventana es el uso más común. El título y el tooltip sí quedan vacíos, como dice PM11. |
| D3 | ¿Emoji 🍅 en el título de macOS? | **No.** Solo números, y `‖` en pausa. La barra de menús es monocroma y el ícono ya identifica a Logday. |
| D4 | ¿El título de macOS cambia cada segundo (`18:42`) o cada minuto (`18 min`)? | **Cada segundo**, como pide PM11 y como hace cualquier pomodoro. El costo es que el título baila 1 o 2 px por los dígitos proporcionales. Si molesta, se cambia a minutos sin tocar nada más. *Resuelto el 31 oct 2026:* molestaba; sigue cada segundo, pero con dígitos de ancho fijo (§4.1). |
| D5 | Fin con la app cerrada: ¿cuenta el bloque y se avisa? | **Cuenta siempre. Se avisa solo si el fin fue hace menos de 5 min**; si no, solo la línea en la vista. La siguiente fase nunca arranca sola al recuperar. |
| D6 | ¿El ciclo (2 de 4) se reinicia al cambiar de día? | **Sí, si no hay nada corriendo ni en pausa** al abrir Logday o al cruzar la medianoche. Un descanso largo que toca a primera hora por los bloques de ayer no tiene sentido. |
| D7 | Tarea completada a mitad de bloque: ¿el siguiente bloque sigue con ella? | **No, pasa a "Sin tarea"**, con la ayuda en la tarjeta. Seguir sumando bloques a una tarea hecha ensucia el historial. El selector solo ofrece pendientes y en curso. |
| D8 | Cambio de tarea a mitad de bloque: ¿a cuál se anota el bloque? | **A la que esté elegida al terminar.** Quien cambia la tarea suele estar corrigiendo la elección. Es lo más simple de explicar y de implementar. |
| D9 | ¿Las opciones en la vista o en Opciones? | **En Opciones (`settings: true`)**, con un atajo y el botón de sonido en la vista (1.1). |
| D10 | Nombre de la fase de trabajo en inglés. | **"Focus"**: "Work ready" o "Work, 18 min left" se leen raro. |
