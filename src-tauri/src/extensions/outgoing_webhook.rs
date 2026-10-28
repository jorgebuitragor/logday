//! Extensión "Webhook saliente" (`outgoing-webhook`, specs/webhook-saliente):
//! Logday avisa a una URL del usuario (n8n, Zapier, un script…). La URL y
//! el secreto viven en el llavero y no salen de Rust; el webview arma el
//! cuerpo y Rust lo firma y lo envía.

use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use reqwest::Url;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::AppHandle;

use super::google_oauth::keychain;
use super::team_chat::RateLimiter;
use super::{read_secret, SECRET_NOT_FOUND};

pub const EXTENSION_ID: &str = "outgoing-webhook";
pub const URL_KEY: &str = "url";
pub const SECRET_KEY: &str = "secret";
const MAX_SENDS_PER_HOUR: usize = 60; // W9
const SEND_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_BODY: usize = 256 * 1024;

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SendError {
    pub code: &'static str,
    pub status: Option<u16>,
}

impl SendError {
    fn new(code: &'static str) -> Self {
        Self { code, status: None }
    }
}

/// W1: `https` con cualquier host, o `http` solo en el mismo equipo.
pub fn validate_url(raw: &str) -> Result<Url, &'static str> {
    let url = Url::parse(raw.trim()).map_err(|_| "invalid_url")?;
    // Credenciales en la URL: confunden al leerla y no las usa n8n.
    if !url.username().is_empty() || url.password().is_some() {
        return Err("invalid_url");
    }
    let host = url.host_str().ok_or("invalid_url")?.to_ascii_lowercase();
    match url.scheme() {
        "https" => Ok(url),
        "http" if host == "localhost" || host == "127.0.0.1" || host == "[::1]" => Ok(url),
        "http" => Err("not_https"),
        _ => Err("invalid_url"),
    }
}

/// HMAC-SHA256 (RFC 2104) con `sha2`, para no sumar otra dependencia.
pub fn hmac_sha256(key: &[u8], msg: &[u8]) -> [u8; 32] {
    const BLOCK: usize = 64;
    let mut k = [0u8; BLOCK];
    if key.len() > BLOCK {
        k[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        k[..key.len()].copy_from_slice(key);
    }
    let mut ipad = [0x36u8; BLOCK];
    let mut opad = [0x5cu8; BLOCK];
    for i in 0..BLOCK {
        ipad[i] ^= k[i];
        opad[i] ^= k[i];
    }
    let inner = Sha256::new().chain_update(ipad).chain_update(msg).finalize();
    Sha256::new().chain_update(opad).chain_update(inner).finalize().into()
}

/// W3: `sha256=<hex>`, como lo esperan los ejemplos de n8n y GitHub.
pub fn signature(secret: &str, body: &str) -> String {
    let mac = hmac_sha256(secret.as_bytes(), body.as_bytes());
    format!("sha256={}", mac.iter().map(|b| format!("{b:02x}")).collect::<String>())
}

fn limiter() -> &'static Mutex<RateLimiter> {
    static LIMITER: OnceLock<Mutex<RateLimiter>> = OnceLock::new();
    LIMITER.get_or_init(|| Mutex::new(RateLimiter::new(MAX_SENDS_PER_HOUR, Duration::from_secs(3600))))
}

#[tauri::command]
pub fn outgoing_webhook_validate_url(url: String) -> Result<(), String> {
    validate_url(&url).map(|_| ()).map_err(String::from)
}

/// W9: envía `body` (JSON ya armado por el webview) a la URL del llavero.
#[tauri::command]
pub async fn outgoing_webhook_send(app: AppHandle, body: String) -> Result<(), SendError> {
    if body.len() > MAX_BODY || serde_json::from_str::<serde_json::Value>(&body).is_err() {
        return Err(SendError::new("invalid_body"));
    }
    let raw = keychain(&app, |s| read_secret(&s, EXTENSION_ID, URL_KEY))
        .await
        .map_err(|e| SendError::new(if e == SECRET_NOT_FOUND { "needs_reconfig" } else { "keychain_error" }))?;
    let url = validate_url(&raw).map_err(|_| SendError::new("needs_reconfig"))?;
    // El secreto es opcional: sin él, el envío va sin firma.
    let secret = match keychain(&app, |s| read_secret(&s, EXTENSION_ID, SECRET_KEY)).await {
        Ok(s) => Some(s),
        Err(e) if e == SECRET_NOT_FOUND => None,
        Err(_) => return Err(SendError::new("keychain_error")),
    };
    if !limiter().lock().map(|mut l| l.try_acquire(Instant::now())).unwrap_or(false) {
        return Err(SendError::new("rate_limited"));
    }
    let client = reqwest::Client::builder()
        .timeout(SEND_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Logday")
        .build()
        .map_err(|_| SendError::new("network"))?;
    let mut req = client.post(url).header("Content-Type", "application/json");
    if let Some(secret) = secret.filter(|s| !s.is_empty()) {
        req = req.header("X-Logday-Signature", signature(&secret, &body));
    }
    // Los errores de reqwest llevan la URL en su texto: se reducen a un código.
    let resp = req
        .body(body)
        .send()
        .await
        .map_err(|e| SendError::new(if e.is_timeout() { "timeout" } else { "network" }))?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(SendError { code: "provider_error", status: Some(resp.status().as_u16()) })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hmac_como_el_rfc_4231() {
        // Caso 2: clave "Jefe".
        let mac = hmac_sha256(b"Jefe", b"what do ya want for nothing?");
        let hex: String = mac.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
        // Caso 6: clave más larga que el bloque.
        let mac = hmac_sha256(&[0xaa; 131], b"Test Using Larger Than Block-Size Key - Hash Key First");
        let hex: String = mac.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54");
    }

    #[test]
    fn firma_con_prefijo() {
        assert!(signature("s", "{}").starts_with("sha256="));
        assert_eq!(signature("s", "{}").len(), "sha256=".len() + 64);
    }

    #[test]
    fn urls() {
        for ok in ["https://n8n.example.com/webhook/abc", "http://localhost:5678/webhook/x", "http://127.0.0.1:5678/webhook-test/x"] {
            assert!(validate_url(ok).is_ok(), "{ok}");
        }
        assert_eq!(validate_url("http://n8n.lan/webhook/x").unwrap_err(), "not_https");
        assert_eq!(validate_url("http://192.168.1.10/webhook").unwrap_err(), "not_https");
        assert_eq!(validate_url("ftp://n8n.example.com").unwrap_err(), "invalid_url");
        assert_eq!(validate_url("https://u:p@n8n.example.com/x").unwrap_err(), "invalid_url");
        assert_eq!(validate_url("no es url").unwrap_err(), "invalid_url");
    }
}
