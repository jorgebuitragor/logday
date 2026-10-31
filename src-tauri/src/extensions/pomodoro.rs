//! Pomodoro (specs/pomodoro/design.md, "Arquitectura" y §4): lo que vigila
//! el fin de una fase y la bandeja. El estado del temporizador vive en el
//! frontend; aquí solo queda lo necesario para que el aviso llegue con la
//! ventana oculta y el WebView frenado (PM4, PM5):
//!
//! - el instante de fin, los textos de la notificación ya traducidos y si
//!   avisar;
//! - los textos de la bandeja (título en macOS, tooltip en Windows y las
//!   entradas del menú), que el frontend manda en el idioma de la app.
//!
//! Un hilo, una vez por segundo, actualiza el título y el tooltip y, al
//! llegar al fin, manda la notificación y emite `pomodoro:finished`. Los
//! clics del menú emiten `pomodoro:tray-action`, que resuelve el frontend.

use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::menu::MenuItem;
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_notification::NotificationExt;

pub const EVT_FINISHED: &str = "pomodoro:finished";
pub const EVT_TRAY_ACTION: &str = "pomodoro:tray-action";
pub const MENU_TOGGLE: &str = "pomodoro_toggle";
pub const MENU_SKIP: &str = "pomodoro_skip";
const MENU_STATUS: &str = "pomodoro_status";

/// D5: si el fin se detecta más tarde que esto (equipo suspendido), no se
/// avisa: un aviso de hace una hora confunde.
const STALE_MS: i64 = 5 * 60 * 1000;

/// Textos de la bandeja, ya traducidos (design §4). Pueden llevar `{min}`
/// (minutos enteros que faltan) y `{time}` (`m:ss`), que se rellenan aquí.
#[derive(Debug, Clone, Default, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrayTexts {
    /// Entrada de estado, deshabilitada. `None`: sin entrada (Listo).
    pub status: Option<String>,
    /// La misma con menos de 1 minuto ("Trabajo · menos de 1 min").
    pub status_less_than_min: Option<String>,
    /// "Pausar", "Reanudar", "Iniciar el descanso", "Iniciar un pomodoro".
    pub toggle: String,
    /// "Saltar". `None`: sin esa entrada.
    pub skip: Option<String>,
    /// Tooltip de Windows. `None`: "Logday".
    pub tooltip: Option<String>,
}

/// Lo que se avisa al llegar al fin.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishAlert {
    /// La opción global de notificaciones de la app (PM5).
    pub notify: bool,
    /// Con el sonido propio activo, la notificación va sin sonido para no
    /// sonar dos veces (design §6).
    pub own_sound: bool,
    pub title: String,
    pub body: String,
}

#[derive(Debug, Clone)]
enum Mode {
    /// Extensión apagada: sin bloque en la bandeja.
    Off,
    /// Sin fase en curso (Listo o Terminado): solo el menú.
    Idle,
    Running { end_at_ms: i64, key: String, alert: FinishAlert },
    Paused { remaining_ms: i64 },
}

struct Inner {
    mode: Mode,
    tray: Option<TrayTexts>,
    /// La entrada de estado del menú, para cambiarle el texto sin rearmar
    /// el menú (design §4.2).
    status_item: Option<MenuItem<Wry>>,
    /// Lo último que se puso, para no tocar la bandeja si no cambió.
    shown_title: Option<String>,
    shown_tooltip: Option<String>,
    shown_status: Option<String>,
}

pub struct PomodoroState(Mutex<Inner>);

impl Default for PomodoroState {
    fn default() -> Self {
        Self(Mutex::new(Inner {
            mode: Mode::Off,
            tray: None,
            status_item: None,
            shown_title: None,
            shown_tooltip: None,
            shown_status: None,
        }))
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FinishedPayload {
    key: String,
    end_at: i64,
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Lo que falta hasta el fin, nunca negativo.
pub fn remaining_ms(end_at_ms: i64, now_ms: i64) -> i64 {
    (end_at_ms - now_ms).max(0)
}

/// `m:ss` en minutos totales, sin horas (`25:00`, `4:59`, `120:00`), igual
/// que en la vista. Se redondea hacia arriba: el último segundo es `0:01` y
/// `0:00` solo al terminar.
pub fn format_clock(ms: i64) -> String {
    let secs = (ms.max(0) + 999) / 1000;
    format!("{}:{:02}", secs / 60, secs % 60)
}

/// Minutos enteros que faltan ("18 min" con 18:42).
pub fn whole_minutes(ms: i64) -> i64 {
    ms.max(0) / 60_000
}

/// Rellena `{min}` y `{time}`.
pub fn fill(template: &str, ms: i64) -> String {
    template.replace("{min}", &whole_minutes(ms).to_string()).replace("{time}", &format_clock(ms))
}

/// D5: se avisa solo si el fin fue hace menos de 5 minutos.
pub fn should_alert(end_at_ms: i64, now_ms: i64) -> bool {
    now_ms - end_at_ms < STALE_MS
}

/// Lo que muestra la bandeja en un momento: título, tooltip y entrada de
/// estado. Sin efectos, para probarlo sin la app.
#[derive(Debug, PartialEq)]
struct TrayView {
    title: Option<String>,
    tooltip: String,
    status: Option<String>,
}

fn tray_view(mode: &Mode, tray: Option<&TrayTexts>, now: i64) -> TrayView {
    let tooltip_of = |ms: i64| tray.and_then(|t| t.tooltip.as_deref()).map(|t| fill(t, ms)).unwrap_or_else(|| "Logday".into());
    match mode {
        Mode::Running { end_at_ms, .. } => {
            let ms = remaining_ms(*end_at_ms, now);
            let status = tray.and_then(|t| {
                let template = if whole_minutes(ms) == 0 { t.status_less_than_min.as_ref().or(t.status.as_ref()) } else { t.status.as_ref() };
                template.map(|s| fill(s, ms))
            });
            TrayView { title: Some(format_clock(ms)), tooltip: tooltip_of(ms), status }
        }
        Mode::Paused { remaining_ms } => TrayView {
            // U+2016: un glifo de texto, no un emoji (D3).
            title: Some(format!("\u{2016} {}", format_clock(*remaining_ms))),
            tooltip: tooltip_of(*remaining_ms),
            status: tray.and_then(|t| t.status.as_ref()).map(|s| fill(s, *remaining_ms)),
        },
        Mode::Idle => TrayView { title: None, tooltip: "Logday".into(), status: tray.and_then(|t| t.status.clone()) },
        Mode::Off => TrayView { title: None, tooltip: "Logday".into(), status: None },
    }
}

/// Entradas del Pomodoro en el menú de la bandeja (design §4.2), entre
/// "Nueva tarea" y "Salir". Vacío con la extensión apagada.
pub fn tray_items(app: &AppHandle) -> tauri::Result<Vec<MenuItem<Wry>>> {
    let state = app.state::<PomodoroState>();
    let mut inner = state.0.lock().unwrap();
    inner.status_item = None;
    let Some(tray) = inner.tray.clone() else {
        return Ok(Vec::new());
    };
    if matches!(inner.mode, Mode::Off) {
        return Ok(Vec::new());
    }
    let view = tray_view(&inner.mode, Some(&tray), now_ms());
    let mut items = Vec::new();
    if let Some(text) = &view.status {
        let item = MenuItem::with_id(app, MENU_STATUS, text, false, None::<&str>)?;
        inner.status_item = Some(item.clone());
        items.push(item);
    }
    inner.shown_status = view.status;
    items.push(MenuItem::with_id(app, MENU_TOGGLE, &tray.toggle, true, None::<&str>)?);
    if let Some(skip) = &tray.skip {
        items.push(MenuItem::with_id(app, MENU_SKIP, skip, true, None::<&str>)?);
    }
    Ok(items)
}

/// Pone en la bandeja lo que toca ahora, si cambió. Fuera del candado:
/// la bandeja y el menú se tocan en el hilo principal.
fn apply_tray(app: &AppHandle) {
    let (title, tooltip, status, item) = {
        let state = app.state::<PomodoroState>();
        let mut inner = state.0.lock().unwrap();
        let view = tray_view(&inner.mode, inner.tray.as_ref(), now_ms());
        let title = (view.title != inner.shown_title).then(|| view.title.clone());
        let tooltip = (Some(&view.tooltip) != inner.shown_tooltip.as_ref()).then(|| view.tooltip.clone());
        let status = match (&view.status, &inner.shown_status) {
            (Some(next), Some(prev)) if next != prev => Some(next.clone()),
            _ => None,
        };
        inner.shown_title = view.title;
        inner.shown_tooltip = Some(view.tooltip);
        if status.is_some() {
            inner.shown_status = status.clone();
        }
        (title, tooltip, status, inner.status_item.clone())
    };
    let Some(tray) = app.tray_by_id(crate::TRAY_ID) else {
        return;
    };
    if let Some(title) = title {
        // macOS: junto al ícono. Linux: la etiqueta del AppIndicator, que
        // solo algunos escritorios muestran. Windows no tiene título.
        let _ = tray.set_title(title.as_deref());
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(tooltip) = tooltip {
        let _ = tray.set_tooltip(Some(tooltip));
    }
    #[cfg(target_os = "macos")]
    let _ = tooltip;
    if let (Some(text), Some(item)) = (status, item) {
        let _ = item.set_text(text);
    }
}

/// El fin llegó: avisa (si toca) y le pasa el fin al frontend, que arma la
/// fase siguiente. Rust deja de vigilar hasta que llegue el nuevo estado.
fn fire(app: &AppHandle, end_at_ms: i64, key: String, alert: FinishAlert) {
    if alert.notify && should_alert(end_at_ms, now_ms()) {
        let mut builder = app.notification().builder().title(alert.title).body(alert.body);
        if !alert.own_sound {
            builder = builder.sound(default_sound());
        }
        let _ = builder.show();
    }
    let _ = app.emit(EVT_FINISHED, FinishedPayload { key, end_at: end_at_ms });
}

fn default_sound() -> &'static str {
    if cfg!(target_os = "macos") {
        "NSUserNotificationDefaultSoundName"
    } else if cfg!(windows) {
        "Default"
    } else {
        "message-new-instant"
    }
}

fn tick(app: &AppHandle) {
    let finished = {
        let state = app.state::<PomodoroState>();
        let mut inner = state.0.lock().unwrap();
        match &inner.mode {
            Mode::Running { end_at_ms, key, alert } if now_ms() >= *end_at_ms => {
                let done = (*end_at_ms, key.clone(), alert.clone());
                inner.mode = Mode::Idle;
                Some(done)
            }
            _ => None,
        }
    };
    if let Some((end_at_ms, key, alert)) = finished {
        fire(app, end_at_ms, key, alert);
    }
    apply_tray(app);
}

/// El hilo que vigila el fin. Mide contra el reloj del sistema, así que
/// tras una suspensión detecta el fin en el primer segundo (PM4).
pub fn spawn_watcher(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        // Al inicio de cada segundo, para que el título cambie a la vez
        // que el de la vista.
        let ms = now_ms();
        std::thread::sleep(Duration::from_millis((1000 - ms.rem_euclid(1000)) as u64 + 5));
        tick(&app);
    });
}

fn set_state(app: &AppHandle, mode: Mode, tray: TrayTexts) {
    let rebuild = {
        let state = app.state::<PomodoroState>();
        let mut inner = state.0.lock().unwrap();
        // El menú se rearma solo si cambió lo que tiene (entradas o
        // etiquetas); la entrada de estado cambia con `set_text`.
        let changed_shape = match (&inner.tray, &inner.mode) {
            (Some(prev), prev_mode) => {
                prev.toggle != tray.toggle
                    || prev.skip != tray.skip
                    || prev.status.is_some() != tray.status.is_some()
                    || std::mem::discriminant(prev_mode) != std::mem::discriminant(&mode)
            }
            (None, _) => true,
        };
        inner.mode = mode;
        inner.tray = Some(tray);
        changed_shape
    };
    if rebuild {
        crate::refresh_tray(app);
    }
    apply_tray(app);
}

/// Una fase corriendo: el instante de fin (ms desde 1970), su clave
/// (fase + fin, la misma con que el frontend termina una sola vez) y lo
/// que se avisa. Devuelve `true` para que el frontend sepa que el aviso
/// nativo está activo.
#[tauri::command]
pub async fn pomodoro_schedule(
    app: AppHandle,
    end_at: i64,
    key: String,
    alert: FinishAlert,
    tray: TrayTexts,
) -> Result<bool, String> {
    set_state(&app, Mode::Running { end_at_ms: end_at, key, alert }, tray);
    Ok(true)
}

/// En pausa: el tiempo queda fijo (PM11).
#[tauri::command]
pub async fn pomodoro_pause(app: AppHandle, remaining: i64, tray: TrayTexts) -> Result<bool, String> {
    set_state(&app, Mode::Paused { remaining_ms: remaining.max(0) }, tray);
    Ok(true)
}

/// Sin fase en curso (Listo o Terminado): sin título y con el menú que
/// toque ("Iniciar un pomodoro", D2).
#[tauri::command]
pub async fn pomodoro_idle(app: AppHandle, tray: TrayTexts) -> Result<bool, String> {
    set_state(&app, Mode::Idle, tray);
    Ok(true)
}

/// Extensión desactivada (PM13): nada en la bandeja.
#[tauri::command]
pub async fn pomodoro_clear(app: AppHandle) -> Result<(), String> {
    {
        let state = app.state::<PomodoroState>();
        let mut inner = state.0.lock().unwrap();
        inner.mode = Mode::Off;
        inner.tray = None;
    }
    crate::refresh_tray(&app);
    apply_tray(&app);
    Ok(())
}

/// Los clics de "Pausar"/"Reanudar"/"Iniciar" y "Saltar" de la bandeja.
/// No muestran la ventana (design §4.2).
pub fn on_menu(app: &AppHandle, id: &str) {
    let action = match id {
        MENU_TOGGLE => "toggle",
        MENU_SKIP => "skip",
        _ => return,
    };
    let _ = app.emit(EVT_TRAY_ACTION, action);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn texts() -> TrayTexts {
        TrayTexts {
            status: Some("Trabajo · {min} min".into()),
            status_less_than_min: Some("Trabajo · menos de 1 min".into()),
            toggle: "Pausar".into(),
            skip: Some("Saltar".into()),
            tooltip: Some("Logday · Trabajo · {time}".into()),
        }
    }

    fn alert() -> FinishAlert {
        FinishAlert { notify: true, own_sound: true, title: "t".into(), body: "b".into() }
    }

    #[test]
    fn formato_m_ss_en_minutos_totales() {
        assert_eq!(format_clock(25 * 60_000), "25:00");
        assert_eq!(format_clock(299_000), "4:59");
        assert_eq!(format_clock(120 * 60_000), "120:00");
        assert_eq!(format_clock(0), "0:00");
        assert_eq!(format_clock(-5), "0:00");
        // Redondeo hacia arriba: 0,2 s es todavía el último segundo.
        assert_eq!(format_clock(200), "0:01");
        assert_eq!(format_clock(59_001), "1:00");
    }

    #[test]
    fn lo_que_falta_contra_el_reloj() {
        assert_eq!(remaining_ms(10_000, 4_000), 6_000);
        assert_eq!(remaining_ms(10_000, 12_000), 0);
        assert_eq!(whole_minutes(18 * 60_000 + 42_000), 18);
        assert_eq!(whole_minutes(42_000), 0);
    }

    #[test]
    fn rellena_minutos_y_tiempo() {
        assert_eq!(fill("Logday · Trabajo · {time}", 1_122_000), "Logday · Trabajo · 18:42");
        assert_eq!(fill("Trabajo · {min} min", 1_122_000), "Trabajo · 18 min");
    }

    #[test]
    fn avisa_solo_si_el_fin_es_reciente() {
        assert!(should_alert(1_000, 1_500));
        assert!(should_alert(0, STALE_MS - 1));
        assert!(!should_alert(0, STALE_MS));
    }

    #[test]
    fn bandeja_corriendo_en_pausa_y_sin_fase() {
        let t = texts();
        let running = Mode::Running { end_at_ms: 1_122_000, key: "work:1".into(), alert: alert() };
        assert_eq!(
            tray_view(&running, Some(&t), 0),
            TrayView {
                title: Some("18:42".into()),
                tooltip: "Logday · Trabajo · 18:42".into(),
                status: Some("Trabajo · 18 min".into()),
            }
        );
        // Con menos de un minuto, la otra forma.
        assert_eq!(tray_view(&running, Some(&t), 1_122_000 - 30_000).status.as_deref(), Some("Trabajo · menos de 1 min"));
        let paused = Mode::Paused { remaining_ms: 1_122_000 };
        let pt = TrayTexts { status: Some("Trabajo · en pausa · {time}".into()), ..texts() };
        let view = tray_view(&paused, Some(&pt), 999_999);
        assert_eq!(view.title.as_deref(), Some("\u{2016} 18:42"));
        assert_eq!(view.status.as_deref(), Some("Trabajo · en pausa · 18:42"));
        let idle = tray_view(&Mode::Idle, Some(&TrayTexts { status: None, ..texts() }), 0);
        assert_eq!(idle, TrayView { title: None, tooltip: "Logday".into(), status: None });
        assert_eq!(tray_view(&Mode::Off, Some(&t), 0).status, None);
    }
}
