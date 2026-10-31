# Cliente HTTP — Tasks

Estado: pendiente. Rama `feature/cliente-http`, desde `develop`. Son dos PR: el primero deja la extensión completa en las notas; el segundo suma la herramienta de DevTools.

## Antes de empezar

- [x] Enfoque aprobado por Jorge (31 oct 2026): bloque `http` en las notas, entornos locales con secretos en el llavero, envío desde Rust y herramienta en DevTools.
- [ ] Respuestas de Jorge a las decisiones de `design.md` §10. Si cambia la 1 (inline o modal), cambian las tareas del bloque.
- [ ] Ver si `feature/devtools-opciones` ya entró en `develop`. Solo afecta al PR 2 (A10).

## PR 1: la extensión en las notas

### Base de extensiones (`specs/extensiones`, R24 y R8)

- [ ] `types.ts`:
  - `'http-client'` en `ExtensionId`;
  - `noteBlock.inline` y `noteBlock.template`;
  - `NoteBlockProps.part`, `noteId` e `index`;
  - `dynamicSecretKeys` (A3.1, A3.2, A3.4).
- [ ] `mermaidCodeBlock.tsx`: la variante inline de `ExtensionCodeBlockView`, con el código visible y las islas `header` y `footer` (A3.1). `NoteEditor.tsx`:
  - pasa `noteId`;
  - "Nuevo bloque" inserta `template` para los bloques inline, sin `NoteBlockEditor`, y deja el cursor al final de la URL (HT9).
- [ ] `Mod-Enter` en `MermaidAwareCodeBlock.addKeyboardShortcuts()` y el bus `src/extensions/noteBlockEvents.ts` (A3.3), con prueba: dentro del bloque lo maneja; fuera, no.
- [ ] `removeExtensionConfig` borra también `dynamicSecretKeys(settings)`, con prueba en `actions.test.ts` o en el store (HT22).
- [ ] `NoteList.tsx`: no quitar del resumen los bloques inline (A3.5).
- [ ] `lowlight` de `NoteEditor.tsx`: sumar `http` (A3.6). `codeHighlight.ts`: `http` en `CODE_LANGUAGE_OPTIONS`.
- [ ] `App.css`: `.extension-node-inline` y la anulación de `.extension-block-ui` (A3.7, hallazgo 3).
- [ ] `lib/fencedBlocks.ts`: lenguaje exacto y cercas de 3 o más comillas invertidas, con pruebas (hallazgo 2). Que sigan pasando las de Excalidraw.
- [ ] `specs/extensiones/requirements.md` y `design.md`:
  - R24 con el modo inline;
  - R8 con las claves dinámicas;
  - la excepción de R17 (hallazgo 7).

### Núcleo puro (`src/extensions/http-client/core/`, vitest)

- [ ] `parse.ts` con `parse.test.ts`: todas las reglas de A4 y sus números de línea (HT5–HT7).
- [ ] `environments.ts`: leer y validar los ajustes, los nombres, `trustedHosts` (también desde la pista de un secreto URL), duplicar y las claves `v_`/`e_`. `secretKeys.ts`, para el registro (A6, HT17–HT22).
- [ ] `resolve.ts`: variables normales, secretas, sin valor, no definidas y del sistema; validar la URL; cabeceras automáticas; `needsConfirm` (A5, HT15, HT16, HT20, HT21).
- [ ] `body.ts`: elegir la vista y el respaldo cuando el JSON o el XML no son válidos (A9, HT10, HT12).
- [ ] `cache.ts`: LRU por entradas y bytes, la regla de `firstLine` y `stale` (A8, HT11).
- [ ] `api.ts`: los `invoke` y la traducción de `SendError` a los textos de §8.5.

### Rust (`src-tauri/src/extensions/http_client.rs`)

- [ ] `http_client_send` y `http_client_cancel` con la firma de A7. Se registran en `extensions/mod.rs` y en el `invoke_handler` de `lib.rs`.
- [ ] Validación (método, cabeceras, tamaño, esquema, credenciales), los secretos desde el llavero con `keychain()` y `read_secret`, y la comprobación de hosts de confianza (HT21, HT23).
- [ ] Dos clientes en un `OnceLock`, con y sin verificación de certificados, el tiempo límite por petición y redirecciones a mano con `next_hop` (HT24, HT25).
- [ ] Lectura del cuerpo con tope, la clasificación texto o binario, y enmascarar `final_url` y `Location`.
- [ ] Cancelar con el `JoinHandle` de `tauri::async_runtime::spawn`, el tope de 6 en curso y la limpieza del mapa (HT13).
- [ ] Códigos de error sin la URL. El texto que se busca en la cadena de `source()`, fijado con pruebas (HT26).
- [ ] Pruebas puras y con `tiny_http`, las de A7. `cargo check` y `cargo test`.

### Interfaz

- [ ] Registro (A2), `index.ts` y `start()`:
  - la región viva;
  - suscribirse al bus;
  - la parada cancela lo que está en curso y vacía la caché.
- [ ] `store.ts`: en curso, resultados y confirmaciones, por clave de bloque.
- [ ] `BlockHeader.tsx` y `BlockFooter.tsx` con todos los estados de Interfaz §1.4, la confirmación en el bloque y el foco de §5.
- [ ] `EnvironmentChip.tsx` (§1.3) y `ResponseView.tsx` (§2): pestañas, Formateado/Sin formato, tabla de cabeceras, petición enviada, imagen, binario, copiar, guardar como archivo y cerrar.
- [ ] `SEND_BTN` en `components/shared/controlClasses.ts` (§1.2).
- [ ] `Settings.tsx`, Opciones → Cliente HTTP (§4):
  - entornos en pestañas;
  - variables con secretos;
  - hosts de confianza;
  - opciones de las peticiones;
  - vacíos y confirmaciones con `useConfirmDelete`.
- [ ] Textos: `extensions['http-client.*']` y la sección `httpClient` de `i18n.ts`, es y en con las mismas claves (§8.1–§8.7), con prueba de paridad.
- [ ] Pruebas de dibujo con `react-dom/server`: el bloque en cada estado, la respuesta y el panel de Opciones.

### Verificación del PR 1

- [ ] `pnpm test`, `pnpm build`, `pnpm lint` (sin warnings nuevos sobre los 21 de base) y `cargo check`.
- [ ] Build de producción en el navegador con Tauri simulado (`send` simulado), en los temas claro, oscuro y sepia. Probar:
  - escribir un bloque, ⌘↵, varias peticiones, errores, variables que faltan;
  - confirmar con un entorno protegido y con un host ajeno;
  - cancelar, una respuesta grande y una binaria;
  - el teclado (comprobar si Tab entra en las islas en WebKit, §5).
- [ ] App de QA (`com.jorgebuitrago.logday.qatareas`, según `AGENTS.md`), contra un servidor local:
  - el llavero de macOS (un solo aviso);
  - un certificado autofirmado;
  - redirecciones;
  - el tiempo límite;
  - "Quitar configuración" borra los secretos.
- [ ] Con la extensión apagada, el bloque es código normal. Confirmar en Web que se ve como código.

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
