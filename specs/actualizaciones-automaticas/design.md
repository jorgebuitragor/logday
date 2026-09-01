# Actualizaciones automáticas — Design

## Decisión central: plugin oficial de Tauri, no seguir con el chequeo casero

`tauri-plugin-updater` (Rust) + `@tauri-apps/plugin-updater` (JS), más
`@tauri-apps/plugin-process` para el `relaunch()` tras instalar — mismo
patrón que `plugin-dialog`/`plugin-notification`/`plugin-websocket`, ya
usados en este repo (`src-tauri/Cargo.toml`, `package.json`). Reemplaza
`check_update`, el comando Rust casero que solo pega contra
`api.github.com/.../releases/latest` y deja el resto (descargar,
instalar, reiniciar) en manos del usuario vía navegador — el plugin
hace las tres cosas dentro de la app.

## Endpoint: GitHub Releases

El plugin soporta apuntar directo a un asset `latest.json` publicado en
cada GitHub Release, con placeholders de plataforma/arquitectura/
versión actual en la URL de endpoint (formato estándar del plugin). No
hace falta un servidor propio — GitHub Releases ya funciona como CDN +
endpoint.

`tauri.conf.json` → `plugins.updater.endpoints`:

```
["https://github.com/jorgebuitragor/logday/releases/latest/download/latest.json"]
```

## Firma

- Se genera un par de llaves una sola vez:
  `pnpm tauri signer generate -w ~/.tauri/logday-updater.key` (fuera
  del repo, en la máquina de Jorge).
- La llave **pública** va en `tauri.conf.json` →
  `plugins.updater.pubkey` (se commitea, es pública por diseño).
- La llave **privada** + su contraseña se guardan como GitHub Secrets
  del repo (`TAURI_SIGNING_PRIVATE_KEY`,
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) — nunca en el repo, nunca en
  texto plano en ningún archivo versionado.
- Esta firma es propia del plugin y **es independiente** de la firma/
  notarización de Apple o de un certificado Authenticode de Windows —
  es la única firma estrictamente necesaria para que el updater
  funcione y verifique integridad.

## Pipeline de release: `.github/workflows/release.yml`

No existe ningún workflow de CI/release hoy — `.github/` no existe en
el repo, `v1.0.0` es el único tag y no hay ningún GitHub Release
publicado todavía (confirmado con `gh release list`). Este sería el
primer workflow del repo.

Se dispara al pushear un tag `v*` (mismo esquema de tag que ya se usa).
Usa `tauri-apps/tauri-action@v0` con una matriz `macos-latest`
(build arm64 — Apple Silicon, lo que corre esta rama) + `windows-latest`.
La action ya sabe generar `latest.json` y firmarlo con los secrets de
arriba, y sube instaladores + `latest.json` al GitHub Release del tag.

## Riesgo conocido: Gatekeeper en macOS sin notarización

Confirmado con el usuario: no hay cuenta de Apple Developer todavía.
Sin ella, los builds de macOS solo pueden firmarse ad-hoc
(`codesign --sign -`, gratis), no notarizarse por Apple. Un archivo
descargado por la propia app (como hace el updater) llega marcado con
el atributo de cuarentena de macOS; Gatekeeper puede bloquear una app
ad-hoc-firmada bajada así ("Logday está dañado, muévelo a la
papelera"), sobre todo en Apple Silicon. Esto puede romper justo el
flujo que se quiere arreglar, **y solo en macOS** — Windows no tiene un
bloqueo equivalente tan duro (como mucho, SmartScreen avisa "editor no
reconocido", no bloquea, y mejora solo con reputación/tiempo).

Se prueba explícitamente en la validación (`tasks.md`). Si el bloqueo
aparece en la práctica, la única solución real es conseguir una cuenta
de Apple Developer ($99/año) para notarizar — eso queda fuera de este
spec, se documenta acá como riesgo aceptado por ahora.

## Frontend

- `appStore.ts`: estado nuevo — `updateInfo: { version: string; body?:
  string } | null`, `updateStatus: 'idle' | 'checking' | 'available' |
  'downloading' | 'error'`, y `autoUpdateEnabled: boolean` (persistido
  en `localStorage`, mismo mecanismo que `syncConfig`/`gitConfig`).
- Chequeo al iniciar (`init()`) + periódico, mismo patrón que
  `startReconcileInterval` de sync-servidor (`setInterval`, se limpia
  al desmontar).
- Si `autoUpdateEnabled` es `true` y hay actualización: descarga e
  instala directo, pero SIEMPRE muestra un aviso corto ("Logday se va a
  reiniciar para actualizar en X segundos", con opción de posponer)
  antes de llamar a `relaunch()` — nunca reinicia sin avisar (ver
  requirements.md).
- Si `autoUpdateEnabled` es `false` (default): aparece un aviso/badge
  visible fuera de Ajustes (ubicación exacta a definir al implementar,
  revisando qué patrón visual ya usa la app para avisos globales antes
  de inventar uno nuevo) + la sección ya existente en Ajustes → Acerca
  de, con un botón "Actualizar ahora" que dispara descarga+instalación
  +reinicio bajo demanda.
- `AboutSettingsTab.tsx`: se reescribe sobre el nuevo estado/acciones en
  vez de `checkUpdate()`/`fs.openUrl`. Se agrega el toggle "Actualizar
  automáticamente".
- Se borra `check_update` (Rust, `src-tauri/src/lib.rs`, incluyendo su
  registro en `invoke_handler`) y `checkUpdate()`/`ReleaseInfo` de
  `src/lib/invoke.ts`, una vez migrado — no conviven dos mecanismos de
  chequeo.

## Permisos

Agregar el plugin a `src-tauri/capabilities/default.json`, mismo
patrón que ya tienen ahí `notification`/`dialog`/`websocket`.

## i18n

Claves nuevas es/en bajo el namespace `settings` que ya usa "Acerca
de", reemplazando/extendiendo `checkUpdates`/`updateAvailable`/
`downloadUpdate` donde aplique.

## Nota aparte: versiones de Tauri sueltas

`Cargo.toml` fija `tauri = { version = "2", ... }` y `package.json`
fija `"@tauri-apps/api": "^2"` — ambos rangos abiertos, y ya se vio un
mismatch de minor en el log de `pnpm tauri dev` (`tauri v2.10.3` vs.
`@tauri-apps/api v2.11.1`). Agregar `plugin-updater` no lo causa, pero
sí aumenta la superficie del problema (una dependencia más resolviendo
versiones por su cuenta) — vale la pena fijar versiones exactas al
tocar estos archivos para esta feature, ver `tasks.md`.

## Fuera de este diseño

- Servidor de updates propio — GitHub Releases alcanza, no se
  justifica.
- Delta updates (descargar solo el diff en vez del instalador
  completo) — el plugin no lo soporta out-of-the-box para todos los
  targets, no se persigue acá.
