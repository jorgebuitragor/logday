//! Extensión "Google Calendar" (`google-calendar`, specs/google-calendar):
//! los eventos del calendario principal, en solo lectura. El OAuth es el
//! común de `google_oauth.rs`, con su propia conexión.

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use super::google_oauth::{self, http, keychain, CLIENT_SECRET_KEY};
use super::{read_secret, write_secret, SECRET_NOT_FOUND};

pub const EXTENSION_ID: &str = "google-calendar";
/// G2: leer eventos, nada más.
pub const SCOPES: &str = "https://www.googleapis.com/auth/calendar.events.readonly";
const EVENTS_URL: &str = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/// Error para el webview: solo un código y, si Google respondió, su status.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct CalendarError {
    pub code: &'static str,
    pub status: Option<u16>,
}

impl CalendarError {
    fn new(code: &'static str) -> Self {
        Self { code, status: None }
    }
}

/// Status de la API de Calendar → código para el panel.
pub fn calendar_error_code(status: u16) -> &'static str {
    match status {
        403 => "not_allowed",
        429 => "rate_limited",
        _ => "provider_error",
    }
}

/// Solo lo que usa Logday, sin los cancelados (G6). Lo demás del evento
/// (invitados, descripción, ubicación) no sale de Rust.
pub fn slim_events(body: &Value) -> Vec<Value> {
    let Some(items) = body.get("items").and_then(Value::as_array) else {
        return vec![];
    };
    items
        .iter()
        .filter(|e| e.get("status").and_then(Value::as_str) != Some("cancelled"))
        .map(|e| {
            serde_json::json!({
                "id": e.get("id"),
                "summary": e.get("summary"),
                "start": e.get("start"),
                "end": e.get("end"),
                "htmlLink": e.get("htmlLink"),
            })
        })
        .collect()
}

/// Un instante ISO de `toISOString()`; nada más pasa a la URL.
fn valid_instant(s: &str) -> bool {
    !s.is_empty() && s.len() <= 40 && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | ':' | '.' | '+'))
}

#[tauri::command]
pub async fn google_calendar_connect(app: AppHandle, client_id: String) -> Result<String, String> {
    google_oauth::connect(&app, EXTENSION_ID, &client_id, SCOPES).await.map_err(String::from)
}

#[tauri::command]
pub async fn google_calendar_disconnect(app: AppHandle) -> Result<(), String> {
    google_oauth::disconnect(&app, EXTENSION_ID).await.map_err(String::from)
}

/// G1: usa el secreto del cliente que ya tiene Chat del equipo, copiándolo
/// de una entrada del llavero a otra sin pasar por el webview.
#[tauri::command]
pub async fn google_calendar_copy_client(app: AppHandle) -> Result<(), String> {
    keychain(&app, |s| {
        let secret = read_secret(&s, super::team_chat::EXTENSION_ID, CLIENT_SECRET_KEY)
            .map_err(|e| if e == SECRET_NOT_FOUND { "needs_client" } else { e })?;
        write_secret(&s, EXTENSION_ID, CLIENT_SECRET_KEY, &secret)
    })
    .await
    .map_err(String::from)
}

/// G4, G7: los eventos entre `time_min` y `time_max` (instantes ISO).
#[tauri::command]
pub async fn google_calendar_events(
    app: AppHandle,
    client_id: String,
    time_min: String,
    time_max: String,
) -> Result<Vec<Value>, CalendarError> {
    if !valid_instant(&time_min) || !valid_instant(&time_max) {
        return Err(CalendarError::new("invalid_range"));
    }
    let client = http().map_err(CalendarError::new)?;
    let mut token = google_oauth::access_token(&app, EXTENSION_ID, &client_id, false).await.map_err(CalendarError::new)?;
    for attempt in 0..2 {
        let resp = client
            .get(EVENTS_URL)
            .bearer_auth(&token)
            .query(&[
                ("timeMin", time_min.as_str()),
                ("timeMax", time_max.as_str()),
                ("singleEvents", "true"),
                ("orderBy", "startTime"),
                ("maxResults", "250"),
                ("fields", "items(id,status,summary,start,end,htmlLink)"),
            ])
            .send()
            .await
            .map_err(|e| CalendarError::new(if e.is_timeout() { "timeout" } else { "network" }))?;
        let status = resp.status().as_u16();
        if resp.status().is_success() {
            let body: Value = resp.json().await.map_err(|_| CalendarError::new("provider_error"))?;
            return Ok(slim_events(&body));
        }
        // Un 401 es un token vencido o revocado; se renueva una vez.
        if status == 401 && attempt == 0 {
            google_oauth::clear_access(EXTENSION_ID);
            token = google_oauth::access_token(&app, EXTENSION_ID, &client_id, true).await.map_err(CalendarError::new)?;
            continue;
        }
        return Err(CalendarError { code: calendar_error_code(status), status: Some(status) });
    }
    Err(CalendarError::new("needs_reconnect"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solo_pide_leer_eventos() {
        assert_eq!(SCOPES, "https://www.googleapis.com/auth/calendar.events.readonly");
    }

    #[test]
    fn deja_solo_lo_que_usa_logday() {
        let body = serde_json::json!({ "items": [
            { "id": "a", "status": "confirmed", "summary": "Daily", "start": { "dateTime": "2026-10-28T09:00:00-05:00" },
              "end": { "dateTime": "2026-10-28T09:15:00-05:00" }, "htmlLink": "https://www.google.com/calendar/event?eid=a",
              "attendees": [{ "email": "x@fcv.org" }], "description": "privado" },
            { "id": "b", "status": "cancelled", "summary": "Cancelada" },
        ]});
        let events = slim_events(&body);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["summary"], "Daily");
        assert!(events[0].get("attendees").is_none() && events[0].get("description").is_none());
        assert!(slim_events(&serde_json::json!({})).is_empty());
    }

    #[test]
    fn rango_valido() {
        assert!(valid_instant("2026-10-01T05:00:00.000Z"));
        assert!(!valid_instant("2026-10-01&x=1"));
        assert!(!valid_instant(""));
        assert!(valid_instant("2026-10-01T00:00:00-05:00"));
    }

    #[test]
    fn errores_de_la_api() {
        assert_eq!(calendar_error_code(403), "not_allowed");
        assert_eq!(calendar_error_code(429), "rate_limited");
        assert_eq!(calendar_error_code(500), "provider_error");
    }
}
