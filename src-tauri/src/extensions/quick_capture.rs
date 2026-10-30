//! Captura rápida (specs/captura-rapida/design.md): el atajo global, la
//! ventanita de captura y su entrada en la bandeja. La ventana no escribe
//! en disco: le pasa lo capturado a la ventana principal, que lo crea con
//! las acciones del store (C15).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

pub const WINDOW_LABEL: &str = "quick-capture";
const WIDTH: f64 = 600.0;
const HEIGHT: f64 = 220.0;

/// Errores que llegan al panel (C3). Nunca llevan más que un código.
const ERR_INVALID: &str = "invalid";
const ERR_TAKEN: &str = "taken";
const ERR_UNSUPPORTED: &str = "unsupported";

#[derive(Default)]
pub struct QuickCaptureState {
    shortcut: Mutex<Option<Shortcut>>,
    /// Texto de "Captura rápida" en la bandeja (C4). `None`: sin entrada.
    tray_label: Mutex<Option<String>>,
    /// C11: Logday no era la app activa cuando se abrió la ventana.
    from_other_app: AtomicBool,
}

impl QuickCaptureState {
    pub fn tray_label(&self) -> Option<String> {
        self.tray_label.lock().unwrap().clone()
    }
}

/// C2: el formato del plugin (`CommandOrControl+Shift+Space`), con al
/// menos un modificador.
pub fn parse_shortcut(text: &str) -> Result<Shortcut, &'static str> {
    let shortcut: Shortcut = text.parse().map_err(|_| ERR_INVALID)?;
    if shortcut.mods.is_empty() {
        return Err(ERR_INVALID);
    }
    Ok(shortcut)
}

/// El plugin no admite atajos globales en Wayland (C3): bajo XWayland se
/// registran pero solo se disparan con una ventana X11 al frente.
fn is_wayland() -> bool {
    cfg!(target_os = "linux")
        && std::env::var("XDG_SESSION_TYPE").map(|v| v.eq_ignore_ascii_case("wayland")).unwrap_or(false)
}

fn ensure_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(win) = app.get_webview_window(WINDOW_LABEL) {
        return Ok(win);
    }
    // El frontend sabe que es la captura por la etiqueta de la ventana
    // (main.tsx), y no carga `App` ni el store.
    let win = WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::App("index.html".into()))
        .title("Logday")
        .inner_size(WIDTH, HEIGHT)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .visible(false)
        .shadow(true)
        .build()?;
    let handle = app.clone();
    win.on_window_event(move |event| {
        // C10: un clic fuera la oculta. El foco ya fue a donde se hizo
        // clic, así que no hay que devolverlo (C11), aunque sea a la
        // ventana principal.
        if let tauri::WindowEvent::Focused(false) = event {
            handle.state::<QuickCaptureState>().from_other_app.store(false, Ordering::Relaxed);
            if let Some(w) = handle.get_webview_window(WINDOW_LABEL) {
                let _ = w.hide();
            }
        }
    });
    Ok(win)
}

/// C6: un poco arriba del centro de la pantalla donde está el puntero,
/// como los buscadores del sistema.
fn place_on_cursor_monitor(app: &AppHandle, win: &WebviewWindow) {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| win.primary_monitor().ok().flatten());
    let (Some(monitor), Ok(size)) = (monitor, win.outer_size()) else {
        let _ = win.center();
        return;
    };
    let (pos, area) = (monitor.position(), monitor.size());
    let x = pos.x + (area.width as i32 - size.width as i32) / 2;
    let y = pos.y + area.height as i32 / 4;
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

fn show(app: &AppHandle, win: &WebviewWindow) {
    let logday_active = app.webview_windows().values().any(|w| w.is_focused().unwrap_or(false));
    app.state::<QuickCaptureState>().from_other_app.store(!logday_active, Ordering::Relaxed);
    place_on_cursor_monitor(app, win);
    let _ = win.show();
    let _ = win.set_focus();
    let _ = app.emit("quick-capture:shown", ());
}

/// Oculta la ventana y, si Logday no era la app activa, devuelve el foco
/// a la anterior (C11). En macOS hay que ocultar la app; en Windows el
/// sistema ya lo devuelve, y en Linux depende del gestor de ventanas.
fn hide(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(WINDOW_LABEL) {
        let _ = win.hide();
    }
    let from_other_app = app.state::<QuickCaptureState>().from_other_app.swap(false, Ordering::Relaxed);
    #[cfg(target_os = "macos")]
    if from_other_app {
        let _ = app.hide();
    }
    #[cfg(not(target_os = "macos"))]
    let _ = from_other_app;
}

/// Lo que hacen el atajo y la entrada de la bandeja (C6, C7).
pub fn toggle(app: &AppHandle) {
    let Some(win) = app.get_webview_window(WINDOW_LABEL) else {
        return;
    };
    if win.is_visible().unwrap_or(false) {
        hide(app);
    } else {
        show(app, &win);
    }
}

/// Activa la captura o cambia su atajo (C1–C4). La ventana y la entrada
/// de la bandeja quedan aunque el atajo no se registre, para usarla desde
/// la bandeja. `label` es el texto de la bandeja y `pretty`, el atajo
/// como se muestra (los arma el webview, en el idioma de la app).
#[tauri::command]
pub async fn quick_capture_configure(
    app: AppHandle,
    shortcut: String,
    label: String,
    pretty: String,
) -> Result<(), String> {
    ensure_window(&app).map_err(|e| e.to_string())?;
    let state = app.state::<QuickCaptureState>();
    let global = app.global_shortcut();
    if let Some(old) = state.shortcut.lock().unwrap().take() {
        let _ = global.unregister(old);
    }
    let result = parse_shortcut(&shortcut).and_then(|parsed| {
        if is_wayland() {
            return Err(ERR_UNSUPPORTED);
        }
        global.register(parsed).map(|_| parsed).map_err(|_| ERR_TAKEN)
    });
    let tray_text = match result {
        Ok(parsed) => {
            *state.shortcut.lock().unwrap() = Some(parsed);
            format!("{label}  {pretty}")
        }
        Err(_) => label,
    };
    *state.tray_label.lock().unwrap() = Some(tray_text);
    crate::refresh_tray(&app);
    result.map(|_| ()).map_err(str::to_string)
}

/// C5, C20: libera el atajo, quita la entrada de la bandeja y destruye la
/// ventana (con su borrador).
#[tauri::command]
pub async fn quick_capture_disable(app: AppHandle) -> Result<(), String> {
    let state = app.state::<QuickCaptureState>();
    if let Some(old) = state.shortcut.lock().unwrap().take() {
        let _ = app.global_shortcut().unregister(old);
    }
    *state.tray_label.lock().unwrap() = None;
    crate::refresh_tray(&app);
    if let Some(win) = app.get_webview_window(WINDOW_LABEL) {
        let _ = win.destroy();
    }
    Ok(())
}

/// Esc, guardar o el atajo con la ventana abierta (C7, C10, C13).
#[tauri::command]
pub async fn quick_capture_hide(app: AppHandle) -> Result<(), String> {
    hide(&app);
    Ok(())
}

/// ⌘/Ctrl+Enter (C13): oculta la captura y trae la ventana principal,
/// que ya abrió lo creado.
#[tauri::command]
pub async fn quick_capture_open_main(app: AppHandle) -> Result<(), String> {
    app.state::<QuickCaptureState>().from_other_app.store(false, Ordering::Relaxed);
    if let Some(win) = app.get_webview_window(WINDOW_LABEL) {
        let _ = win.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acepta_el_atajo_por_defecto_y_variantes() {
        assert!(parse_shortcut("CommandOrControl+Shift+Space").is_ok());
        assert!(parse_shortcut("Alt+Shift+KeyL").is_ok());
        assert!(parse_shortcut("Control+Alt+Digit1").is_ok());
        assert!(parse_shortcut("Command+F5").is_ok());
    }

    #[test]
    fn rechaza_atajos_sin_modificador_o_mal_escritos() {
        assert_eq!(parse_shortcut("Space").unwrap_err(), ERR_INVALID);
        assert_eq!(parse_shortcut("").unwrap_err(), ERR_INVALID);
        assert_eq!(parse_shortcut("Shift+").unwrap_err(), ERR_INVALID);
        assert_eq!(parse_shortcut("Control+NoExiste").unwrap_err(), ERR_INVALID);
    }
}
