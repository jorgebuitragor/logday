//! Extensión "OpenProject" (`openproject`, specs/openproject): trae los
//! work packages asignados al usuario como tareas de Logday.
//!
//! Va en Desktop porque el OpenProject de la empresa solo se alcanza desde
//! la red interna o la VPN. Usa la API v3 con el token personal del
//! usuario (Basic, usuario `apikey`). La URL y el token se guardan juntos en
//! el llavero: el token solo viaja a la URL con la que se guardó, y ninguno
//! de los dos llega al webview (R10, R17).

use std::net::IpAddr;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use reqwest::Url;
use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use super::google_oauth::keychain;
use super::{delete_secret, read_secret, write_secret, SECRET_NOT_FOUND};

pub const EXTENSION_ID: &str = "openproject";
pub const URL_KEY: &str = "url";
pub const TOKEN_KEY: &str = "token";
const HTTP_TIMEOUT: Duration = Duration::from_secs(20);
const PAGE_SIZE: u32 = 100;
const MAX_PAGE: u32 = 20; // P4: hasta 2000 work packages por rol
const MAX_BODY: usize = 8 * 1024 * 1024;
const MAX_CUSTOM_FIELDS: usize = 60;
// Si la lista de filtros falla, se prueban los campos uno por uno, hasta
// `PROBE_MAX` o tras `PROBE_GAP` seguidos que no existen.
const PROBE_MAX: u32 = 200;
const PROBE_GAP: u32 = 25;

// ── Piezas puras (con pruebas) ────────────────────────────────────────

/// Nombres que solo existen dentro de una red: un nombre sin puntos o
/// con un dominio reservado para redes privadas.
fn is_internal_host(host: &str) -> bool {
    let host = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = host.parse::<IpAddr>() {
        return match ip {
            IpAddr::V4(v4) => v4.is_private() || v4.is_loopback() || v4.is_link_local(),
            IpAddr::V6(v6) => v6.is_loopback() || (v6.segments()[0] & 0xfe00) == 0xfc00,
        };
    }
    !host.contains('.')
        || [".local", ".lan", ".internal", ".intranet", ".corp", ".home.arpa", ".localhost"]
            .iter()
            .any(|suffix| host.ends_with(suffix))
}

/// P1: `https` con cualquier host; `http` solo dentro de la red interna
/// (con un aviso en el panel), porque el token va en cada petición. Se
/// guarda sin `/` final, y puede tener ruta (`https://host/openproject`).
pub fn validate_url(raw: &str) -> Result<Url, &'static str> {
    let mut url = Url::parse(raw.trim()).map_err(|_| "invalid_url")?;
    if !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
        return Err("invalid_url");
    }
    let host = url.host_str().ok_or("invalid_url")?.to_ascii_lowercase();
    match url.scheme() {
        "https" => {}
        "http" if is_internal_host(&host) => {}
        "http" => return Err("not_https"),
        _ => return Err("invalid_url"),
    }
    let path = url.path().trim_end_matches('/').to_string();
    url.set_path(&path);
    Ok(url)
}

fn api(base: &Url, path: &str) -> Result<Url, &'static str> {
    Url::parse(&format!("{}{}", base.as_str().trim_end_matches('/'), path)).map_err(|_| "invalid_url")
}

/// P4: el campo del work package donde está el usuario. La API solo une
/// filtros con "y", así que cada campo es una consulta.
pub const ROLES: [&str; 2] = ["assignee", "responsible"];

/// P4b: un campo personalizado de OpenProject (`customField<n>`), como
/// "Responsable Desarrollo".
pub fn is_custom_field(id: &str) -> bool {
    id.strip_prefix("customField")
        .is_some_and(|n| !n.is_empty() && n.len() <= 9 && n.chars().all(|c| c.is_ascii_digit()))
}

/// P4: los work packages abiertos donde el usuario está en `role`
/// (asignado, responsable o un campo personalizado de persona), los
/// cambiados hace poco primero. En los campos personalizados va el id del
/// usuario: `me` solo es seguro en los campos propios de OpenProject.
///
/// Con `project` (su id), dentro de ese proyecto: un campo personalizado
/// que no está en todos los proyectos solo se acepta así (en la FCV, fuera
/// de un proyecto, "Cf 11 no existe").
///
/// Con `closed`, también los cerrados (P4c): sin el filtro de estado.
pub fn work_packages_url(
    base: &Url,
    role: &str,
    user_id: &str,
    project: Option<u64>,
    closed: bool,
    page: u32,
) -> Result<Url, &'static str> {
    let value = if ROLES.contains(&role) {
        "me"
    } else if is_custom_field(role) && !user_id.is_empty() && user_id.chars().all(|c| c.is_ascii_digit()) {
        user_id
    } else {
        return Err("invalid_role");
    };
    let status = if closed { "*" } else { "o" };
    let filters = format!(
        r#"[{{"{role}":{{"operator":"=","values":["{value}"]}}}},{{"status":{{"operator":"{status}","values":[]}}}}]"#
    );
    let path = match project {
        Some(id) => format!("/api/v3/projects/{id}/work_packages"),
        None => "/api/v3/work_packages".to_string(),
    };
    let mut url = api(base, &path)?;
    url.query_pairs_mut()
        .append_pair("filters", &filters)
        .append_pair("sortBy", r#"[["updatedAt","desc"]]"#)
        .append_pair("pageSize", &PAGE_SIZE.to_string())
        .append_pair("offset", &page.to_string());
    Ok(url)
}

/// La clase de valor de un filtro con `=`, en una `filter_instance_schema`:
/// `user` (una persona, `[]User`) o `text` (`[1]String`, como el campo
/// "Tarea" de la FCV). Las demás no se usan.
pub fn schema_kind(schema: &Value) -> Option<&'static str> {
    let deps = schema.get("_dependencies")?.as_array()?;
    deps.iter().find_map(|d| {
        match d.pointer("/dependencies/~1api~1v3~1queries~1operators~1%3D/values/type").and_then(Value::as_str)? {
            "[]User" => Some("user"),
            "[1]String" => Some("text"),
            _ => None,
        }
    })
}

/// P4b, P5: los campos personalizados de persona o de texto de la lista
/// de `filter_instance_schemas`. Devuelve sus ids y clase, en orden, y si
/// la lista traía algún campo personalizado (sin sesión, o en algunas
/// versiones, no trae ninguno).
pub fn custom_field_ids(schemas: &Value) -> (Vec<(String, &'static str)>, bool) {
    let Some(els) = schemas.pointer("/_embedded/elements").and_then(Value::as_array) else {
        return (Vec::new(), false);
    };
    let mut any_custom = false;
    let ids = els
        .iter()
        .filter_map(|el| {
            let id = el.pointer("/_links/self/href")?.as_str()?.rsplit('/').next()?;
            if !is_custom_field(id) {
                return None;
            }
            any_custom = true;
            schema_kind(el).map(|kind| (id.to_string(), kind))
        })
        .take(MAX_CUSTOM_FIELDS)
        .collect();
    (ids, any_custom)
}

/// El nombre de un filtro de `/api/v3/queries/filters/<id>`: OpenProject lo
/// da como `title` del enlace propio.
pub fn filter_title(filter: &Value) -> Option<String> {
    filter
        .pointer("/_links/self/title")
        .or_else(|| filter.get("name"))
        .and_then(Value::as_str)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Un código para el webview: nunca el texto del error, que puede llevar
/// la URL.
pub fn status_error(status: u16) -> &'static str {
    match status {
        300..=399 => "redirected",
        // Filtro que OpenProject no acepta (un campo que no está en ese
        // proyecto, o un valor que no corresponde).
        400 => "bad_request",
        401 => "unauthorized",
        403 => "forbidden",
        404 => "not_found",
        // P12: alguien cambió el work package desde que se importó.
        409 => "conflict",
        // P12: OpenProject no acepta el valor (p. ej. un avance que sale
        // del estado, o una transición de estado que el flujo no permite).
        422 => "rejected",
        429 => "rate_limited",
        _ => "provider_error",
    }
}

// ── URL y token en memoria tras leerlos una vez ───────────────────────

type Credentials = (Url, String);

/// El id del usuario (de `/users/me`), para los campos personalizados.
fn user_id_cache() -> &'static Mutex<Option<String>> {
    static CACHE: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn cache() -> &'static Mutex<Option<Credentials>> {
    static CACHE: OnceLock<Mutex<Option<Credentials>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn set_cache(value: Option<Credentials>) {
    if let Ok(mut g) = cache().lock() {
        *g = value;
    }
    if let Ok(mut g) = user_id_cache().lock() {
        *g = None;
    }
}

async fn user_id(base: &Url, token: &str) -> Result<String, &'static str> {
    if let Some(id) = user_id_cache().lock().ok().and_then(|g| g.clone()) {
        return Ok(id);
    }
    let me: Value = serde_json::from_str(&get(api(base, "/api/v3/users/me")?, token).await?).map_err(|_| "not_openproject")?;
    let id = me.get("id").and_then(Value::as_u64).ok_or("not_openproject")?.to_string();
    if let Ok(mut g) = user_id_cache().lock() {
        *g = Some(id.clone());
    }
    Ok(id)
}

async fn credentials(app: &AppHandle) -> Result<Credentials, &'static str> {
    if let Some(c) = cache().lock().ok().and_then(|g| g.clone()) {
        return Ok(c);
    }
    let (raw, token) = keychain(app, |s| {
        Ok((read_secret(&s, EXTENSION_ID, URL_KEY)?, read_secret(&s, EXTENSION_ID, TOKEN_KEY)?))
    })
    .await
    .map_err(|e| if e == SECRET_NOT_FOUND { "needs_connect" } else { e })?;
    let url = validate_url(&raw).map_err(|_| "needs_connect")?;
    set_cache(Some((url.clone(), token.clone())));
    Ok((url, token))
}

fn http() -> Result<reqwest::Client, &'static str> {
    reqwest::Client::builder()
        .timeout(HTTP_TIMEOUT)
        // Sin redirecciones: el token iría a otro sitio.
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Logday")
        .build()
        .map_err(|_| "network")
}

async fn get(url: Url, token: &str) -> Result<String, &'static str> {
    let resp = http()?
        .get(url)
        .basic_auth("apikey", Some(token))
        .header("Accept", "application/hal+json")
        .send()
        .await
        .map_err(|e| if e.is_timeout() { "timeout" } else { "network" })?;
    if !resp.status().is_success() {
        return Err(status_error(resp.status().as_u16()));
    }
    let body = resp.text().await.map_err(|_| "network")?;
    if body.len() > MAX_BODY {
        return Err("too_big");
    }
    Ok(body)
}

/// P12: el cuerpo del PATCH: `lockVersion` (para que OpenProject rechace el
/// cambio si alguien lo editó entretanto), y solo lo que cambió.
pub fn update_body(lock_version: u64, progress: Option<u8>, status: Option<u64>) -> Result<Value, &'static str> {
    if progress.is_none() && status.is_none() {
        return Err("nothing_to_send");
    }
    let mut body = serde_json::json!({ "lockVersion": lock_version });
    if let Some(p) = progress {
        if p > 100 {
            return Err("invalid_progress");
        }
        body["percentageDone"] = p.into();
    }
    if let Some(s) = status {
        body["_links"] = serde_json::json!({ "status": { "href": format!("/api/v3/statuses/{s}") } });
    }
    Ok(body)
}

/// El mensaje de un error de OpenProject, recortado: se muestra como dato.
fn op_message(body: &str) -> String {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v.get("message")?.as_str().map(|m| m.chars().take(200).collect()))
        .unwrap_or_default()
}

// ── Comandos ──────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct Connected {
    pub name: String,
    /// La URL tal como quedó guardada, para los enlaces de las tareas.
    pub url: String,
}

/// P2: prueba la URL y el token con `/api/v3/users/me` y, si responden,
/// los guarda en el llavero. Devuelve el nombre del usuario y la URL.
#[tauri::command]
pub async fn openproject_connect(app: AppHandle, url: String, token: String) -> Result<Connected, String> {
    let base = validate_url(&url)?;
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err("missing_token".into());
    }
    let body = get(api(&base, "/api/v3/users/me")?, &token).await?;
    let me: Value = serde_json::from_str(&body).map_err(|_| "not_openproject")?;
    if me.get("_type").and_then(Value::as_str) != Some("User") {
        return Err("not_openproject".into());
    }
    let name = me
        .get("name")
        .or_else(|| me.get("login"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let (raw, secret) = (base.to_string(), token.clone());
    keychain(&app, move |s| {
        write_secret(&s, EXTENSION_ID, URL_KEY, &raw)?;
        write_secret(&s, EXTENSION_ID, TOKEN_KEY, &secret)
    })
    .await?;
    let url = base.as_str().trim_end_matches('/').to_string();
    set_cache(Some((base, token)));
    Ok(Connected { name, url })
}

/// P3: borra la URL y el token. El token sigue vivo en OpenProject hasta
/// que el usuario lo revoque en "Mi cuenta → Tokens de acceso".
#[tauri::command]
pub async fn openproject_disconnect(app: AppHandle) -> Result<(), String> {
    set_cache(None);
    keychain(&app, |s| {
        delete_secret(&s, EXTENSION_ID, URL_KEY)?;
        delete_secret(&s, EXTENSION_ID, TOKEN_KEY)
    })
    .await
    .map_err(String::from)
}

/// P4: una página (desde 1) de los work packages abiertos donde el
/// usuario está en `role` (`assignee`, `responsible` o `customField<n>`),
/// en el JSON de OpenProject, que el webview lee como datos.
#[tauri::command]
pub async fn openproject_work_packages(
    app: AppHandle,
    role: String,
    project: Option<u64>,
    closed: Option<bool>,
    page: u32,
) -> Result<String, String> {
    if !(1..=MAX_PAGE).contains(&page) {
        return Err("invalid_page".into());
    }
    let (base, token) = credentials(&app).await?;
    let user = if is_custom_field(&role) { user_id(&base, &token).await? } else { String::new() };
    get(work_packages_url(&base, &role, &user, project, closed.unwrap_or(false), page)?, &token)
        .await
        .map_err(String::from)
}

/// P5e: los estados de ese OpenProject, con si cuentan como cerrados, para
/// poner el estado de la tarea en Logday.
#[tauri::command]
pub async fn openproject_statuses(app: AppHandle) -> Result<String, String> {
    let (base, token) = credentials(&app).await?;
    get(api(&base, "/api/v3/statuses")?, &token).await.map_err(String::from)
}

/// P12: envía a OpenProject el avance y/o el estado de un work package. Con
/// `lockVersion`, OpenProject rechaza el cambio (409, `conflict`) si alguien
/// lo editó desde la última importación. Devuelve el work package tal como
/// quedó (JSON). Un 422 vuelve como `rejected|<mensaje de OpenProject>`.
#[tauri::command]
pub async fn openproject_update_work_package(
    app: AppHandle,
    id: u64,
    lock_version: u64,
    progress: Option<u8>,
    status: Option<u64>,
) -> Result<String, String> {
    if id == 0 {
        return Err("invalid_id".into());
    }
    let body = update_body(lock_version, progress, status)?;
    let (base, token) = credentials(&app).await?;
    let resp = http()?
        .patch(api(&base, &format!("/api/v3/work_packages/{id}"))?)
        .basic_auth("apikey", Some(&token))
        .header("Accept", "application/hal+json")
        .json(&body)
        .send()
        .await
        .map_err(|e| if e.is_timeout() { "timeout" } else { "network" })?;
    let status_code = resp.status().as_u16();
    let text = resp.text().await.map_err(|_| "network")?;
    match status_code {
        200..=299 => Ok(text),
        422 => Err(format!("rejected|{}", op_message(&text))),
        s => Err(status_error(s).into()),
    }
}

/// P5b: un work package por su id, para saber el tipo de sus ancestros
/// (la épica que contiene la tarea).
#[tauri::command]
pub async fn openproject_work_package(app: AppHandle, id: u64) -> Result<String, String> {
    if id == 0 {
        return Err("invalid_id".into());
    }
    let (base, token) = credentials(&app).await?;
    get(api(&base, &format!("/api/v3/work_packages/{id}"))?, &token).await.map_err(String::from)
}

/// P4b: una página (desde 1) de los proyectos activos que ve el usuario,
/// para buscar en cada uno los campos personalizados que no están en
/// todos.
#[tauri::command]
pub async fn openproject_projects(app: AppHandle, page: u32) -> Result<String, String> {
    if !(1..=MAX_PAGE).contains(&page) {
        return Err("invalid_page".into());
    }
    let (base, token) = credentials(&app).await?;
    let mut url = api(&base, "/api/v3/projects")?;
    url.query_pairs_mut()
        .append_pair("filters", r#"[{"active":{"operator":"=","values":["t"]}}]"#)
        .append_pair("pageSize", &PAGE_SIZE.to_string())
        .append_pair("offset", &page.to_string());
    get(url, &token).await.map_err(String::from)
}

#[derive(Serialize)]
pub struct CustomField {
    pub id: String,
    pub name: String,
    /// `user` o `text` (ver `schema_kind`).
    pub kind: &'static str,
}

/// P4b, P5: los campos personalizados de persona (como "Responsable
/// Desarrollo") y de texto (como "Tarea") que el usuario puede usar, con su
/// nombre.
#[tauri::command]
pub async fn openproject_custom_fields(app: AppHandle) -> Result<Vec<CustomField>, String> {
    let (base, token) = credentials(&app).await?;
    let mut url = api(&base, "/api/v3/queries/filter_instance_schemas")?;
    url.query_pairs_mut().append_pair("pageSize", "1000");
    // En la FCV esta lista falla con sesión, y sin sesión no trae los campos
    // personalizados: en esos casos se prueban uno por uno.
    let listed = match get(url, &token).await {
        Ok(body) => serde_json::from_str::<Value>(&body).ok().map(|v| custom_field_ids(&v)),
        Err("unauthorized") => return Err("unauthorized".into()),
        Err(_) => None,
    };
    let ids = match listed {
        Some((ids, true)) => ids,
        _ => probe_custom_fields(&base, &token).await?,
    };
    let mut out = Vec::new();
    for (id, kind) in ids {
        // Sin el nombre, el campo se muestra con su id: no se pierde.
        let name = match get(api(&base, &format!("/api/v3/queries/filters/{id}"))?, &token).await {
            Ok(body) => serde_json::from_str::<Value>(&body).ok().as_ref().and_then(filter_title),
            Err(_) => None,
        };
        out.push(CustomField { name: name.unwrap_or_else(|| id.clone()), id, kind });
    }
    Ok(out)
}

async fn probe_custom_fields(base: &Url, token: &str) -> Result<Vec<(String, &'static str)>, &'static str> {
    let mut ids = Vec::new();
    let mut misses = 0;
    for n in 1..=PROBE_MAX {
        let id = format!("customField{n}");
        match get(api(base, &format!("/api/v3/queries/filter_instance_schemas/{id}"))?, token).await {
            Ok(body) => {
                misses = 0;
                if let Some(kind) = serde_json::from_str::<Value>(&body).ok().as_ref().and_then(schema_kind) {
                    ids.push((id, kind));
                    if ids.len() >= MAX_CUSTOM_FIELDS {
                        break;
                    }
                }
            }
            Err("not_found") => {
                misses += 1;
                if misses >= PROBE_GAP {
                    break;
                }
            }
            // Un campo que da error no detiene la búsqueda.
            Err("provider_error") => misses = 0,
            Err(e) => return Err(e),
        }
    }
    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls_permitidas() {
        assert_eq!(validate_url("https://op.fcv.org/").unwrap().as_str(), "https://op.fcv.org/");
        assert_eq!(validate_url(" https://intranet.fcv.org/openproject/ ").unwrap().as_str(), "https://intranet.fcv.org/openproject");
        for ok in ["http://openproject/", "http://op.fcv.local", "http://10.1.2.3:8080", "http://192.168.0.5", "http://op.corp", "http://localhost:3000"] {
            assert!(validate_url(ok).is_ok(), "{ok}");
        }
        assert_eq!(validate_url("http://op.fcv.org").unwrap_err(), "not_https");
        assert_eq!(validate_url("http://8.8.8.8").unwrap_err(), "not_https");
        for bad in ["ftp://op.fcv.org", "https://u:p@op.fcv.org", "https://op.fcv.org/?x=1", "no es url"] {
            assert_eq!(validate_url(bad).unwrap_err(), "invalid_url", "{bad}");
        }
    }

    #[test]
    fn consulta_de_work_packages() {
        let base = validate_url("https://op.fcv.org/openproject").unwrap();
        let url = work_packages_url(&base, "assignee", "", None, false, 2).unwrap();
        assert_eq!(url.path(), "/openproject/api/v3/work_packages");
        let q: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        let filters: Value = serde_json::from_str(&q["filters"]).unwrap();
        assert_eq!(filters[0]["assignee"]["values"][0], "me");
        assert_eq!(filters[1]["status"]["operator"], "o");
        assert_eq!(q["offset"], "2");
        assert_eq!(q["pageSize"], "100");
        let url = work_packages_url(&base, "responsible", "", None, false, 1).unwrap();
        let q: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        let filters: Value = serde_json::from_str(&q["filters"]).unwrap();
        assert_eq!(filters[0]["responsible"]["operator"], "=");
        assert_eq!(filters[0]["responsible"]["values"][0], "me");
        // Un campo personalizado va con el id del usuario.
        let url = work_packages_url(&base, "customField12", "57", Some(46), true, 1).unwrap();
        let q: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        let filters: Value = serde_json::from_str(&q["filters"]).unwrap();
        assert_eq!(filters[0]["customField12"]["values"][0], "57");
        assert_eq!(url.path(), "/openproject/api/v3/projects/46/work_packages");
        // Con los cerrados (P4c), el estado es "cualquiera".
        assert_eq!(filters[1]["status"]["operator"], "*");
        // Solo esos campos: el webview no arma filtros a su gusto.
        assert_eq!(work_packages_url(&base, "author", "", None, false, 1).unwrap_err(), "invalid_role");
        assert_eq!(work_packages_url(&base, "customField12", "", None, false, 1).unwrap_err(), "invalid_role");
        assert_eq!(work_packages_url(&base, "customField1\"}]", "5", None, false, 1).unwrap_err(), "invalid_role");
        assert_eq!(work_packages_url(&base, "customField12", "5\"", None, false, 1).unwrap_err(), "invalid_role");
    }

    #[test]
    fn campos_personalizados() {
        let schemas: Value = serde_json::from_str(r#"{"_embedded":{"elements":[
          {"_links":{"self":{"href":"/api/v3/queries/filter_instance_schemas/assignee"}},
           "_dependencies":[{"dependencies":{"/api/v3/queries/operators/%3D":{"values":{"type":"[]User"}}}}]},
          {"_links":{"self":{"href":"/api/v3/queries/filter_instance_schemas/customField12"}},
           "_dependencies":[{"dependencies":{"/api/v3/queries/operators/%3D":{"values":{"type":"[]User"}}}}]},
          {"_links":{"self":{"href":"/api/v3/queries/filter_instance_schemas/customField3"}},
           "_dependencies":[{"dependencies":{"/api/v3/queries/operators/%3D":{"values":{"type":"[1]String"}}}}]},
          {"_links":{"self":{"href":"/api/v3/queries/filter_instance_schemas/customField21"}},
           "_dependencies":[{"dependencies":{"/api/v3/queries/operators/%3D":{"values":{"type":"[]Version"}}}}]}
        ]}}"#).unwrap();
        assert_eq!(
            custom_field_ids(&schemas),
            (vec![("customField12".to_string(), "user"), ("customField3".to_string(), "text")], true)
        );
        assert_eq!(custom_field_ids(&Value::Null), (vec![], false));
        // Sin campos personalizados en la lista: hay que probar uno por uno.
        let solo_propios: Value = serde_json::from_str(r#"{"_embedded":{"elements":[
          {"_links":{"self":{"href":"/api/v3/queries/filter_instance_schemas/assignee"}}}]}}"#).unwrap();
        assert_eq!(custom_field_ids(&solo_propios), (vec![], false));
        // El nombre viene en el título del enlace (así responde la FCV).
        let f: Value = serde_json::from_str(r#"{"_type":"QueryFilter","id":"customField11","_links":{"self":{"href":"/x","title":"Responsable Desarrollo "}}}"#).unwrap();
        assert_eq!(filter_title(&f).as_deref(), Some("Responsable Desarrollo"));
        assert_eq!(filter_title(&Value::Null), None);
        assert!(is_custom_field("customField7"));
        assert!(!is_custom_field("customField") && !is_custom_field("customFieldx") && !is_custom_field("assignee"));
    }

    #[test]
    fn cuerpo_del_cambio() {
        let b = update_body(7, Some(40), Some(12)).unwrap();
        assert_eq!(b["lockVersion"], 7);
        assert_eq!(b["percentageDone"], 40);
        assert_eq!(b["_links"]["status"]["href"], "/api/v3/statuses/12");
        let solo_avance = update_body(7, Some(0), None).unwrap();
        assert!(solo_avance.get("_links").is_none());
        assert_eq!(update_body(7, None, None).unwrap_err(), "nothing_to_send");
        assert_eq!(update_body(7, Some(101), None).unwrap_err(), "invalid_progress");
        assert_eq!(op_message(r#"{"_type":"Error","message":"% no se puede cambiar"}"#), "% no se puede cambiar");
        assert_eq!(op_message("<html>"), "");
    }

    #[test]
    fn codigos_de_error() {
        assert_eq!(status_error(302), "redirected");
        assert_eq!(status_error(400), "bad_request");
        assert_eq!(status_error(401), "unauthorized");
        assert_eq!(status_error(404), "not_found");
        assert_eq!(status_error(409), "conflict");
        assert_eq!(status_error(422), "rejected");
        assert_eq!(status_error(500), "provider_error");
    }
}
