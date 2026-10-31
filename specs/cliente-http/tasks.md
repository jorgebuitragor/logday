# Cliente HTTP — Tasks

Estado: PR 1 implementado (31 oct 2026), falta su prueba visual y en la app de QA; PR 2 pendiente. Rama `feature/cliente-http`, desde `develop`. Son dos PR: el primero deja la extensión completa en las notas; el segundo suma la herramienta de DevTools.

## Antes de empezar

- [x] Enfoque aprobado por Jorge (31 oct 2026): bloque `http` en las notas, entornos locales con secretos en el llavero, envío desde Rust y herramienta en DevTools.
- [x] Respuestas de Jorge a las decisiones de `design.md` §10: las aprobó todas como las recomienda el diseño (31 oct 2026).
- [ ] Ver si `feature/devtools-opciones` ya entró en `develop`. Solo afecta al PR 2 (A10).

## PR 1: la extensión en las notas

### Base de extensiones (`specs/extensiones`, R24 y R8)

- [x] `types.ts`:
  - `'http-client'` en `ExtensionId`;
  - `noteBlock.inline` y `noteBlock.template`;
  - `NoteBlockProps.part`, `noteId` e `index`;
  - `dynamicSecretKeys` (A3.1, A3.2, A3.4).
- [x] `mermaidCodeBlock.tsx`: la variante inline de `ExtensionCodeBlockView`, con el código visible y las islas `header` y `footer` (A3.1). `NoteEditor.tsx`:
  - pasa `noteId`;
  - "Nuevo bloque" inserta `template` para los bloques inline, sin `NoteBlockEditor`, y deja el cursor al final de la URL (HT9).
- [x] `Mod-Enter` en `MermaidAwareCodeBlock.addKeyboardShortcuts()` y el bus `src/extensions/noteBlockEvents.ts` (A3.3), con prueba: dentro del bloque lo maneja; fuera, no.
- [x] `removeExtensionConfig` borra también `dynamicSecretKeys(settings)`, con prueba en `actions.test.ts` o en el store (HT22).
- [x] `NoteList.tsx`: no quitar del resumen los bloques inline (A3.5).
- [x] `lowlight` de `NoteEditor.tsx`: sumar `http` (A3.6). `codeHighlight.ts`: `http` en `CODE_LANGUAGE_OPTIONS`.
- [x] `App.css`: `.extension-node-inline` y la anulación de `.extension-block-ui` (A3.7, hallazgo 3).
- [x] `lib/fencedBlocks.ts`: lenguaje exacto y cercas de 3 o más comillas invertidas, con pruebas (hallazgo 2). Que sigan pasando las de Excalidraw.
- [x] `specs/extensiones/requirements.md` y `design.md`:
  - R24 con el modo inline;
  - R8 con las claves dinámicas;
  - la excepción de R17 (hallazgo 7).

### Núcleo puro (`src/extensions/http-client/core/`, vitest)

- [x] `parse.ts` con `parse.test.ts`: todas las reglas de A4 y sus números de línea (HT5–HT7).
- [x] `environments.ts`: leer y validar los ajustes, los nombres, `trustedHosts` (también desde la pista de un secreto URL), duplicar y las claves `v_`/`e_`. `secretKeys.ts`, para el registro (A6, HT17–HT22).
- [x] `resolve.ts`: variables normales, secretas, sin valor, no definidas y del sistema; validar la URL; cabeceras automáticas; `needsConfirm` (A5, HT15, HT16, HT20, HT21).
- [x] `body.ts`: elegir la vista y el respaldo cuando el JSON o el XML no son válidos (A9, HT10, HT12).
- [x] `cache.ts`: LRU por entradas y bytes, la regla de `firstLine` y `stale` (A8, HT11).
- [x] `api.ts`: los `invoke` y la traducción de `SendError` a los textos de §8.5.

### Rust (`src-tauri/src/extensions/http_client.rs`)

- [x] `http_client_send` y `http_client_cancel` con la firma de A7. Se registran en `extensions/mod.rs` y en el `invoke_handler` de `lib.rs`.
- [x] Validación (método, cabeceras, tamaño, esquema, credenciales), los secretos desde el llavero con `keychain()` y `read_secret`, y la comprobación de hosts de confianza (HT21, HT23).
- [x] Dos clientes en un `OnceLock`, con y sin verificación de certificados, el tiempo límite por petición y redirecciones a mano con `next_hop` (HT24, HT25).
- [x] Lectura del cuerpo con tope, la clasificación texto o binario, y enmascarar `final_url` y `Location`.
- [x] Cancelar con el `JoinHandle` de `tauri::async_runtime::spawn`, el tope de 6 en curso y la limpieza del mapa (HT13).
- [x] Códigos de error sin la URL. El texto que se busca en la cadena de `source()`, fijado con pruebas (HT26).
- [x] Pruebas puras y con `tiny_http`, las de A7. `cargo check` y `cargo test`.

### Interfaz

- [x] Registro (A2), `index.ts` y `start()`:
  - la región viva;
  - suscribirse al bus;
  - la parada cancela lo que está en curso y vacía la caché.
- [x] `store.ts`: en curso, resultados y confirmaciones, por clave de bloque.
- [x] `BlockHeader.tsx` y `BlockFooter.tsx` con todos los estados de Interfaz §1.4, la confirmación en el bloque y el foco de §5.
- [x] `EnvironmentChip.tsx` (§1.3) y `ResponseView.tsx` (§2): pestañas, Formateado/Sin formato, tabla de cabeceras, petición enviada, imagen, binario, copiar, guardar como archivo y cerrar.
- [x] `SEND_BTN` en `components/shared/controlClasses.ts` (§1.2).
- [x] `Settings.tsx`, Opciones → Cliente HTTP (§4):
  - entornos en pestañas;
  - variables con secretos;
  - hosts de confianza;
  - opciones de las peticiones;
  - vacíos y confirmaciones con `useConfirmDelete`.
- [x] Textos: `extensions['http-client.*']` y la sección `httpClient` de `i18n.ts`, es y en con las mismas claves (§8.1–§8.7), con prueba de paridad.
- [x] Pruebas de dibujo con `react-dom/server`: el bloque en cada estado, la respuesta y el panel de Opciones.

### Verificación del PR 1

- [x] `pnpm test` (54 archivos, 537 pruebas), `pnpm build`, `pnpm lint` (21 warnings, los de base), `cargo check` y `cargo test` (68 pruebas; 14 del Cliente HTTP, con un servidor local de `tiny_http`).
- [x] Primera prueba en el navegador (31 oct 2026, Tauri simulado, tema oscuro): una nota con un bloque `http` muestra la barra (entorno y Enviar); Enviar llama a `http_client_send` con el método, la URL y las cabeceras (más `User-Agent`), y la respuesta aparece debajo (200 OK, tiempo, tamaño, JSON formateado, pestañas Cuerpo/Cabeceras/Petición) sin escribirse en la nota; el selector de entorno ofrece "Crear un entorno…", que abre Opciones → Cliente HTTP y crea "Entorno 1" con sus opciones.
- [ ] Resto de la prueba en el navegador, en los temas claro, oscuro y sepia:
  - escribir un bloque, ⌘↵, varias peticiones, errores, variables que faltan;
  - confirmar con un entorno protegido y con un host ajeno;
  - cancelar, una respuesta grande y una binaria;
  - el teclado (comprobar si Tab entra en las islas en WebKit, §5).
- [ ] App de QA (`com.jorgebuitrago.logday.qatareas`, según `AGENTS.md`), contra un servidor local:
  - el llavero de macOS (un solo aviso);
  - un certificado autofirmado (el texto de rustls que se busca está fijado con pruebas de cadenas, no con un servidor TLS real);
  - redirecciones;
  - el tiempo límite;
  - "Quitar configuración" borra los secretos.
- [ ] Con la extensión apagada, el bloque es código normal. Confirmar en Web que se ve como código.

### Diferencias con el diseño (PR 1)

- **Enviar va relleno con el acento del tema** (`SEND_BTN`: `--accent-solid` y `--accent-on`), como el botón principal de la bienvenida, en vez del borde índigo de §1.2: se lee igual en sepia y en los temas tintados. El botón "Activar" del aviso de R6 (`ConsentModal`, hallazgo 5) pasó al mismo par.
- **⌘↵:** cada barra se suscribe al bus `noteBlockEvents` (no `start()`), y el evento lleva el elemento del NodeView: cada bloque reconoce el suyo aunque su índice haya cambiado desde el último dibujo. El cálculo de a qué bloque va es una función pura (`components/notes/extensionBlockPos.ts`, con `blockIndexAt`), probada con un esquema de ProseMirror mínimo.
- **`NoteBlockProps.cursor`** (nuevo): la posición del cursor dentro del bloque, o `null`. Con él la selección de la barra sigue al cursor y la pista ⌘↵ sale solo mientras se edita. El NodeView inline recalcula el índice y el cursor con cada transacción del editor.
- **El NodeView inline es un renderer aparte** con `stopEvent` para las islas (ProseMirror no maneja sus teclas ni clics). El de Excalidraw no cambia.
- **`.extension-node-inline` sin `overflow: hidden`**, para que los menús de la barra no se corten. Las islas anulan también `p` y las tablas de `.prose-editor`, no solo `pre` y `code`.
- **Redirecciones con secretos:** no se siguen si cambia el origen (esquema, host o puerto), algo más estricto que "si cambia el host" (A7.5): así un secreto tampoco baja de https a http.
- **HT21 desde Rust:** si un secreto va en el host (el webview no lo ve), Rust rechaza con `secret_host_not_allowed` y el bloque pide la misma confirmación; al confirmarla se reenvía con `allowUntrustedHost`. El texto para cuando no hay nombres de variables es `confirmUntrustedSecret`.
- **Opciones:** el "Entorno activo" es un `<select>` nativo, no el menú del chip. Una variable nueva es una fila en borrador hasta que tiene un nombre válido (los ajustes descartan las variables sin nombre).
- **Respuesta:** "Guardar como archivo" es siempre un botón de ícono, sin el menú "Más acciones". "Hace…" usa `Intl.RelativeTimeFormat` directamente. Se quitaron las claves `ago`, `moreActions` y `envLabel`, y se sumaron `responseAria`, `tabsAria`, `bodyAria`, `headersAria`, `requestAria`, `saveDefaultName`, `confirmUntrustedSecret`, `hostAddAria`, `maxSizeUnit`, `err.invalid_url`, `err.scheme_not_allowed`, `err.credentials_in_url` y `err.invalid_method`.
- **El aviso de GET o HEAD con cuerpo** se ve también sin respuesta.
- **Parser:** además de las líneas en blanco del final, quita las del principio del cuerpo.
- **`User-Agent`:** la versión sale de `getVersion()` en `start()`; hasta que llega, va `Logday`.
- **Caché:** el tamaño de una entrada es una estimación (el cuerpo, más 2 KB). La respuesta recién llegada se queda aunque sola pase de 50 MB; se olvidan las demás.
- **`formatFence`** alarga la cerca sola si el contenido trae una línea con comillas invertidas (lo usará el PR 2 al guardar en una nota).
- **`removeExtensionConfig`** usa `secretKeysToClear` (`extensions/state.ts`), probada en `state.test.ts`.
- **Rust:** `SendError` y `Body` se serializan en camelCase (`secretKey`, `tlsReason`, `kind: "text"`). Al seguir una redirección que deja el cuerpo, se quita también el `Content-Type`.
- **Sin hacer en el PR 1:** el atajo ⌥⌘↓/↑ para llevar el foco a la respuesta (§5) queda para si la prueba en WebKit muestra que Tab no entra en las islas.

## PR 2: DevTools

- [ ] `devtools/model.ts`:
  - el grupo `network` y la herramienta `http`;
  - `availableTools()`;
  - `LANGUAGE_TOOL` y `OUTPUT_LANGUAGE`;
  - integrarlo con el orden, las ocultas y los grupos plegados de `feature/devtools-opciones` si ya entró (A10, D24).
- [ ] `ui/meta.ts` (`TOOL_ICON`, `PICKER_TOOLS`) y `View.tsx`:
  - `VIEWS.http`;
  - `availableTools` en la columna, el buscador, ⌥⌘↓/↑ y `lastTool`;
  - `privacyNoteWithHttp`.
- [ ] `views/HttpTool.tsx` (§3):
  - el formulario y `serialize.ts`;
  - la misma resolución, confirmaciones y `ResponseView`;
  - `ToolActions` (enviar, copiar, guardar, limpiar y las pestañas);
  - los borradores en memoria (D9) y "Vaciar todas las herramientas".
- [ ] "Guardar en una nota" (bloque `http`, con cerca de 4 si hace falta) y "Traer de una nota" (la primera petición del bloque) (HT28).
- [ ] Textos de §8.8 en `devtools` y `httpClient`.
- [ ] `specs/devtools`: D11 reescrito, el grupo Red en D1/D0 y las tareas.
- [ ] Prueba de humo en `views.test.tsx` y prueba en el navegador: DevTools con y sin Cliente HTTP activa.

## Al cerrar

- [ ] Documentar en el vault (`02 Decisiones/`) la decisión de las peticiones en las notas y los secretos por variable, si Jorge lo aprueba como está.
- [ ] Actualizar este archivo con lo hecho y las diferencias con el diseño, como en `specs/pomodoro/tasks.md`.
