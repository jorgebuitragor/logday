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
