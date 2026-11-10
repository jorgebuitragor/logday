//! Archivos de una skill: el árbol, los avisos que salen de los archivos
//! (SK7), leer uno de texto y la huella del contenido (SK18, SK21).
//!
//! Los enlaces simbólicos de dentro de una skill no se siguen: se listan
//! como enlace y se avisa. Nunca se abre ni se ejecuta nada.

use std::fs;
use std::io::Read;
use std::path::Path;

use serde::Serialize;
use sha2::{Digest, Sha256};

use super::roots::{ERR_BINARY, ERR_NOT_FOUND, ERR_TOO_LARGE};

/// Hasta dónde se recorre una skill para contarla (design "Juntar
/// ubicaciones"): una carpeta enorme no cuelga la lista.
pub const MAX_WALK_FILES: usize = 2000;
pub const MAX_WALK_DEPTH: usize = 6;
/// Lo que se lee del `SKILL.md` para la lista y el detalle.
pub const MAX_SKILL_MD: u64 = 256 * 1024;
/// Lo que se muestra de un archivo de texto.
pub const MAX_TEXT_FILE: u64 = 1024 * 1024;
/// Para saber si un archivo es binario: un `\0` en los primeros 8 KB.
const SNIFF: usize = 8 * 1024;

const SCRIPT_EXTENSIONS: &[&str] = &[
    "sh", "bash", "zsh", "fish", "py", "js", "mjs", "cjs", "ts", "rb", "pl", "php", "ps1", "psm1", "bat", "cmd", "exe",
    "applescript", "scpt", "command",
];

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    Text,
    Binary,
    Symlink,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    /// Relativa a la skill, con `/`.
    pub rel: String,
    pub size: u64,
    pub kind: FileKind,
    pub executable: bool,
    pub script: bool,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileFlags {
    pub scripts: bool,
    pub binaries: bool,
    pub symlinks: bool,
    pub executables: bool,
    /// El recorrido se cortó en `MAX_WALK_FILES` o `MAX_WALK_DEPTH`.
    pub truncated: bool,
}

#[derive(Debug, Default)]
pub struct Walk {
    pub files: Vec<FileInfo>,
    pub flags: FileFlags,
    pub size: u64,
    pub modified_ms: u64,
}

fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(unix)]
fn is_executable(meta: &fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    meta.permissions().mode() & 0o111 != 0
}
#[cfg(not(unix))]
fn is_executable(_meta: &fs::Metadata) -> bool {
    false
}

fn looks_binary(path: &Path) -> bool {
    let Ok(mut f) = fs::File::open(path) else { return false };
    let mut buf = vec![0u8; SNIFF];
    let n = f.read(&mut buf).unwrap_or(0);
    buf[..n].contains(&0)
}

fn is_script_path(rel: &str) -> bool {
    if rel.starts_with("scripts/") {
        return true;
    }
    Path::new(rel)
        .extension()
        .map(|e| SCRIPT_EXTENSIONS.contains(&e.to_string_lossy().to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Carpetas que no se recorren: no son parte de lo que lee el agente y
/// pueden ser enormes.
fn skip_dir(name: &str) -> bool {
    name == ".git" || name == "node_modules"
}

/// Recorre la carpeta real de una skill, sin seguir enlaces.
pub fn walk(dir: &Path) -> Walk {
    let mut out = Walk::default();
    if let Ok(meta) = fs::metadata(dir) {
        out.modified_ms = modified_ms(&meta);
    }
    let mut stack: Vec<(std::path::PathBuf, String, usize)> = vec![(dir.to_path_buf(), String::new(), 0)];
    while let Some((path, prefix, depth)) = stack.pop() {
        let Ok(entries) = fs::read_dir(&path) else { continue };
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            if out.files.len() >= MAX_WALK_FILES {
                out.flags.truncated = true;
                return finish(out);
            }
            let name = entry.file_name().to_string_lossy().to_string();
            let rel = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
            let Ok(meta) = fs::symlink_metadata(entry.path()) else { continue };
            out.modified_ms = out.modified_ms.max(modified_ms(&meta));
            if meta.file_type().is_symlink() {
                out.flags.symlinks = true;
                out.files.push(FileInfo { rel, size: 0, kind: FileKind::Symlink, executable: false, script: false });
            } else if meta.is_dir() {
                if skip_dir(&name) {
                    continue;
                }
                if depth + 1 >= MAX_WALK_DEPTH {
                    out.flags.truncated = true;
                    continue;
                }
                stack.push((entry.path(), rel, depth + 1));
            } else if meta.is_file() {
                let binary = looks_binary(&entry.path());
                let executable = is_executable(&meta);
                let script = is_script_path(&rel);
                out.flags.binaries |= binary;
                out.flags.executables |= executable;
                out.flags.scripts |= script || executable;
                out.size += meta.len();
                out.files.push(FileInfo {
                    rel,
                    size: meta.len(),
                    kind: if binary { FileKind::Binary } else { FileKind::Text },
                    executable,
                    script,
                });
            }
        }
    }
    finish(out)
}

fn finish(mut w: Walk) -> Walk {
    w.files.sort_by(|a, b| a.rel.cmp(&b.rel));
    w
}

/// El `SKILL.md` de una carpeta, sin distinguir mayúsculas en el nombre.
pub fn find_skill_md(dir: &Path) -> Option<std::path::PathBuf> {
    let exact = dir.join("SKILL.md");
    if fs::symlink_metadata(&exact).map(|m| m.is_file()).unwrap_or(false) {
        return Some(exact);
    }
    fs::read_dir(dir).ok()?.flatten().find_map(|e| {
        let is_file = fs::symlink_metadata(e.path()).map(|m| m.is_file()).unwrap_or(false);
        (is_file && e.file_name().to_string_lossy().eq_ignore_ascii_case("SKILL.md")).then(|| e.path())
    })
}

/// Lee un archivo de texto con tope. Falla si es binario o no es UTF-8.
pub fn read_text(path: &Path, max: u64) -> Result<String, &'static str> {
    let meta = fs::metadata(path).map_err(|_| ERR_NOT_FOUND)?;
    if meta.len() > max {
        return Err(ERR_TOO_LARGE);
    }
    let bytes = fs::read(path).map_err(|_| ERR_NOT_FOUND)?;
    if bytes.contains(&0) {
        return Err(ERR_BINARY);
    }
    String::from_utf8(bytes).map_err(|_| ERR_BINARY)
}

/// Lee hasta `max` bytes de un texto (para el `SKILL.md` en la lista): si
/// es más largo, se corta en un límite de carácter.
pub fn read_text_prefix(path: &Path, max: u64) -> Option<String> {
    let f = fs::File::open(path).ok()?;
    let mut buf = Vec::new();
    f.take(max).read_to_end(&mut buf).ok()?;
    if buf.contains(&0) {
        return None;
    }
    Some(match String::from_utf8(buf) {
        Ok(s) => s,
        Err(e) => {
            let valid = e.utf8_error().valid_up_to();
            let mut bytes = e.into_bytes();
            bytes.truncate(valid);
            String::from_utf8(bytes).unwrap_or_default()
        }
    })
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Huella del contenido de una skill: el sha256 de la lista ordenada de
/// `ruta relativa` + sha256 de cada archivo, y de los enlaces su destino.
/// No depende de fechas ni permisos, así que es la misma en cualquier
/// equipo para el mismo contenido.
pub fn content_hash(dir: &Path) -> Result<String, &'static str> {
    let w = walk(dir);
    if w.flags.truncated {
        return Err(ERR_TOO_LARGE);
    }
    let mut h = Sha256::new();
    for f in &w.files {
        let path = dir.join(&f.rel);
        h.update(f.rel.as_bytes());
        h.update([0]);
        match f.kind {
            FileKind::Symlink => {
                let target = fs::read_link(&path).map(|t| t.to_string_lossy().to_string()).unwrap_or_default();
                h.update(b"link:");
                h.update(target.as_bytes());
            }
            _ => {
                let bytes = fs::read(&path).map_err(|_| ERR_NOT_FOUND)?;
                h.update(sha256_hex(&bytes).as_bytes());
            }
        }
        h.update([0]);
    }
    Ok(h.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extensions::agent_skills::roots::tests::{skill, Tmp};

    #[test]
    fn recorre_y_marca_scripts_y_binarios() {
        let t = Tmp::new("walk");
        let d = t.0.join("s");
        skill(&d, "---\nname: s\n---\n");
        fs::create_dir_all(d.join("scripts")).unwrap();
        fs::write(d.join("scripts/run.txt"), "x").unwrap();
        fs::write(d.join("logo.png"), [0x89, 0, 1, 2]).unwrap();
        fs::create_dir_all(d.join(".git/objects")).unwrap();
        fs::write(d.join(".git/objects/x"), "y").unwrap();
        let w = walk(&d);
        let rels: Vec<_> = w.files.iter().map(|f| f.rel.as_str()).collect();
        assert_eq!(rels, vec!["SKILL.md", "logo.png", "scripts/run.txt"]);
        assert!(w.flags.scripts && w.flags.binaries && !w.flags.symlinks);
        assert_eq!(w.files[1].kind, FileKind::Binary);
    }

    #[test]
    fn huella_estable_y_sensible_al_contenido() {
        let t = Tmp::new("hash");
        let a = t.0.join("a");
        let b = t.0.join("b");
        for d in [&a, &b] {
            skill(d, "hola");
            fs::create_dir_all(d.join("ref")).unwrap();
            fs::write(d.join("ref/x.md"), "x").unwrap();
        }
        assert_eq!(content_hash(&a).unwrap(), content_hash(&b).unwrap());
        fs::write(b.join("ref/x.md"), "y").unwrap();
        assert_ne!(content_hash(&a).unwrap(), content_hash(&b).unwrap());
    }

    #[test]
    fn leer_texto_con_topes() {
        let t = Tmp::new("leer");
        fs::write(t.0.join("t.md"), "ñandú").unwrap();
        fs::write(t.0.join("b.bin"), [1, 0, 2]).unwrap();
        assert_eq!(read_text(&t.0.join("t.md"), 100).unwrap(), "ñandú");
        assert_eq!(read_text(&t.0.join("b.bin"), 100).unwrap_err(), ERR_BINARY);
        assert_eq!(read_text(&t.0.join("t.md"), 2).unwrap_err(), ERR_TOO_LARGE);
        // El prefijo no corta un carácter a la mitad.
        assert_eq!(read_text_prefix(&t.0.join("t.md"), 2).unwrap(), "ñ");
    }

    #[test]
    fn encuentra_skill_md_sin_mayusculas() {
        let t = Tmp::new("md");
        fs::create_dir_all(t.0.join("x")).unwrap();
        fs::write(t.0.join("x/skill.md"), "a").unwrap();
        assert!(find_skill_md(&t.0.join("x")).is_some());
        assert!(find_skill_md(&t.0).is_none());
    }
}
