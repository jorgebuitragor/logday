# Blindaje de seguridad de Desktop: requirements

Estado: implementado, sin probar en Windows.

Origen: auditoría de calidad y seguridad del ecosistema del 9 nov 2026,
lote 1 (ítems U-01 a U-05 del plan; hallazgos S-01, S-02, S-03, S-13, S-15,
S-18 y S-22). Esos hallazgos encadenados permitían que el contenido de una
nota terminara ejecutando código en el equipo:

- un script metido en una nota (llegada por sync, creada por un agente vía
  MCP, importada o pegada de una web) corría en el webview;
- el webview no tenía CSP, y todos los comandos Rust aceptaban cualquier
  ruta del disco;
- en Windows, abrir un enlace con `&` ejecutaba otros comandos.

Este spec cubre el blindaje del lado de Desktop. La validación de `id`,
`folder` y `project` en el servidor (U-06) va aparte, en logday-server.

## Abrir enlaces y archivos

- BS1. Cuando el webview pida abrir una URL (`open_url`), el sistema DEBERÁ
  abrirla solo si su esquema es `http`, `https`, `mailto` o `tel` (una URL
  `//host` se trata como `https`), y DEBERÁ hacerlo sin pasar por un shell
  (plugin `opener`: ShellExecute en Windows, `open` en macOS, `xdg-open` en
  Linux). Con cualquier otro esquema DEBERÁ responder un error y no abrir
  nada.
- BS2. La URL DEBERÁ normalizarse antes de abrirse (`url::Url`), de modo que
  comillas y espacios queden codificados.
- BS3. Cuando el webview pida abrir una ruta (`open_in_system`), el sistema
  DEBERÁ:
  - abrir una carpeta con el explorador de archivos;
  - abrir con su aplicación un documento de una lista de extensiones
    conocidas (texto, Markdown, PDF, imágenes, Office, audio y video);
  - y para cualquier otra cosa (un `.app`, `.command`, `.exe`, `.sh`, un
    paquete de macOS) solo mostrarla en su carpeta, sin ejecutarla.
  La ruta DEBERÁ ser absoluta y sin `..`.

## Vista dividida de notas

- BS4. La vista previa de la vista dividida (`MarkdownPreview`) DEBERÁ
  sanear el HTML del Markdown con un esquema que deje solo lo que produce el
  editor: el esquema por defecto de `rehype-sanitize` (estilo GitHub) más
  `u`, `mark`, `colgroup`, `col`, el atributo `style` y los `data-type` y
  `data-checked` de las listas de tareas.
- BS5. Del atributo `style` DEBERÁN quedar solo `color`, `background-color`
  y `text-align`, sin `url(`, `image-set`, `expression` ni `\`. Es la misma
  regla que Logday Web (`renderMarkdown.ts`).
- BS6. En ningún caso DEBERÁN llegar al DOM `iframe` (con o sin `srcdoc`),
  `script`, `object`, `embed`, `form`, `base`, `meta`, `link`, `style`,
  `svg`, manejadores `on*` ni enlaces `javascript:`.
- BS7. Un clic en un enlace de la vista previa DEBERÁ abrir con `open_url`
  los enlaces `http`, `https`, `mailto`, `tel` y `//`, y tratar cualquier
  otro `href` como una nota (por id o por título, como el editor). NUNCA
  DEBERÁ abrir un `href` con `open_in_system`.

## Diagramas y dibujos

- BS8. Mermaid DEBERÁ usar `securityLevel: 'strict'`.
- BS9. El SVG de un diagrama de Mermaid o de un dibujo de Excalidraw DEBERÁ
  pasar por DOMPurify antes de insertarse. Se conservan SVG, el HTML de las
  etiquetas dentro de `<foreignObject>` y los `<style>` del propio SVG.

## Límite de rutas de los comandos de archivos

- BS10. Los comandos `read_file`, `write_file`, `list_dir`,
  `create_dir_recursive`, `delete_file`, `rename_dir`, `delete_dir`,
  `path_exists`, `search_tasks`, `read_file_binary` y `write_file_binary`
  DEBERÁN aceptar solo rutas absolutas, sin `..`, que después de resolver
  los enlaces simbólicos caigan dentro de:
  - la carpeta de la app (`app_data_dir`);
  - una carpeta de datos permitida (BS12);
  - o un archivo permitido (BS13).
  Fuera de eso DEBERÁN responder un error, y `path_exists` DEBERÁ responder
  `false`.
- BS11. Las carpetas de datos permitidas DEBERÁN guardarse en
  `fs-scope.json`, dentro de la carpeta de la app. El webview NO DEBERÁ
  poder escribir, borrar ni renombrar ese archivo.
- BS12. Una carpeta elegida en el diálogo de carpeta (`fs_pick_folder`)
  DEBERÁ pasar a ser una carpeta de datos permitida. Es la única forma de
  agregar una.
- BS13. Un archivo elegido en un diálogo de abrir (`fs_pick_files`) o de
  guardar (`fs_save_dialog`) DEBERÁ quedar permitido hasta cerrar la app.
- BS14. La primera vez que corra esta versión (sin `fs-scope.json`), el
  sistema DEBERÁ adoptar como carpeta permitida el `basePath` de
  `config.json`, si existe. Después, cambiar `config.json` NO DEBERÁ agregar
  carpetas.
- BS15. Dentro de una carpeta de datos, NO DEBERÁ poder escribirse, crearse,
  borrarse ni renombrarse nada en una carpeta `.git` (sus hooks y su
  `config` ejecutan código con `git_run`).
- BS16. `delete_file`, `delete_dir` y `rename_dir` NO DEBERÁN aplicarse a
  una carpeta de datos entera ni a la carpeta de la app.
- BS17. `search_tasks` NO DEBERÁ seguir enlaces simbólicos a carpetas.

## Git

- BS18. `git_run` DEBERÁ correr solo dentro de una carpeta de datos y solo
  con los comandos que usa la integración Git: `init`, `config --local
  user.name|user.email <valor>`, `add -A`, `commit -m <mensaje>`,
  `remote add|set-url origin <url>` (con `https://`, `http://`, `ssh://` o
  `usuario@host:ruta`), `push --set-upstream origin main`, `fetch origin`,
  `rev-list HEAD..origin/HEAD --count` (y al revés) y `pull origin main`.

## Permisos por ventana y CSP

- BS19. Los comandos propios DEBERÁN declararse en el manifiesto de la app
  (`build.rs`), y cada ventana DEBERÁ poder llamar solo a los que su
  capability permite. La ventana de captura rápida solo DEBERÁ poder llamar
  a `quick_capture_hide` y `quick_capture_focus`.
- BS20. El webview DEBERÁ tener una CSP (`tauri.conf.json`) sin
  `unsafe-inline` ni `unsafe-eval` en `script-src`, con `object-src 'none'`,
  `base-uri 'self'` y `form-action 'none'`. Lo demás (imágenes, estilos,
  fuentes, conexiones, workers y frames) queda en lo que la app usa hoy;
  ver design.md.
- BS21. Los diálogos de archivos DEBERÁN abrirse desde Rust. La capability
  de la ventana principal NO DEBERÁ incluir `dialog:allow-open` ni
  `dialog:allow-save`.

## Dependencias

- BS22. Las dependencias del editor y del render de notas DEBERÁN estar en
  versiones sin vulnerabilidades conocidas cuando exista una corregida:
  `@tiptap/*` ≥ 3.30.5, `prosemirror-view` ≥ 1.42.3, `dompurify` ≥ 3.4.17,
  `mermaid` ≥ 11.16.1, `markdown-it` ≥ 14.3.3 y `js-yaml` ≥ 3.15.2. Las
  transitivas se fijan con `overrides` en `pnpm-workspace.yaml`.

## Fuera de alcance

- La validación de `id`, `folder` y `project` en logday-server (U-06).
- Guardar los tokens del sync en el llavero (A-03).
- Separar la firma del updater del build en el CI (U-12).
- Las imágenes locales que una nota enlaza por ruta absoluta fuera de la
  carpeta de datos dejan de verse en la vista dividida y en el PDF. El
  editor guarda las imágenes incrustadas (`data:`), así que solo afecta a
  rutas escritas a mano.
