# Captura rápida — Tareas

Estado: en diseño.

- [x] Decisión: Jorge la eligió el 29 oct 2026.
- [ ] Resolver las preguntas abiertas de `requirements.md` (atajo por
  defecto y destino por defecto).
- [ ] R25 en la base: atajo global y ventana propia de una extensión.
- [ ] Rust: `tauri-plugin-global-shortcut`, `quick_capture.rs` (enable,
  set_shortcut, disable, toggle, hide), ventana y bandeja dinámica
  (C1–C7, C11, C20).
- [ ] Capacidad `quick-capture.json` con permisos mínimos.
- [ ] Mover `applyThemeToDOM` a `src/lib/theme.ts`.
- [ ] `main.tsx`: entrada `?window=quick-capture` sin `App` ni store.
- [ ] `CaptureWindow`: texto, tipo, destino, teclas, borrador, espera de
  la respuesta y confirmación (C8–C10, C12–C14, C16–C18, C21).
- [ ] Módulo: `start()`, contexto, guardar con `createTask` y
  `createNoteWith`, abrir en la ventana principal (C13, C15).
- [ ] Panel: grabador del atajo, estado del registro, tipo y destinos
  por defecto (C2, C3).
- [ ] Registro de la extensión (`quick-capture`, Herramientas) y textos
  en es y en (C22).
- [ ] Pruebas, build, lint y `cargo test`.
- [ ] QA en la app aislada: atajo con la app oculta y con otra app al
  frente, guardar tarea y nota, ⌘+Enter, Esc con borrador, foco de
  vuelta, atajo ocupado, bandeja, desactivar.
- [ ] Compilar en Windows y Linux (el plugin de atajos y la ventana).
