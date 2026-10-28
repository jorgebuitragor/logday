# Excalidraw — Design

## Punto de extensión: bloques propios en las notas (R24 de la base)

- El registro declara `noteBlock: { language: 'excalidraw' }`.
- `NoteEditor` arma con las extensiones activas el mapa
  `lenguaje → extensión` **antes** de crear el editor, porque TipTap
  arma sus NodeView en el primer render.
- `mermaidCodeBlock.tsx` dibuja esos bloques con `ExtensionSlot`
  (`point="NoteBlock"`, props `{ code, onEdit }`), aislados en su
  `ExtensionBoundary`. El código sigue en el documento, oculto, igual que
  Mermaid.
- Editar o crear abre `ExtensionSlot` con `point="NoteBlockEditor"` y
  props `{ code, onSave, onClose }`. Al guardar:
  - el n-ésimo bloque de ese lenguaje (`parseFencedBlocks`) se
    reemplaza por `formatFence(lenguaje, código)`;
  - o, si es nuevo, se inserta donde está el cursor
    (`insertBlockAtSelection`).
- Los índices de los bloques de código normales (barra de lenguaje, menú
  contextual, cambiar lenguaje) saltan los bloques de Mermaid **y** los de
  las extensiones activas (`specialFencesRef`), para no desfasarse.

## Módulo

- `Block.tsx`: `exportToSvg` de `@excalidraw/excalidraw` con el tema de la
  app; se carga con `import()` al mostrarse.
- `Editor.tsx`: `<Excalidraw>` con `initialData`, `theme` y `langCode`
  (`es-ES`/`en`). Guarda con `serializeAsJSON(…, 'local')`, que incluye
  las imágenes como data URL, en una línea (`sceneToCode`), y comprueba el
  tamaño (X4).
  - Sin `window.confirm`: el aviso de descartar va en la barra del editor.
  - Si hay cambios, se ve comparando `id` y `version` de los elementos con
    los del inicio, porque `onChange` también se dispara al abrir.
- `index.ts`: `NoteBlock` y `NoteBlockEditor` (con `lazy`).

## Fuentes (X6)

`vite-plugins/excalidraw-fonts.js`:

- en `dev`, sirve `/excalidraw/fonts/…` desde `node_modules`;
- en `build`, copia las familias a `dist/excalidraw/fonts`, sin Xiaolai
  (unos 480 KB en total).

`assets.ts` fija `window.EXCALIDRAW_ASSET_PATH` en `/excalidraw/`. Está
en JS porque el proyecto no tiene los tipos de Node.
