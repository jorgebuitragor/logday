# Chat del equipo (modo local) — Tareas

Estado: en progreso.

- [x] Rust: `team_chat_validate_url` y `team_chat_send`, con validación
  de host, límite de 20 por hora, timeout de 10 s y sin redirecciones.
- [x] Pruebas en Rust: tabla de URLs (http, otro host, host parecido,
  ruta equivocada, válidas), cuerpo por proveedor, texto y límite.
- [x] Preferencias locales: proveedor, pista, último resultado; aviso
  de consentimiento de la base.
- [x] Tarjeta en Opciones → Extensiones y "Enviar al chat" en
  `DailyEditor`.
- [x] Pruebas en vitest de la configuración, los errores y "ya se envió
  hoy".
- [x] Guía paso a paso para conseguir la URL (D4), con prueba de que
  cada texto existe en es y en, sin voseo.
- [ ] Verificar con una URL real los hosts de Teams Workflows
  (`*.logic.azure.com`, `*.environment.api.powerplatform.com`) y el
  formato del cuerpo.
- [ ] Probar en la app de QA con webhooks reales de los tres
  proveedores.
