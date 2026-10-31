# Navegación entre secciones — Design

Estado: en progreso.

## Arquitectura

- **Una sola lista de secciones.** Un hook `useSectionItems()` (en `src/components/sidebar/sections.ts` o similar) devuelve las secciones en el orden del usuario. Cada una es `{ id, Icon, label, shortcut?, hidden }`: las 4 fijas más las de `useExtensionSectionItems()`. De esa lista salen:
  - la Barra de íconos;
  - la Lista con nombres;
  - el menú colapsado;
  - "Más";
  - los atajos ⌘1…⌘9;
  - los comandos "Ir a…" de Buscar;
  - la lista de Opciones.

  Desaparece la columna de íconos escrita a mano en `Sidebar.tsx` (NS4).
- **El orden y la visibilidad**, puros y probados (`sectionOrder.ts`): `resolveSections(saved, available)` devuelve el orden efectivo según NS7:
  - ignora los ids que ya no existen;
  - agrega al final, visibles, los que no estaban;
  - conserva el lugar de una extensión desactivada.

  También define `moveSection`, `toggleSectionHidden` y `shortcutFor(index)`.
- **Componente `SectionNav`** (`src/components/sidebar/SectionNav.tsx`), con `variant: 'icons' | 'list'` y `collapsed`. Hace el roving tabindex, `aria-current`, el clic derecho (NS10), "Más" y el cálculo de lo que cabe con `ResizeObserver` (NS12). Se retiran `LABEL_FIT_MARGIN_PX`, `LABEL_NEIGHBOUR_OVERFLOW_PX` y la medición de etiquetas de la fila.
- **Config local** (`AppConfig`, como `sidebarLabelsVisible`; no se sincroniza):
  - `sidebarStyle?: 'icons' | 'list'` (por defecto `'icons'`);
  - `sidebarSections?: { id: string; hidden?: boolean }[]` (sin guardar, el orden por defecto).

  Su lectura y migración siguen el patrón de `sidebarLabelsVisible` en `appStore.ts`. `sidebarLabelsVisible` se deja de leer y de escribir (NS5).
- **Atajos:** en el mismo `keydown` global de `App.tsx`, con ⌘/Ctrl + `0`…`9` (por `e.key`) y antes de los atajos de letras.
  - Funcionan dentro de los campos: ⌘1 en un input no hace nada en WebKit.
  - El editor de atajos de Opciones no debería aceptar un dígito como atajo.
- **Buscar:** `SearchModal.tsx` suma un grupo "Ir a" arriba de los resultados, con las secciones cuyo nombre contiene lo escrito (sin acentos ni mayúsculas). Elegir una llama `setSection` y cierra Buscar.
- **Ancho:**
  - el ancho redimensionable (`logday_sidebar_w`, `App.tsx`) es el del menú entero en los dos estilos. Así la lista y el detalle no cambian de tamaño al cambiar de estilo.
  - En la Barra de íconos, el panel mide el ancho menos 44 px, y el mínimo pasa de 160 a 204 px (panel ≥ 160). Un ancho guardado más chico se sube al mínimo al leerlo, sin reescribirlo.
- **R11** (`specs/extensiones/requirements.md`) se reescribe: las extensiones con vista van en el menú de secciones, en el orden del usuario (NS7) y, si no caben, en "Más".

## Interfaz

Se basa en el análisis del agente `logday-design` (31 oct 2026), sobre `Sidebar.tsx`, `ExtensionSections.tsx`, `SettingsModal.tsx:143-190` (barra de Opciones), `ThemeTile.tsx`, `GeneralSettingsTab.tsx:461-481`, `controlClasses.ts` y `App.css`. Lo marcado como **nuevo** no existe hoy.

### 1. Barra de íconos

```
+----+---------------------+
| Lg | Tareas      [+] [<] |   título = sección activa; [<] colapsar
|----|---------------------|
|[D] | VISTAS              |
|[T]*|  Lista              |   * activo: bg-indigo-500/15 text-indigo-400
|[N] | PROYECTOS           |     y una barra de 2 px a la izquierda
|[E] |  inbox              |
|----|  ...                |   separadora entre las fijas y las extensiones
|[W] |                     |
|[P] |                     |
|[⋯] |                     |   "Más", solo si hace falta
|    |---------------------|
|    | 12:34 Pomodoro      |   SidebarStatus (R26)
|[F] | ~/Logday            |   ruta de la carpeta
|[S] |                     |   F = Buscar, S = Opciones (con el punto de actualización)
+----+---------------------+
 44px  panel
```

- **Columna:** `w-11 shrink-0 border-r border-[var(--border)] bg-[var(--bg-panel)]`, `flex-col items-center gap-1 py-2`.
  - Arriba, el logo (Inicio): el SVG que hoy usa el colapsado, en un botón de 36×36.
  - Debajo, las secciones, con una separadora `my-1 h-px w-6 bg-[var(--border)]` entre las fijas y las de extensiones, igual que hoy en el colapsado. Si el usuario las mezcla al reordenar, la separadora no se dibuja.
  - Abajo, fijos, Buscar y Opciones.
- **Botón:** `h-9 w-9 rounded-lg`, ícono de 18 px.
  - Inactivo: `text-[var(--text-hint)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]`.
  - Activo: `bg-indigo-500/15 text-indigo-400` y una barra `absolute left-0 h-5 w-0.5 rounded-r bg-[var(--accent)]` pegada al borde de la columna.
  - Más `FOCUS_RING`.
- **Panel:**
  - Cabecera: `flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5`, con el título `text-sm font-medium text-[var(--text-primary)] truncate` y, a la derecha, el botón de colapsar (`PanelLeftClose` de 14 px, con `aria-label`).
  - Debajo, el contenido de la sección, igual que hoy.
  - Al pie, `SidebarStatusSlots` y la ruta de la carpeta. El botón "Opciones" con texto del pie actual se va, porque Opciones queda en la columna.
- **Colapsado:** solo la columna (`w-12`, como hoy).
  - Con Tareas activa, sus 3 vistas van debajo de las secciones, tras una separadora.
  - `SidebarStatusSlots collapsed` va encima de Buscar.
  - La parte de las secciones tiene scroll propio (como hoy) y, si hay "Más", lo que no cabe va ahí.

### 2. Lista con nombres (predeterminada desde el 31 oct 2026)

```
+--------------------------+
| logday            [F][<] |   cabecera de hoy
|--------------------------|
| [I] Inicio               |
| [D] Dailys               |
| [T] Tareas            ←  |   activo
| [N] Notas                |
| [E] Horas extra          |
| ------------------------ |
| [W] DevTools             |
| [P] Pomodoro             |
| [⋯] Más (2)              |
|--------------------------|
| VISTAS / PROYECTOS ...   |   panel de la sección
|--------------------------|
| 12:34 Pomodoro           |
| [S] Opciones             |   pie de hoy
| ~/Logday                 |
+--------------------------+
```

- **Filas:** como `navItem` de `SettingsModal.tsx`: `flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs`, ícono de 14 px.
  - Activa: `bg-indigo-500/15 text-indigo-400 font-medium`.
  - Inactiva: `text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]`.
  - El atajo va a la derecha, solo al pasar el puntero o con el foco: `ml-auto text-[10px] text-[var(--text-hint)]`.
- **Contenedor:** `px-2 py-2 border-b border-[var(--border)] space-y-0.5`, con un alto máximo del 40 % del menú (NS12).
- **Colapsado:** el mismo de la Barra de íconos.

### 3. "Más"

- **Botón:** ícono `MoreHorizontal`. En la Lista lleva el texto "Más (n)".
  - `aria-haspopup="menu"`, `aria-expanded`;
  - `aria-label` "Más secciones" o, si la activa está dentro, "Más secciones: <nombre>";
  - si la activa está dentro, se ve como activo (NS13).
- **Menú:** al lado del botón (a la derecha en la columna, debajo en la Lista).
  - Clases: `rounded-xl border border-[var(--border-card)] bg-[var(--bg-elevated)] p-1 shadow-xl min-w-44`.
  - Ítems `role="menuitem"` con ícono, nombre y atajo; la activa, con `aria-current` y el estilo activo.
  - Al final, una separadora y "Ordenar secciones…", que abre Opciones → Navegación.
  - Se cierra con Esc, con un clic fuera o al elegir.

### 4. Tooltip propio (Barra de íconos y colapsado)

- Es **nuevo**: un `role="tooltip"` enlazado con `aria-describedby`, a la derecha del botón.
  - Clases: `rounded-md bg-[var(--bg-elevated)] border border-[var(--border-card)] px-2 py-1 text-[11px] text-[var(--text-primary)] shadow-lg`.
  - Contenido: el nombre y, en `text-[var(--text-hint)]`, el atajo.
- Aparece a los 300 ms con el puntero, enseguida con el foco del teclado, y se va con Esc o al salir.
- Reemplaza al `title` nativo en esos botones.

### 5. Clic derecho sobre una sección

Usa el menú contextual que ya existe en `Sidebar.tsx` (el de proyectos y vistas), con "Quitar del menú" o "Fijar en el menú", "Mover arriba" y "Mover abajo". Las que no aplican, como subir la primera, van deshabilitadas. Inicio no tiene menú.

### 6. Opciones → Navegación

Una entrada propia (NS21), con `PanelLeft`, segunda del grupo App (`SettingsModal.tsx`, `NavigationSettingsTab.tsx`). En orden: el menú lateral (6.1 y 6.2, en `SidebarSettings.tsx`), la pantalla de inicio (su selector, con el estado de abierto y el cierre con Esc o un clic fuera dentro de la misma sección), la vista de notas y la vista de tareas al abrir (6.3). "Ordenar secciones…" abre esta pestaña, que empieza por el menú lateral: no hace falta desplazarse hasta él.

El menú lateral reemplaza la tarjeta "Textos del menú lateral".

**6.1 Estilo de las secciones:** dos tarjetas en `grid grid-cols-2 gap-3`, en `SidebarStylePicker.tsx` (con la animación al elegir), para que la bienvenida use el mismo selector.

- **Semántica:** `<fieldset>` con `<legend>` e `<input type="radio" class="sr-only">` dentro de cada `<label>`, para tener las flechas, el anuncio de lectores y el foco nativos. `ThemeTile` es un `<button>`: se copia su estilo, no su semántica.
- **Tarjeta:** `rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] p-3`.
  - Hover: `hover:border-[var(--border-high)]`.
  - Seleccionada: `border-indigo-500/60 bg-indigo-500/10` y el punto indicador de `ThemeTile`.
  - Foco: `has-[:focus-visible]:ring-2 ring-indigo-500`.
- **Miniatura** (**nueva**, `SidebarStylePreview.tsx`): unos 160×96 px, en SVG o HTML en línea, con `aria-hidden="true"`.
  - Colores: el marco en `--bg-base` con borde `--border`, el menú en `--bg-panel`, las líneas de contenido en `--bg-hover` y el activo en `--accent`.
  - Barra de íconos: una columna de 6 cuadritos, uno resaltado, y el panel con líneas.
  - Lista: 5 filas con un cuadrito y una línea de texto cada una, y el panel debajo.
- **Animación** (`@keyframes` en `App.css`, bucle de unos 3 s, solo `transform` y `opacity`):
  - el resaltado baja de sección en sección y las líneas del panel se desvanecen y vuelven, como si cambiara de sección;
  - en la Barra de íconos, además, aparece un tooltip chico junto al cuadrito resaltado.
  - Corre solo con `:hover` o `:focus-within` de la tarjeta, y una vez (una iteración) al elegirla.
  - Con `prefers-reduced-motion: reduce` o `.no-animations`: `animation: none` y el fotograma final.

**6.2 Secciones del menú:** debajo de las tarjetas, `rounded-xl border border-[var(--border-card)] bg-[var(--bg-surface)] divide-y divide-[var(--border)]`. Una fila por sección, de unos 36 px, con:

- el asa (`GripVertical`, `cursor-grab`);
- el ícono y el nombre;
- `ml-auto`, los botones "Mover arriba" y "Mover abajo" (`ChevronUp` y `ChevronDown` de 14 px, con `aria-label`; deshabilitados en los bordes);
- un `Toggle` de `components/shared/FormControls.tsx` para "Mostrar en el menú".

Al pie, "Restablecer orden" con `SECONDARY_CLS`. Se arrastra con eventos de puntero (sin librería nueva) y, al soltar, se anuncia la posición en una región `aria-live`.

**6.3 Vistas al abrir:** la vista de notas (Lista, Árbol) y la de tareas (Lista, Kanban, Calendario) usan el mismo control: botones en fila (`flex gap-2`), con el elegido en `border-indigo-500/60 bg-indigo-500/10` y `aria-pressed`. Los nombres de las vistas de tareas son los del menú lateral.

- `tasksViewDefault?: 'list' | 'kanban' | 'calendar'` en `AppConfig`, local. Al leer la config, `initialTasksView` (`src/lib/viewDefaults.ts`) da la preferencia y la vista con que abre Tareas (`currentView`); un valor desconocido es la Lista.
- `setTasksViewDefault` guarda la preferencia y cambia la vista actual; `setView` no la toca (NS22).

### 7. Textos (es / en)

| Clave | es | en |
|---|---|---|
| estilo | Estilo de las secciones | Section style |
| icons | Barra de íconos | Icon bar |
| iconsDesc | Los íconos van en una columna a la izquierda; el nombre aparece al pasar el puntero. | Icons sit in a column on the left; the name shows on hover. |
| list | Lista con nombres | List with names |
| listDesc | Cada sección muestra su ícono y su nombre. | Each section shows its icon and name. |
| sections | Secciones del menú | Sidebar sections |
| sectionsDesc | Arrastra para ordenar. Las que ocultes siguen en Más. | Drag to reorder. Hidden ones stay under More. |
| show | Mostrar en el menú | Show in sidebar |
| moveUp / moveDown | Mover arriba / Mover abajo | Move up / Move down |
| remove / pin | Quitar del menú / Fijar en el menú | Remove from sidebar / Pin to sidebar |
| reset | Restablecer orden | Reset order |
| more | Más | More |
| moreLabel | Más secciones | More sections |
| moreActive | Más secciones: {name} | More sections: {name} |
| orderEllipsis | Ordenar secciones… | Arrange sections… |
| nav | Secciones | Sections |
| collapse | Ocultar el menú | Hide sidebar |
| home | Inicio | Home |
| goTo | Ir a {name} | Go to {name} |
| moved | {name}, posición {n} de {total} | {name}, position {n} of {total} |
| settings.tabNavigation | Navegación | Navigation |
| settings.goToSectionRow | Ir a una sección | Go to a section |
| settings.tasksViewDefault | Vista de tareas al abrir | Tasks view on open |
| settings.tasksViewDefaultHint | Con qué vista abre Tareas al iniciar Logday. Cambiar de vista mientras usas la app no la modifica. | The view Tasks opens with when Logday starts. Switching views while you use the app doesn’t change it. |

"Horas extra" ya existe como `overtime_long`.

### 8. Casos borde

- Las 4 fijas ocultas: el menú muestra Inicio y "Más".
- La sección activa es una extensión que se desactiva: se va a Inicio (R13 ya lo hace al cargar; aquí también en caliente, como hoy).
- Ventana de 800×600 con 10 secciones: en la Barra de íconos caben unas 9 y el resto va a "Más". El colapsado, igual.
- Idioma inglés: los nombres son más largos, y en la Lista se cortan con `truncate`.
- 7 temas y los personalizados: solo tokens, salvo el acento indigo.
