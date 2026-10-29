//! Extensión "Chat del equipo" (`team-chat`), modo local.
//!
//! Contrato común con el servidor en
//! `logday-server/specs/daily-al-chat/design.md`: los proveedores, la
//! validación de la URL, el cuerpo de cada uno y los límites (4000
//! caracteres, 20 envíos por hora, 10 s, sin redirecciones). Si algo de
//! aquí cambia, cambia también allá.
//!
//! La URL del webhook vive en el llavero (`ext:team-chat:webhook`) y no
//! sale de Rust: el webview solo manda el proveedor y el texto.

use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use reqwest::Url;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::AppHandle;

use super::{keychain_service, read_secret, SECRET_NOT_FOUND};

pub const EXTENSION_ID: &str = "team-chat";
pub const WEBHOOK_KEY: &str = "webhook";
pub const MAX_TEXT_CHARS: usize = 4000;
pub const MAX_SENDS_PER_HOUR: usize = 20;
const SEND_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Provider {
    GoogleChat,
    Slack,
    Teams,
}

impl Provider {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "google_chat" => Some(Self::GoogleChat),
            "slack" => Some(Self::Slack),
            "teams" => Some(Self::Teams),
            _ => None,
        }
    }

    /// Hosts permitidos. Un `*.` al inicio se compara como sufijo con
    /// punto; el resto, exacto.
    fn allowed_hosts(self) -> &'static [&'static str] {
        match self {
            Self::GoogleChat => &["chat.googleapis.com"],
            Self::Slack => &["hooks.slack.com"],
            // Webhooks de Workflows (los conectores de Office 365,
            // *.webhook.office.com, están retirados). PENDIENTE: verificar
            // estos dos hosts con una URL real de Workflows; salen del spec,
            // no de una URL probada.
            Self::Teams => &["*.logic.azure.com", "*.environment.api.powerplatform.com"],
        }
    }

    fn path_allowed(self, url: &Url) -> bool {
        let segments: Vec<&str> = match url.path_segments() {
            Some(s) => s.collect(),
            None => return false,
        };
        match self {
            // /v1/spaces/<espacio>/messages
            Self::GoogleChat => {
                segments.len() == 4
                    && segments[0] == "v1"
                    && segments[1] == "spaces"
                    && !segments[2].is_empty()
                    && segments[3] == "messages"
            }
            // /services/… o /triggers/…
            Self::Slack => {
                segments.len() >= 2
                    && (segments[0] == "services" || segments[0] == "triggers")
                    && segments[1..].iter().any(|s| !s.is_empty())
            }
            Self::Teams => true,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UrlError {
    Invalid,
    NotHttps,
    HostNotAllowed,
    PathNotAllowed,
}

impl UrlError {
    pub fn code(self) -> &'static str {
        match self {
            Self::Invalid => "invalid_url",
            Self::NotHttps => "not_https",
            Self::HostNotAllowed => "host_not_allowed",
            Self::PathNotAllowed => "path_not_allowed",
        }
    }
}

fn host_matches(host: &str, pattern: &str) -> bool {
    match pattern.strip_prefix("*.") {
        Some(suffix) => host.len() > suffix.len() + 1 && host.ends_with(&format!(".{suffix}")),
        None => host == pattern,
    }
}

/// R10: `https`, host y ruta del proveedor, sin hacer ninguna llamada de red.
pub fn validate_webhook_url(provider: Provider, raw: &str) -> Result<Url, UrlError> {
    let url = Url::parse(raw.trim()).map_err(|_| UrlError::Invalid)?;
    if url.scheme() != "https" {
        return Err(UrlError::NotHttps);
    }
    // Credenciales en la URL: no las usa ningún proveedor y confunden al
    // leerla ("https://chat.googleapis.com@otro.host/…").
    if !url.username().is_empty() || url.password().is_some() {
        return Err(UrlError::Invalid);
    }
    if url.host().is_none() {
        return Err(UrlError::Invalid);
    }
    // `domain()` es `None` para las IPs: nunca se aceptan.
    let host = url.domain().ok_or(UrlError::HostNotAllowed)?.to_ascii_lowercase();
    // Solo el puerto por defecto (443); `Url` lo normaliza a `None`.
    if url.port().is_some() {
        return Err(UrlError::HostNotAllowed);
    }
    if !provider.allowed_hosts().iter().any(|p| host_matches(&host, p)) {
        return Err(UrlError::HostNotAllowed);
    }
    if !provider.path_allowed(&url) {
        return Err(UrlError::PathNotAllowed);
    }
    Ok(url)
}

/// Cuerpo de la petición. El texto va tal cual (ver "Formato del texto"
/// en el design).
pub fn build_body(provider: Provider, text: &str) -> Value {
    match provider {
        Provider::GoogleChat | Provider::Slack => json!({ "text": text }),
        // Formato de mensaje que espera la plantilla de Workflows "Publicar
        // en un canal cuando se recibe una solicitud de webhook".
        Provider::Teams => json!({
            "type": "message",
            "attachments": [{
                "contentType": "application/vnd.microsoft.card.adaptive",
                "contentUrl": null,
                "content": {
                    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "type": "AdaptiveCard",
                    "version": "1.4",
                    "body": [{ "type": "TextBlock", "text": text, "wrap": true }]
                }
            }]
        }),
    }
}

/// R16: ni vacío ni de más de 4000 caracteres.
pub fn validate_text(text: &str) -> Result<(), &'static str> {
    if text.trim().is_empty() {
        return Err("empty_text");
    }
    if text.chars().count() > MAX_TEXT_CHARS {
        return Err("text_too_long");
    }
    Ok(())
}

/// Ventana deslizante de una hora, como `loginLimiter` del servidor
/// (R17). En memoria: al reiniciar la app se pierde la cuenta.
pub struct RateLimiter {
    max: usize,
    window: Duration,
    hits: VecDeque<Instant>,
}

impl RateLimiter {
    pub fn new(max: usize, window: Duration) -> Self {
        Self { max, window, hits: VecDeque::new() }
    }

    pub fn try_acquire(&mut self, now: Instant) -> bool {
        while let Some(&first) = self.hits.front() {
            if now.duration_since(first) >= self.window {
                self.hits.pop_front();
            } else {
                break;
            }
        }
        if self.hits.len() >= self.max {
            return false;
        }
        self.hits.push_back(now);
        true
    }
}

/// Compartido con el envío "como yo" (team_chat_google.rs): R17 cuenta
/// los envíos, no el camino.
pub(super) fn limiter() -> &'static Mutex<RateLimiter> {
    static LIMITER: OnceLock<Mutex<RateLimiter>> = OnceLock::new();
    LIMITER.get_or_init(|| Mutex::new(RateLimiter::new(MAX_SENDS_PER_HOUR, Duration::from_secs(3600))))
}

/// Error de un envío. Solo códigos: nunca la URL ni el texto (R11).
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SendError {
    pub code: &'static str,
    /// Código HTTP del proveedor, si respondió.
    pub status: Option<u16>,
}

impl SendError {
    fn new(code: &'static str) -> Self {
        Self { code, status: None }
    }
}

/// Valida una URL antes de guardarla en el llavero (R10). La guarda
/// después el webview con `ext_secret_set`.
#[tauri::command]
pub fn team_chat_validate_url(provider: String, url: String) -> Result<(), String> {
    let provider = Provider::parse(&provider).ok_or("invalid_provider")?;
    validate_webhook_url(provider, &url).map(|_| ()).map_err(|e| e.code().to_string())
}

/// Envía `text` al webhook guardado en el llavero (envío manual y de
/// prueba). Timeout de 10 s y sin redirecciones (R18, R19).
#[tauri::command]
pub async fn team_chat_send(app: AppHandle, provider: String, text: String) -> Result<(), SendError> {
    let provider = Provider::parse(&provider).ok_or(SendError::new("invalid_provider"))?;
    validate_text(&text).map_err(SendError::new)?;

    let service = keychain_service(&app);
    let raw = tauri::async_runtime::spawn_blocking(move || read_secret(&service, EXTENSION_ID, WEBHOOK_KEY))
        .await
        .map_err(|_| SendError::new("keychain_error"))?
        .map_err(|e| SendError::new(if e == SECRET_NOT_FOUND { "needs_reconfig" } else { "keychain_error" }))?;
    // Se valida otra vez al enviar: el proveedor elegido pudo cambiar
    // después de guardar la URL.
    let url = validate_webhook_url(provider, &raw).map_err(|_| SendError::new("needs_reconfig"))?;

    if !limiter().lock().map(|mut l| l.try_acquire(Instant::now())).unwrap_or(false) {
        return Err(SendError::new("rate_limited"));
    }

    let client = reqwest::Client::builder()
        .timeout(SEND_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| SendError::new("network"))?;
    // Los errores de reqwest incluyen la URL en su texto: se reducen a un
    // código y no se registran.
    let resp = client
        .post(url)
        .json(&build_body(provider, &text))
        .send()
        .await
        .map_err(|e| SendError::new(if e.is_timeout() { "timeout" } else { "network" }))?;
    let status = resp.status();
    if status.is_success() {
        Ok(())
    } else {
        Err(SendError { code: "provider_error", status: Some(status.as_u16()) })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use Provider::*;

    const GOOGLE_OK: &str = "https://chat.googleapis.com/v1/spaces/AAAAbcd/messages?key=k123&token=t456";
    const SLACK_OK: &str = "https://hooks.slack.com/services/T000/B000/XXXX";

    #[test]
    fn urls_validas() {
        let ok = [
            (GoogleChat, GOOGLE_OK),
            (Slack, SLACK_OK),
            (Slack, "https://hooks.slack.com/triggers/T000/123/abc"),
            (Teams, "https://prod-12.westus.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?api-version=2016-06-01&sig=x"),
            (Teams, "https://default1234.56.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/abc/triggers/manual/paths/invoke?sig=x"),
            // Mayúsculas en el host y espacios alrededor.
            (GoogleChat, "  https://CHAT.googleapis.com/v1/spaces/AAA/messages?key=k  "),
        ];
        for (p, url) in ok {
            assert!(validate_webhook_url(p, url).is_ok(), "{p:?} {url}");
        }
    }

    #[test]
    fn urls_invalidas() {
        let cases = [
            // http
            (GoogleChat, "http://chat.googleapis.com/v1/spaces/AAA/messages", UrlError::NotHttps),
            (Slack, "http://hooks.slack.com/services/T/B/X", UrlError::NotHttps),
            (Teams, "http://prod-1.westus.logic.azure.com/workflows/x", UrlError::NotHttps),
            // otro host
            (GoogleChat, "https://evil.io/v1/spaces/AAA/messages", UrlError::HostNotAllowed),
            (Slack, "https://slack.com/services/T/B/X", UrlError::HostNotAllowed),
            (Teams, "https://outlook.webhook.office.com/webhookb2/x", UrlError::HostNotAllowed),
            // URL de otro proveedor
            (GoogleChat, SLACK_OK, UrlError::HostNotAllowed),
            (Slack, GOOGLE_OK, UrlError::HostNotAllowed),
            (Teams, SLACK_OK, UrlError::HostNotAllowed),
            // host parecido
            (GoogleChat, "https://chat.googleapis.com.evil.io/v1/spaces/AAA/messages", UrlError::HostNotAllowed),
            (GoogleChat, "https://evilchat.googleapis.com/v1/spaces/AAA/messages", UrlError::HostNotAllowed),
            (Slack, "https://hooks.slack.com.evil.io/services/T/B/X", UrlError::HostNotAllowed),
            (Teams, "https://logic.azure.com.evil.io/workflows/x", UrlError::HostNotAllowed),
            (Teams, "https://evillogic.azure.com/workflows/x", UrlError::HostNotAllowed),
            // el sufijo solo, sin subdominio
            (Teams, "https://logic.azure.com/workflows/x", UrlError::HostNotAllowed),
            // credenciales para disfrazar el host
            (GoogleChat, "https://chat.googleapis.com@evil.io/v1/spaces/AAA/messages", UrlError::Invalid),
            // IP y puerto
            (GoogleChat, "https://142.250.0.1/v1/spaces/AAA/messages", UrlError::HostNotAllowed),
            (GoogleChat, "https://chat.googleapis.com:8443/v1/spaces/AAA/messages", UrlError::HostNotAllowed),
            // ruta equivocada
            (GoogleChat, "https://chat.googleapis.com/v1/spaces/AAA", UrlError::PathNotAllowed),
            (GoogleChat, "https://chat.googleapis.com/v1/spaces//messages", UrlError::PathNotAllowed),
            (GoogleChat, "https://chat.googleapis.com/v2/spaces/AAA/messages", UrlError::PathNotAllowed),
            (Slack, "https://hooks.slack.com/", UrlError::PathNotAllowed),
            (Slack, "https://hooks.slack.com/services/", UrlError::PathNotAllowed),
            (Slack, "https://hooks.slack.com/apps/T/B/X", UrlError::PathNotAllowed),
            // no es una URL
            (GoogleChat, "chat.googleapis.com/v1/spaces/AAA/messages", UrlError::Invalid),
            (Slack, "", UrlError::Invalid),
        ];
        for (p, url, want) in cases {
            assert_eq!(validate_webhook_url(p, url).err(), Some(want), "{p:?} {url}");
        }
    }

    #[test]
    fn proveedor_desconocido() {
        assert_eq!(Provider::parse("discord"), None);
        assert_eq!(team_chat_validate_url("discord".into(), SLACK_OK.into()), Err("invalid_provider".into()));
        assert_eq!(team_chat_validate_url("slack".into(), SLACK_OK.into()), Ok(()));
        assert_eq!(team_chat_validate_url("slack".into(), GOOGLE_OK.into()), Err("host_not_allowed".into()));
    }

    #[test]
    fn cuerpo_google_y_slack() {
        let text = "Buenos días.\n*Hoy*\n- algo";
        assert_eq!(build_body(GoogleChat, text), json!({ "text": text }));
        assert_eq!(build_body(Slack, text), json!({ "text": text }));
    }

    #[test]
    fn cuerpo_teams_es_tarjeta_adaptativa() {
        let body = build_body(Teams, "hola\nmundo");
        assert_eq!(body["type"], "message");
        let att = &body["attachments"][0];
        assert_eq!(att["contentType"], "application/vnd.microsoft.card.adaptive");
        assert_eq!(att["content"]["type"], "AdaptiveCard");
        let blocks = att["content"]["body"].as_array().unwrap();
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0], json!({ "type": "TextBlock", "text": "hola\nmundo", "wrap": true }));
    }

    #[test]
    fn texto_vacio_o_largo() {
        assert_eq!(validate_text(""), Err("empty_text"));
        assert_eq!(validate_text("  \n "), Err("empty_text"));
        assert_eq!(validate_text("hola"), Ok(()));
        // Se cuentan caracteres, no bytes.
        assert_eq!(validate_text(&"ñ".repeat(MAX_TEXT_CHARS)), Ok(()));
        assert_eq!(validate_text(&"a".repeat(MAX_TEXT_CHARS + 1)), Err("text_too_long"));
    }

    #[test]
    fn limite_por_hora() {
        let mut l = RateLimiter::new(MAX_SENDS_PER_HOUR, Duration::from_secs(3600));
        let t0 = Instant::now();
        for i in 0..MAX_SENDS_PER_HOUR {
            assert!(l.try_acquire(t0 + Duration::from_secs(i as u64)), "envío {i}");
        }
        assert!(!l.try_acquire(t0 + Duration::from_secs(60)));
        // Una hora después del primero, se libera un cupo.
        assert!(l.try_acquire(t0 + Duration::from_secs(3600)));
        assert!(!l.try_acquire(t0 + Duration::from_secs(3600)));
    }
}
