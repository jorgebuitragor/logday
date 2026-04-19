use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use tauri::Manager;

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

/// Reads a file and returns its text content
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {path}: {e}"))
}

/// Writes text content to a file (creates parent directories if needed)
#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {e}"))?;
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write {path}: {e}"))
}

/// Lists entries (files and directories) in a given directory
#[tauri::command]
fn list_dir(dir: String) -> Result<Vec<FsEntry>, String> {
    let read = fs::read_dir(&dir).map_err(|e| format!("Failed to read dir {dir}: {e}"))?;
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
fn create_dir_recursive(dir: String) -> Result<(), String> {
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir {dir}: {e}"))
}

/// Deletes a file
#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| format!("Failed to delete {path}: {e}"))
}

/// Renames (moves) a directory
#[tauri::command]
fn rename_dir(from: String, to: String) -> Result<(), String> {
    fs::rename(&from, &to).map_err(|e| format!("Failed to rename {from} to {to}: {e}"))
}

/// Deletes a directory and all its contents
#[tauri::command]
fn delete_dir(path: String) -> Result<(), String> {
    fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete dir {path}: {e}"))
}

/// Checks if a path exists
#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// Recursively searches all .md files under base_dir for the given query string
#[tauri::command]
fn search_tasks(base_dir: String, query: String) -> Vec<SearchResult> {
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();
    search_recursive(Path::new(&base_dir), &query_lower, &mut results, 0);
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
        if path.is_dir() {
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
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        }
        child.wait().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        let mut child = Command::new("clip")
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
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
fn read_file_binary(path: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read {path}: {e}"))?;
    Ok(STANDARD.encode(bytes))
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
fn write_file_binary(path: String, data: String) -> Result<(), String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {e}"))?;
    }
    let bytes = STANDARD.decode(&data).map_err(|e| format!("Failed to decode base64: {e}"))?;
    fs::write(&path, bytes).map_err(|e| format!("Failed to write {path}: {e}"))
}

/// Opens a file or folder in the system's default file manager
#[tauri::command]
fn open_in_system(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
            write_clipboard,
            read_file_binary,
            write_file_binary,
            fetch_image_base64,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
