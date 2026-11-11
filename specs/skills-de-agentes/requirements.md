# Skills de agentes — Requirements

Estado: en progreso.

## Contexto

Extensión de Desktop (`agent-skills`, grupo Herramientas) para ver y gestionar las *skills* de Claude Code y de Codex desde Logday. Una skill es una carpeta con un `SKILL.md` (frontmatter YAML con `name` y `description`, y el cuerpo con las instrucciones) y, a veces, scripts, referencias y otros archivos. Los dos agentes leen las skills de carpetas fijas del equipo y detectan los cambios sin reiniciar.

Jorge la pidió el 10 nov 2026 y aprobó la propuesta ese mismo día, con todas las recomendaciones:

1. Tiene vista propia en el menú lateral (como DevTools) y una página en Opciones.
2. Las skills nuevas de Codex van a `~/.agents/skills`, que es lo que documenta OpenAI. `~/.codex/skills` (lo que usa su `skill-installer`) se lista igual.
3. Una skill para las dos herramientas: la carpeta real queda en `~/.claude/skills`, y en Codex va un enlace simbólico.
4. Borrar manda a la papelera del sistema, con confirmación.
5. Desactivar sin borrar mueve la skill a una carpeta de Logday, y Activar la devuelve.
6. Repos vinculados: solo GitHub en la v1, públicos y privados (con token).
7. De un repo que es un marketplace de plugins se copian solo sus skills, como skills sueltas, con un aviso.
8. Las skills de proyecto (`<repo>/.claude/skills`, `<repo>/.agents/skills`) quedan para después.
9. Al instalar desde fuera se quitan los bits de ejecución.
10. Las actualizaciones se buscan solo con un botón.
11. Se entrega en tres fases, un PR por fase.
12. El nombre es "Skills de agentes" / "Agent skills".

Fuentes:

- [Skills de Claude Code](https://code.claude.com/docs/en/skills.md), [Plugin loading](https://code.claude.com/docs/en/plugins/loading.md), [Plugin security](https://code.claude.com/docs/en/plugins/security.md).
- [Build skills de Codex](https://learn.chatgpt.com/docs/build-skills.md).
- [Especificación abierta](https://agentskills.io/specification).

## Requisitos (EARS)

### Fuentes

- SK1. La extensión DEBERÁ listar las skills de estas fuentes:

  | Fuente | Carpeta | Se puede cambiar |
  |---|---|---|
  | Claude Code | `~/.claude/skills/` (sin `synced/`) | sí |
  | Codex | `~/.agents/skills/` | sí |
  | Codex (carpeta antigua) | `~/.codex/skills/` (sin `.system/`) | sí |
  | Claude Code, sincronizadas de claude.ai | `~/.claude/skills/synced/` | no |
  | Codex, de sistema | `~/.codex/skills/.system/` | no |
  | Codex, de administración | `/etc/codex/skills/` (solo macOS y Linux) | no |
  | Plugins de Claude Code | lo que diga `~/.claude/plugins/installed_plugins.json` | no |
  | Plugins de Codex | `~/.codex/plugins/cache/` | no |

  Las de solo lectura DEBERÁN mostrarse con su origen y con cómo se gestionan (por ejemplo, "Plugin de Claude Code: gestiónalo con /plugin").

- SK2. Una misma carpeta presente en varias fuentes, por un enlace simbólico, DEBERÁ aparecer **una sola vez**, con todas sus herramientas ("Claude · Codex").
- SK3. Un enlace simbólico a una carpeta que no está dentro de ninguna fuente DEBERÁ mostrarse como "enlace externo". Se puede ver a dónde apunta y quitar el enlace, pero Logday NO DEBERÁ leer su contenido.
- SK4. La extensión NO DEBERÁ leer ni escribir nada fuera de las carpetas de SK1 y de su propia carpeta de datos. En particular, nunca `settings.json`, `config.toml`, `auth.json` ni los registros de plugins. La única excepción es leer `installed_plugins.json` para saber dónde están los plugins.

### Ver (fase 1)

- SK5. La lista DEBERÁ mostrar por cada skill:
  - nombre, descripción, herramientas y origen;
  - número de archivos, tamaño y última modificación;
  - los avisos de SK7.

  DEBERÁ poder buscarse por nombre y descripción, sin tildes ni mayúsculas, y filtrarse por herramienta (Todas, Claude Code, Codex) y por origen (Tuyas, Desactivadas, Plugins y sistema).
- SK6. El detalle de una skill DEBERÁ mostrar:
  - el `SKILL.md` renderizado y saneado, o su texto fuente;
  - el frontmatter en una tabla;
  - el árbol de archivos;
  - la ruta de cada carpeta donde está.

  Un archivo de texto DEBERÁ poder abrirse como texto plano. Un binario solo se lista. Nada se renderiza como HTML vivo ni se abre con otro programa.
- SK7. Avisos de riesgo, calculados al listar:
  - trae scripts: archivos en `scripts/`, con extensión de script o con bit de ejecución;
  - trae binarios;
  - declara `allowed-tools`;
  - declara `hooks`;
  - inyecta comandos con `` !`…` `` en el cuerpo;
  - contiene enlaces simbólicos;
  - el frontmatter no es válido o le falta `name` o `description`;
  - el `name` no coincide con la carpeta.
- SK8. "Mostrar en Finder" ("Mostrar en el Explorador" en Windows) DEBERÁ mostrar la carpeta de la skill sin abrir ni ejecutar nada.

### Gestionar (fase 2)

- SK9. **Crear.** Se PODRÁ crear una skill desde una plantilla, eligiendo Claude Code, Codex o ambas. El nombre DEBERÁ cumplir la especificación abierta: de 1 a 64 caracteres; solo `a-z`, `0-9` y `-`; sin guion al principio ni al final, ni dos seguidos. Será el nombre de la carpeta. La descripción DEBERÁ tener de 1 a 1024 caracteres. Si ya existe una skill con ese nombre en el destino, NO DEBERÁ crearse.
- SK10. **Editar.** En una skill que se puede cambiar, se PODRÁ editar el `SKILL.md` dentro de la app. El resto de archivos no se edita.
  - Antes de guardar, DEBERÁ avisarse si el frontmatter no es válido. Guardar igual se permite.
  - SI el archivo cambió en disco desde que se abrió, DEBERÁ preguntarse antes de pisarlo.
- SK11. **Borrar.** Borrar DEBERÁ mandar la skill a la papelera del sistema, con la confirmación compartida (respeta "Confirmar antes de eliminar").
  - SI la skill es un enlace, DEBERÁ quitarse el enlace y nunca su destino.
  - SI está en varias herramientas, el diálogo DEBERÁ permitir quitarla solo de una (se quita el enlace) o de todas (la carpeta va a la papelera y se quitan los enlaces).
- SK12. **Desactivar.** Desactivar DEBERÁ mover la skill a `<datos de la app>/agent-skills/disabled/<fuente>/<carpeta>`, con todas sus ubicaciones, enlaces incluidos. Activar la DEBERÁ devolver al mismo sitio. SI ese sitio ya está ocupado, NO DEBERÁ pisarse y se avisa.
- SK13. **Compartir con la otra herramienta.** Una skill propia solo en Claude Code o solo en Codex PODRÁ añadirse a la otra.
  - En macOS y Linux, con un enlace simbólico a la carpeta real. Si la real está en Codex, el enlace va en `~/.claude/skills` hacia ella.
  - En Windows, donde crear enlaces exige permisos, con una copia, y así lo dice el botón.
- SK14. **Importar.** Se PODRÁ importar una carpeta o un `.zip` elegidos en un diálogo nativo. Si contiene varias skills, se elige cuáles. Siempre pasa por la vista previa (SK15).
  - *Enmienda (10 nov 2026, pedido por Jorge: "que pueda cargar las skills con archivos, de una carpeta que me compartan o un .zip"):*
    - También se PODRÁN **soltar** una o varias carpetas o `.zip` sobre la vista.
    - Rust DEBERÁ aceptar solo las rutas que él mismo anotó del evento de soltar de la ventana principal, en los últimos 2 minutos; el webview no puede nombrar otras.
    - Lo que no sea carpeta ni `.zip` se ignora.
    - Cada skill se importa con todos sus archivos (`scripts/`, `references/`, `assets/`…), con las reglas de SK16.
- SK38. **Menú del clic derecho** *(pedido por Jorge el 11 nov 2026)*. Al hacer clic derecho sobre una skill de la lista, o con la tecla de menú o Mayús+F10 sobre la fila enfocada, DEBERÁ abrirse un menú con las mismas acciones que el detalle (editar, compartir, activar o desactivar y borrar) más "Mostrar en el Finder". No hace falta elegir la skill antes.
  - Borrar DEBERÁ ir al final y separado, con la misma confirmación de SK11.
  - Una skill que no se puede cambiar (de plugin o del sistema) solo DEBERÁ ofrecer "Mostrar".
  - Se usa con flechas, Inicio y Fin; Escape o un clic fuera lo cierran y el foco vuelve a la fila.
- SK39. La skill y el repo elegidos DEBERÁN distinguirse del hover: fondo de acento y una barra a la izquierda, como en la lista de horas extra.

### Vista previa e instalación

- SK15. Antes de instalar o actualizar desde fuera de las carpetas de los agentes (importar o un repo), Logday DEBERÁ:
  1. copiar o descomprimir el contenido en su carpeta de preparación, nunca directo en la del agente;
  2. mostrar el `SKILL.md`, el árbol con cada archivo de texto abrible, los avisos de SK7, el tamaño y el origen (ruta, o repo y commit);
  3. dejar elegir el nombre de destino (por defecto, el `name` del frontmatter si es válido, si no, el de la carpeta) y las herramientas;
  4. instalar solo al confirmar.
- SK16. Al preparar DEBERÁN aplicarse estas reglas:
  - nada de rutas absolutas ni `..` dentro del zip;
  - los enlaces simbólicos de dentro y las carpetas `.git` se omiten, con aviso;
  - los bits de ejecución se quitan (decisión 9);
  - topes: 5 MB por archivo, 1000 archivos y 20 MB por skill, más 50 MB por zip descargado. Si se superan, la skill no se prepara y se dice por qué.
- SK17. SI ya existe una skill con el nombre de destino, la instalación DEBERÁ pedir "Reemplazar". La anterior va a la papelera.
- SK18. Lo que se instala DEBERÁ ser exactamente lo que se previsualizó. Si lo preparado cambió entre la vista previa y la confirmación, la instalación DEBERÁ fallar.

### Repos de GitHub, GitLab y servidores propios (fase 3)

- SK19. Se PODRÁ vincular un repo con `owner/repo` (GitHub), con la URL del repo en GitHub, GitLab o un servidor propio, o con eso más una rama o tag y una subcarpeta. En GitLab el repo puede estar dentro de grupos y subgrupos (`grupo/subgrupo/repo`). Los repos vinculados se guardan en la configuración local de la extensión. *(Enmienda del 10 nov 2026: antes solo GitHub.)*
- SK20. Al abrir un repo, Logday DEBERÁ:
  - resolver la rama o el tag (por defecto, la rama principal) a un **commit**;
  - descargar el zip de ese commit;
  - buscar skills (carpetas con `SKILL.md`) en `skills/`, `skills/.curated/`, `skills/.experimental/`, `.claude/skills/`, `.agents/skills/`, `plugins/*/skills/`, la raíz y la subcarpeta pedida;
  - mostrar el catálogo con su estado: No instalada, Instalada, Actualización disponible o Modificada localmente.
- SK21. Instalar desde un repo DEBERÁ pasar por la vista previa (SK15) y guardar de dónde vino: repo, ruta, commit y huella del contenido.
- SK22. "Buscar actualizaciones" DEBERÁ ser manual: un botón por repo y uno para todos. Logday NO DEBERÁ consultar ningún servidor por su cuenta.
  - Para aplicar una actualización DEBERÁ mostrarse antes el cambio de cada archivo (añadido, quitado, cambiado, con el diff del texto).
  - SI la skill se modificó a mano desde que se instaló, DEBERÁ avisarse antes de pisarla.
  - La versión anterior va a la papelera.
- SK23. SI el repo trae `.claude-plugin/marketplace.json` o `plugin.json`, el catálogo DEBERÁ avisar que solo se instalan las skills: hooks, servidores MCP, comandos y agentes del plugin no. También DEBERÁ sugerir `/plugin marketplace add owner/repo` para instalar el plugin completo.
- SK24. Para repos privados se PODRÁ guardar un token por servidor. Va al llavero (`ext:agent-skills:github_token` para GitHub, `gitlab_token` para gitlab.com y `token-<huella del host>` para los propios), el webview nunca lo lee, y solo se envía al servidor al que pertenece.
- SK25. Las peticiones DEBERÁN salir desde Rust (R17), por `https` y con límites de tiempo y tamaño, solo a:
  - `api.github.com` y `codeload.github.com` para GitHub;
  - `gitlab.com` para GitLab;
  - los servidores propios que el usuario haya añadido (SK36).
  Una redirección a otro host DEBERÁ rechazarse, salvo la de GitHub a `codeload.github.com`, que se pide sin el token.
- SK36. Se PODRÁN añadir servidores propios (host y, si hace falta, puerto) de tipo **GitLab** o **Gitea/Forgejo**, desde Opciones o al vincular la URL de un repo en un host desconocido.
  - Añadir un servidor DEBERÁ confirmarse en un diálogo nativo desde Rust (SK29): si un script del webview pudiera añadirlos, podría hacer que Logday se conecte a cualquier host.
  - La lista de servidores la guarda Rust en la carpeta de datos de la extensión (vetada al webview, SK27), no en la configuración.
  - Quitar un servidor no pide confirmación y borra su token.
  - Se aceptan direcciones de red local o de una VPN (p. ej. Tailscale): un servidor propio suele estar ahí, y solo se llega a los que el usuario añadió.
- SK37. El certificado del servidor DEBERÁ ser válido para el sistema. No hay opción para aceptar certificados no válidos: un servidor con una CA propia funciona si esa CA está instalada en el llavero del sistema.

### Seguridad

- SK26. Las rutas de las fuentes DEBERÁN calcularse en Rust a partir de la carpeta personal. El webview solo nombra una fuente, una carpeta de skill y una ruta relativa sin `..`. Todo se resuelve con los enlaces simbólicos y se comprueba que caiga dentro de la fuente.
- SK27. Las carpetas de los agentes NO DEBERÁN agregarse al límite de rutas general (`fs_scope.rs`). Los comandos genéricos de archivos (`read_file`, `write_file`…) DEBERÁN seguir sin poder tocarlas. Tampoco DEBERÁN poder tocar la carpeta de datos de esta extensión (preparación, desactivadas y registro).
- SK28. Logday NO DEBERÁ ejecutar nada de una skill. Nunca `chmod +x`, ni `git`, ni los CLI `claude` o `codex`, ni abrir un archivo de la skill con otro programa.
- SK29. Escribir en las carpetas de los agentes da poder sobre lo que hacen (una skill puede declarar `hooks` o comandos que el agente ejecuta). Por eso crear, guardar, instalar, actualizar, compartir y activar DEBERÁN confirmarse en un **diálogo nativo abierto desde Rust**, que un script del webview no puede contestar.
  - Al guardar, basta una vez por skill y por sesión de la app.
  - Borrar y desactivar no lo piden, porque no agregan nada que el agente vaya a ejecutar.
- SK30. Los comandos nuevos DEBERÁN estar solo en la capability de la ventana principal.

### Plataformas y datos

- SK31. Solo Desktop (`apps: ['desktop']`): Web y Mobile no tienen acceso al sistema de archivos local.
- SK32. Nada se sincroniza (R9, R19). Los repos vinculados y las preferencias van en la configuración local de la extensión. El registro de lo instalado desde repos va en su carpeta de datos.
- SK33. La extensión no envía datos de Logday fuera, así que no lleva el aviso de R6. Al activarla DEBERÁ explicarse que las skills se ejecutan con los permisos del agente.
- SK34. Para pruebas, en builds de depuración Rust PODRÁ usar como carpeta personal la de la variable `LOGDAY_AGENT_SKILLS_HOME`. En builds de release se ignora, y el webview no puede cambiarla.

### Textos

- SK35. Los textos DEBERÁN estar en español e inglés (R20), en español con tú y sin voseo.
