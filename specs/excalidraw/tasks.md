# Excalidraw — Tareas

Estado: en progreso.

- [x] Decisión: dibujos dentro de la nota, como bloque ```excalidraw
  (28 oct 2026).
- [x] Punto de extensión R24 (`NoteBlock`, `NoteBlockEditor`,
  `noteBlock` en el registro) y su uso en `NoteEditor`.
- [x] `@excalidraw/excalidraw` 0.18.1 (React 19), bloque, editor y
  fuentes locales.
- [x] Pruebas de la escena y de `fencedBlocks`.
- [x] Revisión con el build de producción en el navegador (29 oct 2026),
  con Tauri simulado. Se probó crear, ver, editar con clic (reemplaza el
  mismo bloque y deja el texto), descartar con y sin cambios, y los temas
  claro y oscuro. Las fuentes salen de la app y no hay peticiones fuera.
  Salieron y se corrigieron:
  - abrir el editor fallaba (React #306): `NoteBlockEditor` era un
    `lazy` dentro del `lazy` de `ExtensionSlot`; ahora es un componente
    (`EditorLoader`);
  - un dibujo pequeño se agrandaba al ancho de la nota: ahora va a su
    tamaño;
  - el resumen de la lista de notas mostraba el JSON del dibujo: ahora
    se quitan los bloques de las extensiones (`stripFencedBlocks`).
- [ ] Probarlo en la app de QA con la corrección.
