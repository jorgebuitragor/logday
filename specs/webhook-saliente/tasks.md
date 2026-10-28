# Webhook saliente (n8n) — Tareas

Estado: en progreso.

- [x] Decisión: tercera extensión del orden de Jorge (28 oct 2026).
- [x] `appEvents.ts` y las llamadas desde el store (R23 de la base).
- [x] Rust: validar la URL, firmar con HMAC y enviar, con pruebas.
- [x] Módulo: `buildPayload`, oyente de eventos, botón del daily y panel.
- [x] Guía para n8n y textos en es y en.
- [x] Pruebas, build, lint y `cargo test`.
- [x] QA en la app aislada (28 oct 2026), con un servidor local que hace
  de n8n: crear una tarea envió `task.created` con la firma HMAC válida,
  `User-Agent: Logday`, JSON y sin el contenido de la tarea.
- [ ] Probar en la app `task.completed`, "Enviar prueba" y "Enviar a n8n"
  del daily, y con un n8n real (mismo envío; la lógica está en las
  pruebas).
