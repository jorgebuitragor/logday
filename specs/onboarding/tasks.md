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

## Pendiente

### (b) Escenas animadas y "Ver el recorrido"

- [ ] `MiniFrame` (con el estilo del menú) y las 5 miniaturas, con las clases `.obd-*` (OB12, OB13).
- [ ] `TourModal` en Acerca de (OB15).
- [ ] Pruebas: sin animación se ve el fotograma final, "Ver de nuevo", las teclas según la config, el modal.

### Final

- [ ] Prueba visual en el navegador: 800×600, español e inglés, oscuro, claro y sepia, animaciones apagadas, teclado.

## Diferencias con el diseño

- **Adelantado de (b):** `TourScenes` (solo con el texto) y las teclas tomadas de la config (OB14, `components/tour/scenes.ts`) ya están en (a), para no escribir las teclas a mano en el paso provisional.
- **Paso 1:** "Empezar" va en el contenido, como en el boceto, y el paso no tiene pie.
- **Paso 4:** Atrás y Siguiente recorren las escenas; Atrás desde la primera vuelve al paso 3, y en la última Siguiente dice "Continuar" y pasa al 5. "Omitir recorrido" no se muestra en la última escena.
- **Error al terminar (OB9):** sale sobre el pie, con "Elegir otra carpeta" (clave nueva `pickOther`), que vuelve al paso 2. Reintentar es volver a pulsar el botón.
- **Paso 5:** los nombres y los íconos son los del menú ("Dailys", no "Daily" de `startupDailys`).
- **Paso 2:** con el aviso de iCloud no se repite la recomendación de carpeta local, que ya va en el aviso.
- **Carga al terminar:** `completeOnboarding` carga lo mismo que `init` (también dailys, horas extra, calendario y ausencias) y arranca la purga de la papelera; `setupBasePath` solo cargaba proyectos, carpetas, tareas y notas, y con una carpeta que ya tenía datos (OB8) faltaban.
- **Opciones → General:** los 8 temas también pasan a ser radios del grupo `theme`; el personalizado sigue siendo un botón, ahora con `aria-pressed`, y "Crear tema" un botón sin él. Los temas salen de `settings/themeOptions.ts`, que comparten Opciones y la bienvenida.
