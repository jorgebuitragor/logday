//! "Chat del equipo" enviando como el usuario, en Google Chat
//! (specs/chat-como-usuario).
//!
//! OAuth de app de escritorio: el navegador del sistema, redirección a
//! 127.0.0.1 con PKCE, y el cliente OAuth de la organización (opción A:
//! cada organización crea el suyo como app interna). El token de
//! renovación vive en el llavero y el de acceso solo en memoria: ninguno
//! llega al webview (C5).

use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use reqwest::Url;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tiny_http::{Header, Response, Server};

use super::team_chat::{limiter, validate_text, SendError, EXTENSION_ID};
use super::{delete_secret, keychain_service, read_secret, write_secret, SECRET_NOT_FOUND};

pub const CLIENT_SECRET_KEY: &str = "google_client_secret";
pub const REFRESH_KEY: &str = "google_refresh";

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const CHAT_API: &str = "https://chat.googleapis.com/v1";
/// C3: crear mensajes, nada más. `openid email` solo para mostrar la cuenta.
const SCOPES: &str = "openid email https://www.googleapis.com/auth/chat.messages.create";
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300); // C4
const HTTP_TIMEOUT: Duration = Duration::from_secs(10);

// ── Piezas puras (con pruebas) ────────────────────────────────────────

fn random_urlsafe(bytes: usize) -> Result<String, &'static str> {
    let mut buf = vec![0u8; bytes];
    getrandom::getrandom(&mut buf).map_err(|_| "token_error")?;
    Ok(URL_SAFE_NO_PAD.encode(buf))
}

/// PKCE S256: base64url(sha256(verifier)).
pub fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

pub fn auth_url(client_id: &str, redirect_uri: &str, challenge: &str, state: &str) -> String {
    Url::parse_with_params(
        AUTH_URL,
        &[
            ("client_id", client_id),
            ("redirect_uri", redirect_uri),
            ("response_type", "code"),
            ("scope", SCOPES),
            ("code_challenge", challenge),
            ("code_challenge_method", "S256"),
            ("state", state),
            // Sin `offline` no hay token de renovación, y sin `consent`
            // Google no lo vuelve a dar si la cuenta ya autorizó antes.
            ("access_type", "offline"),
            ("prompt", "consent"),
        ],
    )
    .expect("URL de autorización válida")
    .to_string()
}

/// La respuesta de Google en la redirección: el código, o por qué no hay.
pub fn parse_callback(path_and_query: &str, expected_state: &str) -> Result<String, &'static str> {
    let url = Url::parse(&format!("http://127.0.0.1{path_and_query}")).map_err(|_| "token_error")?;
    let get = |k: &str| url.query_pairs().find(|(key, _)| key == k).map(|(_, v)| v.into_owned());
    // Se mira el `state` antes que nada: una respuesta que no es la nuestra
    // no dice nada, ni siquiera que se canceló.
    if get("state").as_deref() != Some(expected_state) {
        return Err("state_mismatch");
    }
    if let Some(err) = get("error") {
        return Err(if err == "access_denied" { "cancelled" } else { "token_error" });
    }
    get("code").filter(|c| !c.is_empty()).ok_or("token_error")
}

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

/// La cuenta del `id_token` (C6). No se verifica la firma: llega directo
/// de Google, por TLS, como respuesta a nuestra petición, y solo se usa
/// para mostrar el correo.
pub fn email_from_id_token(id_token: &str) -> Option<String> {
    let payload = id_token.split('.').nth(1)?;
    let bytes = URL_SAFE_NO_PAD.decode(payload.trim_end_matches('=')).ok()?;
    let value: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    value.get("email")?.as_str().map(str::to_string)
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

// ── Tokens ────────────────────────────────────────────────────────────

/// Token de acceso en memoria, con su vencimiento (C5).
fn access_cache() -> &'static Mutex<Option<(String, Instant)>> {
    static CACHE: OnceLock<Mutex<Option<(String, Instant)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn cached_access() -> Option<String> {
    let guard = access_cache().lock().ok()?;
    guard.as_ref().filter(|(_, exp)| Instant::now() < *exp).map(|(t, _)| t.clone())
}

fn cache_access(token: String, expires_in: u64) {
    // Un minuto de margen para no mandar un token a punto de vencer.
    let exp = Instant::now() + Duration::from_secs(expires_in.saturating_sub(60));
    if let Ok(mut g) = access_cache().lock() {
        *g = Some((token, exp));
    }
}

fn clear_access() {
    if let Ok(mut g) = access_cache().lock() {
        *g = None;
    }
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: Option<u64>,
    refresh_token: Option<String>,
    id_token: Option<String>,
}

#[derive(Deserialize)]
struct TokenError {
    error: Option<String>,
}

fn http() -> Result<reqwest::Client, &'static str> {
    reqwest::Client::builder()
        .timeout(HTTP_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "network")
}

async fn keychain<T: Send + 'static>(f: impl FnOnce(String) -> Result<T, &'static str> + Send + 'static, app: &AppHandle) -> Result<T, &'static str> {
    let service = keychain_service(app);
    tauri::async_runtime::spawn_blocking(move || f(service))
        .await
        .map_err(|_| "keychain_error")?
}

async fn client_secret(app: &AppHandle) -> Result<String, &'static str> {
    keychain(|s| read_secret(&s, EXTENSION_ID, CLIENT_SECRET_KEY), app)
        .await
        .map_err(|e| if e == SECRET_NOT_FOUND { "needs_client" } else { e })
}

/// Pide a Google tokens nuevos. `invalid_grant` = el permiso ya no vale.
async fn token_request(params: &[(&str, &str)]) -> Result<TokenResponse, &'static str> {
    let resp = http()?
        .post(TOKEN_URL)
        .form(params)
        .send()
        .await
        .map_err(|e| if e.is_timeout() { "timeout" } else { "network" })?;
    if resp.status().is_success() {
        return resp.json::<TokenResponse>().await.map_err(|_| "token_error");
    }
    let err = resp.json::<TokenError>().await.ok().and_then(|e| e.error);
    Err(if err.as_deref() == Some("invalid_grant") { "needs_reconnect" } else { "token_error" })
}

/// Un token de acceso válido: el de memoria o uno renovado (C11).
async fn access_token(app: &AppHandle, client_id: &str, force_refresh: bool) -> Result<String, &'static str> {
    if !force_refresh {
        if let Some(t) = cached_access() {
            return Ok(t);
        }
    }
    let refresh = keychain(|s| read_secret(&s, EXTENSION_ID, REFRESH_KEY), app)
        .await
        .map_err(|e| if e == SECRET_NOT_FOUND { "needs_reconnect" } else { e })?;
    let secret = client_secret(app).await?;
    let tokens = token_request(&[
        ("grant_type", "refresh_token"),
        ("client_id", client_id),
        ("client_secret", &secret),
        ("refresh_token", &refresh),
    ])
    .await?;
    cache_access(tokens.access_token.clone(), tokens.expires_in.unwrap_or(3600));
    Ok(tokens.access_token)
}

// ── Comandos ──────────────────────────────────────────────────────────

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Logday</title>\
<body style=\"font-family:system-ui;text-align:center;padding:3em\">\
<h2>Listo / Done</h2><p>Ya puedes volver a Logday. / You can go back to Logday.</p></body>";

/// C3, C4: abre el navegador, espera la redirección y guarda el token de
/// renovación. Devuelve la cuenta conectada (su correo).
#[tauri::command]
pub async fn team_chat_google_connect(app: AppHandle, client_id: String) -> Result<String, String> {
    let client_id = client_id.trim().to_string();
    if client_id.is_empty() {
        return Err("needs_client".into());
    }
    let secret = client_secret(&app).await?;
    let verifier = random_urlsafe(48)?;
    let state = random_urlsafe(24)?;

    // Un puerto libre, solo mientras dura el inicio de sesión.
    let server = Server::http("127.0.0.1:0").map_err(|_| "server_error")?;
    let port = server.server_addr().to_ip().map(|a| a.port()).ok_or("server_error")?;
    let redirect_uri = format!("http://127.0.0.1:{port}");
    let url = auth_url(&client_id, &redirect_uri, &pkce_challenge(&verifier), &state);
    // El opener del plugin, no `open_url`: en Windows, `cmd /c start`
    // partiría la URL en cada `&`.
    app.opener().open_url(url, None::<&str>).map_err(|_| "browser_error")?;

    let expected = state.clone();
    let code = tauri::async_runtime::spawn_blocking(move || -> Result<String, &'static str> {
        let deadline = Instant::now() + LOGIN_TIMEOUT;
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            let req = match server.recv_timeout(left) {
                Ok(Some(r)) => r,
                Ok(None) => return Err("timeout"),
                Err(_) => return Err("server_error"),
            };
            let path = req.url().to_string();
            // El navegador puede pedir otras cosas (favicon): solo cuenta la
            // redirección con `state`.
            if !path.contains("state=") {
                let _ = req.respond(Response::empty(404));
                continue;
            }
            let result = parse_callback(&path, &expected);
            let html = Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).expect("cabecera");
            let _ = req.respond(Response::from_string(DONE_PAGE).with_header(html));
            return result;
        }
    })
    .await
    .map_err(|_| "server_error")??;

    let tokens = token_request(&[
        ("grant_type", "authorization_code"),
        ("code", &code),
        ("client_id", &client_id),
        ("client_secret", &secret),
        ("redirect_uri", &redirect_uri),
        ("code_verifier", &verifier),
    ])
    .await?;
    let refresh = tokens.refresh_token.clone().ok_or("token_error")?;
    keychain(move |s| write_secret(&s, EXTENSION_ID, REFRESH_KEY, &refresh), &app).await?;
    cache_access(tokens.access_token, tokens.expires_in.unwrap_or(3600));
    Ok(tokens.id_token.as_deref().and_then(email_from_id_token).unwrap_or_default())
}

/// C6: revoca el permiso en Google (si se puede) y borra el token.
#[tauri::command]
pub async fn team_chat_google_disconnect(app: AppHandle) -> Result<(), String> {
    clear_access();
    if let Ok(refresh) = keychain(|s| read_secret(&s, EXTENSION_ID, REFRESH_KEY), &app).await {
        // Sin red, igual se borra aquí: el permiso queda en Google hasta
        // que el usuario lo quite desde su cuenta.
        if let Ok(client) = http() {
            let _ = client.post(REVOKE_URL).form(&[("token", refresh.as_str())]).send().await;
        }
    }
    keychain(|s| delete_secret(&s, EXTENSION_ID, REFRESH_KEY), &app).await.map_err(String::from)
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
    let mut token = access_token(&app, &client_id, false).await.map_err(err)?;
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
            clear_access();
            token = access_token(&app, &client_id, true).await.map_err(err)?;
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
    fn pkce_s256_como_el_rfc() {
        // RFC 7636, apéndice B.
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn url_de_autorizacion() {
        let url = Url::parse(&auth_url("cid.apps.googleusercontent.com", "http://127.0.0.1:5555", "ch", "st")).unwrap();
        assert_eq!(url.host_str(), Some("accounts.google.com"));
        let q: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(q["client_id"], "cid.apps.googleusercontent.com");
        assert_eq!(q["redirect_uri"], "http://127.0.0.1:5555");
        assert_eq!(q["code_challenge_method"], "S256");
        assert_eq!(q["state"], "st");
        assert_eq!(q["access_type"], "offline");
        assert!(q["scope"].contains("https://www.googleapis.com/auth/chat.messages.create"));
        // Nada de permisos de lectura.
        assert!(!q["scope"].contains("readonly") && !q["scope"].contains("chat.messages "));
    }

    #[test]
    fn respuesta_de_la_redireccion() {
        assert_eq!(parse_callback("/?state=st&code=abc", "st"), Ok("abc".into()));
        assert_eq!(parse_callback("/?state=otro&code=abc", "st"), Err("state_mismatch"));
        assert_eq!(parse_callback("/?code=abc", "st"), Err("state_mismatch"));
        assert_eq!(parse_callback("/?state=st&error=access_denied", "st"), Err("cancelled"));
        assert_eq!(parse_callback("/?state=st&error=server_error", "st"), Err("token_error"));
        assert_eq!(parse_callback("/?state=st", "st"), Err("token_error"));
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
    fn correo_del_id_token() {
        let payload = URL_SAFE_NO_PAD.encode(br#"{"email":"jorge@fcv.org","sub":"1"}"#);
        assert_eq!(email_from_id_token(&format!("h.{payload}.s")), Some("jorge@fcv.org".into()));
        assert_eq!(email_from_id_token("no-es-un-jwt"), None);
    }

    #[test]
    fn errores_de_la_api() {
        assert_eq!(chat_error_code(403), "not_allowed");
        assert_eq!(chat_error_code(404), "space_not_found");
        assert_eq!(chat_error_code(429), "rate_limited");
        assert_eq!(chat_error_code(500), "provider_error");
    }
}
