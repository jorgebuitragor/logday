# Bienvenida (onboarding) — Tasks

Estado: en progreso.

## Hecho

### (a) Flujo, carpeta y arreglo de iCloud (rama `feature/onboarding-flujo`)

- [x] Store: `pickBaseFolder` y `completeOnboarding` en lugar de `setupBasePath`, que no usaba nadie más (OB3, OB9). La lógica pura (iCloud, "ya tiene datos", crear las carpetas, idioma, pasos) está en `src/lib/onboarding.ts`.
  - `completeOnboarding` crea las carpetas, pone `basePath`, guarda la config y, solo si eso salió bien, pone `isConfigured: true` y la sección activa en la pantalla de inicio. Si falla, deshace `basePath` y lanza el error.
  - Pruebas con el store real (`src/store/onboarding.test.ts`): elegir no termina ni escribe nada, iCloud y datos, lo elegido llega a `config.json`, "Omitir" con los valores por defecto, el error y el reintento.
- [x] `OnboardingLayout` (`src/pages/onboarding/`): progreso con `aria-current="step"`, título con foco al cambiar de paso, contenido con scroll, pie fijo y el cambio de paso con `.obd-step` (OB1, OB2, OB17).
- [x] Paso 1, idioma con radios nativos y preselección según el sistema (OB5): `initialLanguage` en el estado inicial del store.
- [x] Paso 2, carpeta: el aviso de iCloud (que ahora sí se ve), "ya tiene datos", el anuncio de la ruta, Continuar deshabilitado con `aria-describedby` y el error al elegir (OB6–OB9).
- [x] Paso 3, apariencia: `ThemeTile` con radio nativo (`name`) y `SidebarStylePicker` (OB10, OB11).
- [x] Paso 4 provisional: el texto de las 5 escenas, sin miniaturas.
- [x] Paso 5, pantalla de inicio con radios y "Abrir Logday" (OB16).
- [x] Secciones `onboarding` y `tour` en `i18n.ts`, con las mismas claves en es y en.
- [x] Pruebas: carpeta obligatoria, "Omitir" solo en los pasos 3 y 4, aviso de iCloud, "ya tiene datos", el idioma, la pantalla de inicio y el estilo del menú se guardan al terminar, las teclas del texto según la config, la paridad es/en y sin voseo.

### (b) Escenas animadas y "Ver el recorrido" (rama `feature/onboarding-recorrido`)

- [x] `MiniFrame` (`components/tour/`): el menú en el estilo elegido, con Inicio y hasta 5 secciones visibles en el orden del usuario, y el resaltado que pasa de una fila a otra (OB13).
- [x] Las 5 miniaturas (`Miniatures.tsx`) con las clases `.obd-*` de `App.css`: una pasada de 4 s que empieza a los 300 ms, solo `transform` y `opacity`, y el estilo base de cada clase es su fotograma final (OB12, OB13).
- [x] "Ver la animación de nuevo" vuelve a montar la escena. No se dibuja con las animaciones de la app apagadas y se oculta con `prefers-reduced-motion` (`.obd-replay`).
- [x] Atajos del texto y de las miniaturas tomados de la config (OB14): las letras de `shortcuts` y los dígitos del orden del menú.
- [x] `TourScenes` compartido y `TourModal` en Opciones → Acerca de, con Cerrar, Atrás, Siguiente y Terminar; Esc cierra el recorrido y no Opciones, y el foco vuelve al botón (OB15).
- [x] Pruebas (`components/tour/tour.test.tsx`): cada `@keyframes obd-*` usa solo `transform` y `opacity` y termina en el estilo base de su clase; las reglas de `prefers-reduced-motion` y `.no-animations`; cada clase usada existe en `App.css`; el resaltado del marco; "Ver de nuevo"; las teclas según la config y el orden del menú; el modal y Acerca de.

## Pendiente

- [ ] Probar en la app de QA (WebKit real y diálogo nativo de carpeta), y en Windows y Linux.
- [ ] Probar con las animaciones apagadas y con el lector de pantalla (las pruebas cubren el CSS y la semántica).

### Prueba en el navegador (31 oct 2026, Tauri simulado, 800×600)

- [x] Los 5 pasos, empezando sin config: el idioma preelegido es el del sistema, cambiar a inglés traduce la pantalla y el foco va al título en cada paso.
- [x] Carpeta: Continuar deshabilitado hasta elegirla; el aviso de iCloud se ve y elegir no escribe la config; "ya tiene datos" con una carpeta con `projects/`.
- [x] Sepia y Lista con nombres se aplican al momento; las escenas usan ese estilo; la escena 4 muestra ⌘0 y ⌘1…⌘4.
- [x] "Abrir Logday" guarda `basePath`, idioma, estilo y pantalla de inicio, crea las carpetas y abre en Tareas.
- [x] "Ver el recorrido" en Acerca de: Esc lo cierra sin cerrar Opciones y el foco vuelve al botón.
- [x] Arreglado en la prueba:
  - el botón principal quedaba casi transparente con texto blanco en los temas tintados (App.css cambia `bg-indigo-*` por `--accent-soft`).
- [x] A pedido de Jorge, el logo y el botón principal siguen el tema:
  - el logo es el mismo SVG del menú, con `--accent`;
  - el botón usa los tokens nuevos `--accent-solid` y `--accent-on`. Están fijados en App.css para los 7 temas, con contraste de 4.5:1 o más, y se derivan en los personalizados (`themeColor.ts`).
  - Probado en los 7 temas;
  - los atajos globales (⌘N, ⌘T, ⌘D) funcionaban durante la bienvenida, sin carpeta.

## Diferencias con el diseño

- **Adelantado de (b):** `TourScenes` (solo con el texto) y las teclas tomadas de la config (OB14, `components/tour/scenes.ts`) ya están en (a), para no escribir las teclas a mano en el paso provisional.
- **Escena 2:** la lista se funde en el Kanban, en vez de repartir cada fila en su columna; después la tarjeta pasa de la columna 1 a la 2.
- **Escena 4:** la tecla que aparece es la de Tareas según el orden del menú (⌘2 con el orden por defecto), no ⌘1, que es Dailys. Lo escrito en Buscar es el principio del nombre de Tareas en el idioma de la app ("tar", "tas").
- **Escena 5:** los archivos son `projects/…/….md`, `notes/….md` y `dailys/….md`, como en la carpeta real: las tareas viven en `projects/<proyecto>/`, no en `tasks/`.
- **Modal:** el título es "Cómo funciona" y, además de Cerrar y Siguiente/Terminar, tiene Atrás desde la segunda escena.
- **Acerca de:** "Ver el recorrido" va en una fila propia, con su descripción, entre Actualizaciones y Licencia.
- **Paso 1:** "Empezar" va en el contenido, como en el boceto, y el paso no tiene pie.
- **Paso 4:** Atrás y Siguiente recorren las escenas; Atrás desde la primera vuelve al paso 3, y en la última Siguiente dice "Continuar" y pasa al 5. "Omitir recorrido" no se muestra en la última escena.
- **Error al terminar (OB9):** sale sobre el pie, con "Elegir otra carpeta" (clave nueva `pickOther`), que vuelve al paso 2. Reintentar es volver a pulsar el botón.
- **Paso 5:** los nombres y los íconos son los del menú ("Dailys", no "Daily" de `startupDailys`).
- **Paso 2:** con el aviso de iCloud no se repite la recomendación de carpeta local, que ya va en el aviso.
- **Carga al terminar:** `completeOnboarding` carga lo mismo que `init` (también dailys, horas extra, calendario y ausencias) y arranca la purga de la papelera; `setupBasePath` solo cargaba proyectos, carpetas, tareas y notas, y con una carpeta que ya tenía datos (OB8) faltaban.
- **Opciones → General:** los 8 temas también pasan a ser radios del grupo `theme`; el personalizado sigue siendo un botón, ahora con `aria-pressed`, y "Crear tema" un botón sin él. Los temas salen de `settings/themeOptions.ts`, que comparten Opciones y la bienvenida.
- **Claves fuera de la tabla:** `onboarding.pickOther` y `tour.optional` (la etiqueta "opcional" de la escena 5). Las de Acerca de (`aboutTour`, `aboutTourDesc`, `tourDone`, `close`) y `replay` van en `tour`.
