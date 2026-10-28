//! Servidor MCP local de la extensión "Agentes de IA" (specs/agentes-mcp).
//!
//! Rust solo hace de transporte y de portero: escucha en 127.0.0.1,
//! valida cada petición (ruta, método, Origin, Host, token, tamaño) y le
//! pasa el cuerpo JSON-RPC al webview con el evento `mcp://request`. La
//! lógica MCP vive en `src/extensions/mcp/`, porque las escrituras tienen
//! que pasar por el store (R14), y el webview contesta con `mcp_reply`.

use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tiny_http::{Header, Response, Server};

use super::{keychain_service, read_secret, SECRET_KEYCHAIN_ERROR, SECRET_NOT_FOUND};

const EXT_ID: &str = "mcp";
const TOKEN_KEY: &str = "token";
const MAX_BODY: usize = 1024 * 1024; // R9
const REPLY_TIMEOUT: Duration = Duration::from_secs(30); // R18

pub const PORT_IN_USE: &str = "port_in_use";
pub const SERVER_ERROR: &str = "server_error";

/// Respuesta del webview: `Some(json)` o `None` para una notificación.
type Reply = Option<String>;

#[derive(Default)]
pub struct McpState {
    server: Mutex<Option<Arc<Server>>>,
    pending: Arc<Mutex<HashMap<u64, Sender<Reply>>>>,
    next_id: Arc<AtomicU64>,
}

#[derive(Clone, Serialize)]
struct RequestEvent {
    id: u64,
    body: String,
}

/// Cabeceras que importan para decidir si se atiende una petición.
pub struct RequestMeta<'a> {
    pub method: &'a str,
    pub url: &'a str,
    pub host: Option<&'a str>,
    pub origin: Option<&'a str>,
    pub authorization: Option<&'a str>,
}

/// Rechazo con su código HTTP (R5, R8, R9).
#[derive(Debug, PartialEq, Eq)]
pub enum Rejection {
    NotFound,
    MethodNotAllowed,
    Forbidden,
    Unauthorized,
}

impl Rejection {
    fn status(&self) -> u16 {
        match self {
            Rejection::NotFound => 404,
            Rejection::MethodNotAllowed => 405,
            Rejection::Forbidden => 403,
            Rejection::Unauthorized => 401,
        }
    }
}

/// Compara sin cortar en el primer byte distinto, para que el tiempo de
/// respuesta no diga cuántos caracteres del token acertó quien prueba.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Decide si se atiende la petición. El orden importa: un navegador
/// (Origin) o un Host ajeno se rechazan antes de mirar el token.
pub fn check_request(meta: &RequestMeta, port: u16, token: &str) -> Result<(), Rejection> {
    let path = meta.url.split('?').next().unwrap_or("");
    if path != "/mcp" {
        return Err(Rejection::NotFound);
    }
    if !meta.method.eq_ignore_ascii_case("POST") {
        return Err(Rejection::MethodNotAllowed);
    }
    // R8: un agente no manda Origin; un navegador siempre lo manda en un POST.
    if meta.origin.is_some() {
        return Err(Rejection::Forbidden);
    }
    // R8: DNS rebinding. Una página que resuelve su dominio a 127.0.0.1
    // llega con su propio Host.
    let host_ok = meta.host.is_some_and(|h| {
        h.eq_ignore_ascii_case(&format!("127.0.0.1:{port}")) || h.eq_ignore_ascii_case(&format!("localhost:{port}"))
    });
    if !host_ok {
        return Err(Rejection::Forbidden);
    }
    let presented = meta
        .authorization
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");
    if token.is_empty() || !constant_time_eq(presented.as_bytes(), token.as_bytes()) {
        return Err(Rejection::Unauthorized);
    }
    Ok(())
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("cabecera válida")
}

fn json_error(message: &str) -> String {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": null,
        "error": { "code": -32603, "message": message },
    })
    .to_string()
}

fn handle(
    mut req: tiny_http::Request,
    app: &AppHandle,
    port: u16,
    token: &str,
    pending: &Mutex<HashMap<u64, Sender<Reply>>>,
    next_id: &AtomicU64,
) {
    let find = |name: &'static str| {
        req.headers()
            .iter()
            .find(|h| h.field.equiv(name))
            .map(|h| h.value.as_str().to_string())
    };
    let (host, origin, authorization) = (find("Host"), find("Origin"), find("Authorization"));
    let method = req.method().as_str().to_string();
    let url = req.url().to_string();
    let meta = RequestMeta {
        method: &method,
        url: &url,
        host: host.as_deref(),
        origin: origin.as_deref(),
        authorization: authorization.as_deref(),
    };
    if let Err(rejection) = check_request(&meta, port, token) {
        let mut res = Response::empty(rejection.status());
        match rejection {
            Rejection::MethodNotAllowed => res.add_header(header("Allow", "POST")),
            Rejection::Unauthorized => res.add_header(header("WWW-Authenticate", "Bearer")),
            _ => {}
        }
        let _ = req.respond(res);
        return;
    }

    // R9: se lee un byte más del límite para saber si se pasó.
    let mut body = Vec::new();
    if req.as_reader().take(MAX_BODY as u64 + 1).read_to_end(&mut body).is_err() {
        let _ = req.respond(Response::empty(400));
        return;
    }
    if body.len() > MAX_BODY {
        let _ = req.respond(Response::empty(413));
        return;
    }
    let Ok(body) = String::from_utf8(body) else {
        let _ = req.respond(Response::empty(400));
        return;
    };

    let id = next_id.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::channel();
    pending.lock().unwrap().insert(id, tx);
    let reply = if app.emit("mcp://request", RequestEvent { id, body }).is_ok() {
        rx.recv_timeout(REPLY_TIMEOUT).ok()
    } else {
        None
    };
    pending.lock().unwrap().remove(&id);

    let json = header("Content-Type", "application/json");
    let res = match reply {
        Some(Some(text)) => Response::from_string(text).with_header(json).boxed(),
        Some(None) => Response::empty(202).boxed(),
        None => Response::from_string(json_error("Logday no respondió"))
            .with_status_code(503)
            .with_header(json)
            .boxed(),
    };
    let _ = req.respond(res);
}

fn stop_current(state: &McpState) {
    if let Some(server) = state.server.lock().unwrap().take() {
        server.unblock();
    }
    // Las peticiones en espera reciben `None` al soltar su Sender y
    // contestan 503 en vez de esperar los 30 s.
    state.pending.lock().unwrap().clear();
}

/// Abre el servidor en `port` con el token del llavero (R1–R4).
#[tauri::command]
pub async fn mcp_server_start(app: AppHandle, state: State<'_, McpState>, port: u16) -> Result<(), String> {
    stop_current(&state);
    let service = keychain_service(&app);
    let token = tauri::async_runtime::spawn_blocking(move || read_secret(&service, EXT_ID, TOKEN_KEY))
        .await
        .map_err(|_| SECRET_KEYCHAIN_ERROR.to_string())?
        .map_err(|e| if e == SECRET_NOT_FOUND { SECRET_NOT_FOUND.to_string() } else { e.to_string() })?;

    // R2: solo la interfaz local.
    let server = match Server::http(("127.0.0.1", port)) {
        Ok(s) => Arc::new(s),
        Err(e) => {
            let in_use = e
                .downcast_ref::<std::io::Error>()
                .is_some_and(|io| io.kind() == std::io::ErrorKind::AddrInUse);
            return Err(if in_use { PORT_IN_USE } else { SERVER_ERROR }.to_string());
        }
    };
    *state.server.lock().unwrap() = Some(server.clone());

    let pending = state.pending.clone();
    let next_id = state.next_id.clone();
    let token = Arc::new(token);
    std::thread::spawn(move || {
        for req in server.incoming_requests() {
            let (app, token, pending, next_id) = (app.clone(), token.clone(), pending.clone(), next_id.clone());
            // Cada petición en su hilo: una lenta no frena a las demás.
            std::thread::spawn(move || handle(req, &app, port, &token, &pending, &next_id));
        }
    });
    Ok(())
}

#[tauri::command]
pub fn mcp_server_stop(state: State<'_, McpState>) {
    stop_current(&state);
}

/// Respuesta del webview a `mcp://request`. `body: null` = notificación.
#[tauri::command]
pub fn mcp_reply(state: State<'_, McpState>, id: u64, body: Option<String>) {
    if let Some(tx) = state.pending.lock().unwrap().remove(&id) {
        let _ = tx.send(body);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "abc123";

    fn meta<'a>(method: &'a str, url: &'a str, host: Option<&'a str>, origin: Option<&'a str>, auth: Option<&'a str>) -> RequestMeta<'a> {
        RequestMeta { method, url, host, origin, authorization: auth }
    }

    #[test]
    fn acepta_una_peticion_valida() {
        for host in ["127.0.0.1:47321", "localhost:47321", "LOCALHOST:47321"] {
            let m = meta("POST", "/mcp", Some(host), None, Some("Bearer abc123"));
            assert_eq!(check_request(&m, 47321, TOKEN), Ok(()), "{host}");
        }
        let m = meta("POST", "/mcp?x=1", Some("127.0.0.1:47321"), None, Some("Bearer abc123"));
        assert_eq!(check_request(&m, 47321, TOKEN), Ok(()));
    }

    #[test]
    fn rechaza_ruta_y_metodo() {
        let m = meta("POST", "/otra", Some("127.0.0.1:47321"), None, Some("Bearer abc123"));
        assert_eq!(check_request(&m, 47321, TOKEN), Err(Rejection::NotFound));
        let m = meta("GET", "/mcp", Some("127.0.0.1:47321"), None, Some("Bearer abc123"));
        assert_eq!(check_request(&m, 47321, TOKEN), Err(Rejection::MethodNotAllowed));
    }

    #[test]
    fn rechaza_navegadores_y_hosts_ajenos() {
        let m = meta("POST", "/mcp", Some("127.0.0.1:47321"), Some("https://evil.example"), Some("Bearer abc123"));
        assert_eq!(check_request(&m, 47321, TOKEN), Err(Rejection::Forbidden));
        for host in [None, Some("evil.example:47321"), Some("127.0.0.1:9999"), Some("127.0.0.1")] {
            let m = meta("POST", "/mcp", host, None, Some("Bearer abc123"));
            assert_eq!(check_request(&m, 47321, TOKEN), Err(Rejection::Forbidden), "{host:?}");
        }
    }

    #[test]
    fn rechaza_token_ausente_o_incorrecto() {
        for auth in [None, Some("abc123"), Some("Bearer abc12"), Some("Bearer abc1234"), Some("bearer abc123")] {
            let m = meta("POST", "/mcp", Some("127.0.0.1:47321"), None, auth);
            assert_eq!(check_request(&m, 47321, TOKEN), Err(Rejection::Unauthorized), "{auth:?}");
        }
        // Un token vacío nunca autoriza, ni siquiera con "Bearer ".
        let m = meta("POST", "/mcp", Some("127.0.0.1:47321"), None, Some("Bearer "));
        assert_eq!(check_request(&m, 47321, ""), Err(Rejection::Unauthorized));
    }

    #[test]
    fn comparacion_en_tiempo_constante() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"abcd"));
    }
}
