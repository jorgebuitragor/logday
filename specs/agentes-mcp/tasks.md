# Agentes de IA (MCP) — Tareas

Estado: en progreso.

## Decisiones

- [x] Extensión `mcp` del grupo Integraciones, no una sección aparte de
  Opciones.
- [x] Servidor HTTP local en la app (solo `127.0.0.1`), con token; nada
  de binario aparte ni stdio.
- [x] Escrituras por el store; sin herramientas de borrar.
- [x] "Permitir cambios" apagado por defecto.

## Implementación

- [x] Rust: `mcp.rs` con `tiny_http`, `check_request`, los comandos
  `mcp_server_start`, `mcp_server_stop` y `mcp_reply`, y sus pruebas.
- [x] `protocol.ts` y `tools.ts`, con pruebas.
- [x] `storeTools.ts`: lectura de tareas de disco y escrituras con el
  store.
- [x] Registro (`registry.ts`), módulo con `start` y panel `Settings`.
- [x] Textos en `i18n.ts` (es y en).

## Verificación

- [x] `pnpm test`, `pnpm build`, `pnpm lint` (sin warnings nuevos) y
  `cargo test`.
- [x] Servidor en la app de QA (28 oct 2026), con un token de prueba:
  - con `curl`, los rechazos de R5, R8 y R9 (401, 403, 404, 405, 413),
    `initialize`, la notificación (202) y `tools/list` según "Permitir
    cambios";
  - una escritura sin permiso da error; con permiso, `create_task`,
    `update_task` (D2 selló `completed_at`) y `append_to_daily` quedan
    bien en disco;
  - Codex 0.156 (`codex exec`, servidor pasado con `-c`) usó
    `list_tasks` y `get_daily`.
- [ ] Claude Code contra la app de QA (la CLI de esta sesión no tenía la
  sesión iniciada).
- [ ] El panel en la app: activar con el aviso, generar y regenerar el
  token, copiar los comandos, cambiar el puerto y el interruptor.

## Después

- Notas: listar, buscar y leer; luego crear.
- Horas extra y calendario, en solo lectura.
- Modo cuenta en `logday-server`.
