//! Servidores de repos a los que Logday puede conectarse (specs/skills-de-
//! agentes SK25, SK36): github.com y gitlab.com de serie, más los propios
//! (GitLab o Gitea/Forgejo) que añada el usuario.
//!
//! La lista de los propios la guarda Rust en `<datos>/agent-skills/
//! servers.json`, que `FsScope` veta al webview (SK27): un script del
//! webview no puede añadir un host sin pasar por el diálogo nativo, y por
//! eso tampoco puede hacer que Logday se conecte adonde quiera.

use std::fs;

use serde::{Deserialize, Serialize};

use super::files::sha256_hex;
use super::ops::{write_atomic, ERR_IO};
use super::roots::{Roots, ERR_INVALID};

const FILE: &str = "servers.json";
/// Cuántos servidores propios como mucho.
const MAX_SERVERS: usize = 50;

pub const GITHUB_HOST: &str = "github.com";
pub const GITLAB_HOST: &str = "gitlab.com";

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Github,
    Gitlab,
    /// Gitea y Forgejo (misma API).
    Gitea,
}

impl Kind {
    pub fn key(self) -> &'static str {
        match self {
            Kind::Github => "github",
            Kind::Gitlab => "gitlab",
            Kind::Gitea => "gitea",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Kind::Github => "GitHub",
            Kind::Gitlab => "GitLab",
            Kind::Gitea => "Gitea/Forgejo",
        }
    }
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Server {
    pub host: String,
    pub kind: Kind,
    /// De serie: no se puede quitar.
    pub builtin: bool,
    /// La clave de su token en el llavero (`ext:agent-skills:<clave>`).
    pub token_key: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct StoredServer {
    host: String,
    kind: Kind,
}

#[derive(Serialize, Deserialize, Default)]
struct Stored {
    servers: Vec<StoredServer>,
}

/// El host en minúsculas, sin `https://` ni `/` al final. `None` si no es
/// un host (nombre o IPv4) con puerto opcional: nada de usuario, ruta,
/// consulta ni espacios.
pub fn normalize_host(raw: &str) -> Option<String> {
    let mut h = raw.trim().to_ascii_lowercase();
    if let Some(rest) = h.strip_prefix("https://") {
        h = rest.to_string();
    }
    let h = h.trim_end_matches('/').to_string();
    if h.is_empty() || h.len() > 253 {
        return None;
    }
    let (name, port) = match h.rsplit_once(':') {
        Some((n, p)) => (n, Some(p)),
        None => (h.as_str(), None),
    };
    if let Some(p) = port {
        let n: u32 = p.parse().ok()?;
        if p.starts_with('0') || n == 0 || n > 65535 {
            return None;
        }
    }
    let name = name.trim_end_matches('.');
    let labels: Vec<&str> = name.split('.').collect();
    let ok = labels.len() >= 2
        && labels.iter().all(|l| {
            !l.is_empty() && l.len() <= 63 && !l.starts_with('-') && !l.ends_with('-') && l.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
        });
    // Un nombre de una sola parte (`gitlab`, `localhost`) no: se pide el
    // nombre completo o la IP, para no depender de la búsqueda de dominios.
    if !ok {
        return None;
    }
    Some(match port {
        Some(p) => format!("{name}:{p}"),
        None => name.to_string(),
    })
}

/// La clave del token de un host. GitHub conserva la de antes.
pub fn token_key(host: &str) -> String {
    match host {
        GITHUB_HOST => "github_token".into(),
        GITLAB_HOST => "gitlab_token".into(),
        _ => format!("token-{}", &sha256_hex(host.as_bytes())[..12]),
    }
}

fn builtin() -> Vec<Server> {
    [(GITHUB_HOST, Kind::Github), (GITLAB_HOST, Kind::Gitlab)]
        .into_iter()
        .map(|(host, kind)| Server { host: host.into(), kind, builtin: true, token_key: token_key(host) })
        .collect()
}

fn read(roots: &Roots) -> Stored {
    fs::read_to_string(roots.data.join(FILE)).ok().and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or_default()
}

fn write(roots: &Roots, s: &Stored) -> Result<(), &'static str> {
    fs::create_dir_all(&roots.data).map_err(|_| ERR_IO)?;
    let bytes = serde_json::to_vec_pretty(s).map_err(|_| ERR_INVALID)?;
    write_atomic(&roots.data.join(FILE), &bytes)
}

/// Los de serie y los propios (los que se lean mal del archivo se omiten).
pub fn list(roots: &Roots) -> Vec<Server> {
    let mut out = builtin();
    for s in read(roots).servers {
        let Some(host) = normalize_host(&s.host) else { continue };
        if s.kind == Kind::Github || out.iter().any(|o| o.host == host) {
            continue;
        }
        out.push(Server { token_key: token_key(&host), host, kind: s.kind, builtin: false });
    }
    out
}

pub fn find(roots: &Roots, host: &str) -> Option<Server> {
    let host = normalize_host(host)?;
    list(roots).into_iter().find(|s| s.host == host)
}

/// Añade (o cambia el tipo de) un servidor propio. Solo GitLab o Gitea: un
/// GitHub Enterprise no está soportado.
pub fn add(roots: &Roots, host: &str, kind: Kind) -> Result<Server, &'static str> {
    let host = normalize_host(host).ok_or(ERR_INVALID)?;
    if kind == Kind::Github {
        return Err(ERR_INVALID);
    }
    if let Some(b) = builtin().into_iter().find(|b| b.host == host) {
        return Ok(b);
    }
    let mut s = read(roots);
    s.servers.retain(|x| normalize_host(&x.host).as_deref() != Some(host.as_str()));
    if s.servers.len() >= MAX_SERVERS {
        return Err(super::roots::ERR_TOO_LARGE);
    }
    s.servers.push(StoredServer { host: host.clone(), kind });
    write(roots, &s)?;
    Ok(Server { token_key: token_key(&host), host, kind, builtin: false })
}

/// Quita un servidor propio. Devuelve la clave de su token para borrarlo.
pub fn remove(roots: &Roots, host: &str) -> Result<Option<String>, &'static str> {
    let host = normalize_host(host).ok_or(ERR_INVALID)?;
    if builtin().iter().any(|b| b.host == host) {
        return Err(ERR_INVALID);
    }
    let mut s = read(roots);
    let before = s.servers.len();
    s.servers.retain(|x| normalize_host(&x.host).as_deref() != Some(host.as_str()));
    if s.servers.len() == before {
        return Ok(None);
    }
    write(roots, &s)?;
    Ok(Some(token_key(&host)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extensions::agent_skills::roots::tests::Tmp;

    #[test]
    fn normaliza_hosts() {
        assert_eq!(normalize_host(" https://GitLab.Empresa.co/ ").as_deref(), Some("gitlab.empresa.co"));
        assert_eq!(normalize_host("git.casa.lan:3000").as_deref(), Some("git.casa.lan:3000"));
        assert_eq!(normalize_host("100.64.0.7:8443").as_deref(), Some("100.64.0.7:8443"));
        for bad in ["", "gitlab", "localhost", "http://x.co", "x.co/ruta", "u@x.co", "x.co:0", "x.co:70000", "x.co:08", "-a.co", "a..co", "x.co?y", "x co.com", "[::1]:80"] {
            assert_eq!(normalize_host(bad), None, "{bad}");
        }
    }

    #[test]
    fn claves_de_token() {
        assert_eq!(token_key("github.com"), "github_token");
        assert_eq!(token_key("gitlab.com"), "gitlab_token");
        let k = token_key("git.casa.lan:3000");
        assert!(k.starts_with("token-") && k.len() == 18, "{k}");
        assert_ne!(k, token_key("git.casa.lan"));
        // Debe caber en las claves del llavero de extensiones.
        assert!(crate::extensions::secret_account("agent-skills", &k).is_ok());
    }

    #[test]
    fn anade_y_quita_servidores() {
        let t = Tmp::new("servers");
        let r = t.roots();
        assert_eq!(list(&r).len(), 2);
        assert_eq!(add(&r, "github.com", Kind::Gitlab).unwrap().kind, Kind::Github);
        assert!(add(&r, "git.casa.lan", Kind::Github).is_err());
        let s = add(&r, "https://Git.Casa.lan/", Kind::Gitea).unwrap();
        assert_eq!((s.host.as_str(), s.kind, s.builtin), ("git.casa.lan", Kind::Gitea, false));
        add(&r, "git.casa.lan", Kind::Gitlab).unwrap();
        let all = list(&r);
        assert_eq!(all.len(), 3);
        assert_eq!(find(&r, "GIT.casa.lan").unwrap().kind, Kind::Gitlab);
        assert!(find(&r, "otro.lan").is_none());
        assert!(remove(&r, "gitlab.com").is_err());
        assert_eq!(remove(&r, "git.casa.lan").unwrap(), Some(token_key("git.casa.lan")));
        assert_eq!(remove(&r, "git.casa.lan").unwrap(), None);
        assert_eq!(list(&r).len(), 2);
    }
}
