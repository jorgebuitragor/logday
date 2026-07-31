# Tasks — Notas: Link Preview + Importación

Estado: implementado (baseline). Las tareas 1–4 ya están hechas en el código
actual (commit `dffb6a7`, rama `feature/1.1.0`) y se listan aquí marcadas
para que este documento sirva de historial de lo que el spec cubre. Las
tareas 5+ son pendientes reales (backlog), derivadas de
`requirements.md` §5.

## Hecho

- [x] **1. Backend: metadata de URL externa** (req. §2.5)
  - [x] 1.1 Comando Tauri `fetch_url_metadata` en `src-tauri/src/lib.rs`
        (fetch con `reqwest`, extracción de `og:title`/`og:description`/
        `<title>`, truncado, timeout 8s).
  - [x] 1.2 Registrar el comando en el `invoke_handler` de `run()`.
  - [x] 1.3 Wrapper tipado `fetchUrlMetadata` en `src/lib/invoke.ts`.

- [x] **2. Link Preview Card** (req. §2.1–2.8)
  - [x] 2.1 Componente `LinkPreviewCard.tsx` controlado por props, con
        posicionamiento de dos pasadas.
  - [x] 2.2 Estado y listener delegado en `NoteEditor.tsx`
        (`linkPreview`, `linkPreviewHandlerRef`, click/touch/Ctrl-click).
  - [x] 2.3 Cache in-memory de metadata externa (`externalMetaCacheRef`).
  - [x] 2.4 Cierre en scroll / cambio de nota / click afuera / Escape.
  - [x] 2.5 Edición inline de URL externa con reemplazo de marca en el doc.
  - [x] 2.6 Claves de i18n (`es`/`en`) para todos los textos de la tarjeta.

- [x] **3. Promoción de primera línea a título** (req. §3)
  - [x] 3.1 Listener de `keydown` en el pane del editor.
  - [x] 3.2 Transacción ProseMirror que separa título/cuerpo.
  - [x] 3.3 Guardado combinado debounced con `skipNextContentSaveRef` para
        evitar guardado parcial.

- [x] **4. Importar notas** (req. §4)
  - [x] 4.1 `pickMarkdownFiles()` en `src/lib/invoke.ts` (file picker nativo
        filtrado a `.md`/`.txt`).
  - [x] 4.2 Acción `importNotesFromPaths` en `appStore.ts` (parseo con
        frontmatter + fallback a heading/filename, tolerante a fallos por
        archivo).
  - [x] 4.3 Entrada "Importar nota" en el menú contextual de espacio vacío
        de `NoteList.tsx`.
  - [x] 4.4 Drag & drop nativo vía `onDragDropEvent` con overlay visual.
  - [x] 4.5 Claves de i18n (`es`/`en`) para toast y overlay.

## Pendiente (backlog)

- [ ] **5. Conectar `importNotesFromContent` a la UI** — actualmente vive
      en `appStore.ts` sin ningún llamador. Antes de exponerlo en UI:
      1. Definir en `requirements.md` §4 el caso de uso concreto (¿pegar
         markdown desde portapapeles? ¿importar desde otra integración?).
      2. Decidir el punto de entrada en la UI.
      3. Actualizar `design.md` si el flujo de datos difiere del de
         `importNotesFromPaths`.

- [ ] **6. Acción "Guardar como nota" en enlaces externos** — las claves de
      i18n `linkPreviewSave` / `linkPreviewSavedToast` existen pero no hay
      botón ni handler en `LinkPreviewCard`. Antes de implementar:
      1. Especificar en `requirements.md` §2.5 qué contenido se guarda
         (¿solo metadata? ¿se intenta traer el cuerpo del artículo?) y en
         qué carpeta.
      2. Decidir si reutiliza `importNotesFromContent` (tarea 5) como
         mecanismo de creación de la nota.

- [ ] **7. (Sugerido, no confirmado con el usuario) Tests** — no hay tests
      automatizados para el parseo de `parseNote`/fallback de importación
      ni para la clasificación interno/externo de enlaces. Evaluar si vale
      la pena antes de tocar esta área de nuevo.
