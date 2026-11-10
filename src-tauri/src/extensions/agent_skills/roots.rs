//! Fuentes de skills y cómo se resuelven sus rutas (specs/skills-de-agentes
//! SK1, SK26, SK34).
//!
//! El webview nunca manda una ruta absoluta para actuar: manda una fuente y
//! un `id`, que es la ruta de la skill relativa a la carpeta base de esa
//! fuente (`logday`, `<cubo>/<skill>` en las sincronizadas, …). Aquí se
//! valida que el `id` no tenga `..` ni nada raro, se junta con la base y se
//! comprueba, con los enlaces ya resueltos, que la carpeta real caiga dentro
//! de alguna fuente conocida.

use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

/// Variable para pruebas: en builds de depuración, la carpeta personal que
/// se usa en vez de la real (SK34). En release se ignora.
pub const HOME_OVERRIDE_VAR: &str = "LOGDAY_AGENT_SKILLS_HOME";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum SourceId {
    /// `~/.claude/skills`, sin `synced/`.
    Claude,
    /// `~/.agents/skills`: la de usuario que documenta Codex.
    Agents,
    /// `~/.codex/skills`, sin `.system/`: la que usa el `skill-installer`.
    Codex,
    /// Las desactivadas por Logday: `<datos>/agent-skills/disabled`.
    Disabled,
    /// `~/.claude/skills/synced`: llegan de claude.ai.
    ClaudeSynced,
    /// `~/.codex/skills/.system`: vienen con Codex.
    CodexSystem,
    /// `/etc/codex/skills`.
    CodexAdmin,
    /// `~/.claude/plugins` (las rutas salen de `installed_plugins.json`).
    ClaudePlugin,
    /// `~/.codex/plugins/cache`.
    CodexPlugin,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Tool {
    Claude,
    Codex,
}

impl SourceId {
    pub const ALL: [SourceId; 9] = [
        SourceId::Claude,
        SourceId::Agents,
        SourceId::Codex,
        SourceId::Disabled,
        SourceId::ClaudeSynced,
        SourceId::CodexSystem,
        SourceId::CodexAdmin,
        SourceId::ClaudePlugin,
        SourceId::CodexPlugin,
    ];

    /// Las que el usuario puede cambiar (fase 2). Las demás son de la
    /// herramienta o de claude.ai y solo se ven (SK1).
    pub fn editable(self) -> bool {
        matches!(self, SourceId::Claude | SourceId::Agents | SourceId::Codex | SourceId::Disabled)
    }

    /// Herramienta de la fuente. `Disabled` depende de la carpeta de la que
    /// salió (la primera parte de su `id`).
    pub fn tool(self) -> Option<Tool> {
        match self {
            SourceId::Claude | SourceId::ClaudeSynced | SourceId::ClaudePlugin => Some(Tool::Claude),
            SourceId::Agents | SourceId::Codex | SourceId::CodexSystem | SourceId::CodexAdmin | SourceId::CodexPlugin => {
                Some(Tool::Codex)
            }
            SourceId::Disabled => None,
        }
    }

    pub fn key(self) -> &'static str {
        match self {
            SourceId::Claude => "claude",
            SourceId::Agents => "agents",
            SourceId::Codex => "codex",
            SourceId::Disabled => "disabled",
            SourceId::ClaudeSynced => "claude-synced",
            SourceId::CodexSystem => "codex-system",
            SourceId::CodexAdmin => "codex-admin",
            SourceId::ClaudePlugin => "claude-plugin",
            SourceId::CodexPlugin => "codex-plugin",
        }
    }

    pub fn from_key(key: &str) -> Option<SourceId> {
        SourceId::ALL.into_iter().find(|s| s.key() == key)
    }
}

/// La carpeta personal. En depuración, la de `LOGDAY_AGENT_SKILLS_HOME` si
/// está puesta; se lee una vez, al primer uso.
pub fn home() -> PathBuf {
    static HOME: OnceLock<PathBuf> = OnceLock::new();
    HOME.get_or_init(|| {
        if cfg!(debug_assertions) {
            if let Some(dir) = std::env::var_os(HOME_OVERRIDE_VAR).filter(|v| !v.is_empty()) {
                return PathBuf::from(dir);
            }
        }
        dirs_next::home_dir().unwrap_or_default()
    })
    .clone()
}

/// Las carpetas de una instalación: la personal y la de datos de la
/// extensión (`<app_data>/agent-skills`).
#[derive(Clone, Debug)]
pub struct Roots {
    pub home: PathBuf,
    pub data: PathBuf,
    /// `/etc/codex/skills` (no en Windows). Aparte para que las pruebas no
    /// dependan del equipo.
    pub admin: Option<PathBuf>,
}

impl Roots {
    pub fn new(home: PathBuf, data: PathBuf) -> Self {
        let admin = (!cfg!(windows)).then(|| PathBuf::from("/etc/codex/skills"));
        Roots { home, data, admin }
    }

    pub fn claude(&self) -> PathBuf {
        self.home.join(".claude").join("skills")
    }
    pub fn agents(&self) -> PathBuf {
        self.home.join(".agents").join("skills")
    }
    pub fn codex(&self) -> PathBuf {
        self.home.join(".codex").join("skills")
    }
    pub fn disabled(&self) -> PathBuf {
        self.data.join("disabled")
    }
    #[allow(dead_code)] // La usan los comandos que cambian skills (fase 2 y 3).
    pub fn staging(&self) -> PathBuf {
        self.data.join("staging")
    }
    pub fn claude_plugins(&self) -> PathBuf {
        self.home.join(".claude").join("plugins")
    }

    /// Carpeta base de cada fuente: el `id` de una skill es relativo a esta.
    pub fn base(&self, source: SourceId) -> Option<PathBuf> {
        Some(match source {
            SourceId::Claude => self.claude(),
            SourceId::Agents => self.agents(),
            SourceId::Codex => self.codex(),
            SourceId::Disabled => self.disabled(),
            SourceId::ClaudeSynced => self.claude().join("synced"),
            SourceId::CodexSystem => self.codex().join(".system"),
            SourceId::CodexAdmin => return self.admin.clone(),
            SourceId::ClaudePlugin => self.claude_plugins(),
            SourceId::CodexPlugin => self.home.join(".codex").join("plugins").join("cache"),
        })
    }

    /// Las carpetas de los agentes que los comandos genéricos de archivos no
    /// pueden tocar (SK27). No tienen que existir.
    pub fn agent_dirs(&self) -> Vec<PathBuf> {
        vec![self.home.join(".claude"), self.home.join(".codex"), self.home.join(".agents")]
    }

    /// Las bases que existen, ya canonicalizadas, con su fuente. Una
    /// carpeta real que no cae en ninguna es un enlace externo (SK3).
    pub fn canonical_bases(&self) -> Vec<(SourceId, PathBuf)> {
        SourceId::ALL
            .into_iter()
            .filter_map(|s| self.base(s).and_then(|b| b.canonicalize().ok()).map(|b| (s, b)))
            .collect()
    }
}

/// Errores que ve el webview: solo un código, nunca una ruta.
pub const ERR_INVALID: &str = "invalid_name";
pub const ERR_NOT_FOUND: &str = "not_found";
pub const ERR_EXTERNAL: &str = "external";
pub const ERR_BINARY: &str = "binary";
pub const ERR_TOO_LARGE: &str = "too_large";
#[allow(dead_code)] // La usan los comandos que cambian skills (fase 2 y 3).
pub const ERR_READ_ONLY: &str = "read_only";

/// Un nombre de archivo o carpeta aceptable: sin separadores, sin `..`,
/// sin `\0` y de hasta 255 bytes.
fn valid_component(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 255
        && name != "."
        && name != ".."
        && !name.contains(['/', '\\', '\0'])
        && !(cfg!(windows) && name.contains(':'))
}

/// Parte una ruta relativa que manda el webview (con `/`) en componentes
/// válidos. Rechaza `..`, las absolutas y los prefijos de Windows.
pub fn split_relative(rel: &str) -> Result<Vec<String>, &'static str> {
    if rel.is_empty() || rel.len() > 4096 || rel.starts_with('/') || rel.starts_with('\\') {
        return Err(ERR_INVALID);
    }
    let parts: Vec<String> = rel.split('/').map(str::to_string).collect();
    if parts.iter().all(|p| valid_component(p)) {
        Ok(parts)
    } else {
        Err(ERR_INVALID)
    }
}

/// Junta componentes ya validados a una base.
pub fn join(base: &Path, parts: &[String]) -> PathBuf {
    let mut p = base.to_path_buf();
    for part in parts {
        p.push(part);
    }
    p
}

/// Una ruta no tiene `..` ni es relativa (para las que salen de archivos
/// de terceros, como `installed_plugins.json`).
pub fn is_plain_absolute(p: &Path) -> bool {
    p.is_absolute() && !p.components().any(|c| matches!(c, Component::ParentDir))
}

/// Una skill resuelta: su carpeta real, con los enlaces resueltos.
#[derive(Debug, Clone)]
pub struct Resolved {
    pub real: PathBuf,
}

/// Resuelve `(fuente, id)` a la carpeta de la skill (SK26). Falla si no
/// existe o si su carpeta real no cae dentro de ninguna fuente (enlace
/// externo, SK3): de esas no se lee nada.
pub fn resolve_skill(roots: &Roots, source: SourceId, id: &str) -> Result<Resolved, &'static str> {
    let base = roots.base(source).ok_or(ERR_NOT_FOUND)?;
    let parts = split_relative(id)?;
    let path = join(&base, &parts);
    let real = path.canonicalize().map_err(|_| ERR_NOT_FOUND)?;
    if !real.is_dir() {
        return Err(ERR_NOT_FOUND);
    }
    if !roots.canonical_bases().iter().any(|(_, b)| real.starts_with(b)) {
        return Err(ERR_EXTERNAL);
    }
    Ok(Resolved { real })
}

/// Un archivo dentro de una skill ya resuelta: relativo, sin `..`, y que
/// con los enlaces resueltos siga dentro de la carpeta real de la skill.
pub fn resolve_file(skill: &Resolved, rel: &str) -> Result<PathBuf, &'static str> {
    let parts = split_relative(rel)?;
    let file = join(&skill.real, &parts).canonicalize().map_err(|_| ERR_NOT_FOUND)?;
    if !file.starts_with(&skill.real) || !file.is_file() {
        return Err(ERR_NOT_FOUND);
    }
    Ok(file)
}

/// La ruta para mostrar: `~/…` si está dentro de la carpeta personal.
pub fn display_path(roots: &Roots, p: &Path) -> String {
    match p.strip_prefix(&roots.home) {
        Ok(rest) if !roots.home.as_os_str().is_empty() => {
            let rest = rest.to_string_lossy().replace('\\', "/");
            if rest.is_empty() {
                "~".into()
            } else {
                format!("~/{rest}")
            }
        }
        _ => p.to_string_lossy().to_string(),
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::fs;

    pub struct Tmp(pub PathBuf);
    impl Tmp {
        pub fn new(name: &str) -> Self {
            let p = std::env::temp_dir().join(format!("logday-skills-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&p);
            fs::create_dir_all(&p).unwrap();
            Tmp(p.canonicalize().unwrap())
        }
        pub fn roots(&self) -> Roots {
            let mut r = Roots::new(self.0.join("home"), self.0.join("app").join("agent-skills"));
            r.admin = None;
            r
        }
    }
    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    pub fn skill(dir: &Path, md: &str) {
        fs::create_dir_all(dir).unwrap();
        fs::write(dir.join("SKILL.md"), md).unwrap();
    }

    #[test]
    fn rutas_relativas_validas_e_invalidas() {
        assert_eq!(split_relative("a/b.md").unwrap(), vec!["a", "b.md"]);
        assert!(split_relative("SKILL.md").is_ok());
        assert!(split_relative(".hidden/x").is_ok());
        for bad in ["", "/etc/passwd", "../x", "a/../b", "a//b", "a/./b", "\\x", "a\\b", "a\0b"] {
            assert_eq!(split_relative(bad), Err(ERR_INVALID), "{bad:?}");
        }
    }

    #[test]
    fn resuelve_dentro_y_rechaza_fuera() {
        let t = Tmp::new("resolver");
        let r = t.roots();
        skill(&r.claude().join("uno"), "---\nname: uno\n---\n");
        fs::create_dir_all(t.0.join("fuera")).unwrap();
        fs::write(t.0.join("fuera/secreto.txt"), "x").unwrap();
        let ok = resolve_skill(&r, SourceId::Claude, "uno").unwrap();
        assert!(resolve_file(&ok, "SKILL.md").is_ok());
        assert_eq!(resolve_skill(&r, SourceId::Claude, "../fuera").unwrap_err(), ERR_INVALID);
        assert_eq!(resolve_skill(&r, SourceId::Claude, "nada").unwrap_err(), ERR_NOT_FOUND);
        assert_eq!(resolve_file(&ok, "../../../fuera/secreto.txt").unwrap_err(), ERR_INVALID);
        #[cfg(unix)]
        {
            // Un enlace dentro de la skill que sale de ella.
            std::os::unix::fs::symlink(t.0.join("fuera/secreto.txt"), r.claude().join("uno/atajo")).unwrap();
            assert_eq!(resolve_file(&ok, "atajo").unwrap_err(), ERR_NOT_FOUND);
            // Una skill que es un enlace a una carpeta fuera de las fuentes.
            std::os::unix::fs::symlink(t.0.join("fuera"), r.claude().join("externa")).unwrap();
            assert_eq!(resolve_skill(&r, SourceId::Claude, "externa").unwrap_err(), ERR_EXTERNAL);
            // Un enlace de Codex a una de Claude sí vale.
            fs::create_dir_all(r.codex()).unwrap();
            std::os::unix::fs::symlink(r.claude().join("uno"), r.codex().join("uno")).unwrap();
            assert!(resolve_skill(&r, SourceId::Codex, "uno").is_ok());
        }
    }

    #[test]
    fn ruta_para_mostrar() {
        let r = Roots::new(PathBuf::from("/Users/x"), PathBuf::from("/tmp/d"));
        assert_eq!(display_path(&r, Path::new("/Users/x/.claude/skills/a")), "~/.claude/skills/a");
        assert_eq!(display_path(&r, Path::new("/etc/codex/skills")), "/etc/codex/skills");
    }
}
