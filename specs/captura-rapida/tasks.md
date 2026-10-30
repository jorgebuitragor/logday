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
- [ ] QA en la app aislada: atajo con la app oculta y con otra app al
  frente, guardar tarea y nota, ⌘+Enter, Esc con borrador, foco de
  vuelta, atajo ocupado, bandeja, desactivar.
- [ ] Compilar en Windows y Linux (el plugin de atajos y la ventana).
