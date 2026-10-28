//! "Chat del equipo" enviando como el usuario, en Google Chat
//! (specs/chat-como-usuario). El OAuth (navegador, PKCE, tokens) es el
//! común de `google_oauth.rs`; aquí queda lo propio del chat: el enlace
//! del espacio y el envío.

use std::time::Instant;

use reqwest::Url;
use tauri::AppHandle;

use super::google_oauth::{self, http};
use super::team_chat::{limiter, validate_text, SendError, EXTENSION_ID};

const CHAT_API: &str = "https://chat.googleapis.com/v1";
/// C3: crear mensajes, nada más.
pub const SCOPES: &str = "https://www.googleapis.com/auth/chat.messages.create";

// ── Piezas puras (con pruebas) ────────────────────────────────────────

fn is_space_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// C8: el enlace del espacio tal como se ve en el navegador → `spaces/<id>`.
pub fn parse_space_link(raw: &str) -> Result<String, &'static str> {
    const ERR: &str = "invalid_space";
    let url = Url::parse(raw.trim()).map_err(|_| ERR)?;
    if url.scheme() != "https" {
        return Err(ERR);
    }
    let host = url.host_str().unwrap_or("").to_ascii_lowercase();
    let id = match host.as_str() {
        // https://chat.google.com/room/<id> o /u/<n>/room/<id>
        "chat.google.com" => {
            let segs: Vec<&str> = url.path_segments().map(|s| s.filter(|x| !x.is_empty()).collect()).unwrap_or_default();
            match segs.as_slice() {
                ["room", id] => *id,
                ["u", n, "room", id] if n.chars().all(|c| c.is_ascii_digit()) => *id,
                _ => return Err(ERR),
            }
        }
        // https://mail.google.com/chat/u/<n>/#chat/space/<id>
        "mail.google.com" => {
            if !url.path().starts_with("/chat") {
                return Err(ERR);
            }
            url.fragment().and_then(|f| f.strip_prefix("chat/space/")).ok_or(ERR)?
        }
        _ => return Err(ERR),
    };
    if !is_space_id(id) {
        return Err(ERR);
    }
    Ok(format!("spaces/{id}"))
}

fn valid_space(space: &str) -> bool {
    space.strip_prefix("spaces/").is_some_and(is_space_id)
}

/// C12: el status de la API de Chat → código para el panel.
pub fn chat_error_code(status: u16) -> &'static str {
    match status {
        403 => "not_allowed",
        404 => "space_not_found",
        429 => "rate_limited",
        _ => "provider_error",
    }
}

// ── Comandos ──────────────────────────────────────────────────────────

/// C3, C4: abre el navegador, espera la redirección y guarda el token de
/// renovación. Devuelve la cuenta conectada (su correo).
#[tauri::command]
pub async fn team_chat_google_connect(app: AppHandle, client_id: String) -> Result<String, String> {
    google_oauth::connect(&app, EXTENSION_ID, &client_id, SCOPES).await.map_err(String::from)
}

/// C6: revoca el permiso en Google (si se puede) y borra el token.
#[tauri::command]
pub async fn team_chat_google_disconnect(app: AppHandle) -> Result<(), String> {
    google_oauth::disconnect(&app, EXTENSION_ID).await.map_err(String::from)
}

/// C8 en Rust, para que el panel valide el enlace igual que el envío.
#[tauri::command]
pub fn team_chat_google_parse_space(link: String) -> Result<String, String> {
    parse_space_link(&link).map_err(String::from)
}

/// C9–C12: publica `text` en `space` como el usuario conectado.
#[tauri::command]
pub async fn team_chat_google_send(app: AppHandle, client_id: String, space: String, text: String) -> Result<(), SendError> {
    let err = |code: &'static str| SendError { code, status: None };
    validate_text(&text).map_err(err)?;
    if !valid_space(&space) {
        return Err(err("needs_reconfig"));
    }
    if !limiter().lock().map(|mut l| l.try_acquire(Instant::now())).unwrap_or(false) {
        return Err(err("rate_limited"));
    }
    let url = format!("{CHAT_API}/{space}/messages");
    let client = http().map_err(err)?;
    let mut token = google_oauth::access_token(&app, EXTENSION_ID, &client_id, false).await.map_err(err)?;
    for attempt in 0..2 {
        let resp = client
            .post(&url)
            .bearer_auth(&token)
            .json(&serde_json::json!({ "text": text }))
            .send()
            .await
            .map_err(|e| err(if e.is_timeout() { "timeout" } else { "network" }))?;
        let status = resp.status().as_u16();
        if resp.status().is_success() {
            return Ok(());
        }
        // C11: un 401 es un token vencido o revocado; se renueva una vez.
        if status == 401 && attempt == 0 {
            google_oauth::clear_access(EXTENSION_ID);
            token = google_oauth::access_token(&app, EXTENSION_ID, &client_id, true).await.map_err(err)?;
            continue;
        }
        return Err(SendError { code: chat_error_code(status), status: Some(status) });
    }
    Err(err("needs_reconnect"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solo_pide_crear_mensajes() {
        assert_eq!(SCOPES, "https://www.googleapis.com/auth/chat.messages.create");
    }

    #[test]
    fn enlaces_de_espacio() {
        for (link, space) in [
            ("https://chat.google.com/room/AAAAbc123", "spaces/AAAAbc123"),
            ("https://chat.google.com/u/1/room/AAAA_b-c?cls=7", "spaces/AAAA_b-c"),
            ("https://mail.google.com/chat/u/0/#chat/space/AAAAxyz", "spaces/AAAAxyz"),
            ("  https://CHAT.google.com/room/AAAA  ", "spaces/AAAA"),
        ] {
            assert_eq!(parse_space_link(link), Ok(space.to_string()), "{link}");
        }
        for link in [
            "",
            "AAAA",
            "http://chat.google.com/room/AAAA",
            "https://chat.google.com/",
            "https://chat.google.com/dm/AAAA",
            "https://chat.google.com/room/AA/AA",
            "https://chat.google.com.evil.com/room/AAAA",
            "https://mail.google.com/mail/u/0/#inbox",
            "https://mail.google.com/chat/u/0/#chat/dm/AAAA",
            "https://chat.google.com/room/AA%2FBB",
            "https://chat.googleapis.com/v1/spaces/AAAA/messages?key=k",
        ] {
            assert_eq!(parse_space_link(link), Err("invalid_space"), "{link}");
        }
    }

    #[test]
    fn espacio_guardado_valido() {
        assert!(valid_space("spaces/AAAA_1-b"));
        assert!(!valid_space("spaces/"));
        assert!(!valid_space("AAAA"));
        assert!(!valid_space("spaces/AA/messages"));
    }

    #[test]
    fn errores_de_la_api() {
        assert_eq!(chat_error_code(403), "not_allowed");
        assert_eq!(chat_error_code(404), "space_not_found");
        assert_eq!(chat_error_code(429), "rate_limited");
        assert_eq!(chat_error_code(500), "provider_error");
    }
}
