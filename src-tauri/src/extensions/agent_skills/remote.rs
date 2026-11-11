//! Repos vinculados de GitHub, GitLab y Gitea/Forgejo (specs/skills-de-
//! agentes, fase 3, SK19–SK25 y SK36–SK37).
//!
//! Se resuelve la rama o el tag a un commit, se baja el zip de ese commit y
//! se descomprimen solo las carpetas con `SKILL.md` en lo preparado. Todo
//! sale de Rust (R17), por `https`, y solo a los servidores de `servers.rs`:
//!
//! - **GitHub:** `api.github.com`; el zip llega por una redirección a
//!   `codeload.github.com`, que se sigue a mano para comprobar el host y no
//!   reenviar el token.
//! - **GitLab y Gitea:** su propio host. Una redirección solo se sigue si es
//!   al mismo origen; a otro host, no.
//!
//! Logday no consulta ningún servidor por su cuenta: solo cuando el usuario
//! abre un repo o pulsa "Buscar actualizaciones" (SK22).

use std::collections::BTreeSet;
use std::io::Cursor;
use std::time::Duration;

use reqwest::header::{ACCEPT, AUTHORIZATION, LOCATION, USER_AGENT};
use reqwest::{redirect, StatusCode, Url};
use serde::{Deserialize, Serialize};

use super::roots::{Roots, ERR_INVALID, ERR_NOT_FOUND, ERR_TOO_LARGE};
use super::servers::{Kind, Server, GITHUB_HOST};
use super::staging::{self, StagedBundle, StagedOrigin, ERR_ARCHIVE};

pub const ERR_NETWORK: &str = "network";
pub const ERR_RATE: &str = "rate_limited";
pub const ERR_UNAUTHORIZED: &str = "unauthorized";
/// El host del repo no está entre los servidores permitidos (SK36).
pub const ERR_UNKNOWN_SERVER: &str = "server_unknown";
/// El certificado o la conexión TLS fallaron (SK37).
pub const ERR_TLS: &str = "tls";

const GITHUB_API: &str = "https://api.github.com";
const CODELOAD_HOST: &str = "codeload.github.com";
/// Lo más que se baja de un repo (SK16).
pub const MAX_DOWNLOAD: usize = 50 * 1024 * 1024;
/// Hasta qué profundidad se buscan skills dentro del repo.
const MAX_SKILL_DEPTH: usize = 6;
/// Grupos y subgrupos de GitLab que se aceptan delante del repo.
const MAX_NAMESPACE_DEPTH: usize = 20;
const MAX_REDIRECTS: usize = 3;

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepoRef {
    /// El servidor; sin él, github.com.
    #[serde(default)]
    pub host: Option<String>,
    /// En GitLab puede llevar grupos y subgrupos: `grupo/subgrupo`.
    pub owner: String,
    pub repo: String,
    /// Rama o tag; sin él, la rama principal.
    #[serde(default)]
    pub git_ref: Option<String>,
    /// Subcarpeta donde buscar; sin ella, todo el repo.
    #[serde(default)]
    pub path: Option<String>,
}

fn valid_name(s: &str) -> bool {
    !s.is_empty() && s.len() <= 100 && s != "." && s != ".." && s.bytes().all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
}

fn valid_ref(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 200
        && !s.contains("..")
        && !s.starts_with('/')
        && !s.ends_with('/')
        && s.bytes().all(|b| b.is_ascii_alphanumeric() || b"_./-".contains(&b))
}

fn valid_sha(s: &str) -> bool {
    (s.len() == 40 || s.len() == 64) && s.bytes().all(|b| b.is_ascii_hexdigit())
}

/// La subcarpeta en componentes, sin `/` al principio ni al final.
fn path_parts(p: &str) -> Result<Vec<String>, &'static str> {
    let t = p.trim_matches('/');
    if t.is_empty() {
        return Ok(Vec::new());
    }
    let parts: Vec<String> = t.split('/').map(str::to_string).collect();
    if parts.iter().all(|c| !c.is_empty() && c != "." && c != ".." && !c.contains('\\') && !c.contains('\0') && c.len() <= 255) {
        Ok(parts)
    } else {
        Err(ERR_INVALID)
    }
}

impl RepoRef {
    /// El host, o github.com si no lo trae.
    pub fn host(&self) -> &str {
        self.host.as_deref().unwrap_or(GITHUB_HOST)
    }

    /// Valida el repo para un tipo de servidor: solo GitLab admite grupos.
    pub fn validate(&self, kind: Kind) -> Result<(), &'static str> {
        let owner: Vec<&str> = self.owner.split('/').collect();
        let max = if kind == Kind::Gitlab { MAX_NAMESPACE_DEPTH } else { 1 };
        if owner.len() > max || !owner.iter().all(|o| valid_name(o)) || !valid_name(&self.repo) {
            return Err(ERR_INVALID);
        }
        if let Some(r) = &self.git_ref {
            if !valid_ref(r) {
                return Err(ERR_INVALID);
            }
        }
        if let Some(p) = &self.path {
            path_parts(p)?;
        }
        Ok(())
    }

    /// La clave con que se registra lo instalado: `owner/repo` en GitHub
    /// (como antes) y `host/owner/repo` en los demás.
    pub fn key(&self) -> String {
        match self.host() {
            GITHUB_HOST => format!("{}/{}", self.owner, self.repo),
            h => format!("{h}/{}/{}", self.owner, self.repo),
        }
    }
}

fn client() -> Result<reqwest::Client, &'static str> {
    reqwest::Client::builder()
        .redirect(redirect::Policy::none())
        .https_only(true)
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|_| ERR_NETWORK)
}

/// Un fallo de envío, como código: el de certificado aparte (SK37), para
/// poder decir qué pasa con un servidor propio.
fn send_error(e: reqwest::Error) -> &'static str {
    let mut src: Option<&dyn std::error::Error> = Some(&e);
    while let Some(s) = src {
        let t = s.to_string().to_ascii_lowercase();
        if t.contains("certificate") || t.contains("tls") || t.contains("handshake") {
            return ERR_TLS;
        }
        src = s.source();
    }
    ERR_NETWORK
}

/// Un error de la API, como código (sin URL ni token).
fn status_error(res: &reqwest::Response) -> &'static str {
    match res.status() {
        StatusCode::NOT_FOUND => ERR_NOT_FOUND,
        StatusCode::UNAUTHORIZED => ERR_UNAUTHORIZED,
        StatusCode::TOO_MANY_REQUESTS => ERR_RATE,
        StatusCode::FORBIDDEN => {
            let remaining = res.headers().get("x-ratelimit-remaining").and_then(|v| v.to_str().ok());
            if remaining == Some("0") {
                ERR_RATE
            } else {
                ERR_UNAUTHORIZED
            }
        }
        _ => ERR_NETWORK,
    }
}

/// Lee una respuesta con tope de tamaño.
async fn read_limited(mut res: reqwest::Response, max: usize) -> Result<Vec<u8>, &'static str> {
    if res.content_length().map(|l| l as usize > max).unwrap_or(false) {
        return Err(ERR_TOO_LARGE);
    }
    let mut out = Vec::new();
    while let Some(chunk) = res.chunk().await.map_err(|_| ERR_NETWORK)? {
        out.extend_from_slice(&chunk);
        if out.len() > max {
            return Err(ERR_TOO_LARGE);
        }
    }
    Ok(out)
}

// ─── Petición a un servidor ───

/// A quién se habla y con qué token. El token solo viaja a `base`.
struct Api<'a> {
    c: &'a reqwest::Client,
    base: Url,
    kind: Kind,
    token: Option<&'a str>,
}

impl Api<'_> {
    fn new<'a>(c: &'a reqwest::Client, server: &Server, token: Option<&'a str>) -> Result<Api<'a>, &'static str> {
        let base = match server.kind {
            Kind::Github => Url::parse(GITHUB_API),
            _ => Url::parse(&format!("https://{}/", server.host)),
        }
        .map_err(|_| ERR_INVALID)?;
        Ok(Api { c, base, kind: server.kind, token })
    }

    fn url(&self, path_and_query: &str) -> Result<Url, &'static str> {
        self.base.join(path_and_query).map_err(|_| ERR_INVALID)
    }

    fn same_origin(&self, u: &Url) -> bool {
        u.scheme() == "https" && u.host_str() == self.base.host_str() && u.port_or_known_default() == self.base.port_or_known_default()
    }

    fn request(&self, url: Url) -> reqwest::RequestBuilder {
        let mut req = self.c.get(url).header(USER_AGENT, "Logday");
        if self.kind == Kind::Github {
            req = req.header("X-GitHub-Api-Version", "2022-11-28");
        }
        if let Some(t) = self.token {
            req = match self.kind {
                Kind::Github => req.header(AUTHORIZATION, format!("Bearer {t}")),
                Kind::Gitlab => req.header("PRIVATE-TOKEN", t),
                Kind::Gitea => req.header(AUTHORIZATION, format!("token {t}")),
            };
        }
        req
    }

    /// `GET` siguiendo solo redirecciones al mismo origen (con el token,
    /// porque es el mismo servidor). A otro host es un error.
    async fn get(&self, url: Url, accept: Option<&str>) -> Result<reqwest::Response, &'static str> {
        let mut url = url;
        for _ in 0..=MAX_REDIRECTS {
            let mut req = self.request(url.clone());
            if let Some(a) = accept {
                req = req.header(ACCEPT, a);
            }
            let res = req.send().await.map_err(send_error)?;
            if res.status().is_redirection() {
                let loc = res.headers().get(LOCATION).and_then(|v| v.to_str().ok()).ok_or(ERR_NETWORK)?;
                let next = url.join(loc).map_err(|_| ERR_NETWORK)?;
                if !self.same_origin(&next) {
                    return Err(ERR_NETWORK);
                }
                url = next;
                continue;
            }
            if !res.status().is_success() {
                return Err(status_error(&res));
            }
            return Ok(res);
        }
        Err(ERR_NETWORK)
    }

    async fn json<T: for<'de> Deserialize<'de>>(&self, path: &str) -> Result<T, &'static str> {
        let res = self.get(self.url(path)?, Some("application/json")).await?;
        let bytes = read_limited(res, 1024 * 1024).await?;
        serde_json::from_slice(&bytes).map_err(|_| ERR_NETWORK)
    }
}

/// `grupo/sub/repo` como id de proyecto de GitLab (`grupo%2Fsub%2Frepo`).
/// Los nombres ya validados solo llevan `[A-Za-z0-9_.-]`.
fn gitlab_project(r: &RepoRef) -> String {
    format!("{}/{}", r.owner, r.repo).replace('/', "%2F")
}

#[derive(Deserialize)]
struct DefaultBranch {
    default_branch: Option<String>,
}

#[derive(Deserialize)]
struct GitlabCommit {
    id: String,
}

#[derive(Deserialize)]
struct GiteaCommit {
    sha: String,
}

/// La rama principal del repo.
async fn default_branch(api: &Api<'_>, r: &RepoRef) -> Result<String, &'static str> {
    let path = match api.kind {
        Kind::Github => format!("repos/{}/{}", r.owner, r.repo),
        Kind::Gitlab => format!("api/v4/projects/{}", gitlab_project(r)),
        Kind::Gitea => format!("api/v1/repos/{}/{}", r.owner, r.repo),
    };
    let info: DefaultBranch = api.json(&path).await?;
    // Un repo vacío no tiene rama principal.
    let b = info.default_branch.ok_or(ERR_NOT_FOUND)?;
    if valid_ref(&b) {
        Ok(b)
    } else {
        Err(ERR_INVALID)
    }
}

/// La rama o el tag, resuelto a un commit (SK20).
async fn resolve(api: &Api<'_>, r: &RepoRef) -> Result<(String, String), &'static str> {
    let git_ref = match &r.git_ref {
        Some(x) => x.clone(),
        None => default_branch(api, r).await?,
    };
    let sha = match api.kind {
        Kind::Github => {
            let res = api.get(api.url(&format!("repos/{}/{}/commits/{git_ref}", r.owner, r.repo))?, Some("application/vnd.github.sha")).await?;
            String::from_utf8_lossy(&read_limited(res, 1024).await?).trim().to_string()
        }
        Kind::Gitlab => {
            let c: GitlabCommit = api.json(&format!("api/v4/projects/{}/repository/commits/{}", gitlab_project(r), git_ref.replace('/', "%2F"))).await?;
            c.id
        }
        Kind::Gitea => {
            let list: Vec<GiteaCommit> =
                api.json(&format!("api/v1/repos/{}/{}/commits?sha={git_ref}&limit=1&stat=false&verification=false&files=false", r.owner, r.repo)).await?;
            list.into_iter().next().ok_or(ERR_NOT_FOUND)?.sha
        }
    };
    if !valid_sha(&sha) {
        return Err(ERR_NETWORK);
    }
    Ok((sha.to_ascii_lowercase(), git_ref))
}

/// Baja el zip de un commit.
async fn download(api: &Api<'_>, r: &RepoRef, sha: &str) -> Result<Vec<u8>, &'static str> {
    let res = match api.kind {
        // La API responde con una redirección a `codeload.github.com`: se
        // comprueba su host y se pide sin el token (la URL ya lleva un
        // permiso temporal).
        Kind::Github => {
            let res = api.request(api.url(&format!("repos/{}/{}/zipball/{sha}", r.owner, r.repo))?).send().await.map_err(send_error)?;
            if res.status().is_redirection() {
                let loc = res.headers().get(LOCATION).and_then(|v| v.to_str().ok()).ok_or(ERR_NETWORK)?;
                let url = Url::parse(loc).map_err(|_| ERR_NETWORK)?;
                if url.scheme() != "https" || url.host_str() != Some(CODELOAD_HOST) {
                    return Err(ERR_NETWORK);
                }
                let res = api.c.get(url).header(USER_AGENT, "Logday").send().await.map_err(send_error)?;
                if !res.status().is_success() {
                    return Err(status_error(&res));
                }
                res
            } else if res.status().is_success() {
                res
            } else {
                return Err(status_error(&res));
            }
        }
        Kind::Gitlab => api.get(api.url(&format!("api/v4/projects/{}/repository/archive.zip?sha={sha}", gitlab_project(r)))?, None).await?,
        Kind::Gitea => api.get(api.url(&format!("api/v1/repos/{}/{}/archive/{sha}.zip", r.owner, r.repo))?, None).await?,
    };
    read_limited(res, MAX_DOWNLOAD).await
}

/// Las carpetas con `SKILL.md` de un zip de repo (ya sin su carpeta raíz:
/// `owner-repo-sha/` en GitHub, `repo-sha-sha/` en GitLab, `repo/` en
/// Gitea), dentro de `prefix` y sin buscar dentro de otra skill. Y si el
/// repo es de plugins de Claude Code (SK23).
pub fn find_in_zip(bytes: &[u8], prefix: &[String]) -> Result<(Vec<Vec<String>>, bool), &'static str> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| ERR_ARCHIVE)?;
    let mut dirs: BTreeSet<Vec<String>> = BTreeSet::new();
    let mut plugin = false;
    for i in 0..archive.len() {
        let f = archive.by_index_raw(i).map_err(|_| ERR_ARCHIVE)?;
        let name = f.name().map(|n| n.to_string()).unwrap_or_default();
        let mut parts: Vec<String> = name.split('/').filter(|p| !p.is_empty()).map(str::to_string).collect();
        if parts.len() < 2 {
            continue;
        }
        parts.remove(0);
        if parts.iter().any(|p| p == ".." || p == ".git" || p == "node_modules") {
            continue;
        }
        let last = parts.last().cloned().unwrap_or_default();
        if last == "marketplace.json" || last == "plugin.json" {
            if parts.len() >= 2 && parts[parts.len() - 2] == ".claude-plugin" {
                plugin = true;
            }
        }
        if !last.eq_ignore_ascii_case("SKILL.md") || f.is_dir() {
            continue;
        }
        let dir = parts[..parts.len() - 1].to_vec();
        if dir.len() > MAX_SKILL_DEPTH || !dir.starts_with(prefix) {
            continue;
        }
        dirs.insert(dir);
    }
    // Una skill no se mira por dentro: fuera las que están dentro de otra.
    let all: Vec<Vec<String>> = dirs.iter().cloned().collect();
    let out = all.iter().filter(|d| !all.iter().any(|o| o.len() < d.len() && d.starts_with(o))).cloned().collect();
    Ok((out, plugin))
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoCatalog {
    pub bundle: StagedBundle,
    pub sha: String,
    pub git_ref: String,
    pub is_plugin_repo: bool,
}

/// Abre un repo: resuelve, baja y prepara sus skills (SK20). `server` es
/// el de la lista permitida para el host del repo.
pub async fn fetch(roots: Roots, server: Server, r: RepoRef, token: Option<String>) -> Result<RepoCatalog, &'static str> {
    r.validate(server.kind)?;
    let c = client()?;
    let api = Api::new(&c, &server, token.as_deref())?;
    let (sha, git_ref) = resolve(&api, &r).await?;
    let bytes = download(&api, &r, &sha).await?;
    let prefix = path_parts(r.path.as_deref().unwrap_or(""))?;
    let repo_name = r.repo.clone();
    let label = match &r.path {
        Some(p) if !p.trim_matches('/').is_empty() => format!("{}@{} · {}", r.key(), &sha[..7], p.trim_matches('/')),
        _ => format!("{}@{}", r.key(), &sha[..7]),
    };
    let origin = StagedOrigin {
        kind: server.kind.key().into(),
        label,
        repo: Some(serde_json::json!({ "repo": r.key(), "host": server.host, "ref": git_ref, "sha": sha, "path": r.path })),
    };
    let sha2 = sha.clone();
    let (bundle, plugin) = tauri::async_runtime::spawn_blocking(move || -> Result<(StagedBundle, bool), &'static str> {
        let (dirs, plugin) = find_in_zip(&bytes, &prefix)?;
        // Cada skill se prepara en su ruta del repo; una skill en la raíz,
        // con el nombre del repo.
        let map = move |parts: &[String]| -> Option<Vec<String>> {
            let dir = dirs.iter().filter(|d| parts.starts_with(d)).max_by_key(|d| d.len())?;
            if dir.is_empty() {
                let mut v = vec![repo_name.clone()];
                v.extend_from_slice(parts);
                Some(v)
            } else {
                Some(parts.to_vec())
            }
        };
        let b = staging::stage_zip_mapped(&roots, &bytes, origin, &map)?;
        Ok((b, plugin))
    })
    .await
    .map_err(|_| ERR_NETWORK)??;
    Ok(RepoCatalog { bundle, sha: sha2, git_ref, is_plugin_repo: plugin })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extensions::agent_skills::servers::{self, token_key};
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn zip_of(entries: &[&str]) -> Vec<u8> {
        let mut buf = Cursor::new(Vec::new());
        {
            let mut z = zip::ZipWriter::new(&mut buf);
            let o = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
            for name in entries {
                z.start_file(*name, o).unwrap();
                z.write_all(b"---\nname: x\n---\n").unwrap();
            }
            z.finish().unwrap();
        }
        buf.into_inner()
    }

    fn rr(host: Option<&str>, owner: &str, repo: &str, git_ref: Option<&str>, path: Option<&str>) -> RepoRef {
        RepoRef { host: host.map(String::from), owner: owner.into(), repo: repo.into(), git_ref: git_ref.map(String::from), path: path.map(String::from) }
    }

    fn server(host: &str, kind: Kind) -> Server {
        Server { host: host.into(), kind, builtin: false, token_key: token_key(host) }
    }

    #[test]
    fn valida_repos() {
        assert!(rr(None, "anthropics", "skills", Some("v1.2/beta"), Some("skills/")).validate(Kind::Github).is_ok());
        for (o, r, g, p) in [("a b", "x", None, None), ("a", "..", None, None), ("a", "x", Some("../main"), None), ("a", "x", None, Some("../y")), ("a", "x", Some("a;rm"), None)] {
            let bad = rr(None, o, r, g, p);
            assert!(bad.validate(Kind::Github).is_err(), "{o}/{r} {g:?} {p:?}");
        }
        // Grupos y subgrupos: solo en GitLab.
        let sub = rr(Some("gitlab.com"), "grupo/sub", "repo", None, None);
        assert!(sub.validate(Kind::Gitlab).is_ok());
        assert!(sub.validate(Kind::Gitea).is_err());
        assert!(sub.validate(Kind::Github).is_err());
        assert!(rr(Some("gitlab.com"), "grupo//sub", "repo", None, None).validate(Kind::Gitlab).is_err());
        assert!(rr(Some("gitlab.com"), "grupo/../x", "repo", None, None).validate(Kind::Gitlab).is_err());
    }

    #[test]
    fn claves_y_urls_por_servidor() {
        assert_eq!(rr(None, "o", "r", None, None).key(), "o/r");
        assert_eq!(rr(Some("github.com"), "o", "r", None, None).key(), "o/r");
        assert_eq!(rr(Some("git.casa.lan:3000"), "o", "r", None, None).key(), "git.casa.lan:3000/o/r");
        assert_eq!(gitlab_project(&rr(Some("gitlab.com"), "g/sub", "r.x", None, None)), "g%2Fsub%2Fr.x");
        let c = client().unwrap();
        let gl = Api::new(&c, &server("git.empresa.co:8443", Kind::Gitlab), None).unwrap();
        assert_eq!(gl.url("api/v4/projects/g%2Fr").unwrap().as_str(), "https://git.empresa.co:8443/api/v4/projects/g%2Fr");
        assert!(gl.same_origin(&Url::parse("https://git.empresa.co:8443/x").unwrap()));
        assert!(!gl.same_origin(&Url::parse("https://git.empresa.co/x").unwrap()));
        assert!(!gl.same_origin(&Url::parse("http://git.empresa.co:8443/x").unwrap()));
        assert!(!gl.same_origin(&Url::parse("https://otro.co:8443/x").unwrap()));
        let gh = Api::new(&c, &servers::list(&crate::extensions::agent_skills::roots::tests::Tmp::new("api-gh").roots())[0], None).unwrap();
        assert_eq!(gh.url("repos/o/r").unwrap().as_str(), "https://api.github.com/repos/o/r");
    }

    #[test]
    fn busca_skills_en_el_zip() {
        let bytes = zip_of(&[
            "o-r-abc/skills/pdf/SKILL.md",
            "o-r-abc/skills/pdf/sub/SKILL.md",
            "o-r-abc/skills/.curated/docx/SKILL.md",
            "o-r-abc/.claude/skills/rev/SKILL.md",
            "o-r-abc/node_modules/x/SKILL.md",
            "o-r-abc/.claude-plugin/marketplace.json",
            "o-r-abc/README.md",
        ]);
        let (dirs, plugin) = find_in_zip(&bytes, &[]).unwrap();
        let joined: Vec<String> = dirs.iter().map(|d| d.join("/")).collect();
        assert_eq!(joined, vec![".claude/skills/rev", "skills/.curated/docx", "skills/pdf"]);
        assert!(plugin);
        let (dirs, _) = find_in_zip(&bytes, &["skills".to_string()]).unwrap();
        assert_eq!(dirs.len(), 2);
        // Un repo que es una sola skill.
        let (dirs, plugin) = find_in_zip(&zip_of(&["o-r-abc/SKILL.md"]), &[]).unwrap();
        assert_eq!(dirs, vec![Vec::<String>::new()]);
        assert!(!plugin);
        // La carpeta raíz de GitLab (`repo-sha-sha/`) también se quita.
        let (dirs, _) = find_in_zip(&zip_of(&["skills-0a1b-0a1b/revisar/SKILL.md"]), &[]).unwrap();
        assert_eq!(dirs, vec![vec!["revisar".to_string()]]);
    }

    /// Contra GitHub y GitLab de verdad (red): `cargo test --lib --
    /// --ignored agent_skills::remote`. No van en la suite normal.
    #[test]
    #[ignore]
    fn repo_publico_de_github() {
        use crate::extensions::agent_skills::roots::tests::Tmp;
        let t = Tmp::new("github-real");
        let gh = servers::list(&t.roots()).into_iter().find(|s| s.kind == Kind::Github).unwrap();
        let cat = tauri::async_runtime::block_on(fetch(t.roots(), gh, rr(None, "anthropics", "skills", None, Some("skills")), None)).expect("fetch");
        assert_eq!(cat.sha.len(), 40);
        assert!(cat.bundle.skills.len() > 3, "{} skills", cat.bundle.skills.len());
        assert!(cat.bundle.skills.iter().all(|s| s.rel.starts_with("skills/")));
        eprintln!("ref {} sha {} skills {} plugin {}", cat.git_ref, &cat.sha[..7], cat.bundle.skills.len(), cat.is_plugin_repo);
    }

    /// GitLab.com con un repo público dentro de un grupo. Se comprueba que
    /// resuelve el commit y baja el zip; el repo no tiene por qué traer
    /// skills.
    #[test]
    #[ignore]
    fn repo_publico_de_gitlab() {
        use crate::extensions::agent_skills::roots::tests::Tmp;
        let t = Tmp::new("gitlab-real");
        let gl = servers::list(&t.roots()).into_iter().find(|s| s.kind == Kind::Gitlab).unwrap();
        let repo = rr(Some("gitlab.com"), std::env::var("GL_OWNER").as_deref().unwrap_or("gitlab-org"), std::env::var("GL_REPO").as_deref().unwrap_or("gitlab-docs"), None, None);
        let cat = tauri::async_runtime::block_on(fetch(t.roots(), gl, repo, None)).expect("fetch");
        assert_eq!(cat.sha.len(), 40);
        eprintln!("ref {} sha {} skills {}", cat.git_ref, &cat.sha[..7], cat.bundle.skills.len());
    }

    /// Un certificado no válido da `tls`, no `network` (SK37).
    #[test]
    #[ignore]
    fn certificado_no_valido() {
        let c = client().unwrap();
        let api = Api::new(&c, &server("self-signed.badssl.com", Kind::Gitea), None).unwrap();
        let err = tauri::async_runtime::block_on(api.json::<serde_json::Value>("api/v1/version")).unwrap_err();
        assert_eq!(err, ERR_TLS);
    }

    /// Forgejo de verdad: codeberg.org como servidor propio de tipo Gitea.
    #[test]
    #[ignore]
    fn repo_publico_de_forgejo() {
        use crate::extensions::agent_skills::roots::tests::Tmp;
        let t = Tmp::new("forgejo-real");
        let s = servers::add(&t.roots(), "codeberg.org", Kind::Gitea).unwrap();
        let cat = tauri::async_runtime::block_on(fetch(t.roots(), s, rr(Some("codeberg.org"), "Codeberg", "avatars", Some("main"), None), None)).expect("fetch");
        assert_eq!(cat.sha.len(), 40);
        eprintln!("ref {} sha {} skills {}", cat.git_ref, &cat.sha[..7], cat.bundle.skills.len());
    }
}
