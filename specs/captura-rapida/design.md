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

- `quick_capture_enable(shortcut)`: registra el atajo (C1), crea la
  ventana oculta si no existe y agrega "Captura rápida" a la bandeja
  (C4). Devuelve `ok` o el error de C3: `invalid`, `taken` o
  `unsupported`.
- `quick_capture_set_shortcut(shortcut)`: libera el anterior y registra
  el nuevo. Si el nuevo falla, vuelve a registrar el anterior.
- `quick_capture_disable()`: libera el atajo, cierra la ventana y quita
  la entrada de la bandeja (C5, C20).
- `quick_capture_toggle()`: lo que hace el atajo y la bandeja. Si está
  visible la oculta (C7); si no, la centra en el monitor del puntero, la
  muestra, le da el foco y le emite `quick-capture:shown` (C6).
- `quick_capture_hide()`: la oculta. En macOS, si la ventana principal
  no está visible, llama a `AppHandle::hide()` para que el foco vuelva a
  la app anterior (C11). En Windows el sistema ya lo devuelve; en Linux
  depende del gestor de ventanas.

Ventana: etiqueta `quick-capture`, URL `index.html?window=quick-capture`,
600 × 220, sin decoración, `always_on_top`, `skip_taskbar`, no
redimensionable, `visible_on_all_workspaces` (para que aparezca sobre
apps en pantalla completa en macOS). Al perder el foco, Rust la oculta
(C10).

La bandeja se arma hoy en `setup()` con un menú fijo. Pasa a una función
`build_tray_menu(app, capture: Option<&str>)` que se vuelve a llamar con
`tray.set_menu(...)` al activar, desactivar o cambiar el atajo.

Capacidades: `capabilities/quick-capture.json` solo para esa ventana,
con `core:event:default` y `core:window:allow-hide`. Ni `fs`, ni
`dialog`, ni `updater`. Los comandos propios de la app no se filtran por
ventana mientras no haya un manifiesto de la app en `build.rs`, pero la
ventana carga el mismo bundle firmado, así que se acepta.

## Ventana de captura (frontend)

- `main.tsx`: si `?window=quick-capture`, carga con `import()` solo
  `src/extensions/quick-capture/CaptureWindow.tsx` y no `App`. No importa
  el store ni lee archivos.
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
- Al guardar, emite a `main` `quick-capture:save`
  `{ id, kind, title, content, project | folder, open }` y espera
  `quick-capture:reply` con el mismo `id`, 5 s como mucho (C17).
- Un ErrorBoundary propio envuelve la ventana (C21).

## Módulo en la ventana principal (`extensions/quick-capture/index.ts`)

- `start()`:
  - llama a `quick_capture_enable` con el atajo de `settings`;
  - escucha `quick-capture:context` y `quick-capture:save`;
  - devuelve la función que deja de escuchar y llama a
    `quick_capture_disable`.
- `save`:
  - tarea: `createTask(title, project, content, undefined, { open: false })`;
  - nota: `createNoteWith({ title, content, folder })`;
  - con `open`: muestra la ventana principal (comando existente o
    `getCurrentWindow().show()`), cambia a la sección y abre lo creado,
    como hace hoy "Nueva tarea" de la bandeja.
  - Responde `{ ok: true, kind, where }` o `{ ok: false, error }`.
- `Settings`: grabador del atajo (escucha `keydown` y lo traduce al
  formato del plugin, `CommandOrControl+Shift+Space`), el estado del
  registro (C3), el tipo por defecto y los destinos por defecto.

## Configuración

```jsonc
// AppConfig.extensions["quick-capture"].settings (sin secretos)
{ "shortcut": "CommandOrControl+Shift+Space",
  "kind": "task",
  "project": "",   // "" = raíz
  "folder": "" }
```

Sin `secretKeys` ni `sendsDataExternally` (C19).

## Punto de extensión nuevo (R25 de la base)

Es la primera extensión con atajo global y ventana propia. Se agrega a
la base como R25 para que lo use la siguiente (por ejemplo, un Pomodoro
flotante): la ventana es de la extensión, se crea al activarla y se
destruye al desactivarla, y no escribe en disco por su cuenta.

## Riesgos

- **Conflictos del atajo:** macOS no siempre avisa si otra app ya usa el
  atajo; puede registrarse y no dispararse. El panel lo explica y deja
  probarlo ("Probar atajo").
- **Wayland:** el plugin no admite atajos globales ahí; queda la bandeja
  (C3, C4).
- **Ventana principal ocupada:** si está bloqueada en algo largo (la
  primera sincronización), la respuesta puede pasar de 5 s; el texto no
  se pierde (C17).
