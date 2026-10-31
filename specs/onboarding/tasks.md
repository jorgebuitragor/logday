# Bienvenida (onboarding) — Tasks

Estado: en progreso.

## Pendiente

### (a) Flujo, carpeta y arreglo de iCloud

- [ ] Store: `pickBaseFolder` y `completeOnboarding`, en lugar de `setupBasePath` (OB3, OB9), con pruebas.
- [ ] `OnboardingLayout`: progreso, título con foco, pie y cambio de paso animado (OB1, OB2, OB17).
- [ ] Paso 1, idioma con preselección según el sistema (OB5).
- [ ] Paso 2, carpeta: aviso de iCloud que sí se ve, "ya tiene datos", anuncio y error (OB6–OB9).
- [ ] Paso 3, apariencia: `ThemeTile` con semántica de radio y `SidebarStylePicker` (OB10, OB11).
- [ ] Paso 4 provisional: el texto de las 5 escenas, sin miniaturas.
- [ ] Paso 5, pantalla de inicio y "Abrir Logday" (OB16).
- [ ] Sección `onboarding` en `i18n.ts`, con las mismas claves en es y en.
- [ ] Pruebas: carpeta obligatoria, "Omitir" termina, aviso de iCloud, "ya tiene datos", el idioma y la pantalla de inicio se guardan al terminar.

### (b) Escenas animadas y "Ver el recorrido"

- [ ] `MiniFrame` (con el estilo del menú) y las 5 miniaturas, con las clases `.obd-*` (OB12, OB13).
- [ ] Atajos del texto tomados de la config (OB14).
- [ ] `TourScenes` compartido, y `TourModal` en Acerca de (OB15).
- [ ] Pruebas: sin animación se ve el fotograma final, "Ver de nuevo", las teclas según la config, el modal.

### Final

- [ ] Prueba visual en el navegador: 800×600, español e inglés, oscuro, claro y sepia, animaciones apagadas, teclado.
