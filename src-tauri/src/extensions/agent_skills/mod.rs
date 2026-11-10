//! Extensión "Skills de agentes" (`agent-skills`,
//! specs/skills-de-agentes): ver y gestionar las skills de Claude Code y
//! Codex.
//!
//! Todo el acceso a disco pasa por estos comandos, no por los genéricos de
//! archivos: las carpetas de los agentes no son raíces de `FsScope`, y
//! además están vetadas allí (SK27). Escribir en ellas es darle órdenes a
//! un agente que ejecuta comandos, así que cada comando hace una sola cosa
//! sobre una skill nombrada por `(fuente, id)` y nunca recibe una ruta
//! absoluta del webview (SK26).

pub mod files;
pub mod roots;
pub mod scan;

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

use crate::fs_scope::{FsScope, AGENT_SKILLS_DIR};
use files::{find_skill_md, read_text, read_text_prefix, walk, FileFlags, FileInfo, MAX_SKILL_MD, MAX_TEXT_FILE};
use roots::{display_path, home, join, resolve_file, resolve_skill, split_relative, Roots, SourceId, ERR_INVALID, ERR_NOT_FOUND};
use scan::SkillEntry;

pub const EXTENSION_ID: &str = "agent-skills";

/// Las carpetas de esta instalación.
pub fn roots(app: &AppHandle) -> Result<Roots, String> {
    let app_dir = app.path().app_data_dir().map_err(|_| ERR_NOT_FOUND.to_string())?;
    Ok(Roots::new(home(), app_dir.join(AGENT_SKILLS_DIR)))
}

/// Al arrancar: veta en `FsScope` las carpetas de los agentes, también la
/// carpeta personal de pruebas si se usa (SK27).
pub fn protect(app: &AppHandle, scope: &FsScope) {
    if let Ok(r) = roots(app) {
        for dir in r.agent_dirs() {
            scope.deny(&dir);
        }
    }
    if let Some(real) = dirs_next::home_dir() {
        for name in [".claude", ".codex", ".agents"] {
            scope.deny(&real.join(name));
        }
    }
}

fn source(key: &str) -> Result<SourceId, String> {
    SourceId::from_key(key).ok_or_else(|| ERR_INVALID.to_string())
}

/// El trabajo de disco va fuera del hilo principal.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, &'static str> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|_| ERR_NOT_FOUND.to_string())?
        .map_err(str::to_string)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderInfo {
    pub source: SourceId,
    pub path: String,
    pub exists: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListResult {
    pub skills: Vec<SkillEntry>,
    /// Las carpetas que se revisan (Opciones, design "Opciones").
    pub folders: Vec<FolderInfo>,
}

fn folders(r: &Roots) -> Vec<FolderInfo> {
    SourceId::ALL
        .into_iter()
        .filter(|s| *s != SourceId::Disabled)
        .filter_map(|s| {
            let base = r.base(s)?;
            Some(FolderInfo { source: s, path: display_path(r, &base), exists: base.is_dir() })
        })
        .collect()
}

/// Todas las skills (SK1, SK5).
#[tauri::command]
pub async fn agent_skills_list(app: AppHandle) -> Result<ListResult, String> {
    let r = roots(&app)?;
    blocking(move || Ok(ListResult { skills: scan::list(&r), folders: folders(&r) })).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detail {
    pub files: Vec<FileInfo>,
    pub file_flags: FileFlags,
    pub skill_md: Option<String>,
    pub skill_md_truncated: bool,
}

/// Árbol y `SKILL.md` de una skill (SK6). De un enlace externo, nada.
#[tauri::command]
pub async fn agent_skills_detail(app: AppHandle, source: String, id: String) -> Result<Detail, String> {
    let r = roots(&app)?;
    let src = self::source(&source)?;
    blocking(move || {
        let skill = resolve_skill(&r, src, &id)?;
        let w = walk(&skill.real);
        let md = find_skill_md(&skill.real);
        let md_len = md.as_ref().and_then(|p| std::fs::metadata(p).ok()).map(|m| m.len()).unwrap_or(0);
        Ok(Detail {
            files: w.files,
            file_flags: w.flags,
            skill_md: md.and_then(|p| read_text_prefix(&p, MAX_SKILL_MD)),
            skill_md_truncated: md_len > MAX_SKILL_MD,
        })
    })
    .await
}

/// Un archivo de texto de una skill, para verlo como texto plano (SK6).
#[tauri::command]
pub async fn agent_skills_read_file(app: AppHandle, source: String, id: String, rel: String) -> Result<String, String> {
    let r = roots(&app)?;
    let src = self::source(&source)?;
    blocking(move || {
        let skill = resolve_skill(&r, src, &id)?;
        let file = resolve_file(&skill, &rel)?;
        read_text(&file, MAX_TEXT_FILE)
    })
    .await
}

/// Muestra la carpeta de una ubicación en el Finder o el Explorador, sin
/// abrir nada (SK8). Sirve también para un enlace externo o roto: se
/// muestra el enlace, no su destino.
#[tauri::command]
pub async fn agent_skills_reveal(app: AppHandle, source: String, id: String) -> Result<(), String> {
    let r = roots(&app)?;
    let src = self::source(&source)?;
    let base = r.base(src).ok_or_else(|| ERR_NOT_FOUND.to_string())?;
    let path = join(&base, &split_relative(&id).map_err(str::to_string)?);
    if std::fs::symlink_metadata(&path).is_err() {
        return Err(ERR_NOT_FOUND.to_string());
    }
    app.opener().reveal_item_in_dir(&path).map_err(|_| ERR_NOT_FOUND.to_string())
}

/// Muestra una de las carpetas que se revisan (Opciones).
#[tauri::command]
pub async fn agent_skills_reveal_folder(app: AppHandle, source: String) -> Result<(), String> {
    let r = roots(&app)?;
    let base = r.base(self::source(&source)?).ok_or_else(|| ERR_NOT_FOUND.to_string())?;
    if !base.is_dir() {
        return Err(ERR_NOT_FOUND.to_string());
    }
    app.opener().reveal_item_in_dir(&base).map_err(|_| ERR_NOT_FOUND.to_string())
}
