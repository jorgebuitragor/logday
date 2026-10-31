# Navegación entre secciones — Tasks

Estado: en progreso.

## Pendiente

- [ ] `sectionOrder.ts` puro, con pruebas: orden por defecto, ids que ya no existen, extensiones nuevas, desactivadas y reactivadas, mover, ocultar y atajos.
- [ ] `sidebarStyle` y `sidebarSections` en `AppConfig` y el store, con su migración desde `sidebarLabelsVisible` (NS5).
- [ ] `useSectionItems()` y `SectionNav` (`icons`, `list` y `collapsed`): roving tabindex, `aria-current`, `<nav>`, `FOCUS_RING`, "Más" según lo que cabe y tooltip propio.
- [ ] `Sidebar.tsx`: el nuevo armado de los dos estilos y del colapsado. Se quitan la fila, la medición de etiquetas y la columna escrita a mano.
- [ ] Ancho del menú según el estilo (`App.tsx`).
- [ ] Clic derecho sobre una sección (NS10).
- [ ] Atajos ⌘0…⌘9 (`App.tsx`) y comandos "Ir a…" en Buscar.
- [ ] Opciones: el selector con las miniaturas animadas y la lista "Secciones del menú". Se quita la tarjeta "Textos del menú lateral".
- [ ] Textos es/en (sección nueva en `i18n.ts`), con la misma cantidad de claves en los dos idiomas.
- [ ] Reescribir R11 en `specs/extensiones/requirements.md`.
- [ ] Pruebas de los componentes: los dos estilos, el colapsado, "Más", el teclado y Opciones.
- [ ] Prueba visual en el navegador: 800×600 con 4, 6 y 10 secciones, los dos estilos, el colapsado, sepia y oscuro, inglés y las animaciones apagadas.
