# Skills de agentes — Design

Estado: en progreso.

## Arquitectura

- **Todo el acceso a disco y a red está en Rust**, en `src-tauri/src/extensions/agent_skills/`. Son comandos acotados, no raíces nuevas en `FsScope` (SK27).
  - **Problema:** si `~/.claude` fuera una raíz, un script inyectado en el webview podría escribir con `write_file` en `~/.claude/settings.json` (hooks) o en `~/.codex/config.toml`, y eso es ejecutar código.
  - **Solución:** cada comando hace una sola cosa sobre una skill, y se nombra con `(fuente, carpeta, ruta relativa)`.
- **El webview no ve rutas que pueda reutilizar.** Ve las rutas absolutas solo para mostrarlas. Para actuar, siempre manda `source` + `dir`.
- **El frontmatter lo interpreta TypeScript** con `js-yaml` (ya en la app), al listar y en el detalle. Rust devuelve el texto del `SKILL.md`, hasta 256 KB, y los datos de los archivos. Así no entra un parser YAML en Rust, y los avisos que dependen del frontmatter (`allowed-tools`, `hooks`, `` !`…` ``) se calculan en TS, probados con vitest.
- **El estado de la vista** vive en un store chico de la extensión (zustand), como Pomodoro: la lista, la skill elegida, el filtro y lo que se está preparando. La configuración no secreta (repos vinculados y filtros recordados) va en `extensions['agent-skills'].settings`.

### Módulos de Rust

| Archivo | Qué hace |
|---|---|
| `mod.rs` | Comandos de Tauri, estado (`AgentSkillsState`), confirmación nativa (SK29). |
| `roots.rs` | Las fuentes y sus carpetas (SK1, SK34); resolver `(fuente, carpeta, relativa)` (SK26). |
| `scan.rs` | Listar: recorrer las fuentes, juntar enlaces (SK2), contar archivos, avisos de archivos (SK7). |
| `files.rs` | Árbol de una skill, leer un archivo de texto, huella del contenido. |
| `ops.rs` | Crear, guardar, papelera, desactivar o activar, compartir (fase 2). |
| `staging.rs` | Preparar desde una carpeta o un zip, instalar lo preparado (SK15–SK18). |
| `github.rs` | Resolver un commit, bajar el zip y buscar skills en él (fase 3). |
| `manifest.rs` | `installed.json`: de dónde vino cada skill instalada desde un repo. |

## Fuentes (SK1)

```rust
enum SourceId {
    Claude,           // ~/.claude/skills           (sin synced/)
    Agents,           // ~/.agents/skills
    Codex,            // ~/.codex/skills            (sin .system/)
    ClaudeSynced,     // ~/.claude/skills/synced    solo lectura
    CodexSystem,      // ~/.codex/skills/.system    solo lectura
    CodexAdmin,       // /etc/codex/skills          solo lectura, no en Windows
    ClaudePlugin,     // installPath de installed_plugins.json → skills/*/ y raíz
    CodexPlugin,      // ~/.codex/plugins/cache/<mp>/<plugin>/<versión>/skills/*/
    Disabled,         // <app_data>/agent-skills/disabled/<fuente>/<carpeta>
}
```

- **Herramienta de cada fuente:** Claude, ClaudeSynced y ClaudePlugin son de Claude Code. Agents, Codex, CodexSystem, CodexAdmin y CodexPlugin son de Codex.
- **`home`:** `dirs_next::home_dir()`. En `cfg!(debug_assertions)`, si existe la variable `LOGDAY_AGENT_SKILLS_HOME`, se usa esa (SK34). Se lee una vez al arrancar. No se respetan `CODEX_HOME` ni `CLAUDE_CONFIG_DIR`: una app abierta desde el Finder no las hereda, y así lo que se ve no depende de cómo se abrió. Si hiciera falta, se agregaría como opción en una versión futura.
- **`ClaudeSynced`:** su estructura es `synced/<cubo>/<skill>/SKILL.md`. Se recorre a dos niveles.
- **`CodexPlugin`:** por cada `<marketplace>/<plugin>` se toma solo la versión más reciente por fecha. Las carpetas `latest`, que son enlaces, se juntan con la otra por SK2.
- **`ClaudePlugin`:**
  - se leen las entradas `installPath` de `installed_plugins.json` (versión 2);
  - una ruta que no cae dentro de `~/.claude/plugins` se ignora;
  - en cada plugin se buscan `skills/*/SKILL.md` y `SKILL.md` en la raíz;
  - el origen muestra `plugin@marketplace`.
- **Buscar `SKILL.md`:** se busca en `<fuente>/<carpeta>/SKILL.md`, sin distinguir mayúsculas en el nombre del archivo.
- **Lo que no se lista:**
  - carpetas sin `SKILL.md`;
  - nombres que empiezan por `.` (salvo `.system` y `.curated` donde aplican);
  - `node_modules` y `.git`.

### Resolver y validar rutas (SK26)

- `dir` es un nombre de carpeta: sin `/`, `\`, `..` ni `\0`, que no empieza por `.`, y de hasta 255 bytes. La creación es más estricta (SK9).
- La ruta relativa de un archivo se parte en componentes. Se rechazan `..`, las rutas absolutas y los prefijos de Windows.
- Se canonicaliza la carpeta de la skill:
  - si cae dentro de alguna fuente, se lee;
  - si no, es un **enlace externo** (SK3): se devuelve solo `link_target` para mostrarlo.
- El archivo pedido, también canonicalizado, debe quedar dentro de la carpeta canónica de la skill.

### Juntar ubicaciones (SK2)

Al listar, cada carpeta se canonicaliza y se agrupa por su ruta real. Una entrada tiene:

```ts
interface SkillEntry {
  key: string;                 // `${source}:${dir}` de la ubicación principal
  primary: SkillLocation;      // la que no es enlace (o la primera)
  locations: SkillLocation[];  // todas, con { source, dir, path, isLink, linkTarget? }
  tools: ('claude' | 'codex')[];
  origin: 'own' | 'disabled' | 'synced' | 'system' | 'admin' | 'plugin' | 'external';
  plugin?: { name: string; marketplace: string; version?: string };
  editable: boolean;           // own o disabled, y no external
  skillMd: string | null;      // texto, hasta 256 KB (null si no se pudo leer)
  fileCount: number; sizeBytes: number; modifiedMs: number;
  fileFlags: { scripts: boolean; binaries: boolean; symlinks: boolean; executables: boolean; truncated: boolean };
  installed?: InstalledRecord; // de manifest.json, si vino de un repo (fase 3)
}
```

- Al recorrer una skill para contarla se para en 2000 archivos o 6 niveles (`truncated`), para no colgarse con una carpeta enorme.
- **Scripts:** cuentan los archivos en `scripts/`, las extensiones `sh, bash, zsh, py, js, mjs, cjs, ts, rb, pl, php, ps1, bat, cmd, exe, applescript` y los que tienen bit de ejecución.
- **Binario:** un archivo con un `\0` en los primeros 8 KB.

## Avisos de frontmatter (TS, SK7)

`parseSkillMd(text)` en `src/extensions/agent-skills/skillMd.ts`:

- frontmatter entre `---` al principio;
- `js-yaml` con `JSON_SCHEMA`, que no tiene tipos raros;
- devuelve `name`, `description`, el resto de campos, el cuerpo y los errores;
- avisos:
  - `invalid-frontmatter`;
  - `missing-name`;
  - `missing-description`;
  - `name-mismatch`: el `name` no coincide con la carpeta;
  - `name-not-portable`: el `name` no cumple la regla abierta;
  - `allowed-tools`;
  - `hooks`;
  - `shell-injection`: `` !`…` `` fuera de bloques de código.

## Escritura (fase 2)

### Confirmación nativa (SK29)

- `confirm_native(window, title, message)` usa `tauri_plugin_dialog` desde Rust (`MessageDialogBuilder` con Ok/Cancelar, en `spawn_blocking`).
- Los textos del diálogo **los pone Rust**, en el idioma que manda el webview (`es` o `en`), con el nombre de la skill y la carpeta de destino. Si los mandara el webview, un script podría poner "Aceptar para continuar" sobre otra acción.
- El webview solo elige el idioma. Los textos están en `mod.rs` (`fn text(lang, key)`).
- **Guardar:** `AgentSkillsState.save_grants: HashSet<PathBuf>`. Después de confirmar el primer guardado de una skill, los siguientes de esa misma carpeta no preguntan hasta cerrar la app.

### Operaciones

- **`agent_skills_create { lang, name, description, tools }`**
  - valida con SK9;
  - escribe en la carpeta de la primera herramienta: `~/.claude/skills/<name>/SKILL.md` si incluye Claude, si no, `~/.agents/skills/<name>/SKILL.md`;
  - si son las dos, crea el enlace en `~/.agents/skills/<name>` (decisión 3);
  - la plantilla la arma TS y se manda como `content`. Rust solo comprueba que empiece con frontmatter.
- **`agent_skills_save { lang, source, dir, content, expectedHash }`**
  - fuentes `own` o `disabled`;
  - `expectedHash` es el sha256 del `SKILL.md` que se abrió. Si el de disco es otro, devuelve `changed_on_disk` (SK10) y la vista pregunta. Al aceptar, reenvía con `force: true`;
  - escribe en un `.tmp` y después hace `rename`.
- **`agent_skills_trash { source, dir, scope: 'location' | 'all' }`**
  - `location`: si es un enlace, `remove_file` al enlace; si es la carpeta real y hay enlaces, devuelve `has_links` para que la vista ofrezca `all`;
  - `all`: los enlaces con `remove_file` y la carpeta real a la papelera;
  - la papelera es el crate `trash`. En macOS usa `DeleteMethod::NsFileManager`, porque el método por defecto (el Finder) pide permiso de Automatización y suena.
- **`agent_skills_set_enabled { lang, source, dir, enabled }`**
  - desactivar: mueve cada ubicación (la carpeta real y los enlaces, tal cual) a `disabled/<fuente>/<dir>`;
  - activar: hace lo contrario, con confirmación nativa, porque vuelve a poner contenido donde el agente lo lee;
  - si el destino existe, devuelve `occupied`;
  - si `rename` falla por cambiar de volumen, copia y borra.
- **`agent_skills_share { lang, source, dir, to: 'claude' | 'codex' }`**
  - en Unix crea un enlace en `~/.claude/skills/<dir>` o `~/.agents/skills/<dir>` hacia la carpeta real (ruta absoluta);
  - en Windows copia;
  - si ya existe, devuelve `occupied`.
- **`agent_skills_reveal { source, dir }`**: `tauri_plugin_opener::reveal_item_in_dir` (SK8).

### Carpeta de datos

`<app_data>/agent-skills/`:

- `disabled/`: skills desactivadas;
- `staging/<uuid>/`: lo preparado. Se borra lo que tenga más de 24 h al arrancar la extensión;
- `installed.json`: el registro de lo instalado desde repos.

`FsScope::check` gana una lista de carpetas vetadas, para lectura y escritura (SK27), que se revisa antes que la carpeta de la app y las raíces:

- `<app_dir>/agent-skills`: así un script no puede cambiar lo preparado entre la vista previa y la instalación. Además, SK18 se comprueba con la huella.
- `~/.claude`, `~/.codex` y `~/.agents`, tanto la carpeta personal real como, en depuración, la de pruebas (`FsScope::deny`, llamado al arrancar desde `agent_skills::protect`). Hoy ninguna raíz las contiene. Pero si alguien eligiera como carpeta de datos su carpeta personal, sin esto `write_file` podría escribir en `~/.claude/settings.json`. `check_git_cwd` respeta la misma lista.

## Preparar e instalar (SK14–SK18)

- **`agent_skills_import_pick { kind: 'folder' | 'zip' }`**
  - abre el diálogo desde Rust;
  - copia o descomprime en `staging/<uuid>/` con las reglas de SK16;
  - busca skills, que pueden ser la raíz o subcarpetas a tres niveles;
  - devuelve `StagedBundle { id, origin, skills: StagedSkill[], skipped: string[] }`.
- **`StagedSkill`:** `{ rel, dirName, skillMd, files: FileInfo[], fileFlags, hash, sizeBytes }`.
- **La huella** (`hash`) es el sha256 de la lista ordenada de `(ruta relativa, sha256 del contenido)`. Se calcula al preparar.
- **`agent_skills_staged_read { id, rel, file }`:** lee un archivo de texto de lo preparado, para la vista previa.
- **`agent_skills_install { lang, id, items: [{ rel, name, tools, replace, expectedHash }] }`**: instala por lotes, para que importar varias skills pida **un solo** diálogo nativo.
  1. comprueba todas antes de tocar nada: huella (SK18), nombre, topes, ocupado si no viene `replace`, y que no se repita un nombre en el lote;
  2. pide una confirmación nativa con cada nombre, sus herramientas, su destino y el origen, que Rust lee de `staging/<id>/origin.json`;
  3. con `replace`, lo que había con ese nombre en las herramientas elegidas sale: los enlaces se quitan y las carpetas van a la papelera (SK17);
  4. mueve lo preparado al destino y, si son las dos herramientas, crea el enlace;
  5. si `from` es un repo, escribe en `installed.json` (fase 3).
- **`agent_skills_discard { id }`:** borra lo preparado.
- **Zip:** el crate `zip` (solo lectura, `deflate`).
  - Se rechazan los nombres con `..`, absolutos o con `\`.
  - Los enlaces simbólicos del zip (modo unix `0o120000`) se omiten.
  - Los archivos se escriben con permisos `0o644` y las carpetas con `0o755`.
  - Se cuenta el tamaño descomprimido real mientras se escribe, no el que declara el zip, para que una bomba de zip no pase.

## Repos de GitHub (fase 3)

**Configuración:** `settings.repos: { id, owner, repo, ref?, path? }[]`. `id` es un uuid; las claves se repiten si se vincula dos veces lo mismo.

**`agent_skills_repo_fetch { owner, repo, ref, path }`:**

1. Si no hay `ref`: `GET https://api.github.com/repos/{o}/{r}` lee `default_branch`.
2. `GET https://api.github.com/repos/{o}/{r}/commits/{ref}` con `Accept: application/vnd.github.sha` devuelve el sha.
3. `GET https://api.github.com/repos/{o}/{r}/zipball/{sha}` **sin seguir redirecciones**. Se lee `Location` y se acepta solo si el host es `codeload.github.com`. Luego se hace `GET` a esa URL sin token, porque la URL ya lleva el permiso temporal.
4. Se descarga a memoria con un tope de 50 MB.
5. Se lee el índice del zip y se buscan los `SKILL.md` en las rutas de SK20 (quitando la carpeta raíz `owner-repo-sha/`). Solo se descomprimen esas carpetas, en `staging/<uuid>/`.
6. Si existe `.claude-plugin/marketplace.json` o `.claude-plugin/plugin.json` en la raíz o en `plugins/*/`, se marca `isPluginRepo` (SK23).

- **Validación:** `owner` y `repo` usan `[A-Za-z0-9_.-]{1,100}`. `ref` usa `[A-Za-z0-9_./-]{1,200}`, sin `..`. `path` es una ruta relativa sin `..`.
- **Peticiones:** usan `User-Agent: Logday`, `X-GitHub-Api-Version: 2022-11-28` y, si hay token (SK24), `Authorization: Bearer` solo hacia `api.github.com`. El cliente usa `redirect::Policy::none()`, `connect_timeout` de 10 s y un timeout total de 60 s.
- **Errores:** son códigos, sin URL ni token: `not_found`, `rate_limited`, `unauthorized`, `too_large`, `network`, `bad_archive`.

**Estado de cada skill del catálogo** (SK20), comparando con `installed.json`, que tiene `{ repoKey, rel, sha, hash, installedAt, locations }` por `${source}:${dir}`:

- **No instalada:** no hay registro de ese repo y esa ruta.
- **Instalada:** hay registro y `hash` coincide con la huella de lo preparado.
- **Actualización disponible:** la huella preparada es otra que la del registro.
- **Modificada localmente:** la huella actual en disco es otra que la del registro. Se calcula al abrir el catálogo, con `agent_skills_hash { source, dir }`.

**Actualizar** (SK22) es instalar con `replace`.

- Antes, la vista arma el diff con `agent_skills_compare { id, rel, source, dir }`. Devuelve, por archivo, `added`, `removed` o `changed`, y para los de texto (hasta 512 KB) los dos textos.
- La vista los pasa por `lineDiff` (de `src/extensions/devtools/tools/diff.ts`, que se mueve a `src/lib/lineDiff.ts` para compartirlo).

**Token:** se guarda con `ext_secret_set('agent-skills', 'github_token', …)`. `secretKeys: ['github_token']` hace que "Quitar configuración" lo borre.

## Interfaz

### Registro

```ts
{
  id: 'agent-skills',
  category: 'tool',
  icon: Sparkles,      // "WandSparkles" si `Sparkles` ya está en uso en el menú
  apps: ['desktop'],
  view: true,
  settings: true,
  secretKeys: ['github_token'],
  load: () => import('./agent-skills').then((m) => m.default),
}
```

- No lleva `sendsDataExternally` (SK33). El texto `consent` de la tarjeta explica el riesgo: "Las skills le dicen al agente qué hacer y pueden traer scripts que el agente ejecuta con tus permisos. Logday no ejecuta nada; revisa lo que instalas."
- La sección del menú es `ext:agent-skills`, con título "Skills".

### Vista

Usa el mismo esquema de dos columnas que DevTools, con contenedor `@container`.

- **Barra superior:**
  - pestañas **Instaladas** y **Repos** (la segunda, en la fase 3);
  - a la derecha, los botones **Nueva skill** e **Importar** (menú: Carpeta… / Archivo .zip…) y **Actualizar lista**, que vuelve a leer el disco.
- **Columna izquierda (Instaladas):**
  - buscador;
  - filtro segmentado: Todas · Claude Code · Codex;
  - grupos plegables: **Tuyas**, **Desactivadas**, **Plugins**, **Sistema y sincronizadas**;
  - cada fila muestra el nombre, las insignias de herramienta y un punto de aviso si hay riesgo;
  - en una ventana angosta, la columna se vuelve un selector, como en DevTools.
- **Detalle:**
  - **Cabecera:** nombre, descripción, insignias de herramienta y origen, y la línea "N archivos · tamaño · modificada hace…".
  - **Avisos:** cada uno en una línea con su ícono (`ShieldAlert`).
  - **Acciones**, según `editable`:
    - Editar;
    - Añadir a Codex / Añadir a Claude Code;
    - Desactivar / Activar;
    - Mostrar en Finder;
    - Borrar.
  - **Pestañas:**
    - **SKILL.md**, con un conmutador Vista / Texto;
    - **Archivos**: árbol, y al elegir un archivo de texto, su contenido en `<pre>`;
    - **Ubicaciones**: cada ruta, marcando si es un enlace y a dónde apunta.
  - **Markdown:** se renderiza con `react-markdown` + `remark-gfm` + `rehype-sanitize` con el esquema por defecto, sin `rehype-raw`.
    - Las imágenes no se cargan: se ve su texto alternativo, porque cargarlas le diría a un tercero que se abrió la skill.
    - Los enlaces http(s) van por `open_url`.
- **Editar** abre un editor de texto plano en el lugar del detalle: monoespaciada, Guardar (también ⌘S), Cancelar (pregunta si hay cambios) y los avisos del frontmatter en vivo. Guardar puede pedir el diálogo nativo. Si el archivo cambió en disco, ofrece "Cargar el de disco" o "Guardar el mío igual". Un `SKILL.md` de más de 256 KB no se edita aquí.
- **Nueva skill** es un modal con nombre (validado mientras se escribe), descripción y herramientas (casillas Claude Code y Codex, las dos marcadas). Crea con la plantilla y abre el editor.
- **Importar** es un menú con "Carpeta…" y "Archivo .zip…", junto a "Nueva skill", arriba de la columna. Si no se encuentra ningún `SKILL.md`, se avisa y no se abre la vista previa.
- **Vista previa de instalación** es un modal grande:
  - si hay varias skills, a la izquierda la lista de las preparadas, con casillas;
  - a la derecha, la de la fila elegida: avisos, SKILL.md, archivos, nombre de destino editable y herramientas;
  - los botones son "Instalar" e "Instalar N".
- **Repos** (fase 3):
  - lista de repos vinculados, con "Abrir", "Buscar actualizaciones" y "Quitar", y un campo "owner/repo o URL";
  - al abrir uno, su catálogo con estado e Instalar / Actualizar / Ver cambios;
  - arriba, el aviso de SK23 si aplica.

### Opciones (página propia, R21/R28)

- **Carpetas que se revisan:** las rutas de SK1, solo para leer, con "Mostrar en Finder" en cada una que exista.
- **Mostrar:** interruptores "Skills de plugins" y "Skills del sistema y sincronizadas", encendidos por defecto.
- **Token de GitHub** (fase 3): un campo de secreto con su pista, "Guardar" y "Quitar". Una línea explica que solo hace falta para repos privados y que basta con permiso de lectura de contenidos.

### Accesibilidad

- La lista es un `listbox` con flechas y Enter.
- Los avisos tienen texto, no solo color.
- Una región viva anuncia "Skill instalada", "Movida a la papelera" y mensajes así.
- Los modales usan el patrón de `ConfirmDeleteModal` (foco atrapado y Escape).

## Errores

Rust devuelve códigos y la vista los traduce en `agentSkills.err.<código>`:

- `not_found`, `occupied`, `changed_on_disk`, `has_links`, `cancelled` (el usuario dijo que no en el diálogo nativo: no se muestra como error);
- `invalid_name`, `read_only`, `too_large`, `bad_archive`, `hash_mismatch`, `trash_failed`;
- `network`, `rate_limited`, `unauthorized`.

## Pruebas

- **Rust** (carpetas temporales con `home` falso):
  - fuentes y exclusiones;
  - juntar enlaces;
  - enlace externo;
  - rechazo de `..`, absolutas y enlaces que escapan;
  - zip-slip, enlaces en zip y bomba de zip;
  - topes;
  - quitar bits de ejecución;
  - huella estable;
  - crear, guardar con `expectedHash`, desactivar y activar ida y vuelta, compartir, ocupado;
  - lectura del índice del zip de GitHub y búsqueda de rutas;
  - validación de `owner`, `repo` y `ref`.
- **TS:**
  - `parseSkillMd` y avisos;
  - validación del nombre;
  - plantilla;
  - filtros y búsqueda;
  - estado del catálogo;
  - vista con `invoke` simulado (lista, detalle, borrar con confirmación, vista previa).
- **QA** en la app de QA con `LOGDAY_AGENT_SKILLS_HOME=~/Developer/.qa-mocks/agent-skills-home`, nunca con las skills reales de Jorge.
