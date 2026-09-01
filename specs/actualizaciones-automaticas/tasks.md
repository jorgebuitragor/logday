# Actualizaciones automáticas — Tareas

Estado: en diseño, sin empezar.

## Firma y llaves

- [ ] Generar el par de llaves (`pnpm tauri signer generate -w
      ~/.tauri/logday-updater.key`), guardar la privada fuera del repo.
- [ ] Cargar `TAURI_SIGNING_PRIVATE_KEY` y
      `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` como GitHub Secrets del repo.

## Dependencias y config

- [ ] Agregar `tauri-plugin-updater` a `src-tauri/Cargo.toml` y
      `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process` a
      `package.json`.
- [ ] Registrar el plugin en `src-tauri/src/lib.rs` y sus permisos en
      `src-tauri/capabilities/default.json`.
- [ ] `tauri.conf.json` → sección `plugins.updater` (endpoint del
      `latest.json`, `pubkey`).
- [ ] Fijar versiones exactas de `tauri`/`@tauri-apps/api` (hoy sueltas
      en `"2"`/`"^2"` — ver nota en `design.md`).

## Pipeline de release

- [ ] `.github/workflows/release.yml`, disparado por tag `v*`, matriz
      macOS (arm64) + Windows, usando `tauri-apps/tauri-action`.
- [ ] Confirmar que sube instaladores + `latest.json` al GitHub Release
      del tag.

## Frontend

- [ ] Estado nuevo en `appStore.ts` (`updateInfo`, `updateStatus`,
      `autoUpdateEnabled` persistido en `localStorage`).
- [ ] Chequeo al iniciar + interval periódico.
- [ ] Acción de descarga+instalación+reinicio (`downloadAndInstall()` +
      aviso previo + `relaunch()`).
- [ ] Aviso visible fuera de Ajustes cuando hay update pendiente y
      `autoUpdateEnabled` es `false`.
- [ ] Reescribir `AboutSettingsTab.tsx` sobre el nuevo mecanismo +
      toggle "Actualizar automáticamente".
- [ ] Borrar `check_update` (Rust) + `checkUpdate()`/`ReleaseInfo`
      (`src/lib/invoke.ts`) una vez migrado.
- [ ] i18n es/en (`src/lib/i18n.ts`, namespace `settings`).

## Validación

- [ ] `tsc --noEmit` / `eslint` / `cargo check` en verde.
- [ ] Cortar un release de prueba real (p. ej. `v1.0.1`) y confirmar en
      una instalación con `v1.0.0`: aparece el aviso, "Actualizar
      ahora" descarga, instala y reinicia sola, tanto en Mac como en
      Windows.
- [ ] Probar el modo automático: activar el toggle, cortar otro release
      de prueba, confirmar que se instala sola con aviso previo (nunca
      sin avisar).
- [ ] Confirmar en macOS si aparece el bloqueo de Gatekeeper descrito
      en `design.md` — si aparece, se documenta como riesgo conocido,
      no bloquea el resto del spec.
