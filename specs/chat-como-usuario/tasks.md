# Chat del equipo: enviar como yo (Google Chat) — Tareas

Estado: en progreso.

## Decisiones

- [x] Dos formas de enviar: webhook (la de hoy) y "como yo" con OAuth,
  solo para Google Chat (28 oct 2026).
- [x] Se descarta enviar por correo a la dirección del espacio.
- [x] Cliente OAuth: opción A, cada organización crea el suyo como app
  interna (28 oct 2026).

## Implementación

- [x] Rust `team_chat_google.rs`: inicio de sesión con loopback y PKCE,
  renovación, revocación, envío y sus pruebas.
- [x] Enlace del espacio → `spaces/<id>`, con su tabla de casos.
- [x] Panel: "Cómo enviar", cliente OAuth, conectar o desconectar, el
  espacio y la prueba.
- [x] Aviso de consentimiento propio (C7).
- [x] Guías: para "Como yo" y para administradores (crear el cliente).
- [x] Textos en es y en.

## Verificación

- [x] `pnpm test`, `pnpm build`, `pnpm lint` y `cargo test`.
- [ ] QA con un cliente interno de la FCV: conectar, enviar prueba y
  daily, renovar el token vencido, desconectar.
