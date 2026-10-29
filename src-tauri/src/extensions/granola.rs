//! Extensión "Granola" (`granola`, specs/granola): Logday como cliente del
//! servidor MCP de Granola, que funciona con el plan gratuito. OAuth con
//! registro dinámico de cliente (sin ID ni secreto), PKCE y loopback; el
//! token de renovación y el id de cliente viven en el llavero, y el token
//! de acceso en memoria. Ninguno llega al webview.

use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use reqwest::Url;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::AppHandle;

use super::google_oauth::keychain;
use super::oauth_loopback::LoopbackLogin;
use super::{delete_secret, read_secret, write_secret, SECRET_NOT_FOUND};

pub const EXTENSION_ID: &str = "granola";
pub const REFRESH_KEY: &str = "refresh";
pub const CLIENT_KEY: &str = "client";

// Descubierto el 28 oct 2026 en /.well-known de los dos servidores.
const MCP_URL: &str = "https://mcp.granola.ai/mcp";
const REGISTER_URL: &str = "https://mcp-auth.granola.ai/oauth2/register";
const AUTHORIZE_URL: &str = "https://mcp-auth.granola.ai/oauth2/authorize";
const TOKEN_URL: &str = "https://mcp-auth.granola.ai/oauth2/token";
const SCOPES: &str = "mcp offline_access";
const HTTP_TIMEOUT: Duration = Duration::from_secs(30);

/// N9: lo único que Logday le pide a Granola.
pub const ALLOWED_TOOLS: [&str; 3] = ["list_meetings", "get_meetings", "get_account_info"];

// ── Piezas puras (con pruebas) ────────────────────────────────────────

pub fn authorize_url(client_id: &str, redirect_uri: &str, challenge: &str, state: &str) -> String {
    Url::parse_with_params(
        AUTHORIZE_URL,
        &[
            ("response_type", "code"),
            ("client_id", client_id),
            ("redirect_uri", redirect_uri),
            ("scope", SCOPES),
            ("code_challenge", challenge),
            ("code_challenge_method", "S256"),
            ("state", state),
            // RFC 8707: el token es para este servidor MCP y ningún otro.
            ("resource", MCP_URL),
        ],
    )
    .expect("URL de autorización válida")
    .to_string()
}

pub fn registration_body(redirect_uri: &str) -> Value {
    json!({
        "client_name": "Logday",
        "redirect_uris": [redirect_uri],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        // Cliente público: no hay secreto que guardar.
        "token_endpoint_auth_method": "none",
    })
}

/// Una respuesta de MCP por Streamable HTTP: JSON directo o SSE. Devuelve
/// el mensaje JSON-RPC con ese `id`.
pub fn pick_response(body: &str, content_type: &str, id: u64) -> Option<Value> {
    let matches = |v: &Value| v.get("id").and_then(Value::as_u64) == Some(id);
    if content_type.contains("text/event-stream") {
        // Cada evento trae una o más líneas `data:`; se juntan antes de leer.
        let mut data = String::new();
        let mut found = None;
        for line in body.lines().chain(std::iter::once("")) {
            if let Some(rest) = line.strip_prefix("data:") {
                data.push_str(rest.trim_start());
            } else if line.is_empty() && !data.is_empty() {
                if let Ok(v) = serde_json::from_str::<Value>(&data) {
                    if matches(&v) {
                        found = Some(v);
                    }
                }
                data.clear();
            }
        }
        found
    } else {
        serde_json::from_str::<Value>(body).ok().filter(matches)
    }
}

/// El texto de un resultado de `tools/call`, o el código del error.
pub fn tool_text(message: &Value) -> Result<String, &'static str> {
    if message.get("error").is_some() {
        return Err("provider_error");
    }
    let result = message.get("result").ok_or("unexpected_format")?;
    let text: Vec<&str> = result
        .get("content")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(|c| c.get("text").and_then(Value::as_str)).collect())
        .unwrap_or_default();
    if result.get("isError").and_then(Value::as_bool) == Some(true) {
        // Granola marca así el límite de uso y los errores de plan.
        let joined = text.join("\n").to_ascii_lowercase();
        return Err(if joined.contains("rate") { "rate_limited" } else { "tool_error" });
    }
    Ok(text.join("\n"))
}

// ── Tokens ────────────────────────────────────────────────────────────

fn access_cache() -> &'static Mutex<Option<(String, Instant)>> {
    static CACHE: OnceLock<Mutex<Option<(String, Instant)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn cache_access(token: String, expires_in: u64) {
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
}

fn http() -> Result<reqwest::Client, &'static str> {
    reqwest::Client::builder()
        .timeout(HTTP_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Logday")
        .build()
        .map_err(|_| "network")
}

fn net_err(e: reqwest::Error) -> &'static str {
    if e.is_timeout() { "timeout" } else { "network" }
}

async fn token_request(params: &[(&str, &str)]) -> Result<TokenResponse, &'static str> {
    let resp = http()?.post(TOKEN_URL).form(params).send().await.map_err(net_err)?;
    if resp.status().is_success() {
        return resp.json::<TokenResponse>().await.map_err(|_| "token_error");
    }
    let err: Option<String> = resp.json::<Value>().await.ok().and_then(|v| v.get("error")?.as_str().map(String::from));
    Err(if err.as_deref() == Some("invalid_grant") { "needs_reconnect" } else { "token_error" })
}

async fn access_token(app: &AppHandle, force_refresh: bool) -> Result<String, &'static str> {
    if !force_refresh {
        let cached = access_cache().lock().ok().and_then(|g| g.clone());
        if let Some((t, exp)) = cached {
            if Instant::now() < exp {
                return Ok(t);
            }
        }
    }
    let not_found = |e: &'static str| if e == SECRET_NOT_FOUND { "needs_reconnect" } else { e };
    let refresh = keychain(app, |s| read_secret(&s, EXTENSION_ID, REFRESH_KEY)).await.map_err(not_found)?;
    let client_id = keychain(app, |s| read_secret(&s, EXTENSION_ID, CLIENT_KEY)).await.map_err(not_found)?;
    let tokens = token_request(&[
        ("grant_type", "refresh_token"),
        ("refresh_token", &refresh),
        ("client_id", &client_id),
        ("resource", MCP_URL),
    ])
    .await?;
    // Si Granola rota el token de renovación, se guarda el nuevo.
    if let Some(new_refresh) = tokens.refresh_token.clone().filter(|r| r != &refresh) {
        keychain(app, move |s| write_secret(&s, EXTENSION_ID, REFRESH_KEY, &new_refresh)).await?;
    }
    cache_access(tokens.access_token.clone(), tokens.expires_in.unwrap_or(3600));
    Ok(tokens.access_token)
}

// ── Cliente MCP ───────────────────────────────────────────────────────

/// Un POST JSON-RPC a Granola. Devuelve el status, el `Mcp-Session-Id` y
/// el mensaje con ese `id` (si lo hay).
async fn post_rpc(
    client: &reqwest::Client,
    token: &str,
    session: Option<&str>,
    body: Value,
    id: Option<u64>,
) -> Result<(u16, Option<String>, Option<Value>), &'static str> {
    let mut req = client
        .post(MCP_URL)
        .bearer_auth(token)
        .header("Accept", "application/json, text/event-stream")
        .header("MCP-Protocol-Version", "2025-06-18")
        .json(&body);
    if let Some(s) = session {
        req = req.header("Mcp-Session-Id", s);
    }
    let resp = req.send().await.map_err(net_err)?;
    let status = resp.status().as_u16();
    let session_id = resp.headers().get("mcp-session-id").and_then(|v| v.to_str().ok()).map(String::from);
    let ctype = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let text = resp.text().await.map_err(net_err)?;
    Ok((status, session_id, id.and_then(|i| pick_response(&text, &ctype, i))))
}

/// initialize → notifications/initialized → tools/call. Una sesión por
/// llamada: son pocas y así no hay que cuidar sesiones vencidas.
async fn call_once(token: &str, tool: &str, args: &Value) -> Result<Result<String, &'static str>, u16> {
    let client = http().map_err(|_| 0u16)?;
    let init = json!({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": { "name": "Logday", "version": env!("CARGO_PKG_VERSION") },
        },
    });
    let (status, session, _) = post_rpc(&client, token, None, init, Some(1)).await.map_err(|_| 0u16)?;
    if status == 401 {
        return Err(401);
    }
    if !(200..300).contains(&status) {
        return Ok(Err("provider_error"));
    }
    let notify = json!({ "jsonrpc": "2.0", "method": "notifications/initialized" });
    let _ = post_rpc(&client, token, session.as_deref(), notify, None).await;
    let call = json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": { "name": tool, "arguments": args } });
    let (status, _, message) = match post_rpc(&client, token, session.as_deref(), call, Some(2)).await {
        Ok(r) => r,
        Err(e) => return Ok(Err(e)),
    };
    match status {
        401 => Err(401),
        429 => Ok(Err("rate_limited")),
        s if !(200..300).contains(&s) => Ok(Err("provider_error")),
        _ => Ok(message.ok_or("unexpected_format").and_then(|m| tool_text(&m))),
    }
}

async fn call_tool(app: &AppHandle, tool: &str, args: Value) -> Result<String, &'static str> {
    if !ALLOWED_TOOLS.contains(&tool) {
        return Err("tool_not_allowed");
    }
    let token = access_token(app, false).await?;
    match call_once(&token, tool, &args).await {
        Ok(r) => r,
        Err(401) => {
            // Token vencido o revocado: se renueva una vez.
            clear_access();
            let token = access_token(app, true).await?;
            call_once(&token, tool, &args).await.unwrap_or(Err("needs_reconnect"))
        }
        Err(_) => Err("network"),
    }
}

/// El primer correo que aparece en el texto de `get_account_info`.
pub fn first_email(text: &str) -> Option<String> {
    text.split(|c: char| c.is_whitespace() || matches!(c, '<' | '>' | '"' | '(' | ')' | ',' | ':'))
        .find(|w| {
            let mut parts = w.split('@');
            matches!((parts.next(), parts.next(), parts.next()), (Some(a), Some(b), None) if !a.is_empty() && b.contains('.'))
        })
        .map(str::to_string)
}

// ── Comandos ──────────────────────────────────────────────────────────

/// N1: registra el cliente, abre el navegador y guarda los tokens.
/// Devuelve el correo de la cuenta.
#[tauri::command]
pub async fn granola_connect(app: AppHandle) -> Result<String, String> {
    let login = LoopbackLogin::start()?;
    let reg = http()?
        .post(REGISTER_URL)
        .json(&registration_body(&login.redirect_uri))
        .send()
        .await
        .map_err(net_err)?;
    if !reg.status().is_success() {
        return Err("registration_error".into());
    }
    let client_id = reg
        .json::<Value>()
        .await
        .ok()
        .and_then(|v| v.get("client_id")?.as_str().map(String::from))
        .ok_or("registration_error")?;
    let url = authorize_url(&client_id, &login.redirect_uri, &login.challenge, &login.state);
    let (redirect_uri, verifier) = (login.redirect_uri.clone(), login.verifier.clone());
    let code = login.run(&app, url).await?;
    let tokens = token_request(&[
        ("grant_type", "authorization_code"),
        ("code", &code),
        ("redirect_uri", &redirect_uri),
        ("client_id", &client_id),
        ("code_verifier", &verifier),
        ("resource", MCP_URL),
    ])
    .await?;
    let refresh = tokens.refresh_token.clone().ok_or("token_error")?;
    keychain(&app, move |s| {
        write_secret(&s, EXTENSION_ID, CLIENT_KEY, &client_id)?;
        write_secret(&s, EXTENSION_ID, REFRESH_KEY, &refresh)
    })
    .await?;
    cache_access(tokens.access_token, tokens.expires_in.unwrap_or(3600));
    let info = call_tool(&app, "get_account_info", json!({})).await.unwrap_or_default();
    Ok(first_email(&info).unwrap_or_default())
}

/// N3: borra los tokens. Granola no publica un endpoint para revocar; el
/// permiso se quita también desde la cuenta de Granola.
#[tauri::command]
pub async fn granola_disconnect(app: AppHandle) -> Result<(), String> {
    clear_access();
    keychain(&app, |s| {
        delete_secret(&s, EXTENSION_ID, REFRESH_KEY)?;
        delete_secret(&s, EXTENSION_ID, CLIENT_KEY)
    })
    .await
    .map_err(String::from)
}

/// N9: una de las herramientas permitidas, con sus argumentos en JSON.
/// Devuelve el texto de Granola, que el webview lee como datos (N10).
#[tauri::command]
pub async fn granola_call(app: AppHandle, tool: String, args: Value) -> Result<String, String> {
    if !args.is_object() {
        return Err("invalid_args".into());
    }
    call_tool(&app, &tool, args).await.map_err(String::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_de_autorizacion() {
        let url = Url::parse(&authorize_url("cid", "http://127.0.0.1:5555", "ch", "st")).unwrap();
        assert_eq!(url.host_str(), Some("mcp-auth.granola.ai"));
        let q: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(q["client_id"], "cid");
        assert_eq!(q["redirect_uri"], "http://127.0.0.1:5555");
        assert_eq!(q["code_challenge_method"], "S256");
        assert_eq!(q["resource"], "https://mcp.granola.ai/mcp");
        assert_eq!(q["scope"], "mcp offline_access");
    }

    #[test]
    fn registro_como_cliente_publico() {
        let body = registration_body("http://127.0.0.1:5555");
        assert_eq!(body["token_endpoint_auth_method"], "none");
        assert_eq!(body["redirect_uris"][0], "http://127.0.0.1:5555");
    }

    #[test]
    fn respuesta_json_y_sse() {
        let msg = r#"{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"hola"}]}}"#;
        assert_eq!(pick_response(msg, "application/json", 2).unwrap()["id"], 2);
        assert!(pick_response(msg, "application/json", 3).is_none());
        let sse = format!("event: message\ndata: {{\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\"}}\n\nevent: message\ndata: {msg}\n\n");
        assert_eq!(tool_text(&pick_response(&sse, "text/event-stream", 2).unwrap()), Ok("hola".into()));
        // Un mensaje partido en varias líneas `data:`.
        let split = "data: {\"jsonrpc\":\"2.0\",\ndata: \"id\":2,\"result\":{\"content\":[]}}\n\n";
        assert!(pick_response(split, "text/event-stream", 2).is_some());
    }

    #[test]
    fn errores_de_la_herramienta() {
        let err = json!({ "jsonrpc": "2.0", "id": 2, "error": { "code": -32000, "message": "x" } });
        assert_eq!(tool_text(&err), Err("provider_error"));
        let rate = json!({ "jsonrpc": "2.0", "id": 2, "result": { "isError": true, "content": [{ "type": "text", "text": "Rate limit exceeded" }] } });
        assert_eq!(tool_text(&rate), Err("rate_limited"));
        let other = json!({ "jsonrpc": "2.0", "id": 2, "result": { "isError": true, "content": [{ "type": "text", "text": "nope" }] } });
        assert_eq!(tool_text(&other), Err("tool_error"));
        let multi = json!({ "jsonrpc": "2.0", "id": 2, "result": { "content": [{ "type": "text", "text": "a" }, { "type": "text", "text": "b" }] } });
        assert_eq!(tool_text(&multi), Ok("a\nb".into()));
    }

    #[test]
    fn correo_de_la_cuenta() {
        assert_eq!(first_email("<connected_user_email>ana@fcv.org</connected_user_email>").as_deref(), Some("ana@fcv.org"));
        assert_eq!(first_email("Email: ana@fcv.org, workspace: X").as_deref(), Some("ana@fcv.org"));
        assert_eq!(first_email("sin correo @ nada"), None);
    }
}
