# Granola — Tareas

Estado: en progreso.

- [x] Decisión: por el MCP de Granola, porque Jorge no tiene plan pago
  (28 oct 2026).
- [x] `oauth_loopback.rs` común (Google lo usa) y `granola.rs`: registro
  dinámico, login, renovación y cliente MCP (JSON y SSE), con pruebas.
- [x] `model.ts` (lectura y `meetingToNote`), con pruebas sobre
  respuestas con la estructura real y datos inventados (`fixtures.ts`).
- [x] Importador, módulo con importación automática, panel y guía.
- [x] Textos en es y en.
- [x] Pruebas, build, lint y `cargo test`.
- [x] El registro dinámico con `curl` (28 oct 2026): Granola aceptó un
  cliente público con `redirect_uri` en `127.0.0.1` (201).
- [x] El importador de punta a punta en el navegador, con las acciones
  reales del store y respuestas de Granola de los fixtures:
  - creó 2 notas en `notes/Granola/`;
  - la segunda importación no duplicó y pidió `updated_after`.
- [ ] QA: conectar con la cuenta de Jorge en la app de QA e importar.
