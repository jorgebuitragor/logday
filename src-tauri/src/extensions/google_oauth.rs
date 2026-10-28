//! OAuth con Google para las extensiones que actúan con la cuenta del
//! usuario: "como yo" en Chat del equipo (specs/chat-como-usuario) y
//! Google Calendar (specs/google-calendar).
//!
//! App de escritorio: navegador del sistema, redirección a 127.0.0.1 con
//! PKCE, y el cliente OAuth de la organización (opción A). Cada extensión
//! tiene su propia conexión: su token de renovación en el llavero
//! (`ext:<ext>:google_refresh`) y su token de acceso en memoria. Ninguno
//! llega al webview.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use reqwest::Url;
use serde::Deserialize;
use tauri::AppHandle;

use super::oauth_loopback::LoopbackLogin;
use super::{delete_secret, keychain_service, read_secret, write_secret, SECRET_NOT_FOUND};

pub const CLIENT_SECRET_KEY: &str = "google_client_secret";
pub const REFRESH_KEY: &str = "google_refresh";

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const HTTP_TIMEOUT: Duration = Duration::from_secs(10);

// ── Piezas puras (con pruebas) ────────────────────────────────────────

/// `scopes`: los permisos propios de la extensión; siempre se suman
/// `openid email`, solo para mostrar la cuenta.
pub fn auth_url(client_id: &str, redirect_uri: &str, challenge: &str, state: &str, scopes: &str) -> String {
    let scope = format!("openid email {scopes}");
    Url::parse_with_params(
        AUTH_URL,
        &[
            ("client_id", client_id),
            ("redirect_uri", redirect_uri),
            ("response_type", "code"),
            ("scope", scope.as_str()),
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

/// La cuenta del `id_token`. No se verifica la firma: llega directo de
/// Google, por TLS, como respuesta a nuestra petición, y solo se usa para
/// mostrar el correo.
pub fn email_from_id_token(id_token: &str) -> Option<String> {
    let payload = id_token.split('.').nth(1)?;
    let bytes = URL_SAFE_NO_PAD.decode(payload.trim_end_matches('=')).ok()?;
    let value: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    value.get("email")?.as_str().map(str::to_string)
}

// ── Tokens de acceso en memoria, uno por extensión ────────────────────

fn access_cache() -> &'static Mutex<HashMap<String, (String, Instant)>> {
    static CACHE: OnceLock<Mutex<HashMap<String, (String, Instant)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cached_access(ext: &str) -> Option<String> {
    let guard = access_cache().lock().ok()?;
    guard.get(ext).filter(|(_, exp)| Instant::now() < *exp).map(|(t, _)| t.clone())
}

fn cache_access(ext: &str, token: String, expires_in: u64) {
    // Un minuto de margen para no mandar un token a punto de vencer.
    let exp = Instant::now() + Duration::from_secs(expires_in.saturating_sub(60));
    if let Ok(mut g) = access_cache().lock() {
        g.insert(ext.to_string(), (token, exp));
    }
}

pub fn clear_access(ext: &str) {
    if let Ok(mut g) = access_cache().lock() {
        g.remove(ext);
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

pub fn http() -> Result<reqwest::Client, &'static str> {
    reqwest::Client::builder()
        .timeout(HTTP_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "network")
}

/// El llavero puede bloquear (en macOS, a veces pide permiso).
pub async fn keychain<T: Send + 'static>(
    app: &AppHandle,
    f: impl FnOnce(String) -> Result<T, &'static str> + Send + 'static,
) -> Result<T, &'static str> {
    let service = keychain_service(app);
    tauri::async_runtime::spawn_blocking(move || f(service))
        .await
        .map_err(|_| "keychain_error")?
}

async fn client_secret(app: &AppHandle, ext: &'static str) -> Result<String, &'static str> {
    keychain(app, move |s| read_secret(&s, ext, CLIENT_SECRET_KEY))
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

/// Un token de acceso válido para `ext`: el de memoria o uno renovado.
pub async fn access_token(app: &AppHandle, ext: &'static str, client_id: &str, force_refresh: bool) -> Result<String, &'static str> {
    if !force_refresh {
        if let Some(t) = cached_access(ext) {
            return Ok(t);
        }
    }
    let refresh = keychain(app, move |s| read_secret(&s, ext, REFRESH_KEY))
        .await
        .map_err(|e| if e == SECRET_NOT_FOUND { "needs_reconnect" } else { e })?;
    let secret = client_secret(app, ext).await?;
    let tokens = token_request(&[
        ("grant_type", "refresh_token"),
        ("client_id", client_id),
        ("client_secret", &secret),
        ("refresh_token", &refresh),
    ])
    .await?;
    cache_access(ext, tokens.access_token.clone(), tokens.expires_in.unwrap_or(3600));
    Ok(tokens.access_token)
}

/// Abre el navegador, espera la redirección y guarda el token de
/// renovación de `ext`. Devuelve la cuenta conectada (su correo).
pub async fn connect(app: &AppHandle, ext: &'static str, client_id: &str, scopes: &str) -> Result<String, &'static str> {
    let client_id = client_id.trim().to_string();
    if client_id.is_empty() {
        return Err("needs_client");
    }
    let secret = client_secret(app, ext).await?;
    let login = LoopbackLogin::start()?;
    let url = auth_url(&client_id, &login.redirect_uri, &login.challenge, &login.state, scopes);
    let redirect_uri = login.redirect_uri.clone();
    let verifier = login.verifier.clone();
    let code = login.run(app, url).await?;

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
    keychain(app, move |s| write_secret(&s, ext, REFRESH_KEY, &refresh)).await?;
    cache_access(ext, tokens.access_token, tokens.expires_in.unwrap_or(3600));
    Ok(tokens.id_token.as_deref().and_then(email_from_id_token).unwrap_or_default())
}

/// Revoca el permiso de `ext` en Google (si se puede) y borra su token.
pub async fn disconnect(app: &AppHandle, ext: &'static str) -> Result<(), &'static str> {
    clear_access(ext);
    if let Ok(refresh) = keychain(app, move |s| read_secret(&s, ext, REFRESH_KEY)).await {
        // Sin red, igual se borra aquí: el permiso queda en Google hasta
        // que el usuario lo quite desde su cuenta.
        if let Ok(client) = http() {
            let _ = client.post(REVOKE_URL).form(&[("token", refresh.as_str())]).send().await;
        }
    }
    keychain(app, move |s| delete_secret(&s, ext, REFRESH_KEY)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_de_autorizacion() {
        let url = Url::parse(&auth_url("cid", "http://127.0.0.1:5555", "ch", "st", "https://example/scope.x")).unwrap();
        assert_eq!(url.host_str(), Some("accounts.google.com"));
        let q: HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(q["client_id"], "cid");
        assert_eq!(q["redirect_uri"], "http://127.0.0.1:5555");
        assert_eq!(q["code_challenge_method"], "S256");
        assert_eq!(q["state"], "st");
        assert_eq!(q["access_type"], "offline");
        assert_eq!(q["scope"], "openid email https://example/scope.x");
    }

    #[test]
    fn correo_del_id_token() {
        let payload = URL_SAFE_NO_PAD.encode(br#"{"email":"jorge@fcv.org","sub":"1"}"#);
        assert_eq!(email_from_id_token(&format!("h.{payload}.s")), Some("jorge@fcv.org".into()));
        assert_eq!(email_from_id_token("no-es-un-jwt"), None);
    }

    #[test]
    fn tokens_separados_por_extension() {
        cache_access("a-test", "ta".into(), 3600);
        cache_access("b-test", "tb".into(), 3600);
        assert_eq!(cached_access("a-test").as_deref(), Some("ta"));
        clear_access("a-test");
        assert_eq!(cached_access("a-test"), None);
        assert_eq!(cached_access("b-test").as_deref(), Some("tb"));
    }
}
