//! Extensión "Cliente HTTP" (`http-client`, specs/cliente-http, design A7):
//! envía las peticiones que el usuario escribe en sus notas. Salen de
//! Rust (CORS y R17) y solo cuando el usuario pulsa Enviar (HT3).
//!
//! El webview manda la petición con las variables ya puestas, salvo los
//! secretos, que llegan como la marca `{{$secret:<clave>}}`: aquí se leen
//! del llavero y se ponen, y vuelven a enmascararse en lo que se devuelve.
//! Los errores llevan solo un código y el host (HT26): el `Display` de
//! reqwest trae la URL, así que nunca se reenvía. No escribe en los logs.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use base64::Engine;
use reqwest::header::{HeaderName, HeaderValue};
use reqwest::{Method, Url};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::google_oauth::keychain;
use super::{read_secret, secret_account, SECRET_NOT_FOUND};

pub const EXTENSION_ID: &str = "http-client";
const MAX_REQUEST_BODY: usize = 10 * 1024 * 1024;
const MAX_REDIRECTS: usize = 10;
const MAX_IN_FLIGHT: usize = 6;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
// Se ajustan al rango, no se rechazan (HT24).
const TIMEOUT_MS: (u64, u64) = (1_000, 300_000);
const MAX_RESPONSE: (u64, u64) = (1024 * 1024, 50 * 1024 * 1024);
const MARKER_OPEN: &str = "{{$secret:";
const MARKER_CLOSE: &str = "}}";

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SendInput {
    /// UUID del webview, para cancelar.
    pub request_id: String,
    pub method: String,
    /// Con las variables puestas y los secretos como `{{$secret:<clave>}}`.
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
    pub timeout_ms: u64,
    pub max_response_bytes: u64,
    pub follow_redirects: bool,
    pub insecure_tls: bool,
    /// HT21: los hosts a los que un secreto puede ir sin preguntar.
    pub trusted_hosts: Vec<String>,
    /// El usuario confirmó enviar un secreto a un host ajeno.
    pub allow_untrusted_host: bool,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RedirectHop {
    pub status: u16,
    pub location: String,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Body {
    Empty,
    Text { text: String, lossy: bool },
    Binary { base64: String },
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SendOutput {
    pub status: u16,
    pub reason: String,
    /// En el orden recibido, repetidas incluidas.
    pub headers: Vec<(String, String)>,
    pub body: Body,
    pub body_bytes: u64,
    pub content_length: Option<u64>,
    pub truncated: bool,
    pub elapsed_ms: u64,
    /// Con los secretos otra vez como marca.
    pub final_url: String,
    pub redirects: Vec<RedirectHop>,
    pub tls_unverified: bool,
    /// Content-Length o Transfer-Encoding del usuario, y las sensibles
    /// quitadas al redirigir a otro origen.
    pub dropped_headers: Vec<String>,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SendError {
    pub code: &'static str,
    /// El único detalle que sale; nunca la URL completa.
    pub host: Option<String>,
    /// La clave (`v_…`), nunca el valor.
    pub secret_key: Option<String>,
    pub tls_reason: Option<&'static str>,
}

impl SendError {
    fn new(code: &'static str) -> Self {
        Self { code, host: None, secret_key: None, tls_reason: None }
    }
    fn with_host(code: &'static str, host: Option<String>) -> Self {
        Self { code, host, secret_key: None, tls_reason: None }
    }
}

// ---------- Lógica pura ----------

pub fn clamp_timeout(ms: u64) -> Duration {
    Duration::from_millis(ms.clamp(TIMEOUT_MS.0, TIMEOUT_MS.1))
}

pub fn clamp_max_response(bytes: u64) -> u64 {
    bytes.clamp(MAX_RESPONSE.0, MAX_RESPONSE.1)
}

pub fn parse_method(raw: &str) -> Result<Method, SendError> {
    match raw {
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" => {
            Method::from_bytes(raw.as_bytes()).map_err(|_| SendError::new("invalid_method"))
        }
        _ => Err(SendError::new("invalid_method")),
    }
}

/// Las claves de las marcas `{{$secret:<clave>}}`, sin repetir.
pub fn secret_keys_in(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(start) = rest.find(MARKER_OPEN) {
        let after = &rest[start + MARKER_OPEN.len()..];
        match after.find(MARKER_CLOSE) {
            Some(end) => {
                let key = after[..end].to_string();
                if !out.contains(&key) {
                    out.push(key);
                }
                rest = &after[end + MARKER_CLOSE.len()..];
            }
            None => break,
        }
    }
    out
}

pub fn marker(key: &str) -> String {
    format!("{MARKER_OPEN}{key}{MARKER_CLOSE}")
}

/// Pone los valores en lugar de las marcas.
pub fn fill_secrets(text: &str, secrets: &[(String, String)]) -> String {
    let mut out = text.to_string();
    for (key, value) in secrets {
        out = out.replace(&marker(key), value);
    }
    out
}

/// Al revés: cada valor de un secreto vuelve a su marca, también en la
/// forma en que lo escribe una URL (%XX).
pub fn mask_secrets(text: &str, secrets: &[(String, String)]) -> String {
    let mut out = text.to_string();
    for (key, value) in secrets {
        if value.is_empty() {
            continue;
        }
        let mut forms = vec![value.clone()];
        for probe in [format!("http://x/?{value}"), format!("http://x/{value}")] {
            if let Ok(u) = Url::parse(&probe) {
                let s = u.as_str();
                let encoded = if probe.contains("/?") { &s["http://x/?".len()..] } else { &s["http://x/".len()..] };
                if !encoded.is_empty() && !forms.iter().any(|f| f == encoded) {
                    forms.push(encoded.to_string());
                }
            }
        }
        // Primero las formas más largas, para no dejar restos.
        forms.sort_by_key(|f| std::cmp::Reverse(f.len()));
        for form in forms {
            out = out.replace(&form, &marker(key));
        }
    }
    out
}

/// El host en minúsculas y sin el puerto.
pub fn host_of(url: &Url) -> Option<String> {
    url.host_str().map(|h| h.to_ascii_lowercase())
}

/// HT23: solo http y https, sin usuario ni contraseña y con host.
pub fn check_url(raw: &str) -> Result<Url, SendError> {
    let url = Url::parse(raw.trim()).map_err(|_| SendError::new("invalid_url"))?;
    match url.scheme() {
        "http" | "https" => {}
        _ => return Err(SendError::new("scheme_not_allowed")),
    }
    let host = host_of(&url);
    if !url.username().is_empty() || url.password().is_some() {
        return Err(SendError::with_host("credentials_in_url", host));
    }
    if host.as_deref().map_or(true, str::is_empty) {
        return Err(SendError::new("invalid_url"));
    }
    Ok(url)
}

pub fn host_trusted(host: &str, trusted: &[String]) -> bool {
    trusted.iter().any(|t| t.trim().eq_ignore_ascii_case(host))
}

/// Cabeceras que pone reqwest: las del usuario se quitan y se avisa.
fn is_managed_header(name: &str) -> bool {
    name.eq_ignore_ascii_case("content-length") || name.eq_ignore_ascii_case("transfer-encoding")
}

/// Las que no siguen a una redirección a otro origen.
fn is_sensitive_header(name: &str) -> bool {
    ["authorization", "cookie", "proxy-authorization"].iter().any(|h| name.eq_ignore_ascii_case(h))
}

#[derive(Debug, PartialEq)]
pub enum Hop {
    /// Se devuelve esta respuesta.
    Stop,
    Follow { url: Url, method: Method, keep_body: bool, strip_sensitive: bool },
}

fn same_origin(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme() && host_of(a) == host_of(b) && a.port_or_known_default() == b.port_or_known_default()
}

/// La siguiente redirección, o `Stop` (HT24, design A7.5). 303 pasa a GET;
/// 301 y 302 solo si era POST, como los navegadores; 307 y 308 conservan
/// el método y el cuerpo. Con secretos, no se sigue a otro origen.
pub fn next_hop(status: u16, method: &Method, base: &Url, location: Option<&str>, had_secrets: bool) -> Hop {
    if !matches!(status, 301 | 302 | 303 | 307 | 308) {
        return Hop::Stop;
    }
    let Some(url) = location.and_then(|l| base.join(l.trim()).ok()) else {
        return Hop::Stop;
    };
    if !matches!(url.scheme(), "http" | "https") || !url.username().is_empty() || url.password().is_some() {
        return Hop::Stop;
    }
    let cross = !same_origin(base, &url);
    if had_secrets && cross {
        return Hop::Stop;
    }
    let to_get = (status == 303 && *method != Method::HEAD) || (matches!(status, 301 | 302) && *method == Method::POST);
    let next = if to_get { Method::GET } else { method.clone() };
    Hop::Follow { url, keep_body: !to_get, method: next, strip_sensitive: cross }
}

/// Texto según el `Content-Type`; sin tipo, si es UTF-8 sin bytes NUL.
pub fn is_text_type(content_type: Option<&str>, bytes: &[u8]) -> bool {
    let Some(ct) = content_type else {
        return !bytes.contains(&0) && std::str::from_utf8(bytes).is_ok();
    };
    let mime = ct.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
    if mime.is_empty() {
        return !bytes.contains(&0) && std::str::from_utf8(bytes).is_ok();
    }
    mime.starts_with("text/")
        || mime.ends_with("/json")
        || mime.ends_with("+json")
        || mime.ends_with("/xml")
        || mime.ends_with("+xml")
        || mime.ends_with("/yaml")
        || mime.ends_with("/csv")
        || matches!(
            mime.as_str(),
            "application/javascript" | "application/x-www-form-urlencoded" | "application/graphql"
        )
}

pub fn classify_body(content_type: Option<&str>, bytes: Vec<u8>, empty: bool) -> Body {
    if empty || bytes.is_empty() {
        return Body::Empty;
    }
    if is_text_type(content_type, &bytes) {
        return match String::from_utf8(bytes) {
            Ok(text) => Body::Text { text, lossy: false },
            Err(e) => Body::Text { text: String::from_utf8_lossy(e.as_bytes()).into_owned(), lossy: true },
        };
    }
    Body::Binary { base64: base64::engine::general_purpose::STANDARD.encode(bytes) }
}

/// El código de un error de reqwest, a partir del texto de su cadena de
/// `source()` (en minúsculas). El texto que se busca está fijado con
/// pruebas: si una versión nueva lo cambia, fallan.
pub fn classify_chain(chain: &[String], is_connect: bool) -> (&'static str, Option<&'static str>) {
    let has = |needle: &str| chain.iter().any(|s| s.contains(needle));
    if has("invalid peer certificate") || has("certificate verify failed") {
        let reason = if has("expired") {
            "expired"
        } else if has("notvalidforname") || has("not valid for name") {
            "not_valid_for_name"
        } else if has("unknownissuer") || has("unknown issuer") {
            "unknown_issuer"
        } else {
            "other"
        };
        return ("tls", Some(reason));
    }
    if has("dns error") || has("failed to lookup address") || has("nodename nor servname") {
        return ("dns", None);
    }
    if is_connect {
        return ("connect", None);
    }
    ("network", None)
}

fn classify_reqwest(err: &reqwest::Error, host: Option<String>) -> SendError {
    if err.is_timeout() {
        return SendError::with_host("timeout", host);
    }
    let mut chain = Vec::new();
    let mut source: Option<&(dyn std::error::Error + 'static)> = std::error::Error::source(err);
    while let Some(s) = source {
        chain.push(s.to_string().to_ascii_lowercase());
        source = s.source();
    }
    let (code, tls_reason) = classify_chain(&chain, err.is_connect());
    SendError { code, host, secret_key: None, tls_reason }
}

// ---------- Preparar ----------

pub struct Prepared {
    method: Method,
    url: Url,
    /// La URL tal como la escribió el webview (con las marcas), para
    /// devolverla si no hubo redirecciones.
    masked_url: String,
    headers: Vec<(HeaderName, HeaderValue)>,
    body: Option<String>,
    timeout: Duration,
    max_response: u64,
    follow_redirects: bool,
    insecure_tls: bool,
    secrets: Vec<(String, String)>,
    dropped: Vec<String>,
}

/// Las claves de los secretos que lleva la petición, validadas.
pub fn requested_secret_keys(input: &SendInput) -> Result<Vec<String>, SendError> {
    let mut keys = secret_keys_in(&input.url);
    for (_, v) in &input.headers {
        keys.extend(secret_keys_in(v));
    }
    if let Some(b) = &input.body {
        keys.extend(secret_keys_in(b));
    }
    let mut out: Vec<String> = Vec::new();
    for key in keys {
        if secret_account(EXTENSION_ID, &key).is_err() {
            return Err(SendError { code: "secret_missing", host: None, secret_key: None, tls_reason: None });
        }
        if !out.contains(&key) {
            out.push(key);
        }
    }
    Ok(out)
}

/// Valida la petición y pone los secretos (`secrets`: clave → valor, ya
/// leídos del llavero). No toca la red.
pub fn prepare(input: &SendInput, secrets: Vec<(String, String)>) -> Result<Prepared, SendError> {
    let method = parse_method(&input.method)?;
    if input.body.as_ref().map_or(0, String::len) > MAX_REQUEST_BODY {
        return Err(SendError::new("body_too_large"));
    }
    let url_text = fill_secrets(&input.url, &secrets);
    let url = check_url(&url_text)?;
    let host = host_of(&url);
    let mut headers = Vec::new();
    let mut dropped = Vec::new();
    for (name, value) in &input.headers {
        if is_managed_header(name) {
            dropped.push(name.clone());
            continue;
        }
        let name = HeaderName::from_bytes(name.as_bytes()).map_err(|_| SendError::new("invalid_header"))?;
        // `from_str` rechaza CR y LF, también los de un secreto.
        let value = HeaderValue::from_str(&fill_secrets(value, &secrets)).map_err(|_| SendError::new("invalid_header"))?;
        headers.push((name, value));
    }
    let body = input.body.as_ref().map(|b| fill_secrets(b, &secrets));
    // HT21, otra vez del lado de Rust, después de poner los secretos.
    let used_secrets = !secrets.is_empty();
    if used_secrets && !input.allow_untrusted_host {
        let trusted = host.as_deref().map_or(false, |h| host_trusted(h, &input.trusted_hosts));
        if !trusted {
            return Err(SendError::with_host("secret_host_not_allowed", host));
        }
    }
    Ok(Prepared {
        method,
        url,
        masked_url: input.url.clone(),
        headers,
        body,
        timeout: clamp_timeout(input.timeout_ms),
        max_response: clamp_max_response(input.max_response_bytes),
        follow_redirects: input.follow_redirects,
        insecure_tls: input.insecure_tls,
        secrets,
        dropped,
    })
}

// ---------- Enviar ----------

fn client(insecure: bool) -> Result<&'static reqwest::Client, SendError> {
    static SECURE: OnceLock<Option<reqwest::Client>> = OnceLock::new();
    static INSECURE: OnceLock<Option<reqwest::Client>> = OnceLock::new();
    let cell = if insecure { &INSECURE } else { &SECURE };
    cell.get_or_init(|| {
        // Las redirecciones van a mano (para contarlas y quitar secretos).
        // Sin gestor de cookies: cada petición va sola. El proxy de
        // HTTP_PROXY/HTTPS_PROXY lo respeta reqwest por defecto.
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(CONNECT_TIMEOUT)
            .danger_accept_invalid_certs(insecure)
            .build()
            .ok()
    })
    .as_ref()
    .ok_or_else(|| SendError::new("network"))
}

pub async fn execute(p: Prepared) -> Result<SendOutput, SendError> {
    let started = Instant::now();
    let deadline = started + p.timeout;
    let client = client(p.insecure_tls)?;
    let had_secrets = !p.secrets.is_empty();
    let mut method = p.method.clone();
    let mut url = p.url.clone();
    let mut body = p.body.clone();
    let mut headers = p.headers.clone();
    let mut dropped = p.dropped.clone();
    let mut redirects: Vec<RedirectHop> = Vec::new();
    let mut tls_unverified = p.insecure_tls && url.scheme() == "https";

    let resp = loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(SendError::with_host("timeout", host_of(&url)));
        }
        let mut req = client.request(method.clone(), url.clone()).timeout(remaining);
        for (name, value) in &headers {
            req = req.header(name.clone(), value.clone());
        }
        if let Some(b) = &body {
            req = req.body(b.clone());
        }
        let resp = req.send().await.map_err(|e| classify_reqwest(&e, host_of(&url)))?;
        if !p.follow_redirects {
            break resp;
        }
        let location = resp.headers().get(reqwest::header::LOCATION).and_then(|v| v.to_str().ok()).map(str::to_string);
        match next_hop(resp.status().as_u16(), &method, &url, location.as_deref(), had_secrets) {
            Hop::Stop => break resp,
            Hop::Follow { url: next, method: next_method, keep_body, strip_sensitive } => {
                if redirects.len() >= MAX_REDIRECTS {
                    return Err(SendError::with_host("too_many_redirects", host_of(&url)));
                }
                redirects.push(RedirectHop {
                    status: resp.status().as_u16(),
                    location: mask_secrets(next.as_str(), &p.secrets),
                });
                if strip_sensitive {
                    headers.retain(|(n, _)| {
                        let keep = !is_sensitive_header(n.as_str());
                        if !keep && !dropped.iter().any(|d| d.eq_ignore_ascii_case(n.as_str())) {
                            dropped.push(n.as_str().to_string());
                        }
                        keep
                    });
                }
                if !keep_body {
                    body = None;
                    headers.retain(|(n, _)| n != reqwest::header::CONTENT_TYPE);
                }
                // Se suelta la respuesta 3xx (su conexión vuelve al pool o se cierra).
                drop(resp);
                method = next_method;
                url = next;
                tls_unverified |= p.insecure_tls && url.scheme() == "https";
            }
        }
    };

    let status = resp.status();
    let reason = status.canonical_reason().unwrap_or("").to_string();
    let response_headers: Vec<(String, String)> = resp
        .headers()
        .iter()
        .map(|(n, v)| (n.as_str().to_string(), String::from_utf8_lossy(v.as_bytes()).into_owned()))
        .collect();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .map(|v| String::from_utf8_lossy(v.as_bytes()).into_owned());
    let content_length = resp.content_length();
    let empty = method == Method::HEAD || status.as_u16() == 204 || status.as_u16() == 304;
    let host = host_of(&url);

    let mut bytes: Vec<u8> = Vec::new();
    let mut truncated = false;
    let mut resp = resp;
    if !empty {
        loop {
            match resp.chunk().await {
                Ok(Some(chunk)) => {
                    let room = (p.max_response as usize).saturating_sub(bytes.len());
                    if chunk.len() > room {
                        bytes.extend_from_slice(&chunk[..room]);
                        truncated = true;
                        break;
                    }
                    bytes.extend_from_slice(&chunk);
                }
                Ok(None) => break,
                Err(e) => return Err(classify_reqwest(&e, host)),
            }
        }
    }
    // Al soltar la respuesta cortada, la conexión se cierra.
    drop(resp);
    let elapsed_ms = started.elapsed().as_millis() as u64;
    let body_bytes = bytes.len() as u64;
    let final_url = if redirects.is_empty() { p.masked_url.clone() } else { mask_secrets(url.as_str(), &p.secrets) };

    Ok(SendOutput {
        status: status.as_u16(),
        reason,
        headers: response_headers,
        body: classify_body(content_type.as_deref(), bytes, empty),
        body_bytes,
        content_length,
        truncated,
        elapsed_ms,
        final_url,
        redirects,
        tls_unverified,
        dropped_headers: dropped,
    })
}

// ---------- En curso y cancelar ----------

#[derive(Default)]
struct Slot {
    abort: Option<Box<dyn Fn() + Send>>,
    cancelled: bool,
}

fn in_flight() -> &'static Mutex<HashMap<String, Slot>> {
    static MAP: OnceLock<Mutex<HashMap<String, Slot>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Reserva un lugar entre los 6 en curso (HT24). Al soltarse, lo libera:
/// el mapa se limpia en todos los casos.
struct SlotGuard(String);

impl SlotGuard {
    fn reserve(id: &str) -> Result<Self, SendError> {
        let mut map = in_flight().lock().map_err(|_| SendError::new("network"))?;
        if map.len() >= MAX_IN_FLIGHT || map.contains_key(id) {
            return Err(SendError::new("too_many_in_flight"));
        }
        map.insert(id.to_string(), Slot::default());
        Ok(Self(id.to_string()))
    }

    fn cancelled(&self) -> bool {
        in_flight().lock().ok().and_then(|m| m.get(&self.0).map(|s| s.cancelled)).unwrap_or(true)
    }
}

impl Drop for SlotGuard {
    fn drop(&mut self) {
        if let Ok(mut map) = in_flight().lock() {
            map.remove(&self.0);
        }
    }
}

/// Corre `execute` en su propia tarea, para poder abortarla desde
/// `http_client_cancel`: al abortarse se suelta la conexión.
async fn run_tracked(guard: &SlotGuard, prepared: Prepared) -> Result<SendOutput, SendError> {
    let handle = tauri::async_runtime::spawn(execute(prepared));
    let abort = handle.inner().abort_handle();
    {
        let mut map = in_flight().lock().map_err(|_| SendError::new("network"))?;
        match map.get_mut(&guard.0) {
            Some(slot) if !slot.cancelled => slot.abort = Some(Box::new(move || abort.abort())),
            _ => abort.abort(),
        }
    }
    match handle.await {
        Ok(result) => result,
        Err(_) => Err(SendError::new("cancelled")),
    }
}

fn cancel(request_id: &str) -> bool {
    let Ok(mut map) = in_flight().lock() else {
        return false;
    };
    match map.get_mut(request_id) {
        Some(slot) => {
            slot.cancelled = true;
            if let Some(abort) = slot.abort.take() {
                abort();
            }
            true
        }
        None => false,
    }
}

#[tauri::command]
pub async fn http_client_send(app: AppHandle, input: SendInput) -> Result<SendOutput, SendError> {
    let guard = SlotGuard::reserve(&input.request_id)?;
    // Lo barato primero, antes de tocar el llavero.
    parse_method(&input.method)?;
    if input.body.as_ref().map_or(0, String::len) > MAX_REQUEST_BODY {
        return Err(SendError::new("body_too_large"));
    }
    let keys = requested_secret_keys(&input)?;
    let secrets = if keys.is_empty() {
        Vec::new()
    } else {
        let wanted = keys.clone();
        let read = keychain(&app, move |service| {
            let mut out = Vec::new();
            for key in wanted {
                match read_secret(&service, EXTENSION_ID, &key) {
                    Ok(v) => out.push((key, v)),
                    Err(e) if e == SECRET_NOT_FOUND => return Ok(Err(key)),
                    Err(e) => return Err(e),
                }
            }
            Ok(Ok(out))
        })
        .await
        .map_err(|_| SendError::new("keychain_error"))?;
        match read {
            Ok(v) => v,
            Err(key) => return Err(SendError { code: "secret_missing", host: None, secret_key: Some(key), tls_reason: None }),
        }
    };
    if guard.cancelled() {
        return Err(SendError::new("cancelled"));
    }
    let prepared = prepare(&input, secrets)?;
    run_tracked(&guard, prepared).await
}

/// Devuelve si había algo que cancelar.
#[tauri::command]
pub fn http_client_cancel(request_id: String) -> bool {
    cancel(&request_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use std::thread;

    // Las pruebas que usan el mapa global de en curso no corren a la vez.
    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn input(url: &str) -> SendInput {
        SendInput {
            request_id: "t".into(),
            method: "GET".into(),
            url: url.into(),
            headers: vec![],
            body: None,
            timeout_ms: 5_000,
            max_response_bytes: 10 * 1024 * 1024,
            follow_redirects: true,
            insecure_tls: false,
            trusted_hosts: vec![],
            allow_untrusted_host: false,
        }
    }

    fn secret(key: &str, value: &str) -> Vec<(String, String)> {
        vec![(key.to_string(), value.to_string())]
    }

    #[test]
    fn urls_permitidas() {
        assert!(check_url("http://localhost:8080/x").is_ok());
        assert!(check_url("https://api.example.com").is_ok());
        assert_eq!(check_url("ftp://x.com").unwrap_err().code, "scheme_not_allowed");
        assert_eq!(check_url("file:///etc/passwd").unwrap_err().code, "scheme_not_allowed");
        assert_eq!(check_url("data:text/plain,hola").unwrap_err().code, "scheme_not_allowed");
        assert_eq!(check_url("https://u:p@x.com").unwrap_err().code, "credentials_in_url");
        assert_eq!(check_url("no es url").unwrap_err().code, "invalid_url");
    }

    #[test]
    fn metodos() {
        for m in ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] {
            assert!(parse_method(m).is_ok(), "{m}");
        }
        for m in ["get", "TRACE", "CONNECT", ""] {
            assert_eq!(parse_method(m).unwrap_err().code, "invalid_method", "{m}");
        }
    }

    #[test]
    fn rangos_se_ajustan() {
        assert_eq!(clamp_timeout(0), Duration::from_secs(1));
        assert_eq!(clamp_timeout(30_000), Duration::from_secs(30));
        assert_eq!(clamp_timeout(10_000_000), Duration::from_secs(300));
        assert_eq!(clamp_max_response(1), 1024 * 1024);
        assert_eq!(clamp_max_response(u64::MAX), 50 * 1024 * 1024);
    }

    #[test]
    fn marcas_de_secretos() {
        let text = "Bearer {{$secret:v_ab12cd34}} y {{$secret:v_ab12cd34}} y {{$secret:v_00000000}} y {{$secret:sin cerrar";
        assert_eq!(secret_keys_in(text), vec!["v_ab12cd34", "v_00000000"]);
        let s = secret("v_ab12cd34", "tok3n");
        assert_eq!(fill_secrets("Bearer {{$secret:v_ab12cd34}}", &s), "Bearer tok3n");
        assert_eq!(mask_secrets("https://x.com/?k=tok3n", &s), "https://x.com/?k={{$secret:v_ab12cd34}}");
        // También en la forma que escribe una URL.
        let s = secret("v_ab12cd34", "a b\"c");
        assert_eq!(mask_secrets("https://x.com/?k=a%20b%22c", &s), "https://x.com/?k={{$secret:v_ab12cd34}}");
    }

    #[test]
    fn clave_de_secreto_invalida() {
        let mut i = input("https://x.com/{{$secret:../otra}}");
        assert_eq!(requested_secret_keys(&i).unwrap_err().code, "secret_missing");
        i.url = "https://x.com/{{$secret:v_ab12cd34}}".into();
        assert_eq!(requested_secret_keys(&i).unwrap(), vec!["v_ab12cd34"]);
    }

    #[test]
    fn hosts_de_confianza_con_secretos() {
        let mut i = input("https://api.example.com/x");
        i.headers = vec![("Authorization".into(), "Bearer {{$secret:v_ab12cd34}}".into())];
        let s = secret("v_ab12cd34", "tok");
        let err = prepare(&i, s.clone()).err().unwrap();
        assert_eq!(err, SendError::with_host("secret_host_not_allowed", Some("api.example.com".into())));
        i.trusted_hosts = vec!["API.example.com".into()];
        assert!(prepare(&i, s.clone()).is_ok());
        i.trusted_hosts = vec![];
        i.allow_untrusted_host = true;
        assert!(prepare(&i, s.clone()).is_ok());
        // Sin secretos no hace falta confianza.
        assert!(prepare(&input("https://otro.com"), vec![]).is_ok());
        // El host que sale de un secreto también cuenta.
        let mut j = input("{{$secret:v_ab12cd34}}/users");
        j.trusted_hosts = vec!["api.example.com".into()];
        assert!(prepare(&j, secret("v_ab12cd34", "https://api.example.com")).is_ok());
        assert_eq!(prepare(&j, secret("v_ab12cd34", "https://malo.com")).err().unwrap().code, "secret_host_not_allowed");
    }

    #[test]
    fn cabeceras_y_cuerpo() {
        let mut i = input("https://x.com");
        i.headers = vec![("Content-Length".into(), "3".into()), ("X-Ok".into(), "1".into())];
        let p = prepare(&i, vec![]).ok().unwrap();
        assert_eq!(p.dropped, vec!["Content-Length"]);
        assert_eq!(p.headers.len(), 1);
        i.headers = vec![("Mal nombre".into(), "1".into())];
        assert_eq!(prepare(&i, vec![]).err().unwrap().code, "invalid_header");
        // Un secreto con salto de línea no puede ir en una cabecera.
        let mut j = input("https://x.com");
        j.trusted_hosts = vec!["x.com".into()];
        j.headers = vec![("X-Token".into(), "{{$secret:v_ab12cd34}}".into())];
        assert_eq!(prepare(&j, secret("v_ab12cd34", "a\r\nX-Evil: 1")).err().unwrap().code, "invalid_header");
        let mut k = input("https://x.com");
        k.body = Some("x".repeat(MAX_REQUEST_BODY + 1));
        assert_eq!(prepare(&k, vec![]).err().unwrap().code, "body_too_large");
    }

    #[test]
    fn redirecciones() {
        let base = Url::parse("https://a.com/x").unwrap();
        assert_eq!(next_hop(200, &Method::GET, &base, Some("/y"), false), Hop::Stop);
        assert_eq!(next_hop(302, &Method::GET, &base, None, false), Hop::Stop);
        let Hop::Follow { url, method, keep_body, strip_sensitive } = next_hop(302, &Method::POST, &base, Some("/y"), false) else {
            panic!()
        };
        assert_eq!((url.as_str(), method, keep_body, strip_sensitive), ("https://a.com/y", Method::GET, false, false));
        let Hop::Follow { method, keep_body, .. } = next_hop(307, &Method::POST, &base, Some("/y"), false) else { panic!() };
        assert_eq!((method, keep_body), (Method::POST, true));
        let Hop::Follow { method, keep_body, .. } = next_hop(301, &Method::PUT, &base, Some("/y"), false) else { panic!() };
        assert_eq!((method, keep_body), (Method::PUT, true));
        let Hop::Follow { method, .. } = next_hop(303, &Method::PUT, &base, Some("/y"), false) else { panic!() };
        assert_eq!(method, Method::GET);
        let Hop::Follow { method, .. } = next_hop(303, &Method::HEAD, &base, Some("/y"), false) else { panic!() };
        assert_eq!(method, Method::HEAD);
        // Otro origen: se quitan las cabeceras sensibles; con secretos, no se sigue.
        let Hop::Follow { strip_sensitive, .. } = next_hop(301, &Method::GET, &base, Some("https://b.com/"), false) else { panic!() };
        assert!(strip_sensitive);
        assert_eq!(next_hop(301, &Method::GET, &base, Some("https://b.com/"), true), Hop::Stop);
        assert_eq!(next_hop(301, &Method::GET, &base, Some("http://a.com/"), true), Hop::Stop);
        assert!(matches!(next_hop(301, &Method::GET, &base, Some("/z"), true), Hop::Follow { .. }));
        // Solo http y https.
        assert_eq!(next_hop(302, &Method::GET, &base, Some("file:///etc/passwd"), false), Hop::Stop);
    }

    #[test]
    fn clasificacion_del_cuerpo() {
        assert!(is_text_type(Some("application/json; charset=utf-8"), b"{}"));
        assert!(is_text_type(Some("application/problem+json"), b"{}"));
        assert!(is_text_type(Some("text/html"), b"<p>"));
        assert!(is_text_type(Some("image/svg+xml"), b"<svg/>"));
        assert!(!is_text_type(Some("application/pdf"), b"%PDF"));
        assert!(is_text_type(None, b"hola"));
        assert!(!is_text_type(None, b"ho\0la"));
        assert_eq!(classify_body(Some("text/plain"), vec![], false), Body::Empty);
        assert_eq!(classify_body(Some("text/plain"), b"x".to_vec(), true), Body::Empty);
        assert_eq!(classify_body(Some("text/plain"), vec![0x68, 0xff], false), Body::Text { text: "h\u{fffd}".into(), lossy: true });
        assert_eq!(classify_body(Some("image/png"), vec![1, 2, 3], false), Body::Binary { base64: "AQID".into() });
    }

    #[test]
    fn errores_por_su_texto() {
        let t = |s: &str| vec![s.to_string()];
        assert_eq!(classify_chain(&t("invalid peer certificate: unknownissuer"), true), ("tls", Some("unknown_issuer")));
        assert_eq!(
            classify_chain(&t("invalid peer certificate: certificate expired: verification time 1"), true),
            ("tls", Some("expired"))
        );
        assert_eq!(
            classify_chain(&t("invalid peer certificate: certificate not valid for name \"x\"; certificate is only valid for y"), true),
            ("tls", Some("not_valid_for_name"))
        );
        assert_eq!(classify_chain(&t("invalid peer certificate: badsignature"), true), ("tls", Some("other")));
        assert_eq!(classify_chain(&t("dns error"), true), ("dns", None));
        assert_eq!(classify_chain(&t("connection refused"), true), ("connect", None));
        assert_eq!(classify_chain(&t("connection reset"), false), ("network", None));
    }

    #[test]
    fn el_error_no_lleva_la_url() {
        let e = SendError::with_host("connect", Some("x.com".into()));
        let json = serde_json::to_string(&e).unwrap();
        assert_eq!(json, r#"{"code":"connect","host":"x.com","secretKey":null,"tlsReason":null}"#);
    }

    // ---------- Con un servidor local ----------

    /// Un cuerpo que da el primer pedazo y se queda esperando.
    struct Slow {
        sent: bool,
    }
    impl Read for Slow {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            if !self.sent {
                self.sent = true;
                buf[..5].copy_from_slice(b"hola ");
                return Ok(5);
            }
            thread::sleep(Duration::from_secs(5));
            Ok(0)
        }
    }

    fn server() -> u16 {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let port = server.server_addr().to_ip().unwrap().port();
        thread::spawn(move || {
            for req in server.incoming_requests() {
                thread::spawn(move || {
                    let url = req.url().split('?').next().unwrap_or("").to_string();
                    let header = |n: &str, v: &str| tiny_http::Header::from_bytes(n.as_bytes(), v.as_bytes()).unwrap();
                    if url == "/status" {
                        let resp = tiny_http::Response::from_string("hola")
                            .with_status_code(418)
                            .with_header(header("Content-Type", "text/plain"))
                            .with_header(header("Set-Cookie", "a=1"))
                            .with_header(header("Set-Cookie", "b=2"));
                        let _ = req.respond(resp);
                    } else if url == "/big" {
                        let _ = req.respond(tiny_http::Response::from_data(vec![b'x'; 3 * 1024 * 1024]).with_header(header("Content-Type", "text/plain")));
                    } else if url == "/slow" {
                        thread::sleep(Duration::from_millis(2_500));
                        let _ = req.respond(tiny_http::Response::from_string("tarde"));
                    } else if url == "/stall" {
                        let resp = tiny_http::Response::new(
                            tiny_http::StatusCode(200),
                            vec![header("Content-Type", "text/plain")],
                            Slow { sent: false },
                            None,
                            None,
                        );
                        let _ = req.respond(resp);
                    } else if let Some(n) = url.strip_prefix("/redir/") {
                        let n: u32 = n.parse().unwrap_or(0);
                        if n == 0 {
                            let _ = req.respond(tiny_http::Response::from_string("fin"));
                        } else {
                            let resp = tiny_http::Response::empty(302).with_header(header("Location", &format!("/redir/{}", n - 1)));
                            let _ = req.respond(resp);
                        }
                    } else if url == "/cross" {
                        let resp = tiny_http::Response::empty(302).with_header(header("Location", &format!("http://localhost:{port}/status")));
                        let _ = req.respond(resp);
                    } else if url == "/echo-auth" {
                        let auth = req
                            .headers()
                            .iter()
                            .find(|h| h.field.equiv("Authorization"))
                            .map(|h| h.value.as_str().to_string())
                            .unwrap_or_default();
                        let _ = req.respond(tiny_http::Response::from_string(auth));
                    } else {
                        let _ = req.respond(tiny_http::Response::empty(404));
                    }
                });
            }
        });
        port
    }

    fn run(i: SendInput, secrets: Vec<(String, String)>) -> Result<SendOutput, SendError> {
        let p = prepare(&i, secrets)?;
        tauri::async_runtime::block_on(execute(p))
    }

    #[test]
    fn servidor_local() {
        let port = server();
        let base = format!("http://127.0.0.1:{port}");

        // Estado, texto y cabeceras repetidas.
        let out = run(input(&format!("{base}/status")), vec![]).unwrap();
        assert_eq!((out.status, out.reason.as_str()), (418, "I'm a teapot"));
        assert_eq!(out.body, Body::Text { text: "hola".into(), lossy: false });
        assert_eq!(out.headers.iter().filter(|(n, _)| n == "set-cookie").count(), 2);
        assert!(!out.truncated && !out.tls_unverified);

        // HEAD no trae cuerpo.
        let mut head = input(&format!("{base}/status"));
        head.method = "HEAD".into();
        assert_eq!(run(head, vec![]).unwrap().body, Body::Empty);

        // Cuerpo cortado en el máximo (1 MB, el mínimo del rango).
        let mut big = input(&format!("{base}/big"));
        big.max_response_bytes = 1;
        let out = run(big, vec![]).unwrap();
        assert!(out.truncated);
        assert_eq!(out.body_bytes, 1024 * 1024);

        // Tiempo límite (1 s, el mínimo).
        let mut slow = input(&format!("{base}/slow"));
        slow.timeout_ms = 1;
        let started = Instant::now();
        assert_eq!(run(slow, vec![]).unwrap_err().code, "timeout");
        assert!(started.elapsed() < Duration::from_millis(2_400));

        // Una cadena de redirecciones, y más de 10.
        let out = run(input(&format!("{base}/redir/3")), vec![]).unwrap();
        assert_eq!(out.status, 200);
        assert_eq!(out.redirects.len(), 3);
        assert_eq!(out.final_url, format!("{base}/redir/0"));
        assert_eq!(run(input(&format!("{base}/redir/11")), vec![]).unwrap_err().code, "too_many_redirects");
        // Sin seguirlas, la 302.
        let mut nofollow = input(&format!("{base}/redir/1"));
        nofollow.follow_redirects = false;
        assert_eq!(run(nofollow, vec![]).unwrap().status, 302);

        // A otro host: sin secretos se sigue; con secretos, no.
        let out = run(input(&format!("{base}/cross")), vec![]).unwrap();
        assert_eq!(out.status, 418);
        let mut with_secret = input(&format!("{base}/cross"));
        with_secret.headers = vec![("Authorization".into(), "Bearer {{$secret:v_ab12cd34}}".into())];
        with_secret.trusted_hosts = vec!["127.0.0.1".into()];
        let out = run(with_secret, secret("v_ab12cd34", "tok")).unwrap();
        assert_eq!(out.status, 302);
        assert!(out.redirects.is_empty());

        // El secreto llega al servidor y vuelve enmascarado en la URL.
        let mut echo = input(&format!("{base}/echo-auth?k={{{{$secret:v_ab12cd34}}}}"));
        echo.headers = vec![("Authorization".into(), "Bearer {{$secret:v_ab12cd34}}".into())];
        echo.trusted_hosts = vec!["127.0.0.1".into()];
        let out = run(echo, secret("v_ab12cd34", "s3cr3t")).unwrap();
        assert_eq!(out.body, Body::Text { text: "Bearer s3cr3t".into(), lossy: false });
        assert!(!out.final_url.contains("s3cr3t"));

        // Puerto cerrado: error de conexión, solo con el host.
        let err = run(input("http://127.0.0.1:1/x"), vec![]).unwrap_err();
        assert_eq!((err.code, err.host.as_deref()), ("connect", Some("127.0.0.1")));
    }

    #[test]
    fn cancelar_a_mitad_del_cuerpo() {
        let _lock = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let port = server();
        let mut i = input(&format!("http://127.0.0.1:{port}/stall"));
        i.request_id = "cancelar-1".into();
        let guard = SlotGuard::reserve(&i.request_id).unwrap();
        let p = prepare(&i, vec![]).ok().unwrap();
        let canceller = thread::spawn(|| {
            thread::sleep(Duration::from_millis(400));
            cancel("cancelar-1")
        });
        let started = Instant::now();
        let result = tauri::async_runtime::block_on(run_tracked(&guard, p));
        assert!(canceller.join().unwrap());
        assert_eq!(result.unwrap_err().code, "cancelled");
        assert!(started.elapsed() < Duration::from_secs(3));
        drop(guard);
        // El mapa queda limpio.
        assert!(!cancel("cancelar-1"));
    }

    #[test]
    fn tope_de_en_curso() {
        let _lock = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let guards: Vec<SlotGuard> = (0..MAX_IN_FLIGHT).map(|n| SlotGuard::reserve(&format!("tope-{n}")).unwrap()).collect();
        assert_eq!(SlotGuard::reserve("tope-extra").err().unwrap().code, "too_many_in_flight");
        drop(guards);
        assert!(SlotGuard::reserve("tope-extra").is_ok());
    }
}
