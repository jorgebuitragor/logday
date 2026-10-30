# Captura rápida — Design

## Idea central: una ventana que no escribe

La ventana de captura solo junta el texto. Quien crea la tarea o la nota
es la ventana principal, con sus acciones del store (C15):

```
atajo global ──► Rust ──► muestra la ventana "quick-capture"
                              │  (el usuario escribe y pulsa Enter)
                              ▼
        quick-capture:save ──► ventana "main" (módulo de la extensión)
                                  createTask / createNoteWith
        quick-capture:reply ◄──┘  { ok, title, where } o { error }
```

La ventana principal es la única que escribe en disco, lleva la cola del
sync, el CRDT de las notas y emite los eventos de la app (R23). Si la
captura tuviera su propio store, habría dos escritores con estados
distintos de las mismas carpetas. Aunque esté oculta (cerrar solo la
oculta, `lib.rs`), su webview sigue vivo y atiende el evento.

Descartado:

- **Escribir el archivo desde Rust:** se salta el store, así que no hay
  sync, ni LWW, ni eventos (va contra R18).
- **Reusar "Nueva tarea" de la bandeja:** muestra la ventana principal
  entera y cambia de sección; es justo lo que se quiere evitar (C6).

## Rust (`extensions/quick_capture.rs`)

Plugin nuevo: `tauri-plugin-global-shortcut` 2. El atajo se registra
desde Rust, así que el webview no necesita permisos del plugin.

- `quick_capture_configure(shortcut, label, pretty)`: activa la captura o
  cambia su atajo. Libera el anterior, registra el nuevo (C1), crea la
  ventana oculta si no existe y deja "Captura rápida" en la bandeja (C4),
  con el atajo al lado si quedó registrado. `label` y `pretty` los arma el
  webview, en el idioma de la app. Si el atajo falla devuelve `invalid`,
  `taken` o `unsupported` (C3), pero la ventana y la bandeja quedan; el
  panel vuelve a registrar el atajo anterior.
- `quick_capture_disable()`: libera el atajo, quita la entrada de la
  bandeja y destruye la ventana (C5, C20).
- `toggle(app)` (no es comando): lo que hacen el atajo y la bandeja. Si
  está visible la oculta (C7); si no, anota si Logday era la app activa,
  la pone en el monitor del puntero, la muestra y, ya en el bucle de
  eventos, le da el foco y emite `quick-capture:shown` (C6). En macOS,
  `set_focus` no hace nada si la ventana todavía no se ve.
- `quick_capture_focus()`: la ventana lo pide hasta cinco veces si al
  mostrarse no tiene el foco. Con otra app al frente, activar Logday
  desde el atajo a veces falla a la primera (QA, 29 oct 2026).
- `quick_capture_hide()`: Esc, después de guardar o el atajo con la
  ventana abierta. En macOS, si Logday no era la app activa al abrirla,
  llama a `AppHandle::hide()` para que el foco vuelva a la app anterior
  sin traer la ventana principal (C11). En Windows el sistema ya lo
  devuelve; en Linux depende del gestor de ventanas.
- Perder el foco (un clic fuera) solo oculta la ventana: el foco ya fue a
  donde se hizo clic, aunque sea la ventana principal (C10).
- `quick_capture_open_main()`: ⌘/Ctrl+Enter (C13). Oculta la captura y
  muestra la ventana principal, que ya abrió lo creado.

Ventana: etiqueta `quick-capture`, URL `index.html` (el frontend la
reconoce por la etiqueta), 600 × 220, sin decoración, `always_on_top`, `skip_taskbar`, no
redimensionable, `visible_on_all_workspaces` (para que aparezca sobre
apps en pantalla completa en macOS).

La bandeja se armaba en `setup()` con un menú fijo. Ahora lo arma
`build_tray_menu(app)` en `lib.rs`, que lee el texto de "Captura rápida"
del estado de la extensión, y `refresh_tray(app)` lo vuelve a poner con
`tray.set_menu(...)` al activar, desactivar o cambiar el atajo.

Capacidades: `capabilities/quick-capture.json` solo para esa ventana,
con `core:event:default` y `core:window:allow-hide`. Ni `fs`, ni
`dialog`, ni `updater`. Los comandos propios de la app no se filtran por
ventana mientras no haya un manifiesto de la app en `build.rs`, pero la
ventana carga el mismo bundle firmado, así que se acepta.

## Ventana de captura (frontend)

- `main.tsx`: lee la etiqueta de la ventana (`getCurrentWindow().label`).
  Si es `quick-capture`, carga con `import()` solo
  `src/extensions/quick-capture/CaptureWindow.tsx`; si no, `App`, también
  con `import()`, para que la captura no cargue el store ni lea archivos.
- `applyThemeToDOM` vive hoy en `appStore.ts`. Se mueve a
  `src/lib/theme.ts` (el store la reexporta), para aplicar el tema sin
  importar el store (C12).
- Al recibir `quick-capture:shown`, pide el contexto a la ventana
  principal: idioma, tema, temas propios, si hay carpeta de datos (C18),
  proyectos, carpetas de notas y los valores por defecto del panel.
  Mientras no llega, se puede escribir; los selectores se llenan después.
- Teclas: Enter guarda; ⌘/Ctrl+Enter guarda y abre (C13); Shift+Enter,
  salto de línea (C9); Esc oculta (C10); Tab recorre texto → tipo →
  destino (C8).
- El borrador vive en el estado de la ventana, que solo se oculta, nunca
  se cierra mientras la extensión esté activa (C10). Se vacía al guardar.
- Las dos ventanas hablan con `quick-capture:request` y
  `quick-capture:reply` (eventos de Tauri, con un `id` por petición):
  `{ type: 'context' }` y `{ type: 'save', kind, title, content, target,
  open }`. La captura espera la respuesta 5 s como mucho (C17).
- Un ErrorBoundary propio envuelve la ventana (C21).

## Módulo en la ventana principal (`extensions/quick-capture/index.ts`)

- `start()`:
  - llama a `quick_capture_configure` con el atajo de `settings`, y otra
    vez si cambia el idioma (el texto de la bandeja);
  - escucha `quick-capture:request`;
  - devuelve la función que deja de escuchar y llama a
    `quick_capture_disable`.
- `save`:
  - tarea: `createTask(title, project || 'inbox', content, undefined, { open })`;
  - nota: `createNoteWith({ title, content, folder })` y, con `open`,
    `setActiveNote(note)`;
  - con `open`: primero muestra la ventana principal
    (`quick_capture_open_main`), después la sección con el editor vacío
    y, ya montado, lo creado. La tarea se abre en su proyecto, para que se
    vea en la lista.
  - Ese orden sale de la QA: si el editor de notas se monta por primera
    vez con una nota ya elegida, falla (`commandManager` nulo), y Kanban y
    Calendario, que se cargan con `lazy`, cierran el panel de la tarea al
    montarse. Por eso se cargan antes esos módulos y se esperan dos
    cuadros antes de abrir lo creado.
  - Responde `{ ok: true, kind, where }` o `{ ok: false, error }`.
- `Settings`: grabador del atajo (escucha `keydown` y lo traduce al
  formato del plugin, `CommandOrControl+Shift+Space`), el estado del
  registro (C3), el tipo por defecto y los destinos por defecto.

## Configuración

```jsonc
// AppConfig.extensions["quick-capture"].settings (sin secretos)
{ "shortcut": "CommandOrControl+Shift+Space",
  "kind": "task",
  "project": "inbox", // las tareas sin proyecto
  "folder": "" }     // "" = raíz
```

Sin `secretKeys` ni `sendsDataExternally` (C19).

## Punto de extensión nuevo (R25 de la base)

Es la primera extensión con atajo global y ventana propia. Se agrega a
la base como R25 para que lo use la siguiente (por ejemplo, un Pomodoro
flotante): la ventana es de la extensión, se crea al activarla y se
destruye al desactivarla, y no escribe en disco por su cuenta.

## Riesgos

- **Conflictos del atajo:** macOS no siempre avisa si otra app ya usa el
  atajo; puede registrarse y no dispararse. Si pasa, se cambia en el
  panel; la entrada de la bandeja sigue sirviendo.
- **macOS trae la ventana principal:** al activar Logday desde el atajo,
  macOS también trae al frente su ventana principal si estaba abierta
  (detrás de la captura). Al cerrar la captura, Logday se oculta y vuelve
  la app anterior (C11). Si la ventana principal estaba cerrada (en la
  bandeja), solo aparece la captura. Evitarlo del todo pide una ventana
  que no active la app (un `NSPanel`, con el crate `tauri-nspanel`); se
  deja para después si molesta.
- **Wayland:** el plugin no admite atajos globales ahí; queda la bandeja
  (C3, C4).
- **Ventana principal ocupada:** si está bloqueada en algo largo (la
  primera sincronización), la respuesta puede pasar de 5 s; el texto no
  se pierde (C17).
