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
spec, se documenta acá como riesgo aceptado por ahora. El certificado
autofirmado de la sección siguiente no cambia esto; resuelve otra cosa
(el llavero).

## Firma estable en macOS (certificado autofirmado)

Decidido con Jorge el 29 oct 2026, **sin pagar** la cuenta de Apple
Developer.

**El problema.** Con la firma ad hoc, cada versión tiene otra firma y
macOS la trata como otra app. Así, el llavero vuelve a pedir la clave
tras cada actualización a quien usa extensiones con secretos (MCP,
Granola, OpenProject…). Los secretos no se pierden; solo se vuelve a
pedir permiso.

**La solución.** Firmar todas las versiones con **el mismo certificado
autofirmado**, llamado "Logday":
- macOS reconoce cada versión como la misma app, y el "Permitir siempre"
  dura entre actualizaciones;
- la primera versión firmada así todavía pide la clave una vez;
- el aviso de Gatekeeper ("desarrollador no identificado") sigue igual:
  solo lo quita notarizar, con la cuenta paga;
- el updater no cambia: su firma (arriba) es aparte.

**Qué se configura en el repo.** En `release.yml`, `tauri-action` recibe
tres variables:
- `APPLE_CERTIFICATE`: el `.p12` en base64;
- `APPLE_CERTIFICATE_PASSWORD`;
- `APPLE_SIGNING_IDENTITY`: el nombre del certificado, "Logday".

Tauri lo importa en un llavero temporal y firma con él. Sin `APPLE_ID`
no notariza. Si faltan los secrets, el job de macOS avisa y firma ad hoc
como antes. `tauri.conf.json` sigue con `"-"` para los builds locales
sin certificado.

**Crear el certificado (una sola vez, en el Mac de Jorge):**
1. Acceso a Llaveros → menú Acceso a Llaveros → Asistente de
   certificados → Crear un certificado…
2. Nombre: `Logday`. Tipo de identidad: Raíz autofirmada. Tipo de
   certificado: Firma de código. Marcar "Permitir anular valores
   predeterminados".
3. Período de validez: `7300` días (20 años). El resto, como viene.
   Llavero: Inicio de sesión. Crear.
4. En "Mis certificados", clic derecho en "Logday" → Exportar → formato
   `.p12`, con una contraseña. Guardar el `.p12` y la contraseña en el
   gestor de contraseñas.
5. Subir los secrets al repo:
   - `gh secret set APPLE_CERTIFICATE --repo jorgebuitragor/logday < <(base64 -i Logday.p12)`
   - `gh secret set APPLE_CERTIFICATE_PASSWORD --repo jorgebuitragor/logday`
   - `gh secret set APPLE_SIGNING_IDENTITY --repo jorgebuitragor/logday --body Logday`

**Cuidados.**
- Si alguien obtiene el `.p12`, podría firmar apps que macOS tomaría por
  Logday.
- Si se pierde, se crea otro, y los usuarios ven el aviso del llavero
  una vez más.
- No usar los certificados de la FCV.

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

## Aviso y novedades (27 oct 2026)

Con la 1.0.3 se vio que la versión nueva pasaba desapercibida y que sus
notas no llegaban a la app:

- **Notas.** La app muestra el `notes` de `latest.json`, que tauri-action
  arma con `releaseBody`. Era un texto fijo en `release.yml`, así que
  editar después el Release en GitHub no cambiaba lo que veía la app.
  Ahora el workflow toma las notas del mensaje del tag anotado (`git
  tag -a vX.Y.Z`: primera línea de título y el resto, en markdown, como
  notas).
- **Aviso.** Era un toast de 6 s y un punto en el ícono de Opciones.
  Ahora es `UpdateAvailableBanner`, persistente, con "Ver novedades",
  "Actualizar ahora" y "Más tarde", que lo esconde para esa versión
  hasta el próximo arranque. Con la actualización automática el aviso
  sigue siendo `UpdateRestartBanner`, que también tiene "Ver novedades".
- **Novedades.** `ReleaseNotesModal` muestra el markdown de las notas, sin
  HTML crudo. Se abre desde el banner, desde Acerca de, o solo al abrir
  por primera vez la versión recién instalada. Para eso, `installUpdate`
  guarda las notas antes de instalar (`pendingReleaseNotes`). Si no hay,
  porque se actualizó desde una versión anterior a esto o con el
  instalador, se piden a `api.github.com/repos/…/releases/tags/vX`. La
  versión se marca como vista (`lastSeenAppVersion`) solo cuando ya se
  mostraron las notas o se sabe que no hay; si la consulta falla, se
  reintenta en el próximo arranque. En una instalación nueva, sin
  carpeta de datos, no se muestra nada.
- **Chequeo.** Además del intervalo de 4 h, se busca al volver a la app
  si pasaron 30 min desde el último chequeo.

## Acerca de (28 oct 2026)

- `src/lib/releases.ts` reúne la consulta a GitHub (`fetchRelease`, que
  ahora trae también `published_at`), las URLs del repo y el copyright
  y la licencia. Una prueba comprueba que el copyright y la licencia
  coinciden con `tauri.conf.json` y `package.json`.
- **Fecha de la última actualización:** `showReleaseNotesAfterUpdate`,
  la primera vez que se abre una versión, guarda
  `appUpdatedAt = { version, at }` en `localStorage` (local, como las
  demás preferencias). Acerca de la muestra si es de la versión
  instalada; si no, usa `published_at` del release.
- **"Qué trae esta versión":** `openCurrentReleaseNotes` pide las notas
  de la versión instalada y abre el mismo `ReleaseNotesModal`, en modo
  `installed`. "Historial de versiones" abre `…/releases` en el
  navegador.
- **Licencia:** nombre, un resumen de una frase, el copyright y los
  enlaces a `LICENSE` y al repo. Es lo que pide la AGPL: que quien usa
  el programa sepa la licencia y dónde está el código.

## Fuera de este diseño

- Servidor de updates propio — GitHub Releases alcanza, no se
  justifica.
- Delta updates (descargar solo el diff en vez del instalador
  completo) — el plugin no lo soporta out-of-the-box para todos los
  targets, no se persigue acá.
