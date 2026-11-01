# Captura rápida — Tareas

Estado: en progreso.

- [x] Decisión: Jorge la eligió el 29 oct 2026.
- [x] Atajo y destino por defecto: los propuestos (Jorge, 29 oct 2026).
- [x] R25 en la base: atajo global y ventana propia de una extensión.
- [x] Rust: `tauri-plugin-global-shortcut`, `quick_capture.rs` (configure,
  disable, hide, open_main y toggle), ventana y bandeja dinámica
  (C1–C7, C11, C20).
- [x] Capacidad `quick-capture.json` con permisos mínimos.
- [x] Mover `applyThemeToDOM` a `src/lib/theme.ts`.
- [x] `main.tsx`: la ventana `quick-capture` carga solo su formulario, sin
  `App` ni store.
- [x] `CaptureWindow`: texto, tipo, destino, teclas, borrador, espera de
  la respuesta y confirmación (C8–C10, C12–C14, C16–C18, C21).
- [x] Módulo: `start()`, contexto, guardar con `createTask` y
  `createNoteWith`, abrir en la ventana principal (C13, C15).
- [x] Panel: grabador del atajo, estado del registro, tipo y destinos
  por defecto (C2, C3).
- [x] Registro de la extensión (`quick-capture`, Herramientas) y textos
  en es y en (C22).
- [x] Pruebas, build, lint y `cargo test`.
- [x] QA en la app aislada (29 oct 2026, macOS, con el atajo de verdad):
  - con la app activa y con Editor de Texto al frente, el atajo abre la
    captura en el monitor del puntero y con el foco (tres veces seguidas);
  - Enter guarda la tarea en `inbox` con título y contenido, confirma
    "Tarea creada en inbox" y se oculta, sin cambiar la sección;
  - Esc conserva el borrador, que vuelve al abrirla otra vez, y devuelve
    el foco a Editor de Texto;
  - Tab llega a Tarea y Nota; con la ventana principal en la bandeja solo
    aparece la captura;
  - ⌘Enter abre la nota en Notas y la tarea en Inbox con su panel;
  - el panel muestra el atajo y su estado, y cambiarlo a ⌃⌥L libera
    ⌘⇧Espacio; "Restablecer" vuelve al de antes;
  - al desactivarla, el atajo deja de abrirla y se va su entrada de
    Opciones; al activarla otra vez no pide aviso y el atajo vuelve.
  - La QA encontró y se corrigieron: el foco con otra app al frente, el
    editor de notas al abrir con ⌘Enter y el panel de la tarea que se
    cerraba.
- [ ] Probar la entrada de la bandeja, el aviso de atajo ocupado y los
  textos en inglés.
- [ ] Compilar en Windows y Linux (el plugin de atajos y la ventana).
