# Cliente HTTP — Tasks

Estado: PR 1 y PR 2 implementados (31 oct 2026), y la herramienta de DevTools del PR 2 reemplazada por una pantalla propia (rama `feature/http-pantalla-propia`); faltan sus pruebas visuales y en la app de QA. Rama `feature/cliente-http`, desde `develop`. Son dos PR: el primero deja la extensión completa en las notas; el segundo sumaba la herramienta de DevTools, que ahora es la pantalla (abajo).

## Antes de empezar

- [x] Enfoque aprobado por Jorge (31 oct 2026): bloque `http` en las notas, entornos locales con secretos en el llavero, envío desde Rust y herramienta en DevTools.
- [x] Respuestas de Jorge a las decisiones de `design.md` §10: las aprobó todas como las recomienda el diseño (31 oct 2026).
- [x] Ver si `feature/devtools-opciones` ya entró en `develop`. Sí (PR logday#53): el PR 2 se integra con el orden, las ocultas y los grupos plegados (A10).

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

Rama `feature/cliente-http-devtools`, desde `develop` (con el PR 1 y `feature/devtools-opciones` dentro).

- [x] `devtools/model.ts`:
  - el grupo `network` y la herramienta `http`, al final de `TOOL_GROUPS`;
  - `availableTools()` (y `availableToolsIn(extensions)`), que reciben `resolveToolList`, `availableGroups`, `moveGroup(To)`, `visibleToolCount`, `setToolHidden` e `isToolHidden` (specs/devtools design §G.4);
  - `LANGUAGE_TOOL.http` y `OUTPUT_LANGUAGE.http`;
  - integrado con el orden, las ocultas y los grupos plegados: sin Cliente HTTP, Red no aparece y las flechas de los grupos la saltan; lo guardado de ella se conserva.
- [x] `ui/meta.ts` (`TOOL_ICON.http = Globe`, `PICKER_TOOLS`, `TOOL_HELP.http`) y `View.tsx`:
  - `VIEWS.http`, cargada solo al abrirla;
  - `availableTools` en la columna, el selector, el buscador, ⌥⌘↓/↑, `lastTool` (si era `http` y no está, se abre JSON) y "Traer de una nota";
  - `privacyNoteWithHttp` en el pie mientras está la herramienta.
- [x] `views/HttpTool.tsx` (§3):
  - el formulario y `core/serialize.ts`;
  - la misma resolución, confirmaciones y `ResponseView`;
  - `ToolActions` (enviar, copiar el cuerpo, guardar, limpiar y las pestañas);
  - los borradores en memoria (D9) y "Vaciar todas las herramientas", que también olvida la respuesta.
- [x] "Guardar en una nota" (bloque `http` con `formatFence`, que alarga la cerca si hace falta) y "Traer de una nota" (la primera petición del bloque, con el aviso si había más) (HT28).
- [x] Textos de §8.8 en `devtools` y `httpClient`, es y en.
- [x] `specs/devtools`: D11 reescrito, D0 y D25 (el grupo Red), design §G.4 y las tareas.
- [x] Pruebas: `core/serialize.test.ts`, `devtools/httpTool.test.tsx` (aparece y desaparece, cada estado, el envío con Rust simulado y sus confirmaciones, guardar en una nota, paridad y voseo), `settings.test.ts` con y sin Cliente HTTP y la ayuda en `HelpPopover.test.tsx`.
- [x] Primera prueba en el navegador (31 oct 2026, Tauri simulado, tema oscuro): DevTools abre en Cliente HTTP con el formulario, el entorno y el aviso; un POST con `Content-Type` y cuerpo JSON se envía con esos datos (más `User-Agent`) y la respuesta aparece debajo; «Guardar en una nota» crea la nota con el bloque `http` equivalente y el toast con «Abrir».
- [ ] Resto de la prueba en el navegador, en los temas claro, oscuro y sepia:
  - DevTools con y sin Cliente HTTP activa: la columna, el buscador, ⌥⌘↓/↑, el pie, la ayuda y Opciones → DevTools;
  - apagar Cliente HTTP con su herramienta abierta, y volver a encenderla;
  - enviar con el botón, ⌘↵ y Enter en la URL; cancelar con Esc; ⌥⌘1–3; ⌘⇧C, ⌘⇧S, ⌘⇧O y ⌘⇧⌫;
  - las confirmaciones (entorno protegido y host ajeno), "Guardar en una nota" (abrir la nota y ver el bloque) y "Traer de una nota" con un bloque de varias peticiones;
  - la ventana angosta (las cabeceras y el cuerpo se apilan).

### Diferencias con el diseño (PR 2)

- **El motor, sin copiar:** la herramienta es un bloque más del store del Cliente HTTP, con la clave `devtools#0` (`DEVTOOLS_NOTE_ID`, `DEVTOOLS_KEY`). El formulario se pasa a texto con `serializeForm` y se envía con `sendRequest`, así que las confirmaciones, los límites, las cabeceras automáticas y los errores son los del bloque.
- **La confirmación, "Enviando…" y el error con Reintentar** salieron de `ui/Block.tsx` a `ui/SendStatus.tsx` (`ConfirmBox`, `SendProgress`, `SendFailure`), que usan los dos. El bloque se ve igual.
- **`ResponseView`** acepta `tab` y `onTabChange` para ⌥⌘1–3. En la herramienta no lleva "Cerrar la respuesta": la cierra Limpiar.
- **La respuesta sigue a la vista al cambiar la URL**, marcada como vieja ("La petición cambió…"): la herramienta tiene una sola petición. Para eso la caché tiene `peek()` (`readDevtoolsResult`). En el bloque sigue la regla de `firstLine` (A8).
- **`serializeForm`:** quita las líneas en blanco de las cabeceras (en el bloque, una línea en blanco empieza el cuerpo) y, con HEAD, no lleva el cuerpo. Los problemas dicen la línea de su campo (`fieldOf`), y el campo queda con `aria-invalid`.
- **Una línea `###` en el cuerpo** partiría la petición en dos al enviarla: la herramienta no envía y lo dice (`toolBodySeparator`).
- **"Traer de una nota"** usa el texto que ya tenía DevTools ("Abrir en Cliente HTTP" sale de `pickerOpenIn`), así que no hace falta `toolOpenIn`; un bloque que no es `http`, con Cliente HTTP abierta, va a JSON (`fallbackTool`), no al formulario. "Limpiar" es el `clear` de DevTools, sin `toolClear`.
- **Textos nuevos que no estaban en §8.8:** `toolUrlEmpty`, `toolBodySeparator`; en `devtools`, `http.help1–3` ("En esta herramienta"), y `help.k.runHttp` y `help.k.tabsHttp`, que la ayuda usa en lugar de `help.k.run` y `help.k.tabs` solo mientras está la herramienta.
- **El aviso fijo** va con el prop nuevo `notice` de `ToolFrame`.
- **Apagar Cliente HTTP** también olvida lo escrito en la herramienta (`clearToolDrafts('http')`, desde su parada), además de las respuestas.
- **`saveOutputAsNote`** usa siempre `formatFence`: la cerca lleva una comilla más que la línea más larga que empiece por comillas, en vez de 4 fijas. Vale para todas las herramientas.
- **`toolForBlock`** abre un ```` ```http ```` en Cliente HTTP solo si está; un bloque sin lenguaje no se reconoce como petición.

## Pantalla propia (31 oct 2026, HT33–HT35)

Rama `feature/http-pantalla-propia`, desde `develop`. Pedido por Jorge (requirements, "Cambio del 31 oct 2026: pantalla propia"; design §11).

- [x] Registro: `view: true` (HT33). `index.ts` aporta `View`; su parada ya no toca los borradores de DevTools.
- [x] `core/noteRequests.ts` (puro): `collectNoteRequests`, `filterNoteRequests`, `shortUrl`, `requestTitle`, `countRequests`, con `noteRequests.test.ts` (varios bloques, `###`, mal formados, vacíos, notas sin bloques, cercas de 4, más de 20, el buscador).
- [x] `core/serialize.ts`: `formFromBlock(code, index)` carga cualquier petición del bloque; una línea que no se entiende (o un método no admitido) va entera a la URL.
- [x] `store.ts`: `form` y `origin` en memoria, `formNoteId`/`formKey` (`view:<nota>:<bloque>:<petición>` y `view:new`), `readFormResult`, `setFormField`, `loadForm`, `newForm`. Fuera `DEVTOOLS_NOTE_ID`, `DEVTOOLS_KEY`, `readDevtoolsResult` y `resetDevtoolsSlot`.
- [x] `ui/RequestForm.tsx` (lo que era `devtools/views/HttpTool.tsx`, sin el marco de DevTools), `ui/View.tsx` (la columna y la pantalla) y `ui/Help.tsx`.
- [x] `lib/allNotes.ts`: `readAllNotes` sale de `devtools/notes.ts` para compartirla.
- [x] Ayuda: `helpTopics.ts` y `ScreenHelp.tsx` (specs/ayuda-contextual AY30).
- [x] Opciones → Cliente HTTP: el pie apunta a la pantalla, con "Abrir Cliente HTTP". El aviso de R6 y la descripción de la extensión nombran la pantalla.
- [x] DevTools vuelve a antes del PR 2 (specs/devtools, tareas "Quitar Cliente HTTP de DevTools").
- [x] Textos es y en con las mismas claves; fuera `devtoolsHint`, `devtoolsOffHint` y `toolLoadedMulti`.
- [x] Pruebas: `view.test.tsx` (la vista registrada y su sección, la columna en cada estado, cargar una petición, el formulario en cada estado, el envío con Rust simulado y sus confirmaciones, una respuesta por petición, "Nueva petición", la parada, "Guardar en una nota", la ayuda, paridad y voseo), `serialize.test.ts`, `ui.test.tsx` (el pie de Opciones) y `SidebarHelp.test.tsx` (el tema y el título de la ayuda).
- [ ] Prueba en el navegador y en la app de QA, en los temas claro, oscuro y sepia:
  - activar la extensión: aparece la sección con `Globe`; apagarla con la pantalla abierta lleva a Inicio;
  - la columna con notas de varias carpetas, un bloque con `###`, uno mal escrito, el buscador, "Actualizar", y que se actualice tras editar una nota y volver;
  - elegir una petición, "Abrir la nota", "Nueva petición", "Guardar en una nota" (aparece en la columna);
  - enviar con el botón, ⌘↵ y Enter en la URL; cancelar con Esc; las confirmaciones; ir de una petición a otra y volver (cada una con su respuesta);
  - la ventana angosta (la columna arriba, el formulario debajo) y el foco con el teclado;
  - la ayuda de la sección y el enlace de Opciones.

### Diferencias con el pedido

- **"Traer de una nota" no está:** lo reemplaza la columna, que ya muestra todos los bloques `http`.
- **Sin "Limpiar"** en el formulario: "Nueva petición" hace lo mismo y además deja de apuntar a la nota.
- **Atajos:** solo ⌘↵, Enter en la URL y Esc. Los ⌘⇧C, ⌘⇧S, ⌘⇧⌫ y ⌥⌘1–3 eran convenciones de DevTools y no se trajeron; las pestañas de la respuesta se recorren con ←/→ (roving tabindex).
- **"Guardar en una nota" crea siempre una nota nueva**, también si la petición vino de una nota: no reescribe el bloque original. La petición sigue en el formulario como antes (sin pasar a "venir" de la nota nueva), para que su respuesta no se pierda.
- **Una respuesta por petición:** cada petición de la columna tiene su clave en la caché (§11.2), en vez de una sola respuesta para todo el formulario.

## Lenguaje, método y cURL en la barra (31 oct 2026, HT36–HT38)

Rama `feature/http-pantalla-propia`. Pedido por Jorge al probar (requirements, "Cambio del 31 oct 2026: lenguaje, método y cURL en la barra del bloque"; design §12).

- [x] Base (specs/extensiones R24): `setLanguage` y `setCode` en `NoteBlockProps`, en `InlineExtensionBlockView`, con `setBlockLanguageTr`, `setBlockCodeTr` y `changedRange` puros en `extensionBlockPos.ts`.
- [x] `core/parse.ts`: `requestLine` en cada petición. `core/edit.ts`: `setRequestMethod`, `toCurl` y `shellQuote`.
- [x] Barra (`ui/Block.tsx`): selector de lenguaje, selector de método y "Copiar como cURL". `ui/Menu.tsx` suma typeahead.
- [x] Textos es y en con las mismas claves (§12.3).
- [x] Pruebas: `core/edit.test.ts` (varias peticiones con `###`, comentarios, línea sin método, minúsculas, método no admitido, GET/HEAD con cuerpo; cURL con variables, comillas, saltos de línea, Content-Type automático, HEAD y la query en líneas `?`/`&`), `extensionBlockPos.test.ts` (las transacciones: lenguaje, cursor, bloque vacío, tramo distinto) y `ui.test.tsx` (la barra con los selectores y cURL, sin las acciones del editor, la petición del cursor, en inglés).
- [ ] Prueba en la app de QA: cambiar a JSON y a Texto desde la barra (el bloque pasa a normal con su selector, sin saltar el scroll, con el foco en el código); cambiar el método con el ratón y el teclado (typeahead), con varias peticiones y con el cursor en otra; ⌘Z; pegar el cURL en una terminal.

### Diferencias con el pedido

- **Sin buscador en el selector de lenguaje:** el normal tiene uno, pero es solo con el ratón. El de la barra es el `Menu` accesible de la barra, con typeahead (escribir "ja" salta a Java), que con once lenguajes cumple lo mismo.
- **cURL en la barra**, no en la franja: así está también sin respuesta. HEAD va con `--head` (con `-X HEAD` curl espera un cuerpo) y sin cuerpo. Las comillas son de sh y zsh; en `cmd.exe` de Windows no sirven.
- **"Texto" traducido** en el selector de la barra (`langPlain`); el selector normal sigue diciendo "Texto" también en inglés (`CODE_LANGUAGE_OPTIONS`), sin cambiar.
- **La pantalla Cliente HTTP** no tiene "Copiar como cURL" todavía: el pedido era el bloque de la nota.

## Pegar un cURL (31 oct 2026, HT39–HT41)

Rama `feature/http-pantalla-propia`. Pedido por Jorge (requirements, "Cambio del 31 oct 2026: pegar un cURL"; design §13).

- [x] `core/curl.ts` y `core/shell.ts` (puros): `shellWords` (comillas, escapes, `$'…'`, continuaciones, variables del shell), `fromCurl` y `formatJsonBody`, con `core/curl.test.ts` (Chrome, Postman, Insomnia, comillas dobles, `-sSL`, `-u`, `--json`, `-G -d`, `-I`, `@archivo`, `-F`, encadenados, texto que no es curl, URL sin esquema, PowerShell y cmd, opciones desconocidas, cuerpos grandes, los valores sensibles y la ida y vuelta con `toCurl`).
- [x] Base (specs/extensiones R24): `ExtensionModule.convertPaste` y `extensionRuntime.peek`; `components/notes/extensionPaste.ts` (puro: dónde se pega, qué se hace y las dos transacciones) con su prueba, y `handlePaste` en `NoteEditor.tsx`.
- [x] `paste.ts`: `convertCurlPaste` (el `convertPaste` del módulo) y `notifyCurlConverted` (anuncio y aviso con "Abrir Entornos"), con `paste.test.ts`.
- [x] Pantalla: `onPaste` en la URL de `ui/RequestForm.tsx` y `setForm` en el store (HT41).
- [x] Textos es y en con las mismas claves (§13.4).
- [ ] Prueba en el navegador y en la app de QA: pegar un "Copiar como cURL" de Chrome y uno de Postman en un párrafo vacío, en medio de un párrafo, en un bloque `http`, en un bloque `bash`; ⇧⌘V; ⌘Z y otro ⌘Z; el aviso y "Abrir Entornos"; con la extensión apagada; y en la URL de la pantalla.

### Diferencias con el pedido

- **No se convierte (y se pega tal cual)** con `-F`, un cuerpo o cabeceras desde un archivo (`@archivo`), `-T`, `-K`, `--digest`/`--ntlm`, `--unix-socket`, `--next` o varias URL: un bloque que se ve bien pero se envía sin el cuerpo sería peor que el texto original. Tampoco cuando hay otro comando, una tubería o una redirección (`| jq` incluido): así nunca se pierde nada de lo pegado.
- **Sintaxis de cmd.exe** (`^"…^"`, el "Copiar como cURL (cmd)" de Chrome en Windows) no se entiende: no se convierte. La continuación `^` y la de PowerShell (`` ` ``) al final de la línea sí, con las comillas de sh.
- **Content-Type de curl:** con `-d` y un cuerpo `clave=valor`, el bloque lleva `application/x-www-form-urlencoded`, como lo envía curl; con un cuerpo JSON no, porque Logday pone el de JSON (decisión 6); con otro texto, tampoco.
- **`--max-time`** no se copia: el tiempo límite es una opción de Opciones (HT24), no del bloque.
- **"Pegar sin formato"** se reconoce por ⇧⌘V (o ⌥⇧⌘V) en el teclado: el evento de pegar no lo dice. Pegar sin formato desde un menú, sin el atajo, convierte.
- **Valores en el cuerpo:** además de lo pedido (cabeceras y query), se ocultan los campos sensibles de un cuerpo JSON o de formulario (`"password": "{{password}}"`), porque "Copiar como cURL" de un inicio de sesión los trae.

## Al cerrar

- [ ] Documentar en el vault (`02 Decisiones/`) la decisión de las peticiones en las notas y los secretos por variable, si Jorge lo aprueba como está.
- [ ] Actualizar este archivo con lo hecho y las diferencias con el diseño, como en `specs/pomodoro/tasks.md`.
