//! Límite de rutas de los comandos de archivos (specs/blindaje-seguridad,
//! BS10–BS17).
//!
//! Antes, `read_file`, `write_file`, `delete_dir`, etc. aceptaban cualquier
//! ruta absoluta: un script inyectado en el webview (una nota con HTML, un
//! diagrama malicioso) podía leer `~/.ssh` o escribir un LaunchAgent. Ahora
//! cada ruta tiene que caer dentro de:
//!
//! - la carpeta de la app (`app_data_dir`, donde vive `config.json`);
//! - una **raíz** que el usuario eligió en un diálogo nativo de carpeta
//!   (la carpeta de datos). Se guardan en `fs-scope.json`, que el webview no
//!   puede escribir, así que solo un diálogo abierto desde Rust agrega una;
//! - un **archivo** que el usuario eligió en un diálogo de abrir o guardar,
//!   solo durante esta sesión (exportaciones, importar un respaldo, una
//!   plantilla de Excel);
//! - un `.md` o `.txt` que el usuario **soltó** en la ventana principal,
//!   solo para leerlo y solo durante esta sesión (importar notas
//!   arrastrándolas, BS23). Lo anota Rust desde el evento de la ventana, no
//!   el webview.
//!
//! Además, dentro de las raíces no se puede escribir en una carpeta `.git`
//! (sus hooks y su `config` ejecutan código al correr `git_run`), ni borrar
//! o renombrar una raíz entera.
//!
//! Y hay carpetas vetadas aunque caigan dentro de lo anterior
//! (specs/skills-de-agentes SK27): `<app>/agent-skills` y las de los
//! agentes de IA (`deny`).

use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// Archivo donde se guardan las raíces elegidas por el usuario, dentro de
/// `app_data_dir`. Protegido contra escritura desde el webview.
pub const SCOPE_FILE: &str = "fs-scope.json";

/// Carpeta de datos de la extensión Skills de agentes, dentro de la app
/// (specs/skills-de-agentes, design "Carpeta de datos").
pub const AGENT_SKILLS_DIR: &str = "agent-skills";

#[derive(Debug, Default, Serialize, Deserialize)]
struct StoredScope {
    roots: Vec<String>,
}

#[derive(Default)]
struct Inner {
    /// Carpeta de la app, ya canonicalizada. Siempre permitida.
    app_dir: Option<PathBuf>,
    /// Raíces elegidas por el usuario, canonicalizadas.
    roots: Vec<PathBuf>,
    /// Archivos sueltos elegidos en un diálogo (solo esta sesión).
    files: HashSet<PathBuf>,
    /// Notas soltadas en la ventana: solo lectura, solo esta sesión.
    dropped: HashSet<PathBuf>,
    /// Carpetas vetadas aunque caigan dentro de la app o de una raíz
    /// (specs/skills-de-agentes SK27): la de datos de la extensión Skills
    /// de agentes y las de los agentes (`~/.claude`, `~/.codex`,
    /// `~/.agents`). Escribir ahí es darle órdenes a un agente que ejecuta
    /// comandos; solo los comandos propios de esa extensión las tocan.
    denied: Vec<PathBuf>,
}

/// Cuántos archivos de un mismo soltar se aceptan como notas. Importar más
/// de una vez no tiene sentido y así el conjunto no crece sin límite.
pub const MAX_DROPPED_NOTES: usize = 200;

/// Si una ruta ya resuelta es algo que Notas puede importar: un archivo
/// (no una carpeta) con extensión `.md` o `.txt`.
fn is_note_file(resolved: &Path) -> bool {
    let ext_ok = resolved
        .extension()
        .map(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("txt"))
        .unwrap_or(false);
    ext_ok && resolved.is_file()
}

#[derive(Default)]
pub struct FsScope {
    inner: Mutex<Inner>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Access {
    Read,
    Write,
}

/// Error que ve el webview. Sin la ruta resuelta, para no filtrar nada más
/// de lo que ya sabe quien la pidió.
fn denied(path: &str) -> String {
    format!("Ruta fuera de las carpetas permitidas: {path}")
}

/// Normaliza una ruta absoluta sin tocar el disco más que para resolver
/// enlaces simbólicos: rechaza `..` (no hay motivo legítimo para usarlo y
/// es la forma de salir de una raíz), canonicaliza el ancestro existente
/// más largo y le vuelve a pegar el resto.
pub fn resolve(path: &str) -> Result<PathBuf, String> {
    let p = Path::new(path);
    if !p.is_absolute() {
        return Err(denied(path));
    }
    if p.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(denied(path));
    }
    let mut existing = p.to_path_buf();
    let mut rest: Vec<std::ffi::OsString> = Vec::new();
    loop {
        if existing.exists() {
            break;
        }
        match (existing.file_name().map(|n| n.to_os_string()), existing.parent()) {
            (Some(name), Some(parent)) => {
                rest.push(name);
                existing = parent.to_path_buf();
            }
            _ => return Err(denied(path)),
        }
    }
    let mut out = existing.canonicalize().map_err(|_| denied(path))?;
    for name in rest.iter().rev() {
        out.push(name);
    }
    Ok(out)
}

fn is_git_internal(path: &Path, root: &Path) -> bool {
    path.strip_prefix(root)
        .map(|rel| {
            rel.components().any(|c| match c {
                Component::Normal(n) => n.to_string_lossy().eq_ignore_ascii_case(".git"),
                _ => false,
            })
        })
        .unwrap_or(false)
}

impl FsScope {
    /// Carga las raíces guardadas. La primera vez (no existe
    /// `fs-scope.json`) adopta el `basePath` de `config.json`: es la
    /// carpeta que el usuario ya había elegido antes de esta versión.
    pub fn init(&self, app_dir: &Path) {
        let _ = fs::create_dir_all(app_dir);
        let app_dir = app_dir.canonicalize().unwrap_or_else(|_| app_dir.to_path_buf());
        let store = app_dir.join(SCOPE_FILE);
        let mut roots: Vec<PathBuf> = Vec::new();
        let mut migrated = false;
        match fs::read_to_string(&store) {
            Ok(raw) => {
                if let Ok(s) = serde_json::from_str::<StoredScope>(&raw) {
                    for r in s.roots {
                        if let Ok(c) = Path::new(&r).canonicalize() {
                            if !roots.contains(&c) {
                                roots.push(c);
                            }
                        }
                    }
                }
            }
            Err(_) => {
                migrated = true;
                if let Ok(raw) = fs::read_to_string(app_dir.join("config.json")) {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
                        if let Some(base) = v.get("basePath").and_then(|b| b.as_str()) {
                            if let Ok(c) = Path::new(base).canonicalize() {
                                if c.is_dir() {
                                    roots.push(c);
                                }
                            }
                        }
                    }
                }
            }
        }
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if let Ok(own) = resolve(&app_dir.join(AGENT_SKILLS_DIR).to_string_lossy()) {
            if !inner.denied.contains(&own) {
                inner.denied.push(own);
            }
        }
        inner.app_dir = Some(app_dir);
        inner.roots = roots;
        drop(inner);
        if migrated {
            let _ = self.persist();
        }
    }

    fn persist(&self) -> Result<(), String> {
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let Some(app_dir) = inner.app_dir.clone() else {
            return Ok(());
        };
        let stored = StoredScope {
            roots: inner.roots.iter().map(|r| r.to_string_lossy().to_string()).collect(),
        };
        drop(inner);
        let json = serde_json::to_string_pretty(&stored).map_err(|e| e.to_string())?;
        fs::write(app_dir.join(SCOPE_FILE), json).map_err(|e| e.to_string())
    }

    /// Veta una carpeta (y todo lo de dentro) para los comandos genéricos de
    /// archivos, aunque caiga dentro de la app o de una raíz (SK27). No
    /// tiene que existir.
    pub fn deny(&self, dir: &Path) {
        if let Ok(resolved) = resolve(&dir.to_string_lossy()) {
            let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
            if !inner.denied.contains(&resolved) {
                inner.denied.push(resolved);
            }
        }
    }

    /// Agrega una raíz elegida por el usuario en un diálogo de carpeta.
    pub fn add_root(&self, dir: &Path) -> Result<(), String> {
        let c = dir.canonicalize().map_err(|e| e.to_string())?;
        {
            let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
            if !inner.roots.contains(&c) {
                inner.roots.push(c);
            }
        }
        self.persist()
    }

    /// Permite un archivo suelto elegido en un diálogo, hasta cerrar la app.
    pub fn grant_file(&self, file: &Path) -> Result<(), String> {
        let resolved = resolve(&file.to_string_lossy())?;
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        inner.files.insert(resolved);
        Ok(())
    }

    /// Permite leer los `.md` y `.txt` que el usuario soltó en la ventana
    /// principal, hasta cerrar la app (BS23). Lo llama Rust desde
    /// `on_window_event`, nunca un comando: así el webview no puede nombrar
    /// rutas. Se mira la ruta ya resuelta, de modo que un `nota.md` que es
    /// un enlace simbólico a `~/.ssh/id_rsa` no cuenta. Devuelve cuántos
    /// archivos quedaron permitidos.
    pub fn grant_dropped_notes(&self, paths: &[PathBuf]) -> usize {
        let mut granted = 0;
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        for p in paths.iter().take(MAX_DROPPED_NOTES) {
            let Ok(resolved) = resolve(&p.to_string_lossy()) else { continue };
            if is_note_file(&resolved) {
                inner.dropped.insert(resolved);
                granted += 1;
            }
        }
        granted
    }

    /// Comprueba una ruta y la devuelve resuelta. `Write` incluye crear,
    /// borrar y renombrar.
    pub fn check(&self, path: &str, access: Access) -> Result<PathBuf, String> {
        let resolved = resolve(path)?;
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if inner.denied.iter().any(|d| resolved.starts_with(d)) {
            return Err(denied(path));
        }
        if inner.files.contains(&resolved) {
            return Ok(resolved);
        }
        // Lo soltado solo se lee: importar copia la nota a la carpeta de
        // datos, nunca escribe ni borra el original.
        if access == Access::Read && inner.dropped.contains(&resolved) {
            return Ok(resolved);
        }
        if let Some(app_dir) = &inner.app_dir {
            if resolved.starts_with(app_dir) {
                if access == Access::Write && resolved == app_dir.join(SCOPE_FILE) {
                    return Err(denied(path));
                }
                return Ok(resolved);
            }
        }
        for root in &inner.roots {
            if resolved.starts_with(root) {
                if access == Access::Write && is_git_internal(&resolved, root) {
                    return Err(denied(path));
                }
                return Ok(resolved);
            }
        }
        Err(denied(path))
    }

    /// Para borrar o renombrar: además de `check`, la ruta no puede ser una
    /// raíz ni la carpeta de la app enteras.
    pub fn check_not_root(&self, path: &str) -> Result<PathBuf, String> {
        let resolved = self.check(path, Access::Write)?;
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if inner.roots.contains(&resolved) || inner.app_dir.as_ref() == Some(&resolved) {
            return Err(denied(path));
        }
        Ok(resolved)
    }

    /// Directorio de trabajo de `git_run`: tiene que ser una raíz o estar
    /// dentro de una (no la carpeta de la app).
    pub fn check_git_cwd(&self, path: &str) -> Result<PathBuf, String> {
        let resolved = resolve(path)?;
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if inner.denied.iter().any(|d| resolved.starts_with(d)) {
            return Err(denied(path));
        }
        if inner.roots.iter().any(|r| resolved.starts_with(r)) {
            return Ok(resolved);
        }
        Err(denied(path))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Tmp(PathBuf);
    impl Tmp {
        fn new(name: &str) -> Self {
            let p = std::env::temp_dir().join(format!("logday-scope-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&p);
            fs::create_dir_all(&p).unwrap();
            Tmp(p.canonicalize().unwrap())
        }
        fn s(&self, rel: &str) -> String {
            self.0.join(rel).to_string_lossy().to_string()
        }
    }
    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn scope_with_root(t: &Tmp) -> FsScope {
        let app = t.0.join("app");
        let data = t.0.join("data");
        fs::create_dir_all(&data).unwrap();
        let s = FsScope::default();
        s.init(&app);
        s.add_root(&data).unwrap();
        s
    }

    #[test]
    fn permite_dentro_de_la_raiz_y_la_app() {
        let t = Tmp::new("dentro");
        let s = scope_with_root(&t);
        assert!(s.check(&t.s("data/notes/a.md"), Access::Write).is_ok());
        assert!(s.check(&t.s("data/projects/x/nuevo/b.md"), Access::Write).is_ok());
        assert!(s.check(&t.s("app/config.json"), Access::Write).is_ok());
    }

    #[test]
    fn veta_la_carpeta_de_skills_y_las_de_los_agentes() {
        let t = Tmp::new("vetadas");
        let s = scope_with_root(&t);
        assert!(s.check(&t.s("app/agent-skills/staging/x/SKILL.md"), Access::Read).is_err());
        assert!(s.check(&t.s("app/agent-skills"), Access::Write).is_err());
        assert!(s.check(&t.s("app/config.json"), Access::Read).is_ok());
        // Aunque el usuario haya elegido como carpeta de datos una que
        // contiene la de un agente.
        s.deny(&t.0.join("data/.claude"));
        assert!(s.check(&t.s("data/.claude/settings.json"), Access::Write).is_err());
        assert!(s.check(&t.s("data/.claude/skills/x/SKILL.md"), Access::Read).is_err());
        assert!(s.check(&t.s("data/notes/a.md"), Access::Write).is_ok());
    }

    #[test]
    fn rechaza_fuera_relativas_y_con_puntos() {
        let t = Tmp::new("fuera");
        let s = scope_with_root(&t);
        assert!(s.check(&t.s("otro/a.md"), Access::Read).is_err());
        assert!(s.check(&t.s("data/../otro/a.md"), Access::Read).is_err());
        assert!(s.check("notes/a.md", Access::Read).is_err());
        assert!(s.check("/etc/passwd", Access::Read).is_err());
    }

    #[test]
    fn rechaza_enlaces_simbolicos_que_salen_de_la_raiz() {
        #[cfg(unix)]
        {
            let t = Tmp::new("symlink");
            let s = scope_with_root(&t);
            fs::create_dir_all(t.0.join("secreto")).unwrap();
            std::os::unix::fs::symlink(t.0.join("secreto"), t.0.join("data/atajo")).unwrap();
            assert!(s.check(&t.s("data/atajo/id_rsa"), Access::Read).is_err());
        }
    }

    #[test]
    fn protege_git_y_el_archivo_de_raices() {
        let t = Tmp::new("git");
        let s = scope_with_root(&t);
        assert!(s.check(&t.s("data/.git/hooks/pre-commit"), Access::Write).is_err());
        assert!(s.check(&t.s("data/.GIT/config"), Access::Write).is_err());
        assert!(s.check(&t.s("data/.git/HEAD"), Access::Read).is_ok());
        assert!(s.check(&t.s("app/fs-scope.json"), Access::Write).is_err());
        assert!(s.check(&t.s("app/fs-scope.json"), Access::Read).is_ok());
    }

    #[test]
    fn no_deja_borrar_una_raiz_entera() {
        let t = Tmp::new("raiz");
        let s = scope_with_root(&t);
        assert!(s.check_not_root(&t.s("data")).is_err());
        assert!(s.check_not_root(&t.s("app")).is_err());
        fs::create_dir_all(t.0.join("data/notes/vieja")).unwrap();
        assert!(s.check_not_root(&t.s("data/notes/vieja")).is_ok());
    }

    #[test]
    fn archivos_elegidos_en_un_dialogo() {
        let t = Tmp::new("archivo");
        let s = scope_with_root(&t);
        let export = t.0.join("Descargas/respaldo.zip");
        assert!(s.check(&export.to_string_lossy(), Access::Write).is_err());
        s.grant_file(&export).unwrap();
        assert!(s.check(&export.to_string_lossy(), Access::Write).is_ok());
        // Otro archivo de la misma carpeta sigue fuera.
        assert!(s.check(&t.s("Descargas/otro.zip"), Access::Read).is_err());
    }

    #[test]
    fn notas_soltadas_se_pueden_leer_pero_no_escribir() {
        let t = Tmp::new("soltar");
        let s = scope_with_root(&t);
        fs::create_dir_all(t.0.join("Escritorio")).unwrap();
        let md = t.0.join("Escritorio/idea.md");
        let txt = t.0.join("Escritorio/lista.TXT");
        fs::write(&md, "# Idea").unwrap();
        fs::write(&txt, "uno").unwrap();
        assert!(s.check(&md.to_string_lossy(), Access::Read).is_err());

        assert_eq!(s.grant_dropped_notes(&[md.clone(), txt.clone()]), 2);
        assert!(s.check(&md.to_string_lossy(), Access::Read).is_ok());
        assert!(s.check(&txt.to_string_lossy(), Access::Read).is_ok());
        // Solo lectura: ni escribir, ni borrar.
        assert!(s.check(&md.to_string_lossy(), Access::Write).is_err());
        assert!(s.check_not_root(&md.to_string_lossy()).is_err());
        // Otro archivo de la misma carpeta sigue fuera.
        fs::write(t.0.join("Escritorio/otra.md"), "x").unwrap();
        assert!(s.check(&t.s("Escritorio/otra.md"), Access::Read).is_err());
    }

    #[test]
    fn soltar_ignora_lo_que_no_es_una_nota() {
        let t = Tmp::new("soltar-otros");
        let s = scope_with_root(&t);
        fs::create_dir_all(t.0.join("x/carpeta.md")).unwrap();
        fs::write(t.0.join("x/clave.pem"), "secreto").unwrap();
        fs::write(t.0.join("x/sin-extension"), "x").unwrap();
        let paths = vec![
            t.0.join("x/carpeta.md"),
            t.0.join("x/clave.pem"),
            t.0.join("x/sin-extension"),
            t.0.join("x/no-existe.md"),
            PathBuf::from("relativa.md"),
        ];
        assert_eq!(s.grant_dropped_notes(&paths), 0);
        assert!(s.check(&t.s("x/clave.pem"), Access::Read).is_err());
        assert!(s.check(&t.s("x/carpeta.md"), Access::Read).is_err());
    }

    #[test]
    fn soltar_un_enlace_md_a_otro_archivo_no_lo_permite() {
        #[cfg(unix)]
        {
            let t = Tmp::new("soltar-symlink");
            let s = scope_with_root(&t);
            fs::create_dir_all(t.0.join("secreto")).unwrap();
            fs::write(t.0.join("secreto/id_rsa"), "clave").unwrap();
            std::os::unix::fs::symlink(t.0.join("secreto/id_rsa"), t.0.join("nota.md")).unwrap();
            assert_eq!(s.grant_dropped_notes(&[t.0.join("nota.md")]), 0);
            assert!(s.check(&t.s("nota.md"), Access::Read).is_err());
            assert!(s.check(&t.s("secreto/id_rsa"), Access::Read).is_err());
        }
    }

    #[test]
    fn soltar_tiene_un_tope_por_evento() {
        let t = Tmp::new("soltar-tope");
        let s = scope_with_root(&t);
        fs::create_dir_all(t.0.join("muchas")).unwrap();
        let paths: Vec<PathBuf> = (0..MAX_DROPPED_NOTES + 5)
            .map(|i| {
                let p = t.0.join(format!("muchas/{i}.md"));
                fs::write(&p, "x").unwrap();
                p
            })
            .collect();
        assert_eq!(s.grant_dropped_notes(&paths), MAX_DROPPED_NOTES);
        assert!(s.check(&paths[MAX_DROPPED_NOTES].to_string_lossy(), Access::Read).is_err());
    }

    #[test]
    fn migra_el_base_path_de_config_json_una_sola_vez() {
        let t = Tmp::new("migra");
        let app = t.0.join("app");
        let data = t.0.join("data");
        fs::create_dir_all(&app).unwrap();
        fs::create_dir_all(&data).unwrap();
        fs::write(app.join("config.json"), format!("{{\"basePath\": {:?}}}", data.to_string_lossy())).unwrap();
        let s = FsScope::default();
        s.init(&app);
        assert!(s.check(&t.s("data/notes/a.md"), Access::Write).is_ok());
        assert!(app.join(SCOPE_FILE).exists());

        // Con fs-scope.json ya creado, cambiar config.json no agrega raíces.
        fs::create_dir_all(t.0.join("otra")).unwrap();
        fs::write(app.join("config.json"), format!("{{\"basePath\": {:?}}}", t.s("otra"))).unwrap();
        let s2 = FsScope::default();
        s2.init(&app);
        assert!(s2.check(&t.s("otra/a.md"), Access::Read).is_err());
        assert!(s2.check(&t.s("data/a.md"), Access::Read).is_ok());
    }

    #[test]
    fn git_cwd_solo_en_raices() {
        let t = Tmp::new("gitcwd");
        let s = scope_with_root(&t);
        assert!(s.check_git_cwd(&t.s("data")).is_ok());
        assert!(s.check_git_cwd(&t.s("app")).is_err());
        assert!(s.check_git_cwd(&t.s("otro")).is_err());
    }
}
