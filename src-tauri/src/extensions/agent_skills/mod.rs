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
pub mod ops;
pub mod roots;
pub mod scan;
pub mod staging;

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

use crate::fs_scope::{FsScope, AGENT_SKILLS_DIR};
use files::{find_skill_md, read_text, read_text_prefix, sha256_hex, walk, FileFlags, FileInfo, MAX_SKILL_MD, MAX_TEXT_FILE};
use ops::TrashScope;
use roots::{display_path, home, join, resolve_file, resolve_skill, split_relative, Roots, SourceId, Tool, ERR_INVALID, ERR_NOT_FOUND};
use scan::SkillEntry;
use staging::{Installed, StagedBundle, StagedOrigin};

#[allow(dead_code)] // La usa el token de GitHub (fase 3).
pub const EXTENSION_ID: &str = "agent-skills";

/// Las carpetas de esta instalación.
pub fn roots(app: &AppHandle) -> Result<Roots, String> {
    let app_dir = app.path().app_data_dir().map_err(|_| ERR_NOT_FOUND.to_string())?;
    Ok(Roots::new(home(), app_dir.join(AGENT_SKILLS_DIR)))
}

/// Al arrancar: veta en `FsScope` las carpetas de los agentes, también la
/// carpeta personal de pruebas si se usa (SK27), y borra lo preparado hace
/// más de 24 h.
pub fn protect(app: &AppHandle, scope: &FsScope) {
    if let Ok(r) = roots(app) {
        for dir in r.agent_dirs() {
            scope.deny(&dir);
        }
        std::thread::spawn(move || staging::cleanup(&r));
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
    /// sha256 del SKILL.md en disco: al guardar se manda de vuelta para
    /// saber si cambió por fuera mientras se editaba (SK10).
    pub skill_md_hash: Option<String>,
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
        let hash = md.as_ref().and_then(|p| std::fs::read(p).ok()).map(|b| sha256_hex(&b));
        Ok(Detail {
            files: w.files,
            file_flags: w.flags,
            skill_md: md.and_then(|p| read_text_prefix(&p, MAX_SKILL_MD)),
            skill_md_truncated: md_len > MAX_SKILL_MD,
            skill_md_hash: hash,
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

// ─── Fase 2: cambiar (specs/skills-de-agentes SK9–SK18, SK29) ───

/// Lo que se recuerda mientras la app está abierta: las skills cuyo
/// guardado ya se confirmó (SK29: una vez por skill y por sesión).
#[derive(Default)]
pub struct AgentSkillsState {
    save_grants: Mutex<HashSet<PathBuf>>,
}

/// El usuario dijo que no en el diálogo nativo. La vista no lo muestra
/// como error.
pub const ERR_CANCELLED: &str = "cancelled";

/// Textos del diálogo nativo. Los pone Rust y no el webview: si los
/// mandara el webview, un script podría pedir "Aceptar" para otra cosa.
fn text(lang: &str, key: &str) -> &'static str {
    let en = lang == "en";
    match key {
        "ok.install" => if en { "Install" } else { "Instalar" },
        "ok.save" => if en { "Save" } else { "Guardar" },
        "ok.create" => if en { "Create" } else { "Crear" },
        "ok.add" => if en { "Add" } else { "Añadir" },
        "ok.enable" => if en { "Enable" } else { "Activar" },
        "cancel" => if en { "Cancel" } else { "Cancelar" },
        "title" => if en { "Logday · Agent skills" } else { "Logday · Skills de agentes" },
        "warning" => if en {
            "Skills tell the agent what to do and can run commands with your permissions. Only continue if you trust its contents."
        } else {
            "Las skills le dicen al agente qué hacer y pueden ejecutar comandos con tus permisos. Continúa solo si confías en su contenido."
        },
        _ => "",
    }
}

fn tools_label(lang: &str, tools: &[Tool]) -> String {
    let names: Vec<&str> = tools.iter().map(|t| match t { Tool::Claude => "Claude Code", Tool::Codex => "Codex" }).collect();
    names.join(if lang == "en" { " and " } else { " y " })
}

/// Pide confirmación en un diálogo nativo, que un script del webview no
/// puede contestar (SK29). Devuelve `cancelled` si dice que no.
async fn confirm(window: &tauri::Window, lang: &str, message: String, ok: &str) -> Result<(), String> {
    let w = window.clone();
    let ok_label = text(lang, ok).to_string();
    let cancel = text(lang, "cancel").to_string();
    let title = text(lang, "title").to_string();
    let body = format!("{message}\n\n{}", text(lang, "warning"));
    let yes = tauri::async_runtime::spawn_blocking(move || {
        w.dialog()
            .message(body)
            .title(title)
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom(ok_label, cancel))
            .parent(&w)
            .blocking_show()
    })
    .await
    .map_err(|_| ERR_CANCELLED.to_string())?;
    if yes {
        Ok(())
    } else {
        Err(ERR_CANCELLED.to_string())
    }
}

fn tools_from(list: &[String]) -> Result<Vec<Tool>, String> {
    let mut out = Vec::new();
    for t in list {
        let tool = match t.as_str() {
            "claude" => Tool::Claude,
            "codex" => Tool::Codex,
            _ => return Err(ERR_INVALID.to_string()),
        };
        if !out.contains(&tool) {
            out.push(tool);
        }
    }
    if out.is_empty() {
        return Err(ERR_INVALID.to_string());
    }
    out.sort();
    Ok(out)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRef {
    pub source: SourceId,
    pub id: String,
}

/// Crea una skill desde la plantilla (SK9), con confirmación nativa.
#[tauri::command]
pub async fn agent_skills_create(app: AppHandle, window: tauri::Window, lang: String, name: String, content: String, tools: Vec<String>) -> Result<SkillRef, String> {
    let r = roots(&app)?;
    let tools = tools_from(&tools)?;
    if !ops::valid_skill_name(&name) {
        return Err(ERR_INVALID.to_string());
    }
    let (primary, _) = ops::destinations(&r, &name, &tools).map_err(str::to_string)?;
    if ops::name_taken(&r, &name, &tools) {
        return Err(ops::ERR_OCCUPIED.to_string());
    }
    let msg = if lang == "en" {
        format!("Create the skill “{name}” for {} in {}?", tools_label(&lang, &tools), display_path(&r, &primary))
    } else {
        format!("¿Crear la skill «{name}» para {} en {}?", tools_label(&lang, &tools), display_path(&r, &primary))
    };
    confirm(&window, &lang, msg, "ok.create").await?;
    blocking(move || ops::create(&r, &name, &content, &tools).map(|(source, id)| SkillRef { source, id })).await
}

/// Guarda el SKILL.md (SK10). La primera vez por skill y sesión, con
/// confirmación nativa.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn agent_skills_save(
    app: AppHandle,
    window: tauri::Window,
    state: State<'_, AgentSkillsState>,
    lang: String,
    source: String,
    id: String,
    content: String,
    expected_hash: Option<String>,
    force: bool,
) -> Result<(), String> {
    let r = roots(&app)?;
    let src = self::source(&source)?;
    let loc = ops::own_location(&r, src, &id).map_err(str::to_string)?;
    let real = loc.canonicalize().map_err(|_| ERR_NOT_FOUND.to_string())?;
    // Antes de preguntar, lo que se puede comprobar sin escribir.
    if !force {
        if let Some(exp) = expected_hash.as_deref() {
            if ops::skill_md_hash(&real).as_deref() != Some(exp) {
                return Err(ops::ERR_CHANGED.to_string());
            }
        }
    }
    let granted = state.save_grants.lock().unwrap_or_else(|e| e.into_inner()).contains(&real);
    if !granted {
        let name = real.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let msg = if lang == "en" {
            format!("Save the changes to the SKILL.md of “{name}” ({})?", display_path(&r, &loc))
        } else {
            format!("¿Guardar los cambios en el SKILL.md de «{name}» ({})?", display_path(&r, &loc))
        };
        confirm(&window, &lang, msg, "ok.save").await?;
    }
    let saved = blocking(move || ops::save(&r, src, &id, &content, expected_hash.as_deref(), force)).await?;
    state.save_grants.lock().unwrap_or_else(|e| e.into_inner()).insert(saved);
    Ok(())
}

/// Manda una skill a la papelera o quita un enlace (SK11). La
/// confirmación es la de la vista: no agrega nada que el agente ejecute.
#[tauri::command]
pub async fn agent_skills_trash(app: AppHandle, source: String, id: String, scope: TrashScope) -> Result<(), String> {
    let r = roots(&app)?;
    let src = self::source(&source)?;
    blocking(move || ops::trash_skill(&r, src, &id, scope)).await
}

/// Desactiva o activa (SK12). Activar vuelve a poner contenido donde el
/// agente lo lee: pide confirmación nativa.
#[tauri::command]
pub async fn agent_skills_set_enabled(app: AppHandle, window: tauri::Window, lang: String, source: String, id: String, enabled: bool) -> Result<(), String> {
    let r = roots(&app)?;
    let src = self::source(&source)?;
    if !enabled {
        return blocking(move || ops::disable(&r, src, &id)).await;
    }
    if src != SourceId::Disabled {
        return Err(ERR_INVALID.to_string());
    }
    let name = id.rsplit('/').next().unwrap_or(&id).to_string();
    let msg = if lang == "en" { format!("Enable the skill “{name}” again?") } else { format!("¿Volver a activar la skill «{name}»?") };
    confirm(&window, &lang, msg, "ok.enable").await?;
    blocking(move || ops::enable(&r, &id)).await
}

/// Añade una skill propia a la otra herramienta (SK13), con confirmación.
#[tauri::command]
pub async fn agent_skills_share(app: AppHandle, window: tauri::Window, lang: String, source: String, id: String, to: String) -> Result<(), String> {
    let r = roots(&app)?;
    let src = self::source(&source)?;
    let tool = tools_from(&[to])?[0];
    let name = id.rsplit('/').next().unwrap_or(&id).to_string();
    let msg = if lang == "en" {
        format!("Add the skill “{name}” to {}?", tools_label(&lang, &[tool]))
    } else {
        format!("¿Añadir la skill «{name}» a {}?", tools_label(&lang, &[tool]))
    };
    confirm(&window, &lang, msg, "ok.add").await?;
    blocking(move || ops::share(&r, src, &id, tool).map(|_| ())).await
}

/// Elige una carpeta o un `.zip` en un diálogo nativo y lo prepara para la
/// vista previa (SK14, SK15). `None` si se cancela el diálogo.
#[tauri::command]
pub async fn agent_skills_import_pick(app: AppHandle, window: tauri::Window, kind: String) -> Result<Option<StagedBundle>, String> {
    let r = roots(&app)?;
    let zip = match kind.as_str() {
        "zip" => true,
        "folder" => false,
        _ => return Err(ERR_INVALID.to_string()),
    };
    let w = window.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let d = w.dialog().file().set_parent(&w);
        if zip {
            d.add_filter("zip", &["zip"]).blocking_pick_file()
        } else {
            d.blocking_pick_folder()
        }
    })
    .await
    .map_err(|_| ERR_INVALID.to_string())?;
    let Some(fp) = picked else { return Ok(None) };
    let path = fp.into_path().map_err(|_| ERR_INVALID.to_string())?;
    blocking(move || {
        let label = display_path(&r, &path);
        if zip {
            let meta = std::fs::metadata(&path).map_err(|_| ERR_NOT_FOUND)?;
            if meta.len() > staging::MAX_BUNDLE_BYTES {
                return Err(roots::ERR_TOO_LARGE);
            }
            let bytes = std::fs::read(&path).map_err(|_| ERR_NOT_FOUND)?;
            let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            staging::stage_zip(&r, &bytes, &name, StagedOrigin { kind: "zip".into(), label, repo: None }).map(Some)
        } else {
            staging::stage_folder(&r, &path, label).map(Some)
        }
    })
    .await
}

/// Un archivo de texto de una skill preparada (vista previa).
#[tauri::command]
pub async fn agent_skills_staged_read(app: AppHandle, id: String, rel: String, file: String) -> Result<String, String> {
    let r = roots(&app)?;
    blocking(move || staging::read_staged(&r, &id, &rel, &file)).await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallItem {
    pub rel: String,
    pub name: String,
    pub tools: Vec<String>,
    pub replace: bool,
    pub expected_hash: String,
}

/// Instala skills preparadas (SK15–SK18). Antes de tocar nada comprueba
/// todas (huella, nombre, ocupado) y pide **una** confirmación nativa con
/// sus nombres y de dónde vienen.
#[tauri::command]
pub async fn agent_skills_install(app: AppHandle, window: tauri::Window, lang: String, id: String, items: Vec<InstallItem>) -> Result<Vec<Installed>, String> {
    let r = roots(&app)?;
    if items.is_empty() || items.len() > 200 {
        return Err(ERR_INVALID.to_string());
    }
    let mut plan: Vec<(String, String, Vec<Tool>, bool, String)> = Vec::new();
    for it in items {
        let tools = tools_from(&it.tools)?;
        // Dos con el mismo nombre en el mismo lote se pisarían.
        if plan.iter().any(|p| p.1 == it.name) {
            return Err(ops::ERR_OCCUPIED.to_string());
        }
        plan.push((it.rel, it.name, tools, it.replace, it.expected_hash));
    }
    {
        let (r, id, plan) = (r.clone(), id.clone(), plan.clone());
        blocking(move || {
            for (rel, name, tools, replace, exp) in &plan {
                staging::check_install(&r, &id, rel, name, tools, *replace, exp)?;
            }
            Ok(())
        })
        .await?;
    }
    let origin = staging::read_origin(&r, &id).map_err(str::to_string)?;
    let en = lang == "en";
    let mut lines = Vec::new();
    for (_, name, tools, replace, _) in &plan {
        let (primary, _) = ops::destinations(&r, name, tools).map_err(str::to_string)?;
        let mut line = format!("• «{name}» → {} ({})", tools_label(&lang, tools), display_path(&r, &primary));
        if *replace {
            line.push_str(if en { ", replacing the current one" } else { ", reemplaza la que hay" });
        }
        lines.push(line);
    }
    let head = match (en, plan.len()) {
        (true, 1) => "Install this skill?".to_string(),
        (true, n) => format!("Install these {n} skills?"),
        (false, 1) => "¿Instalar esta skill?".to_string(),
        (false, n) => format!("¿Instalar estas {n} skills?"),
    };
    let from = if en { "From" } else { "Desde" };
    let replaced = if en { "Replaced skills go to the trash." } else { "Las que se reemplazan van a la papelera." };
    let mut msg = format!("{head}\n{}\n{from}: {}", lines.join("\n"), origin.label);
    if plan.iter().any(|p| p.3) {
        msg.push_str(&format!("\n{replaced}"));
    }
    confirm(&window, &lang, msg, "ok.install").await?;
    blocking(move || {
        let mut done = Vec::new();
        for (rel, name, tools, replace, exp) in &plan {
            done.push(staging::install(&r, &id, rel, name, tools, *replace, exp)?);
        }
        Ok(done)
    })
    .await
}

/// Borra lo preparado (al cerrar la vista previa sin instalar).
#[tauri::command]
pub async fn agent_skills_discard(app: AppHandle, id: String) -> Result<(), String> {
    let r = roots(&app)?;
    blocking(move || staging::discard(&r, &id)).await
}
