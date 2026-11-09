# Blindaje de seguridad de Desktop: tasks

- [x] `open_url` con el plugin `opener` y lista de esquemas; pruebas con
  `& | ^ "` (BS1, BS2).
- [x] `open_in_system` que muestra en vez de ejecutar (BS3).
- [x] `rehype-sanitize` + filtro de `style` en `MarkdownPreview`; enlaces
  por `open_url` o nota (BS4–BS7). Pruebas en `MarkdownPreview.test.tsx`.
- [x] Mermaid `strict` y `sanitizeSvg` en Mermaid y Excalidraw (BS8, BS9).
- [x] `fs_scope.rs` con raíces, archivos permitidos, `.git` protegido,
  migración de `basePath` y pruebas (BS10–BS17).
- [x] Diálogos desde Rust y sin `dialog:allow-*` en la capability; todos los
  sitios que usaban `@tauri-apps/plugin-dialog` pasan por `lib/invoke.ts`
  (BS12, BS13, BS21).
- [x] `git_run` con lista blanca y dentro de una carpeta de datos (BS18).
- [x] Manifiesto de comandos y capabilities por ventana (BS19).
- [x] CSP en `tauri.conf.json` (BS20).
- [x] Dependencias y `overrides` (BS22).
- [x] QA en el navegador con el build de producción, Tauri simulado y la
  misma CSP: la app carga sin violaciones propias, Mermaid y Excalidraw se
  dibujan, la vista dividida conserva colores y no deja iframe ni `onerror`,
  un enlace a un `.app` no abre nada y uno `https` llama a `open_url`.
- [x] QA en la app de QA (macOS, 9 nov 2026): arranque con migración de
  `basePath`, Mermaid con la CSP, exportar una nota a otra carpeta con el
  diálogo de Rust, vista dividida sin el iframe, y el enlace a un `.app`
  que no abre la Calculadora.
- [ ] QA en la app de QA: importar un respaldo, elegir otra carpeta de
  datos, Git y captura rápida.
- [ ] Probar `open_url` en Windows con un enlace que tenga `&`.
