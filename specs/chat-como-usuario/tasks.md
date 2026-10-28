# Chat del equipo: enviar como yo (Google Chat) — Tareas

Estado: borrador.

## Decisiones

- [x] Dos formas de enviar: webhook (la de hoy) y "como yo" con OAuth,
  solo para Google Chat (28 oct 2026).
- [x] Se descarta enviar por correo a la dirección del espacio.
- [ ] De quién es el cliente OAuth: A (cada organización) o B (uno de
  Logday). Ver requirements, "Pendiente".

## Implementación (cuando esté la decisión)

- [ ] Rust `team_chat_google.rs`: inicio de sesión con loopback y PKCE,
  renovación, revocación, envío y sus pruebas.
- [ ] Enlace del espacio → `spaces/<id>`, con su tabla de casos.
- [ ] Panel: "Cómo enviar", cliente OAuth, conectar o desconectar, el
  espacio y la prueba.
- [ ] Aviso de consentimiento propio (C7).
- [ ] Guías: para "Como yo" y para administradores (crear el cliente).
- [ ] Textos en es y en.

## Verificación

- [ ] `pnpm test`, `pnpm build`, `pnpm lint` y `cargo test`.
- [ ] QA con un cliente interno de la FCV: conectar, enviar prueba y
  daily, renovar el token vencido, desconectar.
