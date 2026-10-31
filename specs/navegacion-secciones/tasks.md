# Navegación entre secciones — Tasks

Estado: en progreso.

## Hecho (rama `feature/navegacion-secciones`)

### Lógica pura (`src/components/sidebar/sectionOrder.ts`)

- [x] `resolveSections`, `mergeSections`, `moveSection` (con `among`), `moveSectionTo` y `setSectionHidden` (NS7, NS9-NS11).
- [x] Atajos: `shortcutOrder`, `shortcutFor`, `sectionForDigit`, `sectionForShortcut` y `shortcutLabel` (⌘ en macOS, Ctrl en Windows y Linux) (NS15).
- [x] Lo que cabe: `splitSections`, `iconCapacity` (botones de 36 px y 4 px entre ellos), `listCapacity` (40 % del alto) y `separatorIndex` (NS12).
- [x] `nextRovingIndex` (NS14), `matchesSectionQuery` sin acentos (NS19), `parseSidebarStyle`, `parseSidebarSections` y `clampSidebarWidth`.
- [x] Pruebas (`sectionOrder.test.ts`): orden por defecto, ids que ya no existen, extensiones nuevas, desactivadas y reactivadas, mover, ocultar, atajos, capacidad, separadora, teclado, Buscar, migración y ancho.

### Config y store

- [x] `sidebarStyle` y `sidebarSections` en `AppConfig` y el store, con `setSidebarStyle` y `setSidebarSections` (`undefined` restablece). Locales, no se sincronizan.
- [x] Migración (NS5): sin estilo guardado, la Barra de íconos. `sidebarLabelsVisible` ya no se lee ni se escribe: queda en el tipo por las configs viejas y desaparece de `config.json` al siguiente guardado (`persistConfig` arma la config entera).
- [x] `openSidebarSettings` y `sidebarSettingsRequest`: "Ordenar secciones…" abre Opciones → Navegación (NS21), sin desplazarse: la pestaña empieza por el menú lateral.

### Menú lateral

- [x] `useSectionItems()` y `useSectionActions()` (`sections.tsx`): una sola lista con las 4 fijas y las extensiones con vista, con nombre, ícono, atajo y si está oculta. Horas extra con su nombre largo (NS8).
- [x] `SectionNav` (`variant: 'icons' | 'list'`, `collapsed`): `<nav aria-label="Secciones">`, roving tabindex con flechas, Inicio y Fin, `aria-current="page"`, `FOCUS_RING`, "Más" según lo que cabe (`ResizeObserver`) y separadora entre fijas y extensiones si no están mezcladas.
- [x] `SectionMenus.tsx`: tooltip propio (300 ms con el puntero, enseguida con el foco del teclado, Esc), menú "Más" con el patrón `menu` y clic derecho (NS10, NS13, NS16, NS18).
- [x] `Sidebar.tsx`: la Barra de íconos (columna de 44 px con Inicio, secciones, Buscar y Opciones; panel con el título de la sección), la Lista (cabecera de siempre y filas con nombre) y el colapsado, que es la columna en los dos estilos, con las vistas de Tareas debajo. Se quitaron la fila, la medición de etiquetas y la columna escrita a mano (`CollapsedExtensionSections`).
- [x] Botón de ocultar con nombre accesible ("Ocultar el menú"); el de mostrarlo, "Mostrar el menú" (NS17).
- [x] Ancho (`App.tsx`): el del menú entero en los dos estilos; con la Barra de íconos el mínimo pasa de 160 a 204 px y un ancho guardado más chico se sube al leerlo, sin reescribirlo.

### Atajos y Buscar

- [x] ⌘0…⌘9 en el `keydown` global de `App.tsx`, antes de los de letras y también dentro de los campos; sin Alt ni Mayúsculas (⌘⌥1 es de los títulos del editor).
- [x] El editor de atajos de Opciones no acepta un dígito: sigue esperando otra tecla.
- [x] Buscar: grupo "Ir a" arriba de los resultados (`SearchGoToSections.tsx`), con Inicio y las secciones que están en "Más".

### Opciones → Navegación → Menú lateral (`SidebarSettings.tsx`)

- [x] Selector de estilo (`SidebarStylePicker.tsx`, aparte para reusarlo en la bienvenida): `<fieldset>` con dos tarjetas y radios nativos, miniaturas en HTML con los tokens del tema (`SidebarStylePreview.tsx`) y la animación de unos 3 s en `App.css` (`.sbp-*`): al pasar el puntero, con el foco del teclado y una vez al elegirla. Con `prefers-reduced-motion` o `.no-animations`, el fotograma final.
- [x] "Secciones del menú": asa para arrastrar (eventos de puntero), "Mover arriba" y "Mover abajo", "Mostrar en el menú" y "Restablecer orden", con los cambios anunciados en una región `aria-live`.
- [x] Se quitó la tarjeta "Textos del menú lateral" y sus textos.

### Opciones → Navegación (NS21, NS22)

- [x] Entrada "Navegación" con `PanelLeft`, segunda del grupo App (`appTabs` en `SettingsModal.tsx`), y `NavigationSettingsTab.tsx` con el menú lateral, la pantalla de inicio (salió de General, con su selector y el cierre con Esc dentro de la sección), la vista de notas (salió de Preferencias) y la vista de tareas al abrir.
- [x] General queda con Idioma, Tema y Tipografía. Se quitaron `SIDEBAR_SETTINGS_ID`, el `setTimeout` y el `scrollIntoView` de "Ordenar secciones…".
- [x] `tasksViewDefault` en `AppConfig` y el store, con `setTasksViewDefault`; `initialTasksView` (`src/lib/viewDefaults.ts`) da la vista con que abre Tareas. Local, no se sincroniza.
- [x] Atajos: fila de solo lectura "Ir a una sección" con ⌘0…⌘9 (Ctrl fuera de macOS).
- [x] NS8: la opción de la pantalla de inicio y `sidebar.overtime` dicen "Horas extra" en vez de "Extras".
- [x] Pruebas: `NavigationSettingsTab.test.tsx` (orden de la pestaña, General y Preferencias sin lo que salió, la vista de tareas, la fila de Atajos, la paridad de `settings`) y `viewDefaults.test.ts` (lectura de la config y la vista con que abre Tareas).

### Textos y specs

- [x] Sección `sectionNav` en `i18n.ts`, con las mismas claves en es y en.
- [x] R11 reescrito en `specs/extensiones/requirements.md`; R26 y el design de extensiones, al día.

### Pruebas de los componentes (`SectionNav.test.tsx`)

- [x] Con `react-dom/server`, como el resto del repo: los dos estilos, el colapsado (también el `Sidebar` entero), "Más" (ocultas, lo que no cabe, la activa dentro, las 4 fijas ocultas), un solo tab stop y `aria-current`, el orden del usuario y la separadora, inglés, Opciones, "Ir a…" y la paridad de textos.

### Prueba en el navegador (31 oct 2026, Tauri simulado)

- [x] 800×600 con las 6 secciones, en los dos estilos y en el colapsado; sepia e inglés.
- [x] Lo que no cabe pasa a "Más" al bajar el alto, y "Más" se ve activo con la sección activa dentro.
- [x] Teclado: flechas, Fin, Enter, un solo tab stop, anillo de foco; "Más" se cierra con Esc y devuelve el foco.
- [x] Tooltip con nombre y atajo; ⌘0…⌘6; clic derecho (quitar y fijar); "Ir a…" en Buscar; selector con la animación; "Mover arriba" con su anuncio.
- [x] Arreglado en la prueba:
  - el tooltip quedaba flotando si su botón pasaba a "Más" o "Más" desaparecía;
  - Enter en Buscar no hacía nada: ahora va a la primera sección de "Ir a" (Buscar no tenía selección con teclado).

## Pendiente

- [ ] Arrastrar en Opciones (no se pudo probar con la automatización; mover con los botones sí).
- [ ] Probar en la app de QA (WebKit real de Tauri) y en Windows y Linux, donde los atajos son Ctrl+0…9.
- [ ] Con más de 6 secciones de verdad (hoy solo hay 2 extensiones con vista).
- [ ] Probar Opciones → Navegación en el navegador: "Ordenar secciones…" abre la pestaña, Esc cierra el selector de la pantalla de inicio sin cerrar Opciones, y Tareas abre en la vista elegida al reiniciar.

## Diferencias con el diseño

- **Atajos de las ocultas.** NS11 dice que una oculta sigue "con su atajo" y NS15 que las ocultas no cuentan. Se numeran en el orden de lectura del menú: primero las visibles (también las que no caben y van a "Más") y después las ocultas. Así las ocultas tienen atajo, pero no corren el número de las visibles. Ocultar una sección cambia el número de las que vienen después.
- **Cabecera del panel.** En la Barra de íconos lleva el título y el botón de ocultar. Las acciones de cada sección (por ejemplo "+" de Proyectos) siguen donde estaban, dentro del contenido, en vez de subir a la cabecera.
- **Clic derecho.** "Quitar del menú" o "Fijar en el menú" depende de si está oculta: una que está en "Más" solo porque no cabe ofrece "Quitar del menú". "Mover arriba" y "Mover abajo" mueven entre las de su misma visibilidad (las visibles entre sí y las ocultas entre sí), para que se note en el menú; en Opciones mueven en el orden completo.
- **Ícono de Inicio.** El logo en la columna de la Barra de íconos y en la cabecera de la Lista; en la fila "Inicio" de la Lista, en Buscar y en "Más", una casa (`House`).
- **Tooltip propio** solo en las secciones, Inicio y "Más". Buscar, Opciones y "Mostrar el menú" siguen con el `title` nativo y un `aria-label`.
- **"Mostrar en el menú"** usa `Toggle` con un sufijo solo para lectores de pantalla ("Mostrar en el menú: Tareas"), para que los interruptores de la lista no se llamen igual (`srSuffix`, nuevo en `FormControls.tsx`).
- **Lo que cabe** se calcula con los tamaños fijos de los botones y las filas, no midiendo cada uno, y la separadora se descuenta si las visibles la tendrían.
- **Una lista guardada parcial** pone primero las guardadas (NS7 al pie de la letra). La app siempre guarda la lista entera, así que solo pasa si se edita `config.json` a mano.
- Los atajos ⌘0…⌘9 también funcionan con Opciones o Buscar abiertos: cambian la sección de detrás.
