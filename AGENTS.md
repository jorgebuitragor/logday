# AGENTS.md — Logday Desktop (`task-manager`)

App de escritorio de Logday: Tauri 2 + React + TypeScript, con el estado en Zustand (`src/store/appStore.ts`). Los datos son archivos Markdown/JSON en la carpeta que elige el usuario; el sync con `logday-server` es opcional. Repos hermanos en `../`: `logday-server`, `logday-web`, `logday-mobile`.

## Comandos

- `pnpm install`, `pnpm tauri dev` (la app), `pnpm build` (tsc + vite).
- `pnpm test`: vitest, con la zona horaria fija en `America/Bogota` (`vitest.config.ts`).
- `pnpm lint`: tiene 21 warnings de base; un cambio no debe sumar más. Necesita Node ≥ 20.19: si falla con `util.styleText`, es la versión de Node.
- Rust: `cargo check --manifest-path src-tauri/Cargo.toml`.
- Los remotes `github` y `origin` apuntan al mismo repo (`jorgebuitragor/logday`).

## Trampas conocidas

- Fechas (`src/lib/localDate.ts`): las de calendario ("hoy", vencimientos, `fecha`, `date`) son `YYYY-MM-DD` en hora local; `created`, `completed_at`/`completedAt` y `updated` son instantes de `toISOString()`, pero los `YYYY-MM-DD` legados siguen siendo válidos: se leen con `parseStamp`, `stampToLocalDate` y `stampSortKey`, nunca con `new Date('YYYY-MM-DD')` ni comparando strings. Contrato en `../logday-server/specs/esquema-datos/requirements.md`.
- Tareas: cada una es `projects/<proyecto>/<id>.md`; `updateTask` mueve el archivo si cambia el proyecto. `tasks` en el store tiene solo las del proyecto activo.
- Las preferencias de UI son locales y no se sincronizan.

## Probar en la app sin tocar los datos reales

No abrir ni modificar la app instalada de Jorge (`com.jorgebuitrago.logday`) ni su carpeta de datos. Para probar en la app, usar un build aparte con otro identificador:

1. Una config con `{"identifier": "com.jorgebuitrago.logday.qatareas", "productName": "Logday QA Tareas", "plugins": {"updater": {"endpoints": ["https://127.0.0.1:9/latest.json"]}}}`.
2. `pnpm tauri build --debug --bundles app --config <esa config>`. El error final de "private key" del updater no importa: el `.app` ya queda en `src-tauri/target/debug/bundle/macos/`.
3. Datos de prueba en una carpeta temporal, y `~/Library/Application Support/com.jorgebuitrago.logday.qatareas/config.json` con `{"basePath": "<carpeta>", "startupScreen": "tasks"}`.
4. Al terminar, borrar el `.app` y las carpetas con ese identificador en `~/Library/Application Support`, `~/Library/Caches` y `~/Library/WebKit`.

## Releases

Gitflow: `release/x.y.z` desde `develop`; subir la versión en `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y `src-tauri/Cargo.lock`; merge `--no-ff` a `main` con tag anotado `vX.Y.Z`, y de vuelta a `develop`. El mensaje del tag (primera línea: título; el resto, markdown) es lo que la app muestra en "Novedades". El tag dispara `.github/workflows/release.yml`, que deja un Release en borrador; publicarlo hace que el actualizador lo ofrezca a todos los usuarios.

## Convenciones

- Textos de UI en `src/lib/i18n.ts` (es y en), en español con tú, nunca voseo.
- Specs SDD en `specs/`: el spec se actualiza en el mismo PR que el código.
- Comentarios en español que explican el porqué.

## No hacer sin preguntar a Jorge

- Mergear a `develop` o `main`, crear tags o publicar un Release.
- Abrir, cerrar o modificar la app instalada o sus datos.

## Dónde está el contexto

Vault de Obsidian `~/Developer/Obsidean/logday`, si está disponible: hub `00 Indice/Logday Desktop (hub).md`.
