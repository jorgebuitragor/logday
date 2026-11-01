# DevTools — Tasks

Estado: en progreso.

- [x] Registro (`registry.ts`, `types.ts`), nombre, descripción y aviso en es/en (D0, R20).
- [x] Funciones puras con pruebas (`tools/*.ts`, `tools.test.ts`, `tools2.test.ts`, `tools3.test.ts`) (D1–D5, D13–D16).
- [x] Modelo: herramientas, grupos, preferencias, memoria y bloques de las notas (`model.ts`) (D9, D10).
- [x] Notas: leer todas, guardar la salida y abrir la nota (`notes.ts`) (D10).
- [x] Vista: navegación (columna de 200 px y selector en ventana angosta), `ToolFrame`, estados, atajos y las 20 herramientas (`View.tsx`, `ui/`, `views/`), cada una cargada al abrirla.
- [x] "Guardar en una nota", "Traer de una nota" (modal con trampa de foco) y "Vaciar todas las herramientas" (D10, D9).
- [x] Textos de la sección `devtools` de `i18n.ts`, es y en, con las mismas claves (D7).
- [x] Guardar como PNG/SVG y copiar el SVG en QR y barras (D15, D16).
- [x] Correcciones de tema: colores de estado en sepia y tokens `--syntax-*` (hallazgos 9.1-1 y 4).
- [x] Prueba de humo de cada herramienta con `react-dom/server` (`views.test.tsx`).
- [ ] Probar en el navegador (build de producción con Tauri simulado): todas las herramientas, temas claro, oscuro y sepia, ventana angosta y teclado.

## Opciones y grupos plegables (D17–D24, design Adenda G)

Rama `feature/devtools-opciones`, sobre `feature/ayuda-contextual`.

- [x] Modelo: `DevtoolsSettings` con `layout`, `groupOrder`, `toolOrder`, `hidden` y `collapsed`; `readDevtoolsSettings` los valida; `resolveToolList` y las funciones de mover, ocultar y plegar, puras (`model.ts`) (D18–D21, D24, §G.4).
- [x] Pruebas del modelo: lo guardado hasta hoy se lee igual que antes; ids desconocidos, repetidos y de otro grupo se descartan; herramientas y grupos nuevos van al final, visibles y desplegados; no se pueden ocultar todas; el A-Z ordena por el nombre del idioma.
- [x] `ToolNav`: encabezados plegables con chevron a la derecha, contador y sr-only; la activa se ve en un grupo plegado; la búsqueda filtra sin tener en cuenta los plegados; grupo "Ocultas"; modo A-Z; roving con encabezados (Enter, Espacio, ← y →) (D20, D21, §G.2).
- [x] Botón de opciones junto al buscador, en la columna y en el selector de la ventana angosta (D17, §G.1).
- [x] ⌥⌘↓/↑ con `resolveToolList(...).order` en `View.tsx`, con las de los grupos plegados y sin las ocultas (D22).
- [x] `Settings.tsx`, `settings: true` en `registry.ts` y `Settings` en `index.ts`: modo de lista, orden y visibilidad por grupo, Restablecer orden y Restablecer las opciones de las herramientas (D17–D20, D23, §G.3).
- [x] `useRowDrag` en `src/components/shared/` (sacado de `SidebarSettings`) y arrastre de grupos y herramientas en la página; `SidebarSettings` pasa a usarlo sin cambiar lo que hace (§G.3).
- [x] Foco al mover: flechas con `aria-disabled` en lugar de `disabled`, en la página de DevTools y en `SidebarSettings.tsx` (§G.3).
- [x] Textos de §G.7 en es y en (`set.*`, `group.hidden`, `groupCount*`, `help.p6`) y `help.p5` cambiado; `help.p6` en `GENERAL_HELP` (`ui/Help.tsx`) (D7).
- [x] Actualizar la tabla de textos de DevTools en `specs/ayuda-contextual/design.md` (`help.p5` cambiado y `help.p6` nuevo) y las pruebas de la ayuda que cuenten sus párrafos.
- [x] Pruebas de vista (`views.test.tsx`): encabezados con `aria-expanded`, la activa visible en un grupo plegado, "Ocultas" al buscar, el A-Z y la página de Opciones.
- [x] Probar en el navegador (build de producción con Tauri simulado): plegar en la columna y en el selector, ordenar con ratón y teclado, ocultar, A-Z, ⌥⌘↓/↑, foco al mover a un extremo (también en Opciones → Navegación), y temas claro, oscuro, sepia, alto contraste y uno tintado. Probado el 31 oct 2026 con Tauri simulado: plegar Codificar (se guarda), la página de Opciones desde el botón del buscador, ocultar XML, bajar YAML (con anuncio y el foco en el botón), modo A-Z, y buscar «xml», que la muestra en «Ocultas» y Enter la abre. Falta: arrastrar con el ratón, ⌥⌘↓/↑ y la app de QA.

### Diferencias con el diseño

- **Pruebas:** las del modelo van en `settings.test.ts`. Las de la vista (`views.test.tsx`) dibujan con `react-dom/server`, que no deja escribir en el buscador: lo que la lista muestra al buscar se prueba con `navBlocks()` (`ui/ToolNav.tsx`), la función pura que arma los bloques (grupos, "Ocultas", plegados) y que usa `ToolNav`.
- **Contexto:** `DevtoolsContext` suma `updateSettings(make)` (arma el parche con lo guardado en ese momento, como `setOptions`, que ahora lo usa) y `openSettings()` (cierra el selector y llama a `openExtensionSettings`). Así `ToolNav` pliega y abre Opciones sin leer el store, y la columna y el selector comparten el estado.
- **Contador sr-only** (", 4 herramientas"): va en los encabezados que son botón. Mientras se busca, el encabezado vuelve a ser texto, como hoy, sin contador.
- **`useRowDrag(selector, onDrop)`:** `onDrop(id, to)` recibe el id de la fila y su destino; devuelve `listRef`, `gripProps(index, id)` y `rowClass(index, id)` (atenuada la arrastrada y la raya del acento en la de destino). En la página, el arrastre de grupos marca la tarjeta entera.
- **Foco al mover:** la clase compartida `SOFT_DISABLED` (`controlClasses.ts`) suma `aria-disabled:hover:text-[var(--text-hint)]` a las tres del diseño, porque `ICON_BTN` aclara el texto al pasar el ratón.
- **Página en A-Z:** las tarjetas siguen el orden de grupos del usuario, y la ayuda `set.azHint` se ve bajo el modo y bajo "Orden y visibilidad", como dice §G.3.


## Cliente HTTP en DevTools (D25, specs/cliente-http PR 2)

Rama `feature/cliente-http-devtools`, desde `develop` (con `feature/devtools-opciones` ya dentro).

- [x] `model.ts`: el grupo `network` y la herramienta `http` al final de `TOOL_GROUPS`; `availableTools`/`availableToolsIn`, y las funciones de la lista con las disponibles (design §G.4); `LANGUAGE_TOOL.http` y `OUTPUT_LANGUAGE.http`; `onClearDrafts` y `clearToolDrafts`.
- [x] La columna, el selector, el buscador, ⌥⌘↓/↑, `lastTool`, "Traer de una nota", la ayuda y Opciones → DevTools trabajan con `availableTools` (D25).
- [x] El pie de la lista con `privacyNoteWithHttp` mientras está Cliente HTTP (D11).
- [x] `views/HttpTool.tsx` (la herramienta: specs/cliente-http Interfaz §3).
- [x] Pruebas: `settings.test.ts` (con y sin Cliente HTTP), `httpTool.test.tsx` y la ayuda (`HelpPopover.test.tsx`).
- [x] ~~Prueba en el navegador: DevTools con y sin Cliente HTTP activa.~~ Ya no aplica: la herramienta se quitó (ver abajo).

## Quitar Cliente HTTP de DevTools (31 oct 2026, specs/cliente-http HT33)

Rama `feature/http-pantalla-propia`, desde `develop`. Pedido por Jorge: el Cliente HTTP tiene su propia pantalla, y DevTools vuelve a como estaba antes del PR 2.

- [x] `model.ts`, `View.tsx`, `Settings.tsx`, `ui/Help.tsx`, `ui/NotePicker.tsx`, `ui/ToolFrame.tsx`, `ui/ToolNav.tsx`, `ui/context.ts` y `ui/meta.ts` vuelven a su versión de antes del PR 2: sin el grupo `network`, la herramienta `http`, `availableTools`, `availableToolsIn`, `HTTP_CLIENT_ID`, `fallbackTool`, `onClearDrafts`, `clearToolDrafts`, el prop `notice` de `ToolFrame` ni `withHttp` en los atajos de la ayuda.
- [x] Se queda lo que no era del Cliente HTTP: `saveOutputAsNote` con `formatFence` (la cerca se alarga sola). `readAllNotes` pasa a `lib/allNotes.ts`, que también usa el Cliente HTTP; `notes.ts` la reexporta.
- [x] Textos: fuera `privacyNoteWithHttp`, `group.network`, `http.name`, `http.desc`, `http.placeholder`, `http.keywords`, `http.help1`–`3`, `help.k.runHttp` y `help.k.tabsHttp` (es y en). D11 restaurado y D25 retirado en `requirements.md`.
- [x] Pruebas: lo guardado con `lastTool: 'http'`, `network` y `http` en el orden, las ocultas y los plegados se lee sin romper y se ignora (`settings.test.ts`); la vista y Opciones → DevTools, sin Red con Cliente HTTP activa (`views.test.tsx`); la ayuda vuelve a sus 8 herramientas (`HelpPopover.test.tsx`).
- [ ] Prueba en el navegador: DevTools con Cliente HTTP activa no muestra Red; una config vieja con `lastTool: 'http'` abre JSON.

## Visor HTML (D26, design Adenda H)

Rama `feature/devtools-html`, desde `develop`.

- [x] Tokenizador compartido (`src/lib/htmlTokenizer.ts`) y documento aislado (`src/lib/htmlPreviewDoc.ts`: `previewCsp`, `sanitizePreviewHtml`, `buildPreviewDoc`), puros.
- [x] `HtmlPreview` en `src/components/shared/`, con `sandbox=""`, `srcdoc` y el ancho simulado escalado; listo para el Cliente HTTP (paquete B de su rediseño).
- [x] `tools/htmlFormat.ts`: `formatHtml`, `minifyHtml` y `checkHtml`.
- [x] Registro: `html-preview` en `model.ts` (al final de Formatos; ```` ```html ```` y `<!DOCTYPE html` van al visor), `ui/meta.ts` (ícono, "Traer de una nota", ayuda) y `View.tsx`; textos es y en.
- [x] `views/HtmlPreviewTool.tsx`: editor y vista previa (apilados en ventana angosta), Formatear, Minificar, Copiar, Limpiar, ancho, recursos externos, tamaño y avisos.
- [x] Pruebas: `src/lib/htmlPreviewDoc.test.ts` y `htmlTool.test.tsx`; ajustadas `settings.test.ts` (Formatos tiene 5) y `HelpPopover.test.tsx` (10 herramientas con ayuda).
- [x] Tabla de "En esta herramienta" en `specs/ayuda-contextual/design.md`.
- [ ] Probar en la app (WebKit) y en Windows (WebView2): que el `srcdoc` se ve con `sandbox=""`; que un clic en un enlace no navega; que con los externos apagados no sale ninguna petición (inspector de red) y encendidos solo https; el escalado de Móvil y Tablet en ventana angosta; temas claro, oscuro y sepia.
