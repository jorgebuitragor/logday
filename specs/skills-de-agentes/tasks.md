# Skills de agentes — Tasks

Estado: en progreso.

## Fase 1: ver (rama `feature/skills-de-agentes`)

### Rust (`src-tauri/src/extensions/agent_skills/`)

- [x] `roots.rs`: fuentes (SK1), `home` con `LOGDAY_AGENT_SKILLS_HOME` solo en debug (SK34), validar `dir` y la ruta relativa, y resolver dentro de la fuente (SK26).
- [x] `scan.rs`: recorrer fuentes, juntar ubicaciones por ruta real (SK2), enlaces externos (SK3), plugins de Claude por `installed_plugins.json` y de Codex por la caché, conteo con topes y avisos de archivos (SK7).
- [x] `files.rs`: árbol de una skill, leer un archivo de texto (no binario, hasta 1 MB), huella.
- [x] Comandos `agent_skills_list`, `agent_skills_detail`, `agent_skills_read_file` y `agent_skills_reveal`, en `generate_handler!`, `build.rs` y la capability `default` (SK30).
- [x] `FsScope`: rechazar `<app_dir>/agent-skills` (SK27).
- [x] Pruebas de Rust.

### Frontend (`src/extensions/agent-skills/`)

- [x] Registro, `ExtensionId`, textos `extensions.agent-skills.*` y sección `agentSkills` de i18n (es y en).
- [x] `skillMd.ts`: frontmatter, avisos y validación del nombre, con pruebas.
- [x] `model.ts`: tipos, filtros y búsqueda, con pruebas. `store.ts`: lista, selección y recarga.
- [x] Vista: columna con buscador, filtros y grupos; detalle con cabecera, avisos, pestañas SKILL.md, Archivos y Ubicaciones, y Mostrar en Finder.
- [x] Página en Opciones: carpetas y "Mostrar".
- [x] `FsScope` veta además `~/.claude`, `~/.codex` y `~/.agents` (la real y, en depuración, la de pruebas), aunque una carpeta de datos elegida las contenga.
- [x] Pruebas de vista con `invoke` simulado.

### QA (10 nov 2026)

- [x] La app de QA (`--debug`, identificador `qatareas`) compila con los comandos nuevos: Tauri valida en el build que cada `allow-agent-skills-*` de la capability exista.
- [x] En el navegador, con el build de producción y Tauri simulado, sobre los datos de una carpeta personal de prueba (`~/Developer/.qa-mocks/agent-skills-home`), se revisaron:
  - los grupos (Tuyas, De plugins, Sistema y sincronizadas) y las insignias de herramienta;
  - una skill en las dos herramientas por un enlace, que sale una sola vez;
  - el punto de riesgo;
  - el detalle de una skill con hooks, `allowed-tools`, `` !`cmd` ``, scripts y un binario: el `<script>` del cuerpo no se interpreta y la imagen remota no se carga;
  - la pestaña Archivos, con un script abierto como texto;
  - un enlace externo, del que solo se muestra la ubicación.
  - Se corrigió el filtro, que decía "Claude Code" y se partía en dos líneas: ahora dice "Claude".
- [ ] Probar en la app de QA con la carpeta de prueba (`open -n --env LOGDAY_AGENT_SKILLS_HOME=… "Logday QA Tareas.app"`): queda para Jorge o para cuando haya acceso a la app.

## Fase 2: gestionar (rama `feature/skills-de-agentes-gestion`)

- [ ] Confirmación nativa desde Rust (SK29) con textos en es y en.
- [ ] Crear (SK9), guardar con `expectedHash` (SK10), papelera con el crate `trash` (SK11), desactivar o activar (SK12) y compartir (SK13).
- [ ] Preparar desde una carpeta o un zip (crate `zip`), reglas y topes (SK16), instalar con huella (SK18) y reemplazar (SK17). Limpieza de `staging/` al arrancar.
- [ ] Vista: editor, modal de Nueva skill, diálogo de borrar con "solo de esta herramienta" o "de todas", Importar y vista previa.
- [ ] Pruebas de Rust y de TS.

## Fase 3: repos de GitHub (rama `feature/skills-de-agentes-repos`)

- [ ] `github.rs`: resolver el commit, zipball con redirección comprobada a `codeload.github.com`, descomprimir solo las carpetas de skills y detectar repos de plugins (SK20, SK23, SK25).
- [ ] `manifest.rs` (`installed.json`), `agent_skills_hash` y `agent_skills_compare`.
- [ ] Token en el llavero (SK24) y su campo en Opciones.
- [ ] Pestaña Repos: vincular, catálogo con estados, instalar, buscar actualizaciones y ver cambios con `lineDiff` (que pasa a `src/lib/`).
- [ ] Pruebas.

## Cierre

- [ ] QA en la app de QA con un `home` de prueba.
- [ ] Nota en el vault y en el hub de Desktop.
