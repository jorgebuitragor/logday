# Extensiones — Tareas

Estado: en progreso.

## Decisiones

- [x] Nombre: "Extensiones", con los grupos "Integraciones" y
  "Herramientas".
- [x] Código incluido y apagado por defecto. No hay instalación ni API
  pública.
- [x] Catálogo en Opciones. En el menú lateral, solo las extensiones
  activas con vista propia.
- [x] Activación y configuración no secreta en preferencias locales, sin
  sync. Secretos en el llavero del SO.
- [x] Red solo desde Rust, a hosts declarados.
- [x] Carga diferida y un ErrorBoundary por extensión.

## Base

- [x] `src/extensions/types.ts` y `registry.ts`, con la primera
  extensión registrada (`team-chat`).
- [x] `AppConfig.extensions` y su lugar en `BackupSettings` (R9).
- [x] `useExtensions`: activas, activar con aviso (R6), desactivar con
  `stop` (R7) y carga con `import()` (R16).
- [x] `ExtensionBoundary` (R15), con una prueba: un componente que lanza
  un error no tumba el árbol y muestra "Desactivar".
- [x] Rust: crate `keyring` y los comandos `ext_secret_set`,
  `ext_secret_clear` y `ext_secret_hint` (R10).
- [ ] Probar el llavero en macOS y Windows (y que compile en Linux, en
  el workflow de release).
- [x] `ActiveSection` y `StartupScreen` con `ext:<id>`, más R13 y R14.
- [x] `Sidebar.tsx`: secciones de extensiones activas con vista (R11).
- [x] `ExtensionsSettingsTab.tsx`: grupos, tarjetas, interruptor, aviso
  y "Quitar configuración" (R1–R8).
- [x] Textos en `i18n.ts`, en es y en (R20).
- [x] Pruebas de `useExtensions` y de la resolución de la pantalla de
  inicio.
- [ ] Probar en la app de QA:
  - activar y desactivar;
  - aviso aceptado y cancelado;
  - "Quitar configuración";
  - pantalla de inicio en una extensión desactivada;
  - que las 8 pestañas de Opciones quepan en es y en.

## Primera extensión

- [x] `team-chat`, en modo local. Ver
  `logday-server/specs/daily-al-chat/` (fase 1). Va en el mismo PR que
  la base.
- [ ] Probar `team-chat` en la app de QA con webhooks reales de Google
  Chat, Slack y Teams: guardar, enviar prueba, "Enviar al chat", URL de
  otro proveedor rechazada y el aviso de "ya se envió hoy".

## Candidatas (sin spec todavía)

- Integraciones: OpenProject (traer tareas), Jira, Granola, Obsidian,
  Excalidraw.
- Herramientas: Agenda, DevTools.
