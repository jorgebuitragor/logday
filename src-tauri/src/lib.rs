mod extensions;
mod fs_scope;

use std::fs;
use std::path::Path;
use fs_scope::{Access, FsScope};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tauri::{
    menu::{IsMenuItem, Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
};

#[derive(Debug, Serialize, Deserialize)]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UrlMeta {
    pub title: String,
    pub description: String,
    pub domain: String,
}

// ── URL metadata helpers ─────────────────────────────────────────────────────

fn extract_domain(url: &str) -> String {
    let without_scheme = url.splitn(2, "://").nth(1).unwrap_or(url);
    let domain = without_scheme.splitn(2, '/').next().unwrap_or(without_scheme);
    domain.split(':').next().unwrap_or(domain).to_string()
}

fn find_attr_value(tag: &str, attr: &str) -> Option<String> {
    let tag_l = tag.to_lowercase();
    let attr_l = attr.to_lowercase();
    for q in ['"', '\''] {
        let pat = format!("{}={}", attr_l, q);
        if let Some(idx) = tag_l.find(&pat) {
            let after = &tag[idx + pat.len()..];
            if let Some(end) = after.find(q) {
                let v = after[..end].trim().to_string();
                if !v.is_empty() {
                    return Some(v);
                }
            }
        }
    }
    None
}

fn extract_meta(html: &str, key: &str) -> Option<String> {
    let html_l = html.to_lowercase();
    let key_l = key.to_lowercase();
    let mut pos = 0;
    while pos < html_l.len() {
        match html_l[pos..].find("<meta") {
            None => break,
            Some(rel) => {
                let abs = pos + rel;
                let end = html_l[abs..].find('>').map(|e| abs + e + 1).unwrap_or(html_l.len());
                let tag = &html[abs..end.min(html_l.len())];
                let name = find_attr_value(tag, "name").unwrap_or_default().to_lowercase();
                let prop = find_attr_value(tag, "property").unwrap_or_default().to_lowercase();
                if name == key_l || prop == key_l {
                    if let Some(c) = find_attr_value(tag, "content") {
                        return Some(html_decode(&c));
                    }
                }
                pos = end;
            }
        }
    }
    None
}

fn extract_title_tag(html: &str) -> Option<String> {
    let html_l = html.to_lowercase();
    if let Some(start) = html_l.find("<title") {
        if let Some(gt) = html_l[start..].find('>') {
            let cs = start + gt + 1;
            if let Some(end) = html_l[cs..].find("</title>") {
                let t = html[cs..cs + end].trim().to_string();
                if !t.is_empty() {
                    return Some(html_decode(&t));
                }
            }
        }
    }
    None
}

fn html_decode(s: &str) -> String {
    s.replace("&amp;", "&")
     .replace("&lt;", "<")
     .replace("&gt;", ">")
     .replace("&quot;", "\"")
     .replace("&#39;", "'")
     .replace("&apos;", "'")
     .replace("&nbsp;", " ")
     .replace("&#x27;", "'")
}

fn truncate_text(s: &str, max: usize) -> String {
    let mut chars = s.chars();
    let taken: String = chars.by_ref().take(max).collect();
    if chars.next().is_some() { format!("{}\u{2026}", taken) } else { taken }
}

/// Fetches a URL (bypassing WebView CORS) and extracts page title + description.
#[tauri::command]
async fn fetch_url_metadata(url: String) -> Result<UrlMeta, String> {
    let domain = extract_domain(&url);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .user_agent("Mozilla/5.0 (compatible; Logday/1.0)")
        .build()
        .map_err(|e| e.to_string())?;
    let html = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let title = extract_meta(&html, "og:title")
        .or_else(|| extract_title_tag(&html))
        .unwrap_or_else(|| domain.clone());

    let description = extract_meta(&html, "og:description")
        .or_else(|| extract_meta(&html, "description"))
        .unwrap_or_default();

    Ok(UrlMeta {
        title: truncate_text(&title, 100),
        description: truncate_text(&description, 200),
        domain,
    })
}

/// Returns the app's local data directory for storing config.json
#[tauri::command]
fn get_app_config_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

/// Returns the user's home directory
#[tauri::command]
fn get_home_dir() -> String {
    dirs_next::home_dir()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

// Todos los comandos de archivos pasan por `FsScope` (src/fs_scope.rs,
// specs/blindaje-seguridad BS10–BS17): solo la carpeta de la app, las
// carpetas de datos elegidas en un diálogo y los archivos elegidos en un
// diálogo de abrir o guardar.

/// Reads a file and returns its text content
#[tauri::command]
fn read_file(scope: State<'_, FsScope>, path: String) -> Result<String, String> {
    let p = scope.check(&path, Access::Read)?;
    fs::read_to_string(&p).map_err(|e| format!("Failed to read {path}: {e}"))
}

/// Writes text content to a file (creates parent directories if needed)
#[tauri::command]
fn write_file(scope: State<'_, FsScope>, path: String, content: String) -> Result<(), String> {
    let p = scope.check(&path, Access::Write)?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {e}"))?;
    }
    fs::write(&p, content).map_err(|e| format!("Failed to write {path}: {e}"))
}

/// Lists entries (files and directories) in a given directory
#[tauri::command]
fn list_dir(scope: State<'_, FsScope>, dir: String) -> Result<Vec<FsEntry>, String> {
    let d = scope.check(&dir, Access::Read)?;
    let read = fs::read_dir(&d).map_err(|e| format!("Failed to read dir {dir}: {e}"))?;
    let mut entries: Vec<FsEntry> = read
        .flatten()
        .map(|e| {
            let path = e.path();
            FsEntry {
                name: e.file_name().to_string_lossy().to_string(),
                path: path.to_string_lossy().to_string(),
                is_dir: path.is_dir(),
            }
        })
        .collect();
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}

/// Creates a directory (and all parent directories)
#[tauri::command]
fn create_dir_recursive(scope: State<'_, FsScope>, dir: String) -> Result<(), String> {
    let d = scope.check(&dir, Access::Write)?;
    fs::create_dir_all(&d).map_err(|e| format!("Failed to create dir {dir}: {e}"))
}

/// Deletes a file
#[tauri::command]
fn delete_file(scope: State<'_, FsScope>, path: String) -> Result<(), String> {
    let p = scope.check_not_root(&path)?;
    fs::remove_file(&p).map_err(|e| format!("Failed to delete {path}: {e}"))
}

/// Renames (moves) a directory
#[tauri::command]
fn rename_dir(scope: State<'_, FsScope>, from: String, to: String) -> Result<(), String> {
    let f = scope.check_not_root(&from)?;
    let t = scope.check_not_root(&to)?;
    fs::rename(&f, &t).map_err(|e| format!("Failed to rename {from} to {to}: {e}"))
}

/// Deletes a directory and all its contents
#[tauri::command]
fn delete_dir(scope: State<'_, FsScope>, path: String) -> Result<(), String> {
    let p = scope.check_not_root(&path)?;
    fs::remove_dir_all(&p).map_err(|e| format!("Failed to delete dir {path}: {e}"))
}

/// Checks if a path exists. Fuera de las carpetas permitidas responde
/// `false`: no sirve para sondear el disco.
#[tauri::command]
fn path_exists(scope: State<'_, FsScope>, path: String) -> bool {
    scope.check(&path, Access::Read).map(|p| p.exists()).unwrap_or(false)
}

/// Recursively searches all .md files under base_dir for the given query string
#[tauri::command]
fn search_tasks(scope: State<'_, FsScope>, base_dir: String, query: String) -> Vec<SearchResult> {
    let Ok(base) = scope.check(&base_dir, Access::Read) else {
        return Vec::new();
    };
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();
    search_recursive(&base, &query_lower, &mut results, 0);
    results
}

fn search_recursive(dir: &Path, query: &str, results: &mut Vec<SearchResult>, depth: u32) {
    if depth > 4 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        // `file_type()` no sigue enlaces simbólicos: un enlace dentro de la
        // carpeta de datos no saca la búsqueda fuera de ella.
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_dir {
            // skip hidden dirs
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if !name_str.starts_with('.') {
                search_recursive(&path, query, results, depth + 1);
            }
        } else if path.extension().is_some_and(|e| e == "md") {
            if let Ok(content) = fs::read_to_string(&path) {
                if content.to_lowercase().contains(query) {
                    results.push(SearchResult {
                        path: path.to_string_lossy().to_string(),
                        content,
                    });
                }
            }
        }
    }
}

/// Writes text to the system clipboard using native OS utilities.
#[tauri::command]
fn write_clipboard(text: String) -> Result<(), String> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    #[cfg(target_os = "macos")]
    {
        let mut child = Command::new("pbcopy")
            .env("LANG", "en_US.UTF-8")
            .env("LC_ALL", "en_US.UTF-8")
            .env("LC_CTYPE", "UTF-8")
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        }
        let status = child.wait().map_err(|e| e.to_string())?;
        if !status.success() {
            return Err(format!("pbcopy falló con código {:?}", status.code()));
        }
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut child = Command::new("clip")
            .stdin(Stdio::piped())
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| e.to_string())?;
        if let Some(stdin) = child.stdin.as_mut() {
            // Convertir a UTF-16LE
            use std::os::windows::prelude::*;
            let utf16: Vec<u16> = text.encode_utf16().collect();
            let bytes: &[u8] = unsafe {
                std::slice::from_raw_parts(utf16.as_ptr() as *const u8, utf16.len() * 2)
            };
            stdin.write_all(bytes).map_err(|e| e.to_string())?;
        }
        child.wait().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    {
        for (cmd, args) in &[("xclip", vec!["-selection", "clipboard"]), ("xsel", vec!["--clipboard", "--input"])] {
            if let Ok(mut child) = Command::new(cmd).args(args).stdin(Stdio::piped()).spawn() {
                if let Some(stdin) = child.stdin.as_mut() {
                    let _ = stdin.write_all(text.as_bytes());
                }
                let _ = child.wait();
                return Ok(());
            }
        }
        return Err("Instala xclip o xsel para usar el portapapeles".to_string());
    }
    #[allow(unreachable_code)]
    Err("Plataforma no soportada".to_string())
}

/// Reads a file and returns its content as base64-encoded string
#[tauri::command]
fn read_file_binary(scope: State<'_, FsScope>, path: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let p = scope.check(&path, Access::Read)?;
    let bytes = fs::read(&p).map_err(|e| format!("Failed to read {path}: {e}"))?;
    Ok(STANDARD.encode(bytes))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncHttpResponse {
    pub status: u16,
    pub body: String,
}

/// Makes an HTTP request to a user-configured logday-server instance
/// (self-hosted sync backend). Runs on the Rust side so it bypasses
/// WebView CORS restrictions — logday-server doesn't implement CORS
/// on purpose (see its specs/arquitectura-inicial), same rationale as
/// fetch_image_base64 below. Returns the raw status/body; all
/// protocol logic (auth headers, JSON parsing, retries) lives in
/// src/lib/sync.ts, not here.
#[tauri::command]
async fn sync_request(
    base_url: String,
    method: String,
    path: String,
    token: Option<String>,
    body: Option<String>,
) -> Result<SyncHttpResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|e| format!("invalid HTTP method {method}: {e}"))?;
    let url = format!("{}{}", base_url.trim_end_matches('/'), path);

    let mut req = client.request(method, &url);
    if let Some(t) = token {
        req = req.bearer_auth(t);
    }
    if let Some(b) = body {
        req = req.header("Content-Type", "application/json").body(b);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    Ok(SyncHttpResponse { status, body: text })
}

/// Downloads an external URL and returns its contents as a base64-encoded string.
/// Runs on the Rust side so it bypasses WebView CORS restrictions.
#[tauri::command]
async fn fetch_image_base64(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let bytes = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    use base64::{engine::general_purpose::STANDARD, Engine};
    Ok(STANDARD.encode(&bytes))
}

#[tauri::command]
fn write_file_binary(scope: State<'_, FsScope>, path: String, data: String) -> Result<(), String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let p = scope.check(&path, Access::Write)?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {e}"))?;
    }
    let bytes = STANDARD.decode(&data).map_err(|e| format!("Failed to decode base64: {e}"))?;
    fs::write(&p, bytes).map_err(|e| format!("Failed to write {path}: {e}"))
}

/// Comprueba que los argumentos de `git_run` sean uno de los comandos que
/// usa la integración Git (src/store/appStore.ts: gitInit, gitCommit,
/// gitPush, gitFetch, gitPull). Cualquier otra cosa (`-c core.sshCommand=…`,
/// `--upload-pack=…`, un remoto `ext::`) se rechaza: con eso un script
/// inyectado ejecutaría comandos (specs/blindaje-seguridad BS18).
fn git_args_allowed(args: &[String]) -> bool {
    let a: Vec<&str> = args.iter().map(String::as_str).collect();
    match a.as_slice() {
        ["init"] | ["add", "-A"] | ["fetch", "origin"] | ["pull", "origin", "main"] => true,
        ["push", "--set-upstream", "origin", "main"] => true,
        ["rev-list", "HEAD..origin/HEAD", "--count"] | ["rev-list", "origin/HEAD..HEAD", "--count"] => true,
        ["config", "--local", "user.name" | "user.email", _value] => true,
        ["commit", "-m", _msg] => true,
        ["remote", "add" | "set-url", "origin", url] => git_remote_allowed(url),
        _ => false,
    }
}

/// Remotos `https://`, `http://`, `ssh://` o `usuario@host:ruta`. Nunca
/// `ext::` ni `fd::` (ejecutan comandos) ni nada que empiece con `-`.
fn git_remote_allowed(url: &str) -> bool {
    let u = url.trim();
    if u.is_empty() || u.starts_with('-') || u.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return false;
    }
    let lower = u.to_ascii_lowercase();
    if lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("ssh://") {
        return true;
    }
    // Forma corta de SSH: git@github.com:usuario/repo.git
    match u.split_once(':') {
        Some((host, path)) => host.contains('@') && !host.contains('/') && !path.is_empty() && !path.starts_with(':'),
        None => false,
    }
}

/// Runs a git subcommand in the given working directory.
/// Only invokes the `git` binary — never executes arbitrary shell strings.
/// Solo los comandos de `git_args_allowed` y dentro de una carpeta de datos.
#[tauri::command]
fn git_run(scope: State<'_, FsScope>, cwd: String, args: Vec<String>) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;

    let dir = scope.check_git_cwd(&cwd)?;
    if !git_args_allowed(&args) {
        return Err("Comando de git no permitido".to_string());
    }
    let mut cmd = std::process::Command::new("git");
    cmd.current_dir(&dir).args(&args);
    #[cfg(target_os = "windows")]
    {
        // 0x08000000 = CREATE_NO_WINDOW
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output().map_err(|e| format!("git not found or failed to start: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Esquemas que `open_url` entrega al sistema. Un enlace de una nota con
/// otro esquema (`file:`, `javascript:`, el de otra app) no se abre.
const OPEN_URL_SCHEMES: [&str; 4] = ["http", "https", "mailto", "tel"];

/// Valida y normaliza una URL antes de abrirla (specs/blindaje-seguridad BS1).
fn parse_openable_url(raw: &str) -> Result<String, String> {
    let raw = raw.trim();
    // `//host/ruta` (enlace sin esquema) se abre como https.
    let candidate = if raw.starts_with("//") { format!("https:{raw}") } else { raw.to_string() };
    let url = url::Url::parse(&candidate).map_err(|_| "Enlace no válido".to_string())?;
    if !OPEN_URL_SCHEMES.contains(&url.scheme()) {
        return Err(format!("No se abren enlaces {}:", url.scheme()));
    }
    Ok(url.as_str().to_string())
}

/// Opens a URL in the default system browser.
/// Antes usaba `cmd /c start` en Windows: una URL con `&` ejecutaba otros
/// comandos (specs/blindaje-seguridad BS1). El plugin opener abre con
/// ShellExecute en Windows, `open` en macOS y `xdg-open` en Linux, sin shell.
#[tauri::command]
fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let url = parse_openable_url(&url)?;
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Extensiones que `open_in_system` abre con su aplicación. El resto
/// (`.app`, `.command`, `.exe`, `.sh`, `.lnk`…) se muestra en el Finder o
/// el Explorador sin ejecutarse (specs/blindaje-seguridad BS3).
const OPENABLE_EXTENSIONS: [&str; 33] = [
    "md", "markdown", "txt", "log", "csv", "json", "xml", "yaml", "yml", "pdf", "rtf",
    "png", "jpg", "jpeg", "gif", "webp", "heic", "bmp", "tif", "tiff",
    "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp",
    "mp3", "mp4", "mov", "wav",
];

/// Carpetas que macOS trata como un archivo ejecutable o instalable.
const BUNDLE_EXTENSIONS: [&str; 10] = [
    "app", "bundle", "framework", "plugin", "prefpane", "workflow", "saver", "kext", "mpkg", "pkg",
];

enum OpenAction {
    Open,
    Reveal,
}

fn open_action(path: &Path) -> OpenAction {
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    if path.is_dir() {
        if BUNDLE_EXTENSIONS.contains(&ext.as_str()) {
            OpenAction::Reveal
        } else {
            OpenAction::Open
        }
    } else if OPENABLE_EXTENSIONS.contains(&ext.as_str()) {
        OpenAction::Open
    } else {
        OpenAction::Reveal
    }
}

/// Opens a file or folder in the system's default file manager.
/// Una carpeta se abre; un documento conocido se abre con su aplicación;
/// cualquier otra cosa solo se muestra en su carpeta, para que un enlace o
/// una ruta vinculada nunca lance un programa.
#[tauri::command]
fn open_in_system(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.is_absolute() || p.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err("Ruta no válida".to_string());
    }
    let resolved = p.canonicalize().map_err(|e| format!("No se encontró {path}: {e}"))?;
    match open_action(&resolved) {
        OpenAction::Open => app.opener().open_path(resolved.to_string_lossy(), None::<&str>),
        OpenAction::Reveal => app.opener().reveal_item_in_dir(&resolved),
    }
    .map_err(|e| e.to_string())
}

/// Filtro de extensiones de un diálogo, como en `@tauri-apps/plugin-dialog`.
#[derive(Debug, Deserialize)]
pub struct DialogFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

fn with_filters<R: tauri::Runtime>(
    mut b: tauri_plugin_dialog::FileDialogBuilder<R>,
    filters: Option<Vec<DialogFilter>>,
) -> tauri_plugin_dialog::FileDialogBuilder<R> {
    for f in filters.unwrap_or_default() {
        let exts: Vec<&str> = f.extensions.iter().map(String::as_str).collect();
        b = b.add_filter(f.name, &exts);
    }
    b
}

/// Diálogo de carpeta. La carpeta elegida pasa a ser una carpeta de datos
/// permitida (BS12): es la única forma de agregar una.
#[tauri::command]
async fn fs_pick_folder(window: tauri::Window, scope: State<'_, FsScope>) -> Result<Option<String>, String> {
    let w = window.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || w.dialog().file().set_parent(&w).blocking_pick_folder())
        .await
        .map_err(|e| e.to_string())?;
    let Some(fp) = picked else { return Ok(None) };
    let path = fp.into_path().map_err(|e| e.to_string())?;
    scope.add_root(&path)?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Diálogo de abrir archivos. Los elegidos se pueden leer hasta cerrar la
/// app (BS13).
#[tauri::command]
async fn fs_pick_files(
    window: tauri::Window,
    scope: State<'_, FsScope>,
    multiple: bool,
    filters: Option<Vec<DialogFilter>>,
) -> Result<Option<Vec<String>>, String> {
    let w = window.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let b = with_filters(w.dialog().file().set_parent(&w), filters);
        if multiple {
            b.blocking_pick_files()
        } else {
            b.blocking_pick_file().map(|f| vec![f])
        }
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(files) = picked else { return Ok(None) };
    let mut out = Vec::with_capacity(files.len());
    for f in files {
        let path = f.into_path().map_err(|e| e.to_string())?;
        scope.grant_file(&path)?;
        out.push(path.to_string_lossy().to_string());
    }
    Ok(Some(out))
}

/// Diálogo de guardar. El archivo elegido se puede escribir hasta cerrar la
/// app (BS13).
#[tauri::command]
async fn fs_save_dialog(
    window: tauri::Window,
    scope: State<'_, FsScope>,
    default_path: Option<String>,
    filters: Option<Vec<DialogFilter>>,
) -> Result<Option<String>, String> {
    let w = window.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let mut b = with_filters(w.dialog().file().set_parent(&w), filters);
        if let Some(name) = default_path {
            // Como en el plugin de JS: un nombre suelto es el nombre
            // sugerido; una ruta, carpeta y nombre.
            let p = Path::new(&name);
            match (p.parent().filter(|d| !d.as_os_str().is_empty()), p.file_name()) {
                (Some(dir), Some(file)) => {
                    b = b.set_directory(dir).set_file_name(file.to_string_lossy());
                }
                _ => b = b.set_file_name(name),
            }
        }
        b.blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(fp) = picked else { return Ok(None) };
    let path = fp.into_path().map_err(|e| e.to_string())?;
    scope.grant_file(&path)?;
    Ok(Some(path.to_string_lossy().to_string()))
}

pub(crate) const TRAY_ID: &str = "main";

/// Menú de la bandeja. "Captura rápida" aparece solo con la extensión
/// activa (specs/captura-rapida C4), y el bloque del Pomodoro, entre
/// "Nueva tarea" y "Salir" con su separador (specs/pomodoro, design §4.2),
/// por eso se rearma con `refresh_tray`.
fn build_tray_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let show_item = MenuItem::with_id(app, "show", "Mostrar Logday", true, None::<&str>)?;
    let capture_item = match app.state::<extensions::quick_capture::QuickCaptureState>().tray_label() {
        Some(label) => Some(MenuItem::with_id(app, "quick_capture", label, true, None::<&str>)?),
        None => None,
    };
    let new_note_item = MenuItem::with_id(app, "new_note", "Nueva nota", true, None::<&str>)?;
    let new_task_item = MenuItem::with_id(app, "new_task", "Nueva tarea", true, None::<&str>)?;
    let sep = tauri::menu::PredefinedMenuItem::separator(app)?;
    let pomodoro_items = extensions::pomodoro::tray_items(app)?;
    let pomodoro_sep = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
    let mut items: Vec<&dyn IsMenuItem<tauri::Wry>> = vec![&show_item];
    if let Some(item) = &capture_item {
        items.push(item);
    }
    items.extend([&new_note_item as &dyn IsMenuItem<tauri::Wry>, &new_task_item, &sep]);
    if !pomodoro_items.is_empty() {
        items.extend(pomodoro_items.iter().map(|i| i as &dyn IsMenuItem<tauri::Wry>));
        items.push(&pomodoro_sep);
    }
    items.push(&quit_item);
    Menu::with_items(app, &items)
}

pub(crate) fn refresh_tray(app: &tauri::AppHandle) {
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY_ID), build_tray_menu(app)) {
        let _ = tray.set_menu(Some(menu));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(extensions::mcp::McpState::default())
        .manage(extensions::quick_capture::QuickCaptureState::default())
        .manage(extensions::pomodoro::PomodoroState::default())
        .manage(FsScope::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Carpetas permitidas para los comandos de archivos, antes de
            // que el webview pida nada (specs/blindaje-seguridad BS10).
            let app_dir = app.path().app_data_dir()?;
            app.state::<FsScope>().init(&app_dir);
            // El updater no existe en mobile — se registra acá (no al
            // nivel del builder) siguiendo el patrón oficial del plugin,
            // que necesita el AppHandle ya construido.
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            // El atajo de la captura rápida solo se registra si la extensión
            // está activa (quick_capture_configure); el plugin solo avisa.
            #[cfg(desktop)]
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(|app, _shortcut, event| {
                        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                            extensions::quick_capture::toggle(app);
                        }
                    })
                    .build(),
            )?;

            let menu = build_tray_menu(app.handle())?;

            let tray = TrayIconBuilder::with_id(TRAY_ID)
                .icon(tauri::include_image!("icons/tray-icon.png"))
                .tooltip("Logday")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quick_capture" => extensions::quick_capture::toggle(app),
                    "new_note" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                            let _ = w.emit("tray:new-note", ());
                        }
                    }
                    "new_task" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                            let _ = w.emit("tray:new-task", ());
                        }
                    }
                    "quit" => app.exit(0),
                    // Pausar, Reanudar, Iniciar y Saltar: sin mostrar la ventana.
                    id => extensions::pomodoro::on_menu(app, id),
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;
            // El tiempo del Pomodoro junto al ícono, con dígitos de ancho
            // fijo para que no se mueva cada segundo (macOS).
            extensions::pomodoro::use_fixed_digits(&tray);

            // Vigila el fin del Pomodoro aunque la ventana esté oculta.
            extensions::pomodoro::spawn_watcher(app.handle());

            #[cfg(windows)]
            {
                use raw_window_handle::{HasWindowHandle, RawWindowHandle};
                use windows_sys::Win32::UI::WindowsAndMessaging::{
                    GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, SendMessageW,
                };
                if let Some(win) = app.get_webview_window("main") {
                    if let Ok(rwh) = win.window_handle() {
                        if let RawWindowHandle::Win32(h) = rwh.as_raw() {
                            let hwnd = h.hwnd.get() as windows_sys::Win32::Foundation::HWND;
                            unsafe {
                                // WS_EX_DLGMODALFRAME quita el icono de la barra de titulo
                                const GWL_EXSTYLE: i32 = -20;
                                const WS_EX_DLGMODALFRAME: isize = 0x0001;
                                const SWP_NOMOVE: u32 = 0x0002;
                                const SWP_NOSIZE: u32 = 0x0001;
                                const SWP_NOZORDER: u32 = 0x0004;
                                const SWP_FRAMECHANGED: u32 = 0x0020;
                                let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style | WS_EX_DLGMODALFRAME);
                                // Aplicar cambio de estilo y limpiar iconos
                                SetWindowPos(hwnd, std::ptr::null_mut(), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
                                SendMessageW(hwnd, 0x0080, 0, 0); // WM_SETICON ICON_SMALL = null
                                SendMessageW(hwnd, 0x0080, 1, 0); // WM_SETICON ICON_BIG = null
                            }
                        }
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_app_config_dir,
            get_home_dir,
            read_file,
            write_file,
            list_dir,
            create_dir_recursive,
            delete_file,
            rename_dir,
            delete_dir,
            path_exists,
            search_tasks,
            open_in_system,
            open_url,
            write_clipboard,
            read_file_binary,
            write_file_binary,
            fetch_image_base64,
            git_run,
            sync_request,
            fetch_url_metadata,
            fs_pick_folder,
            fs_pick_files,
            fs_save_dialog,
            extensions::ext_secret_set,
            extensions::ext_secret_clear,
            extensions::ext_secret_hint,
            extensions::team_chat::team_chat_validate_url,
            extensions::team_chat::team_chat_send,
            extensions::team_chat_google::team_chat_google_connect,
            extensions::team_chat_google::team_chat_google_disconnect,
            extensions::team_chat_google::team_chat_google_parse_space,
            extensions::team_chat_google::team_chat_google_send,
            extensions::google_calendar::google_calendar_connect,
            extensions::google_calendar::google_calendar_disconnect,
            extensions::google_calendar::google_calendar_copy_client,
            extensions::google_calendar::google_calendar_events,
            extensions::outgoing_webhook::outgoing_webhook_validate_url,
            extensions::outgoing_webhook::outgoing_webhook_send,
            extensions::http_client::http_client_send,
            extensions::http_client::http_client_cancel,
            extensions::http_client::http_client_reveal_secret,
            extensions::granola::granola_connect,
            extensions::granola::granola_disconnect,
            extensions::granola::granola_call,
            extensions::openproject::openproject_connect,
            extensions::openproject::openproject_disconnect,
            extensions::openproject::openproject_work_packages,
            extensions::openproject::openproject_custom_fields,
            extensions::openproject::openproject_projects,
            extensions::openproject::openproject_work_package,
            extensions::openproject::openproject_statuses,
            extensions::openproject::openproject_update_work_package,
            extensions::mcp::mcp_server_start,
            extensions::mcp::mcp_server_stop,
            extensions::mcp::mcp_reply,
            extensions::quick_capture::quick_capture_configure,
            extensions::quick_capture::quick_capture_disable,
            extensions::quick_capture::quick_capture_hide,
            extensions::quick_capture::quick_capture_focus,
            extensions::quick_capture::quick_capture_open_main,
            extensions::pomodoro::pomodoro_schedule,
            extensions::pomodoro::pomodoro_pause,
            extensions::pomodoro::pomodoro_idle,
            extensions::pomodoro::pomodoro_clear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod open_and_git_tests {
    use super::*;

    fn v(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn open_url_solo_esquemas_permitidos() {
        assert!(parse_openable_url("https://ejemplo.com/a?b=1&c=2").is_ok());
        assert!(parse_openable_url("mailto:ana@ejemplo.com").is_ok());
        assert_eq!(parse_openable_url("//ejemplo.com/x").unwrap(), "https://ejemplo.com/x");
        assert!(parse_openable_url("file:///Applications/Calculator.app").is_err());
        assert!(parse_openable_url("javascript:alert(1)").is_err());
        assert!(parse_openable_url("otraapp://transfer?x=1").is_err());
        assert!(parse_openable_url("/Users/ana/x.command").is_err());
        assert!(parse_openable_url("calc.exe").is_err());
    }

    #[test]
    fn open_url_no_deja_caracteres_de_shell_sueltos() {
        // `&`, `|` y `^` quedan dentro de una URL válida, que se abre con
        // ShellExecute (sin cmd); las comillas y los espacios se codifican.
        let u = parse_openable_url("https://ejemplo.com/a&calc.exe|x^y\"z w").unwrap();
        assert!(u.starts_with("https://ejemplo.com/"));
        assert!(!u.contains('"'));
        assert!(!u.contains(' '));
    }

    #[test]
    fn git_permite_los_comandos_de_la_integracion() {
        for a in [
            v(&["init"]),
            v(&["add", "-A"]),
            v(&["commit", "-m", "auto: 2026-11-09 10:00"]),
            v(&["config", "--local", "user.name", "Ana"]),
            v(&["remote", "add", "origin", "https://github.com/ana/notas.git"]),
            v(&["remote", "set-url", "origin", "git@github.com:ana/notas.git"]),
            v(&["push", "--set-upstream", "origin", "main"]),
            v(&["fetch", "origin"]),
            v(&["rev-list", "HEAD..origin/HEAD", "--count"]),
            v(&["pull", "origin", "main"]),
        ] {
            assert!(git_args_allowed(&a), "{a:?}");
        }
    }

    #[test]
    fn git_rechaza_lo_demas() {
        for a in [
            v(&["-c", "core.sshCommand=calc", "fetch", "origin"]),
            v(&["status"]),
            v(&["config", "--local", "core.fsmonitor", "calc"]),
            v(&["fetch", "--upload-pack=calc", "origin"]),
            v(&["remote", "add", "origin", "ext::sh -c calc"]),
            v(&["remote", "add", "origin", "--upload-pack=x"]),
            v(&["remote", "add", "origin", "/tmp/repo"]),
            v(&["commit", "-m", "x", "--no-verify"]),
        ] {
            assert!(!git_args_allowed(&a), "{a:?}");
        }
    }

    #[test]
    fn open_in_system_no_ejecuta() {
        let dir = std::env::temp_dir().join(format!("logday-open-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("Calc.app")).unwrap();
        fs::write(dir.join("nota.md"), "x").unwrap();
        fs::write(dir.join("run.command"), "x").unwrap();
        assert!(matches!(open_action(&dir), OpenAction::Open));
        assert!(matches!(open_action(&dir.join("nota.md")), OpenAction::Open));
        assert!(matches!(open_action(&dir.join("Calc.app")), OpenAction::Reveal));
        assert!(matches!(open_action(&dir.join("run.command")), OpenAction::Reveal));
        let _ = fs::remove_dir_all(&dir);
    }
}
