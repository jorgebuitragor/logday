# Blindaje de seguridad de Desktop: design

## Por qué en este orden

La cadena de la auditoría era: contenido de una nota → script en el webview
→ comandos Rust sin límite → ejecución de código. Se corta en los tres
eslabones a la vez, porque cada uno solo es frágil:

1. **Que no entre script** (BS4–BS9, BS22): sanear la vista dividida, Mermaid
   en `strict`, SVG por DOMPurify y dependencias del editor al día.
2. **Que si entra no corra** (BS20): CSP sin `unsafe-inline`. Un `onerror`
   o un `<script>` inyectado ya no se ejecutan.
3. **Que si corre no alcance** (BS10–BS19): comandos de archivos limitados a
   las carpetas que el usuario eligió, `git_run` con lista blanca, apertura
   de enlaces sin shell y permisos por ventana.

## Abrir enlaces (`open_url`, `open_in_system`)

- `open_url` valida con `url::Url` y abre con `tauri_plugin_opener`. El
  plugin usa el crate `open` con la feature `shellexecute-on-windows`, así
  que en Windows llama a `ShellExecuteExW`, sin `cmd`. Antes se armaba
  `cmd /c start "" <url>`, y `cmd` interpreta `&`, `|` y `^`.
- `open_in_system` resuelve la ruta (`canonicalize`) y decide con
  `open_action`: carpeta → abrir; documento conocido → abrir; lo demás →
  `reveal_item_in_dir`. No se limita a las carpetas de datos porque la usan
  las rutas vinculadas de las tareas, que el usuario eligió en un diálogo y
  pueden estar en cualquier lado. Mostrar algo en el Finder no ejecuta nada.

## Vista dividida

`MarkdownPreview` pasa por `rehype-raw` → `rehype-sanitize`
(`notePreviewSchema`) → `rehypeFilterStyle` (`src/lib/markdownSanitize.ts`).
El orden importa: el saneo tiene que ver el HTML ya interpretado, y el
filtro de `style` va al final porque `rehype-sanitize` no filtra valores.

- Se eligió `rehype-sanitize` y no DOMPurify porque la vista ya es un árbol
  hast de `react-markdown`; DOMPurify necesitaría pasar por un string y
  `dangerouslySetInnerHTML`.
- `react-markdown` sigue aplicando su `urlTransform` (quita `javascript:`).
- Comportamiento que no cambia: el componente `p` reemplaza el `style` del
  párrafo por `white-space: pre-wrap` y `urlTransform` quita las imágenes
  `data:`; ya pasaba antes.
- Los enlaces: `isExternalHref` decide entre `open_url` y buscar una nota.

## Diagramas

- `mermaid.initialize({ securityLevel: 'strict' })`. Con `strict` Mermaid
  codifica el HTML de las etiquetas y no enlaza los `click` a funciones.
- `sanitizeSvg` (`src/lib/svgSanitize.ts`): DOMPurify con perfiles `svg`,
  `svgFilters` y `html`, `ADD_TAGS: ['foreignObject', 'style']` y
  `HTML_INTEGRATION_POINTS: { foreignobject: true }` (la misma opción que
  usa Mermaid; sin ella DOMPurify vacía las etiquetas de los nodos).
- `dompurify` pasa a dependencia directa (antes llegaba por Mermaid).

## Límite de rutas (`src-tauri/src/fs_scope.rs`)

- `FsScope` es estado de Tauri (`.manage`). `init` corre en `setup`, antes de
  que el webview pida nada.
- `resolve(path)`: exige ruta absoluta, rechaza componentes `..`,
  canonicaliza el ancestro existente más largo (resuelve symlinks) y le
  vuelve a pegar el resto. Así funciona también para archivos que todavía no
  existen.
- Raíces: `app_data_dir` (siempre) + las de `fs-scope.json`. Archivos
  sueltos: un `HashSet` en memoria.
- `check(path, Read|Write)`, `check_not_root` (borrar y renombrar) y
  `check_git_cwd`.
- **Migración (BS14):** sin `fs-scope.json`, se lee `basePath` de
  `config.json` una vez y se escribe `fs-scope.json`. Después, que el
  webview cambie `config.json` no agrega raíces: un script inyectado no
  puede ampliar el alcance para el próximo arranque.
- **Diálogos (BS12, BS13, BS21):** `fs_pick_folder`, `fs_pick_files` y
  `fs_save_dialog` usan `tauri_plugin_dialog` desde Rust
  (`spawn_blocking` + `blocking_*`, con la ventana como padre). Del lado JS,
  `pickFolder`, `pickFile` y `saveDialog` de `lib/invoke.ts` los llaman; ya
  no se importa `@tauri-apps/plugin-dialog` en ningún archivo.
- Lo que deja de verse: una imagen enlazada por ruta absoluta fuera de la
  carpeta de datos (`![](/Users/…/x.png)`) en la vista dividida y el PDF.

## Git (BS18)

`git_args_allowed` compara los argumentos contra las formas exactas que usa
`appStore.ts`. El mensaje del commit, el nombre y el email van siempre en la
posición de valor, así que no se interpretan como opciones. Con `.git`
protegido contra escritura (BS15), un script no puede plantar hooks ni un
`core.sshCommand`.

## Permisos por ventana (BS19)

`build.rs` declara los 64 comandos con
`tauri_build::AppManifest::new().commands(...)`. Tauri genera un permiso
`allow-<comando>` (con guiones) por cada uno. `capabilities/default.json`
(ventana `main`) los tiene todos; `quick-capture.json` solo
`allow-quick-capture-hide` y `allow-quick-capture-focus`. **Al agregar un
comando hay que sumarlo en los tres lugares** (`generate_handler!`,
`build.rs` y la capability); si no, la ventana recibe "not allowed".

## CSP (BS20)

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline' https:;
img-src 'self' asset: http://asset.localhost data: blob: https: http:;
font-src 'self' data:;
connect-src 'self' ipc: http://ipc.localhost https://api.github.com;
media-src 'self' data: blob: https:;
worker-src 'self' blob:;
frame-src 'self' blob: data:;
object-src 'none'; base-uri 'self'; form-action 'none'
```

- `wasm-unsafe-eval`: Excalidraw arma subconjuntos de fuentes con
  WebAssembly. No habilita `eval` de JavaScript.
- `style-src 'unsafe-inline'`: Tiptap, Mermaid y Excalidraw inyectan
  `<style>`. Por eso `dangerousDisableAssetCspModification: ["style-src"]`:
  si Tauri agregara su nonce a `style-src`, el navegador ignoraría
  `'unsafe-inline'`. `https:` es para la vista previa HTML del Cliente HTTP
  con "Cargar recursos externos" (el `srcdoc` hereda esta CSP).
- `img-src https: http:`: las notas enlazan imágenes de cualquier sitio.
- `font-src 'self' data:`: las fuentes de Excalidraw se sirven desde la app
  (`/excalidraw/fonts/`). Su respaldo en `esm.sh` queda bloqueado, que era
  la intención de R17 de extensiones.
- `connect-src https://api.github.com`: las notas de la versión
  (`lib/releases.ts`). El sync, el updater y el Cliente HTTP van por Rust.
- Sin `devCsp`: `pnpm tauri dev` sigue sin CSP para no pelear con el HMR de
  Vite. La CSP se prueba con el build.

## Dependencias (BS22)

- Directas: `@tiptap/*` 3.32.0, `dompurify` 3.4.17, `mermaid` 11.17.2,
  `js-yaml` 3.15.2, `vite` 6.4.5 (dev), `rehype-sanitize` 6. Se quitó `xlsx`
  (no se usaba; el Excel sale de `xlsx-js-style`).
- `overrides` en `pnpm-workspace.yaml`: `prosemirror-view`, `markdown-it`,
  `dompurify`, `lodash-es`, `nanoid@3` y `source-map-js` por
  vulnerabilidades; `prosemirror-model` y `prosemirror-transform` para que
  haya una sola copia (con dos, tiptap avisa que partir y envolver nodos
  falla).
- Se eligieron versiones publicadas hace más de dos semanas.
- Quedan en `pnpm audit --prod` 7 avisos sin arreglo aplicable: `lodash-es`
  `_.template` (sin versión corregida, no se usa), `nanoid@4` dentro de
  `@excalidraw/mermaid-to-excalidraw` (los fallos son con tamaños inválidos
  que la librería no pasa) y `katex` (bajo, vía Mermaid).

## Alternativas descartadas

- **Plugin `tauri-plugin-fs` con su scope** en lugar de `fs_scope.rs`: habría
  que reescribir las ~40 llamadas a los comandos propios y su scope se
  amplía desde JS con permisos; el diálogo en Rust da un control más simple.
- **Validar las rutas solo en JS**: un script inyectado llama a `invoke`
  directamente; la validación tiene que estar en Rust.
- **Mermaid en `sandbox`**: dibuja en un iframe aparte y rompe el tamaño
  automático del bloque y la exportación a PDF.
