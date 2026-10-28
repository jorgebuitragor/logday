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
- [x] QA de Jorge en la app (28 oct 2026): activó la extensión con el
  aviso, generó el token desde el panel, registró el servidor en su
  agente y confirmó que la integración funciona.
- [x] "Permitir cambios" en la app (28 oct 2026): el interruptor se
  guarda y vale en la siguiente petición, sin reiniciar el servidor.
- [x] Cambiar el puerto en la app (28 oct 2026): 47321 → 47322 guarda el
  puerto y el servidor reabre en el nuevo. En esa prueba apareció un
  fallo: reabrir releía el token del llavero, y en macOS (con la firma de
  la app de QA cambiada) eso abre un aviso que pide la contraseña.
  Mientras no se respondía, el servidor quedaba cerrado y el panel seguía
  diciendo "Escuchando". Corregido: el token se guarda en memoria y el
  panel dice "Abriendo el servidor".
- [x] Con la corrección (28 oct 2026): 47322 → 47321 reabre en menos
  de un segundo, sin aviso del llavero. Regenerar el token lo guarda
  (pista nueva), reabre el servidor con él, el comando copiado funciona
  con `tools/list`, y un token cualquiera da 401. En macOS, guardar y
  leer el token puede pedir permiso una vez en cada build nuevo de la
  app de QA (la firma cambia); con la app firmada de release no debería
  pasar.

## Después

- Notas: listar, buscar y leer; luego crear.
- Horas extra y calendario, en solo lectura.
- Modo cuenta en `logday-server`.
