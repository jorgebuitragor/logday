//! Preparar lo que viene de fuera e instalarlo (specs/skills-de-agentes
//! SK14–SK18).
//!
//! Nada entra directo en la carpeta de un agente: primero se copia o se
//! descomprime en `<datos>/agent-skills/staging/<id>/content`, que el
//! webview no puede tocar (FsScope la veta, SK27). La vista previa lee de
//! ahí, y al instalar se comprueba que la huella sea la que se vio (SK18).
//! Los enlaces de dentro y las carpetas `.git` se omiten, los archivos
//! quedan sin bit de ejecución, y hay topes de tamaño (SK16).

use std::fs;
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};

use super::files::{content_hash, find_skill_md, read_text, read_text_prefix, walk, FileFlags, FileInfo, MAX_SKILL_MD, MAX_TEXT_FILE};
use super::ops::{destinations, link_or_copy, move_path, name_taken, to_trash, valid_skill_name, ERR_IO, ERR_OCCUPIED};
use super::roots::{join, split_relative, Roots, SourceId, Tool, ERR_INVALID, ERR_NOT_FOUND, ERR_TOO_LARGE};

pub const ERR_ARCHIVE: &str = "bad_archive";
pub const ERR_HASH: &str = "hash_mismatch";
/// Un `.md` sin el encabezado de una skill (`name` y `description`).
pub const ERR_NOT_SKILL: &str = "not_skill";

/// Topes (SK16).
pub const MAX_FILE: u64 = 5 * 1024 * 1024;
pub const MAX_SKILL_FILES: usize = 1000;
pub const MAX_SKILL_BYTES: u64 = 20 * 1024 * 1024;
/// De todo lo preparado de una vez (un zip con muchas skills).
pub const MAX_BUNDLE_BYTES: u64 = 100 * 1024 * 1024;
pub const MAX_BUNDLE_FILES: usize = 10_000;
const MAX_DEPTH: usize = 10;
/// Lo preparado se borra a las 24 h (design "Carpeta de datos").
const STAGING_TTL: Duration = Duration::from_secs(24 * 60 * 60);

const ORIGIN_FILE: &str = "origin.json";
const CONTENT_DIR: &str = "content";

/// De dónde viene lo preparado. Lo escribe Rust al preparar; el webview
/// no puede cambiarlo, así que el diálogo nativo de instalar lo usa.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StagedOrigin {
    /// `folder`, `zip`, o el tipo del servidor del repo: `github`, `gitlab` o `gitea`.
    pub kind: String,
    /// Para mostrar: la ruta (`~/…`) o `owner/repo@sha`.
    pub label: String,
    /// Solo de un repo (fase 3).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repo: Option<serde_json::Value>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StagedSkill {
    /// Relativa a lo preparado, con `/` (vacía no: siempre hay una carpeta).
    pub rel: String,
    pub dir_name: String,
    pub skill_md: Option<String>,
    pub files: Vec<FileInfo>,
    pub file_flags: FileFlags,
    pub size_bytes: u64,
    /// `None` si supera los topes: no se puede instalar.
    pub hash: Option<String>,
    pub too_large: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StagedBundle {
    pub id: String,
    pub origin: StagedOrigin,
    pub skills: Vec<StagedSkill>,
    /// Lo que se omitió al preparar (enlaces, `.git`, archivos grandes).
    pub skipped: Vec<String>,
}

fn new_id() -> Result<String, &'static str> {
    let mut b = [0u8; 16];
    getrandom::getrandom(&mut b).map_err(|_| ERR_IO)?;
    Ok(b.iter().map(|x| format!("{x:02x}")).collect())
}

fn valid_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn bundle_dir(roots: &Roots, id: &str) -> Result<PathBuf, &'static str> {
    if !valid_id(id) {
        return Err(ERR_INVALID);
    }
    let dir = roots.staging().join(id);
    if dir.is_dir() {
        Ok(dir)
    } else {
        Err(ERR_NOT_FOUND)
    }
}

/// Lo que se va contando al preparar.
#[derive(Default)]
struct Budget {
    files: usize,
    bytes: u64,
    skipped: Vec<String>,
}

impl Budget {
    fn add(&mut self, size: u64) -> Result<(), &'static str> {
        self.files += 1;
        self.bytes += size;
        if self.files > MAX_BUNDLE_FILES || self.bytes > MAX_BUNDLE_BYTES {
            return Err(ERR_TOO_LARGE);
        }
        Ok(())
    }
}

/// Copia una carpeta elegida, con las reglas de SK16.
fn copy_limited(from: &Path, to: &Path, rel: &str, depth: usize, budget: &mut Budget) -> Result<(), &'static str> {
    fs::create_dir_all(to).map_err(|_| ERR_IO)?;
    let mut entries: Vec<_> = fs::read_dir(from).map_err(|_| ERR_IO)?.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let name = e.file_name().to_string_lossy().to_string();
        let child_rel = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
        let meta = fs::symlink_metadata(e.path()).map_err(|_| ERR_IO)?;
        if meta.file_type().is_symlink() {
            budget.skipped.push(child_rel);
        } else if meta.is_dir() {
            if name == ".git" || name == "node_modules" || depth >= MAX_DEPTH {
                budget.skipped.push(child_rel);
                continue;
            }
            copy_limited(&e.path(), &to.join(&name), &child_rel, depth + 1, budget)?;
        } else if meta.is_file() {
            if meta.len() > MAX_FILE {
                budget.skipped.push(child_rel);
                continue;
            }
            budget.add(meta.len())?;
            // Leer y escribir, no `fs::copy`: así no se copian los permisos
            // (sin bit de ejecución).
            let bytes = fs::read(e.path()).map_err(|_| ERR_IO)?;
            fs::write(to.join(&name), bytes).map_err(|_| ERR_IO)?;
        }
    }
    Ok(())
}

/// Una ruta de dentro de un zip, ya validada: relativa, sin `..`, sin
/// `\`, sin prefijos de Windows. `None` si no vale (zip-slip).
fn zip_path(raw: &str) -> Option<Vec<String>> {
    if raw.is_empty() || raw.contains('\\') || raw.contains('\0') || raw.starts_with('/') {
        return None;
    }
    let mut parts = Vec::new();
    for c in Path::new(raw).components() {
        match c {
            Component::Normal(p) => {
                let s = p.to_string_lossy().to_string();
                if s.contains(':') {
                    return None;
                }
                parts.push(s);
            }
            Component::CurDir => {}
            _ => return None,
        }
    }
    (!parts.is_empty()).then_some(parts)
}

/// Descomprime un zip con las reglas de SK16. `strip_top` quita la primera
/// carpeta (los zips de GitHub traen `owner-repo-sha/`). `map` decide si una
/// ruta (ya sin esa carpeta) se descomprime y dónde: `None` la deja fuera.
pub fn unzip_limited(
    bytes: &[u8],
    to: &Path,
    strip_top: bool,
    map: &dyn Fn(&[String]) -> Option<Vec<String>>,
    budget_skipped: &mut Vec<String>,
) -> Result<(), &'static str> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| ERR_ARCHIVE)?;
    let mut budget = Budget::default();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|_| ERR_ARCHIVE)?;
        // Un nombre que no se puede leer se trata como uno que no vale.
        let raw = file.name().map(|n| n.to_string()).unwrap_or_default();
        let Some(mut parts) = zip_path(&raw) else {
            budget.skipped.push(raw);
            continue;
        };
        if strip_top {
            if parts.len() < 2 {
                continue;
            }
            parts.remove(0);
        }
        let Some(parts) = map(&parts) else { continue };
        let rel = parts.join("/");
        if parts.len() > MAX_DEPTH + 2 || parts.iter().any(|p| p == ".git") {
            budget.skipped.push(rel);
            continue;
        }
        // Enlaces simbólicos guardados en el zip (modo unix 0o120000).
        if file.unix_mode().map(|m| m & 0o170000 == 0o120000).unwrap_or(false) {
            budget.skipped.push(rel);
            continue;
        }
        let dest = join(to, &parts);
        if file.is_dir() {
            fs::create_dir_all(&dest).map_err(|_| ERR_IO)?;
            continue;
        }
        // Se cuenta lo que de verdad sale al descomprimir, no lo que dice
        // el zip: una bomba de zip no pasa.
        let mut buf = Vec::new();
        (&mut file).take(MAX_FILE + 1).read_to_end(&mut buf).map_err(|_| ERR_ARCHIVE)?;
        if buf.len() as u64 > MAX_FILE {
            budget.skipped.push(rel);
            continue;
        }
        budget.add(buf.len() as u64)?;
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|_| ERR_IO)?;
        }
        fs::write(&dest, buf).map_err(|_| ERR_IO)?;
    }
    budget_skipped.extend(budget.skipped);
    Ok(())
}

/// Carpetas con `SKILL.md` dentro de lo preparado (una skill no se mira
/// por dentro buscando otras).
fn find_skills(content: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let mut stack = vec![(content.to_path_buf(), String::new(), 0usize)];
    while let Some((dir, rel, depth)) = stack.pop() {
        if !rel.is_empty() && find_skill_md(&dir).is_some() {
            out.push(rel);
            continue;
        }
        if rel.is_empty() && find_skill_md(&dir).is_some() {
            // Una skill en la raíz de lo preparado no tiene carpeta propia:
            // no pasa, porque al preparar siempre se crea una (la de la
            // carpeta elegida o la del zip).
            continue;
        }
        if depth >= 6 {
            continue;
        }
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name == ".git" || name == "node_modules" {
                continue;
            }
            if fs::symlink_metadata(e.path()).map(|m| m.is_dir()).unwrap_or(false) {
                let r = if rel.is_empty() { name } else { format!("{rel}/{name}") };
                stack.push((e.path(), r, depth + 1));
            }
        }
    }
    out.sort();
    out
}

fn describe(dir: &Path, rel: &str) -> StagedSkill {
    let w = walk(dir);
    let too_large = w.flags.truncated || w.files.len() > MAX_SKILL_FILES || w.size > MAX_SKILL_BYTES;
    let skill_md = find_skill_md(dir).and_then(|p| read_text_prefix(&p, MAX_SKILL_MD));
    StagedSkill {
        rel: rel.to_string(),
        dir_name: rel.rsplit('/').next().unwrap_or(rel).to_string(),
        skill_md,
        size_bytes: w.size,
        hash: if too_large { None } else { content_hash(dir).ok() },
        too_large,
        file_flags: w.flags,
        files: w.files,
    }
}

fn write_origin(dir: &Path, origin: &StagedOrigin) -> Result<(), &'static str> {
    let json = serde_json::to_string(origin).map_err(|_| ERR_IO)?;
    fs::write(dir.join(ORIGIN_FILE), json).map_err(|_| ERR_IO)
}

pub fn read_origin(roots: &Roots, id: &str) -> Result<StagedOrigin, &'static str> {
    let dir = bundle_dir(roots, id)?;
    let raw = fs::read_to_string(dir.join(ORIGIN_FILE)).map_err(|_| ERR_NOT_FOUND)?;
    serde_json::from_str(&raw).map_err(|_| ERR_NOT_FOUND)
}

fn bundle(roots: &Roots, id: String, origin: StagedOrigin, skipped: Vec<String>) -> Result<StagedBundle, &'static str> {
    let content = roots.staging().join(&id).join(CONTENT_DIR);
    let skills = find_skills(&content).into_iter().map(|rel| describe(&join(&content, &split_relative(&rel).unwrap_or_default()), &rel)).collect();
    Ok(StagedBundle { id, origin, skills, skipped })
}

/// Empieza una preparación: su carpeta y su origen.
fn begin(roots: &Roots, origin: &StagedOrigin) -> Result<(String, PathBuf), &'static str> {
    let id = new_id()?;
    let dir = roots.staging().join(&id);
    fs::create_dir_all(dir.join(CONTENT_DIR)).map_err(|_| ERR_IO)?;
    write_origin(&dir, origin)?;
    Ok((id, dir))
}

/// Si falla a medias, no queda nada preparado.
fn or_discard<T>(dir: &Path, r: Result<T, &'static str>) -> Result<T, &'static str> {
    if r.is_err() {
        let _ = fs::remove_dir_all(dir);
    }
    r
}

/// Qué es algo que se quiere importar (SK14). `.skill` es un zip con otra
/// extensión: lo que genera el empaquetador oficial de skills. Un `.md`
/// suelto es un `SKILL.md` sin más archivos. Los enlaces no cuentan: se
/// mira el propio archivo, no a dónde apunta.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ImportKind {
    Folder,
    Zip,
    Markdown,
}

pub fn import_kind(p: &Path) -> Option<ImportKind> {
    let meta = fs::symlink_metadata(p).ok()?;
    if meta.is_dir() {
        return Some(ImportKind::Folder);
    }
    if !meta.is_file() {
        return None;
    }
    match p.extension()?.to_string_lossy().to_ascii_lowercase().as_str() {
        "zip" | "skill" => Some(ImportKind::Zip),
        "md" => Some(ImportKind::Markdown),
        _ => None,
    }
}

/// El `name` de un `.md` suelto, si es una skill: empieza con un
/// frontmatter (`---` … `---`) que tiene `name` no vacío y `description`.
/// Sin eso es una nota cualquiera y no se importa (SK14).
pub fn loose_skill_name(text: &str) -> Option<String> {
    let mut lines = text.trim_start_matches('\u{feff}').lines();
    if lines.next()?.trim_end() != "---" {
        return None;
    }
    let (mut name, mut description) = (None, false);
    for line in lines {
        if line.trim_end() == "---" {
            return name.filter(|_| description);
        }
        if let Some(v) = line.strip_prefix("name:") {
            let v = v.trim().trim_matches(|c| c == '"' || c == '\'').trim();
            if !v.is_empty() {
                name = Some(v.to_string());
            }
        } else if line.starts_with("description:") {
            description = true;
        }
    }
    // Sin el `---` de cierre no hay frontmatter.
    None
}

/// Lee un `.md` suelto y devuelve el nombre de su carpeta y el texto.
fn read_loose_md(src: &Path) -> Result<(String, String), &'static str> {
    let size = fs::metadata(src).map_err(|_| ERR_NOT_FOUND)?.len();
    if size > MAX_SKILL_MD {
        return Err(ERR_TOO_LARGE);
    }
    let text = fs::read_to_string(src).map_err(|_| ERR_NOT_SKILL)?;
    let name = loose_skill_name(&text).ok_or(ERR_NOT_SKILL)?;
    Ok((safe_dir_name(&name), text))
}

/// Prepara un `SKILL.md` suelto elegido en un diálogo (SK14): queda en una
/// carpeta con el `name` de su frontmatter.
pub fn stage_markdown(roots: &Roots, src: &Path, label: String) -> Result<StagedBundle, &'static str> {
    let (name, text) = read_loose_md(src)?;
    let origin = StagedOrigin { kind: "md".into(), label, repo: None };
    let (id, dir) = begin(roots, &origin)?;
    let target = dir.join(CONTENT_DIR).join(&name);
    let r = fs::create_dir_all(&target).and_then(|_| fs::write(target.join("SKILL.md"), text)).map_err(|_| ERR_IO);
    or_discard(&dir, r)?;
    let b = bundle(roots, id, origin, Vec::new());
    or_discard(&dir, b)
}

/// Prepara una carpeta elegida en un diálogo (SK14).
pub fn stage_folder(roots: &Roots, src: &Path, label: String) -> Result<StagedBundle, &'static str> {
    let meta = fs::symlink_metadata(src).map_err(|_| ERR_NOT_FOUND)?;
    if !meta.is_dir() {
        return Err(ERR_NOT_FOUND);
    }
    let name = src.file_name().ok_or(ERR_INVALID)?.to_string_lossy().to_string();
    let origin = StagedOrigin { kind: "folder".into(), label, repo: None };
    let (id, dir) = begin(roots, &origin)?;
    let mut budget = Budget::default();
    let r = copy_limited(src, &dir.join(CONTENT_DIR).join(&name), &name, 0, &mut budget);
    or_discard(&dir, r)?;
    let b = bundle(roots, id, origin, budget.skipped);
    or_discard(&dir, b)
}

/// Prepara un zip (SK14). Si el zip trae la skill en la raíz (sin
/// carpeta), se le pone la del nombre del zip.
pub fn stage_zip(roots: &Roots, bytes: &[u8], zip_name: &str, origin: StagedOrigin) -> Result<StagedBundle, &'static str> {
    let (id, dir) = begin(roots, &origin)?;
    let mut skipped = Vec::new();
    let content = dir.join(CONTENT_DIR);
    let r = unzip_limited(bytes, &content, false, &|p| Some(p.to_vec()), &mut skipped);
    or_discard(&dir, r)?;
    if find_skill_md(&content).is_some() {
        let stem: String = Path::new(zip_name)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "skill".into())
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
            .collect();
        let tmp = dir.join("root");
        let r = fs::rename(&content, &tmp)
            .and_then(|_| fs::create_dir_all(&content))
            .and_then(|_| fs::rename(&tmp, content.join(if stem.is_empty() { "skill".into() } else { stem })));
        or_discard(&dir, r.map_err(|_| ERR_IO))?;
    }
    let b = bundle(roots, id, origin, skipped);
    or_discard(&dir, b)
}

/// Prepara un zip de GitHub (fase 3): solo lo que `map` deja, ya sin la
/// carpeta `owner-repo-sha/`.
pub fn stage_zip_mapped(roots: &Roots, bytes: &[u8], origin: StagedOrigin, map: &dyn Fn(&[String]) -> Option<Vec<String>>) -> Result<StagedBundle, &'static str> {
    let (id, dir) = begin(roots, &origin)?;
    let mut skipped = Vec::new();
    let r = unzip_limited(bytes, &dir.join(CONTENT_DIR), true, map, &mut skipped);
    or_discard(&dir, r)?;
    let b = bundle(roots, id, origin, skipped);
    or_discard(&dir, b)
}

/// Prepara varias carpetas, `.zip`/`.skill` y `.md` soltados a la vez
/// (SK14). Cada uno va en su propia carpeta dentro de lo preparado (un zip,
/// con el nombre del archivo sin extensión; un `.md`, con su `name`); los
/// nombres repetidos llevan `-2`, `-3`… Lo demás se ignora, y un `.md` que
/// no es una skill va a omitidos. `None` si no queda nada.
pub fn stage_paths(roots: &Roots, paths: &[PathBuf], label: String) -> Result<Option<StagedBundle>, &'static str> {
    let items: Vec<(&PathBuf, ImportKind)> = paths.iter().filter_map(|p| import_kind(p).map(|k| (p, k))).collect();
    if items.is_empty() {
        return Ok(None);
    }
    let kind = match items.as_slice() {
        [(_, ImportKind::Folder)] => "folder",
        [(_, ImportKind::Markdown)] => "md",
        _ => "zip",
    };
    let origin = StagedOrigin { kind: kind.into(), label, repo: None };
    let (id, dir) = begin(roots, &origin)?;
    let content = dir.join(CONTENT_DIR);
    let mut skipped = Vec::new();
    let mut used: Vec<String> = Vec::new();
    let r = (|| -> Result<(), &'static str> {
        let mut budget = Budget::default();
        for (p, kind) in &items {
            // Un `.md` que no es una skill se omite y se dice (SK14).
            let loose = if *kind == ImportKind::Markdown {
                match read_loose_md(p) {
                    Ok(v) => Some(v),
                    Err(_) => {
                        skipped.push(p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default());
                        continue;
                    }
                }
            } else {
                None
            };
            let base = match (kind, &loose) {
                (_, Some((name, _))) => Some(name.clone()),
                (ImportKind::Folder, _) => p.file_name().map(|n| n.to_string_lossy().to_string()),
                _ => p.file_stem().map(|n| n.to_string_lossy().to_string()),
            }
            .unwrap_or_else(|| "skill".into());
            let mut name = safe_dir_name(&base);
            let mut n = 2;
            while used.contains(&name) {
                name = format!("{}-{n}", safe_dir_name(&base));
                n += 1;
            }
            used.push(name.clone());
            if let Some((_, text)) = &loose {
                let target = content.join(&name);
                fs::create_dir_all(&target).and_then(|_| fs::write(target.join("SKILL.md"), text)).map_err(|_| ERR_IO)?;
            } else if *kind == ImportKind::Folder {
                copy_limited(p, &content.join(&name), &name, 0, &mut budget)?;
            } else {
                let size = fs::metadata(p).map_err(|_| ERR_NOT_FOUND)?.len();
                if size > MAX_BUNDLE_BYTES {
                    return Err(ERR_TOO_LARGE);
                }
                let bytes = fs::read(p).map_err(|_| ERR_NOT_FOUND)?;
                unzip_limited(&bytes, &content.join(&name), false, &|q| Some(q.to_vec()), &mut skipped)?;
            }
        }
        skipped.extend(budget.skipped);
        Ok(())
    })();
    or_discard(&dir, r)?;
    let b = bundle(roots, id, origin, skipped);
    or_discard(&dir, b).map(Some)
}

/// Un nombre de carpeta sin sorpresas para lo preparado.
fn safe_dir_name(raw: &str) -> String {
    let s: String = raw.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '-' }).collect();
    let s = s.trim_matches('.').to_string();
    if s.is_empty() { "skill".into() } else { s }
}

/// La carpeta de una skill preparada: `rel` validada y, con los enlaces
/// resueltos, dentro de lo preparado.
pub fn staged_skill(roots: &Roots, id: &str, rel: &str) -> Result<PathBuf, &'static str> {
    let content = bundle_dir(roots, id)?.join(CONTENT_DIR).canonicalize().map_err(|_| ERR_NOT_FOUND)?;
    let dir = join(&content, &split_relative(rel)?).canonicalize().map_err(|_| ERR_NOT_FOUND)?;
    if !dir.starts_with(&content) || dir == content || !dir.is_dir() {
        return Err(ERR_NOT_FOUND);
    }
    Ok(dir)
}

/// Un archivo de texto de una skill preparada, para la vista previa.
pub fn read_staged(roots: &Roots, id: &str, rel: &str, file: &str) -> Result<String, &'static str> {
    let dir = staged_skill(roots, id, rel)?;
    let path = join(&dir, &split_relative(file)?).canonicalize().map_err(|_| ERR_NOT_FOUND)?;
    if !path.starts_with(&dir) || !path.is_file() {
        return Err(ERR_NOT_FOUND);
    }
    read_text(&path, MAX_TEXT_FILE)
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Installed {
    pub source: SourceId,
    pub id: String,
    /// La huella de lo instalado (para el registro de repos, fase 3).
    #[serde(skip)]
    pub hash: String,
}

/// Comprueba lo que se va a instalar, sin tocar nada: la huella (SK18), el
/// nombre, los topes y si el nombre está ocupado.
pub fn check_install(roots: &Roots, id: &str, rel: &str, name: &str, tools: &[Tool], replace: bool, expected: &str) -> Result<PathBuf, &'static str> {
    if !valid_skill_name(name) {
        return Err(ERR_INVALID);
    }
    let dir = staged_skill(roots, id, rel)?;
    let w = walk(&dir);
    if w.flags.truncated || w.files.len() > MAX_SKILL_FILES || w.size > MAX_SKILL_BYTES {
        return Err(ERR_TOO_LARGE);
    }
    if content_hash(&dir)? != expected {
        return Err(ERR_HASH);
    }
    destinations(roots, name, tools)?;
    if !replace && name_taken(roots, name, tools) {
        return Err(ERR_OCCUPIED);
    }
    Ok(dir)
}

/// Instala una skill preparada (SK15–SK18). Lo que había con ese nombre en
/// las herramientas elegidas va a la papelera (los enlaces se quitan).
pub fn install(roots: &Roots, id: &str, rel: &str, name: &str, tools: &[Tool], replace: bool, expected: &str) -> Result<Installed, &'static str> {
    let dir = check_install(roots, id, rel, name, tools, replace, expected)?;
    let (primary, link) = destinations(roots, name, tools)?;
    if replace {
        let mut old = Vec::new();
        if tools.contains(&Tool::Claude) {
            old.push(roots.claude().join(name));
        }
        if tools.contains(&Tool::Codex) {
            old.push(roots.agents().join(name));
            old.push(roots.codex().join(name));
        }
        // Primero los enlaces, después las carpetas reales.
        old.sort_by_key(|p| !fs::symlink_metadata(p).map(|m| m.file_type().is_symlink()).unwrap_or(false));
        for p in old {
            match fs::symlink_metadata(&p) {
                Ok(m) if m.file_type().is_symlink() => fs::remove_file(&p).map_err(|_| ERR_IO)?,
                Ok(_) => to_trash(&p)?,
                Err(_) => {}
            }
        }
    }
    move_path(&dir, &primary)?;
    if let Some(link) = link {
        link_or_copy(&primary, &link)?;
    }
    let source = if primary.starts_with(roots.claude()) { SourceId::Claude } else { SourceId::Agents };
    Ok(Installed { source, id: name.to_string(), hash: expected.to_string() })
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Added,
    Removed,
    Changed,
    Same,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub rel: String,
    pub kind: ChangeKind,
    /// Lo instalado y lo nuevo, si es texto de hasta 512 KB y cambió.
    pub before: Option<String>,
    pub after: Option<String>,
}

const MAX_DIFF_TEXT: u64 = 512 * 1024;

/// Lo que cambia, archivo por archivo, entre una skill instalada y lo
/// preparado para actualizarla (SK22).
pub fn compare(roots: &Roots, id: &str, rel: &str, source: SourceId, skill_id: &str) -> Result<Vec<FileChange>, &'static str> {
    let new_dir = staged_skill(roots, id, rel)?;
    let old_dir = super::roots::resolve_skill(roots, source, skill_id)?.real;
    let old = walk(&old_dir);
    let new = walk(&new_dir);
    let mut rels: Vec<String> = old.files.iter().chain(new.files.iter()).map(|f| f.rel.clone()).collect();
    rels.sort();
    rels.dedup();
    let text = |dir: &Path, r: &str| -> Option<String> {
        let p = join(dir, &split_relative(r).ok()?);
        if fs::symlink_metadata(&p).ok()?.file_type().is_symlink() {
            return None;
        }
        read_text(&p, MAX_DIFF_TEXT).ok()
    };
    let bytes = |dir: &Path, r: &str| -> Option<Vec<u8>> {
        let p = join(dir, &split_relative(r).ok()?);
        if fs::symlink_metadata(&p).ok()?.file_type().is_symlink() {
            return None;
        }
        fs::read(p).ok()
    };
    let mut out = Vec::new();
    for r in rels {
        let in_old = old.files.iter().any(|f| f.rel == r);
        let in_new = new.files.iter().any(|f| f.rel == r);
        let kind = match (in_old, in_new) {
            (true, false) => ChangeKind::Removed,
            (false, true) => ChangeKind::Added,
            _ if bytes(&old_dir, &r) == bytes(&new_dir, &r) => ChangeKind::Same,
            _ => ChangeKind::Changed,
        };
        let (before, after) = if kind == ChangeKind::Same {
            (None, None)
        } else {
            (if in_old { text(&old_dir, &r) } else { None }, if in_new { text(&new_dir, &r) } else { None })
        };
        out.push(FileChange { rel: r, kind, before, after });
    }
    Ok(out)
}

/// Borra lo preparado.
pub fn discard(roots: &Roots, id: &str) -> Result<(), &'static str> {
    let dir = bundle_dir(roots, id)?;
    fs::remove_dir_all(dir).map_err(|_| ERR_IO)
}

/// Borra lo preparado hace más de 24 h (al arrancar).
pub fn cleanup(roots: &Roots) {
    let Ok(rd) = fs::read_dir(roots.staging()) else { return };
    let now = SystemTime::now();
    for e in rd.flatten() {
        let old = fs::metadata(e.path())
            .and_then(|m| m.modified())
            .map(|t| now.duration_since(t).unwrap_or_default() > STAGING_TTL)
            .unwrap_or(true);
        if old && valid_id(&e.file_name().to_string_lossy()) {
            let _ = fs::remove_dir_all(e.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extensions::agent_skills::roots::tests::{skill, Tmp};
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    const MD: &str = "---\nname: s\ndescription: d\n---\n# S\n";

    fn zip_of(entries: &[(&str, &[u8])], links: &[(&str, &str)]) -> Vec<u8> {
        let mut buf = Cursor::new(Vec::new());
        {
            let mut z = zip::ZipWriter::new(&mut buf);
            let o = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored).unix_permissions(0o755);
            for (name, data) in entries {
                z.start_file(*name, o).unwrap();
                z.write_all(data).unwrap();
            }
            for (name, target) in links {
                z.add_symlink(*name, *target, o).unwrap();
            }
            z.finish().unwrap();
        }
        buf.into_inner()
    }

    #[test]
    fn rutas_de_zip() {
        assert_eq!(zip_path("a/b.md").unwrap(), vec!["a", "b.md"]);
        assert_eq!(zip_path("./a").unwrap(), vec!["a"]);
        for bad in ["../x", "a/../../x", "/etc/passwd", "a\\b", "C:/x", ""] {
            assert!(zip_path(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn zip_con_trampas_se_limpia() {
        let t = Tmp::new("zip");
        let r = t.roots();
        let bytes = zip_of(
            &[("s/SKILL.md", MD.as_bytes()), ("s/scripts/run.sh", b"#!/bin/sh\n"), ("../fuera.txt", b"x"), ("s/.git/config", b"x")],
            &[("s/atajo", "/etc/passwd")],
        );
        let b = stage_zip(&r, &bytes, "s.zip", StagedOrigin { kind: "zip".into(), label: "s.zip".into(), repo: None }).unwrap();
        assert_eq!(b.skills.len(), 1);
        let s = &b.skills[0];
        assert_eq!(s.rel, "s");
        let rels: Vec<_> = s.files.iter().map(|f| f.rel.as_str()).collect();
        assert_eq!(rels, vec!["SKILL.md", "scripts/run.sh"]);
        assert!(s.skipped_contains(&b, "../fuera.txt") && s.skipped_contains(&b, "s/atajo"));
        assert!(!t.0.join("fuera.txt").exists());
        // Sin bit de ejecución.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let p = staged_skill(&r, &b.id, "s").unwrap().join("scripts/run.sh");
            assert_eq!(fs::metadata(p).unwrap().permissions().mode() & 0o111, 0);
        }
    }

    impl StagedSkill {
        fn skipped_contains(&self, b: &StagedBundle, rel: &str) -> bool {
            b.skipped.iter().any(|s| s == rel)
        }
    }

    #[test]
    fn zip_con_la_skill_en_la_raiz_y_archivos_grandes() {
        let t = Tmp::new("zipraiz");
        let r = t.roots();
        let big = vec![b'a'; (MAX_FILE + 1) as usize];
        let bytes = zip_of(&[("SKILL.md", MD.as_bytes()), ("grande.txt", &big)], &[]);
        let b = stage_zip(&r, &bytes, "Mi Skill.zip", StagedOrigin { kind: "zip".into(), label: "x".into(), repo: None }).unwrap();
        assert_eq!(b.skills[0].rel, "Mi-Skill");
        assert_eq!(b.skipped, vec!["grande.txt"]);
        assert!(stage_zip(&r, b"no es un zip", "x.zip", StagedOrigin { kind: "zip".into(), label: "x".into(), repo: None }).is_err());
    }

    #[test]
    fn carpeta_varias_skills_e_instalar() {
        let t = Tmp::new("instalar");
        let r = t.roots();
        let src = t.0.join("bajada/pack");
        skill(&src.join("uno"), MD);
        skill(&src.join("dos"), MD);
        #[cfg(unix)]
        std::os::unix::fs::symlink("/etc", src.join("uno/etc")).unwrap();
        let b = stage_folder(&r, &src, "~/bajada/pack".into()).unwrap();
        let rels: Vec<_> = b.skills.iter().map(|s| s.rel.as_str()).collect();
        assert_eq!(rels, vec!["pack/dos", "pack/uno"]);
        let uno = &b.skills[1];
        let hash = uno.hash.clone().unwrap();
        // Huella distinta: no instala.
        assert_eq!(install(&r, &b.id, "pack/uno", "uno", &[Tool::Claude], false, "otra").unwrap_err(), ERR_HASH);
        let done = install(&r, &b.id, "pack/uno", "uno", &[Tool::Claude, Tool::Codex], false, &hash).unwrap();
        assert_eq!((done.source, done.id.as_str()), (SourceId::Claude, "uno"));
        assert!(r.claude().join("uno/SKILL.md").is_file());
        assert!(r.agents().join("uno/SKILL.md").is_file());
        // Ocupado sin reemplazar.
        let b2 = stage_folder(&r, &src, "x".into()).unwrap();
        let h2 = b2.skills[1].hash.clone().unwrap();
        assert_eq!(install(&r, &b2.id, "pack/uno", "uno", &[Tool::Claude], false, &h2).unwrap_err(), ERR_OCCUPIED);
        discard(&r, &b2.id).unwrap();
        assert!(read_origin(&r, &b2.id).is_err());
        // Ids raros.
        assert_eq!(discard(&r, "../../x").unwrap_err(), ERR_INVALID);
        assert_eq!(read_staged(&r, &b.id, "../x", "SKILL.md").unwrap_err(), ERR_INVALID);
    }

    #[test]
    fn compara_lo_instalado_con_lo_nuevo() {
        let t = Tmp::new("comparar");
        let r = t.roots();
        skill(&r.claude().join("s"), MD);
        fs::write(r.claude().join("s/viejo.md"), "x").unwrap();
        let src = t.0.join("nueva/s");
        skill(&src, "---\nname: s\ndescription: d2\n---\n");
        fs::write(src.join("nuevo.md"), "y").unwrap();
        let b = stage_folder(&r, &src, "x".into()).unwrap();
        let ch = compare(&r, &b.id, "s", SourceId::Claude, "s").unwrap();
        let kinds: Vec<_> = ch.iter().map(|c| (c.rel.as_str(), c.kind)).collect();
        assert_eq!(kinds, vec![("SKILL.md", ChangeKind::Changed), ("nuevo.md", ChangeKind::Added), ("viejo.md", ChangeKind::Removed)]);
        assert_eq!(ch[0].before.as_deref(), Some(MD));
    }

    #[test]
    fn soltar_varias_carpetas_y_zips() {
        let t = Tmp::new("soltar");
        let r = t.roots();
        let a = t.0.join("compartida/revisar");
        skill(&a, MD);
        let zip = t.0.join("bajada/revisar.zip");
        fs::create_dir_all(zip.parent().unwrap()).unwrap();
        fs::write(&zip, zip_of(&[("SKILL.md", MD.as_bytes())], &[])).unwrap();
        let otro = t.0.join("nota.txt");
        fs::write(&otro, "x").unwrap();
        let b = stage_paths(&r, &[a, zip, otro], "x".into()).unwrap().unwrap();
        let rels: Vec<_> = b.skills.iter().map(|s| s.rel.as_str()).collect();
        assert_eq!(rels, vec!["revisar", "revisar-2"]);
        assert!(stage_paths(&r, &[t.0.join("nota.txt")], "x".into()).unwrap().is_none());
    }

    #[test]
    fn formatos_que_se_pueden_importar() {
        let t = Tmp::new("formatos");
        let dir = t.0.join("carpeta");
        fs::create_dir_all(&dir).unwrap();
        for (name, kind) in [("a.zip", Some(ImportKind::Zip)), ("b.SKILL", Some(ImportKind::Zip)), ("c.md", Some(ImportKind::Markdown)), ("d.txt", None)] {
            fs::write(t.0.join(name), "x").unwrap();
            assert_eq!(import_kind(&t.0.join(name)), kind, "{name}");
        }
        assert_eq!(import_kind(&dir), Some(ImportKind::Folder));
        #[cfg(unix)]
        {
            // Un enlace a un .md no cuenta: se mira el propio archivo.
            std::os::unix::fs::symlink(t.0.join("c.md"), t.0.join("enlace.md")).unwrap();
            assert_eq!(import_kind(&t.0.join("enlace.md")), None);
        }
    }

    #[test]
    fn md_suelto_solo_si_tiene_name_y_description() {
        assert_eq!(loose_skill_name(MD), Some("s".into()));
        assert_eq!(loose_skill_name("\u{feff}---\nname: \"Mi Skill\"\ndescription: >\n  larga\n---\n"), Some("Mi Skill".into()));
        assert_eq!(loose_skill_name("# Una nota\n\nTexto"), None);
        assert_eq!(loose_skill_name("---\nname: s\n---\n"), None);
        assert_eq!(loose_skill_name("---\ndescription: d\n---\n"), None);
        assert_eq!(loose_skill_name("---\nname: s\ndescription: d\n"), None);
    }

    #[test]
    fn preparar_un_md_suelto() {
        let t = Tmp::new("md-suelto");
        let r = t.roots();
        let md = t.0.join("bajadas/SKILL.md");
        fs::create_dir_all(md.parent().unwrap()).unwrap();
        fs::write(&md, "---\nname: revisar-pr\ndescription: d\n---\n# R\n").unwrap();
        let b = stage_markdown(&r, &md, "x".into()).unwrap();
        assert_eq!(b.origin.kind, "md");
        assert_eq!(b.skills.len(), 1);
        assert_eq!(b.skills[0].rel, "revisar-pr");
        assert_eq!(b.skills[0].files.iter().map(|f| f.rel.as_str()).collect::<Vec<_>>(), vec!["SKILL.md"]);
        let nota = t.0.join("nota.md");
        fs::write(&nota, "# Una nota\n").unwrap();
        assert_eq!(stage_markdown(&r, &nota, "x".into()).unwrap_err(), ERR_NOT_SKILL);
    }

    #[test]
    fn soltar_md_y_skill() {
        let t = Tmp::new("soltar-md");
        let r = t.roots();
        let md = t.0.join("una.md");
        fs::write(&md, MD).unwrap();
        let nota = t.0.join("nota.md");
        fs::write(&nota, "# Una nota\n").unwrap();
        let pack = t.0.join("otra.skill");
        fs::write(&pack, zip_of(&[("SKILL.md", MD.as_bytes())], &[])).unwrap();
        let b = stage_paths(&r, &[md, nota, pack], "x".into()).unwrap().unwrap();
        let rels: Vec<_> = b.skills.iter().map(|s| s.rel.as_str()).collect();
        assert_eq!(rels, vec!["otra", "s"]);
        assert_eq!(b.skipped, vec!["nota.md".to_string()]);
    }
}
