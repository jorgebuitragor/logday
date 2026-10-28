//! Inicio de sesión OAuth de app de escritorio, común a Google
//! (`google_oauth.rs`) y Granola (`granola.rs`): un puerto libre en
//! 127.0.0.1 solo mientras dura el login, PKCE S256, `state`, el
//! navegador del sistema y 5 minutos de plazo.
//!
//! En dos pasos, porque Granola necesita la `redirect_uri` para registrar
//! el cliente antes de armar la URL de autorización:
//! `LoopbackLogin::start()` abre el puerto, y `run(app, url)` abre el
//! navegador y espera el código.

use std::time::{Duration, Instant};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use reqwest::Url;
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tiny_http::{Header, Response, Server};

const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Logday</title>\
<body style=\"font-family:system-ui;text-align:center;padding:3em\">\
<h2>Listo / Done</h2><p>Ya puedes volver a Logday. / You can go back to Logday.</p></body>";

pub fn random_urlsafe(bytes: usize) -> Result<String, &'static str> {
    let mut buf = vec![0u8; bytes];
    getrandom::getrandom(&mut buf).map_err(|_| "token_error")?;
    Ok(URL_SAFE_NO_PAD.encode(buf))
}

/// PKCE S256: base64url(sha256(verifier)).
pub fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// La respuesta en la redirección: el código, o por qué no hay.
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

pub struct LoopbackLogin {
    server: Server,
    pub redirect_uri: String,
    pub verifier: String,
    pub challenge: String,
    pub state: String,
}

impl LoopbackLogin {
    /// Abre un puerto libre en 127.0.0.1 y prepara PKCE y `state`.
    pub fn start() -> Result<Self, &'static str> {
        let server = Server::http("127.0.0.1:0").map_err(|_| "server_error")?;
        let port = server.server_addr().to_ip().map(|a| a.port()).ok_or("server_error")?;
        let verifier = random_urlsafe(48)?;
        Ok(Self {
            server,
            redirect_uri: format!("http://127.0.0.1:{port}"),
            challenge: pkce_challenge(&verifier),
            verifier,
            state: random_urlsafe(24)?,
        })
    }

    /// Abre `url` en el navegador y espera la redirección con el código.
    pub async fn run(self, app: &AppHandle, url: String) -> Result<String, &'static str> {
        // El opener del plugin, no `open_url`: en Windows, `cmd /c start`
        // partiría la URL en cada `&`.
        app.opener().open_url(url, None::<&str>).map_err(|_| "browser_error")?;
        let Self { server, state, .. } = self;
        tauri::async_runtime::spawn_blocking(move || -> Result<String, &'static str> {
            let deadline = Instant::now() + LOGIN_TIMEOUT;
            loop {
                let left = deadline.saturating_duration_since(Instant::now());
                let req = match server.recv_timeout(left) {
                    Ok(Some(r)) => r,
                    Ok(None) => return Err("timeout"),
                    Err(_) => return Err("server_error"),
                };
                let path = req.url().to_string();
                // El navegador puede pedir otras cosas (favicon): solo cuenta
                // la redirección con `state`.
                if !path.contains("state=") {
                    let _ = req.respond(Response::empty(404));
                    continue;
                }
                let result = parse_callback(&path, &state);
                let html = Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).expect("cabecera");
                let _ = req.respond(Response::from_string(DONE_PAGE).with_header(html));
                return result;
            }
        })
        .await
        .map_err(|_| "server_error")?
    }
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
    fn respuesta_de_la_redireccion() {
        assert_eq!(parse_callback("/?state=st&code=abc", "st"), Ok("abc".into()));
        assert_eq!(parse_callback("/?state=otro&code=abc", "st"), Err("state_mismatch"));
        assert_eq!(parse_callback("/?code=abc", "st"), Err("state_mismatch"));
        assert_eq!(parse_callback("/?state=st&error=access_denied", "st"), Err("cancelled"));
        assert_eq!(parse_callback("/?state=st&error=server_error", "st"), Err("token_error"));
        assert_eq!(parse_callback("/?state=st", "st"), Err("token_error"));
    }

    #[test]
    fn login_abre_un_puerto_local() {
        let login = LoopbackLogin::start().unwrap();
        assert!(login.redirect_uri.starts_with("http://127.0.0.1:"));
        assert_eq!(login.challenge, pkce_challenge(&login.verifier));
        assert_ne!(login.state, login.verifier);
    }
}
