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
//!   plantilla de Excel).
//!
//! Además, dentro de las raíces no se puede escribir en una carpeta `.git`
//! (sus hooks y su `config` ejecutan código al correr `git_run`), ni borrar
//! o renombrar una raíz entera.

use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// Archivo donde se guardan las raíces elegidas por el usuario, dentro de
/// `app_data_dir`. Protegido contra escritura desde el webview.
pub const SCOPE_FILE: &str = "fs-scope.json";

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

    /// Comprueba una ruta y la devuelve resuelta. `Write` incluye crear,
    /// borrar y renombrar.
    pub fn check(&self, path: &str, access: Access) -> Result<PathBuf, String> {
        let resolved = resolve(path)?;
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if inner.files.contains(&resolved) {
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
