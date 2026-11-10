//! Repos de GitHub vinculados (specs/skills-de-agentes, fase 3, SK19–SK25).
//!
//! Se resuelve la rama o el tag a un commit, se baja el zip de ese commit y
//! se descomprimen solo las carpetas con `SKILL.md` en lo preparado. Todo
//! sale de Rust y solo a `api.github.com` y `codeload.github.com` (R17,
//! SK25); el token (si hay) solo va a `api.github.com`, y la redirección a
//! `codeload` se sigue a mano para comprobar su host y no reenviarlo.
//! Logday no consulta GitHub por su cuenta: solo cuando el usuario abre un
//! repo o pulsa "Buscar actualizaciones" (SK22).

use std::collections::BTreeSet;
use std::io::Cursor;
use std::time::Duration;

use reqwest::header::{ACCEPT, AUTHORIZATION, LOCATION, USER_AGENT};
use reqwest::{redirect, StatusCode, Url};
use serde::{Deserialize, Serialize};

use super::roots::{Roots, ERR_INVALID, ERR_NOT_FOUND, ERR_TOO_LARGE};
use super::staging::{self, StagedBundle, StagedOrigin, ERR_ARCHIVE};

pub const ERR_NETWORK: &str = "network";
pub const ERR_RATE: &str = "rate_limited";
pub const ERR_UNAUTHORIZED: &str = "unauthorized";

const API: &str = "https://api.github.com";
const CODELOAD_HOST: &str = "codeload.github.com";
/// Lo más que se baja de un repo (SK16).
pub const MAX_DOWNLOAD: usize = 50 * 1024 * 1024;
/// Hasta qué profundidad se buscan skills dentro del repo.
const MAX_SKILL_DEPTH: usize = 6;

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepoRef {
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
    pub fn validate(&self) -> Result<(), &'static str> {
        if !valid_name(&self.owner) || !valid_name(&self.repo) {
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

    /// `owner/repo`, la clave con que se registra lo instalado.
    pub fn key(&self) -> String {
        format!("{}/{}", self.owner, self.repo)
    }
}

fn client() -> Result<reqwest::Client, &'static str> {
    reqwest::Client::builder()
        .redirect(redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|_| ERR_NETWORK)
}

fn api_request(c: &reqwest::Client, url: &str, token: Option<&str>) -> reqwest::RequestBuilder {
    let mut req = c
        .get(url)
        .header(USER_AGENT, "Logday")
        .header("X-GitHub-Api-Version", "2022-11-28");
    if let Some(t) = token {
        req = req.header(AUTHORIZATION, format!("Bearer {t}"));
    }
    req
}

/// Un error de la API, como código (sin URL ni token).
fn status_error(res: &reqwest::Response) -> &'static str {
    match res.status() {
        StatusCode::NOT_FOUND => ERR_NOT_FOUND,
        StatusCode::UNAUTHORIZED => ERR_UNAUTHORIZED,
        StatusCode::FORBIDDEN | StatusCode::TOO_MANY_REQUESTS => {
            let remaining = res.headers().get("x-ratelimit-remaining").and_then(|v| v.to_str().ok());
            if remaining == Some("0") || res.status() == StatusCode::TOO_MANY_REQUESTS {
                ERR_RATE
            } else {
                ERR_UNAUTHORIZED
            }
        }
        _ => ERR_NETWORK,
    }
}

#[derive(Deserialize)]
struct RepoInfo {
    default_branch: String,
}

/// La rama o el tag, resuelto a un commit (SK20).
pub async fn resolve(c: &reqwest::Client, r: &RepoRef, token: Option<&str>) -> Result<(String, String), &'static str> {
    let git_ref = match &r.git_ref {
        Some(x) => x.clone(),
        None => {
            let res = api_request(c, &format!("{API}/repos/{}/{}", r.owner, r.repo), token).send().await.map_err(|_| ERR_NETWORK)?;
            if !res.status().is_success() {
                return Err(status_error(&res));
            }
            let info: RepoInfo = res.json().await.map_err(|_| ERR_NETWORK)?;
            if !valid_ref(&info.default_branch) {
                return Err(ERR_INVALID);
            }
            info.default_branch
        }
    };
    let res = api_request(c, &format!("{API}/repos/{}/{}/commits/{git_ref}", r.owner, r.repo), token)
        .header(ACCEPT, "application/vnd.github.sha")
        .send()
        .await
        .map_err(|_| ERR_NETWORK)?;
    if !res.status().is_success() {
        return Err(status_error(&res));
    }
    let sha = res.text().await.map_err(|_| ERR_NETWORK)?.trim().to_string();
    if sha.len() != 40 || !sha.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(ERR_NETWORK);
    }
    Ok((sha, git_ref))
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

/// Baja el zip de un commit. La API responde con una redirección a
/// `codeload.github.com`; se comprueba su host y se pide sin el token (la
/// URL ya lleva un permiso temporal).
pub async fn download(c: &reqwest::Client, r: &RepoRef, sha: &str, token: Option<&str>) -> Result<Vec<u8>, &'static str> {
    let res = api_request(c, &format!("{API}/repos/{}/{}/zipball/{sha}", r.owner, r.repo), token).send().await.map_err(|_| ERR_NETWORK)?;
    let res = if res.status().is_redirection() {
        let loc = res.headers().get(LOCATION).and_then(|v| v.to_str().ok()).ok_or(ERR_NETWORK)?;
        let url = Url::parse(loc).map_err(|_| ERR_NETWORK)?;
        if url.scheme() != "https" || url.host_str() != Some(CODELOAD_HOST) {
            return Err(ERR_NETWORK);
        }
        let res = c.get(url).header(USER_AGENT, "Logday").send().await.map_err(|_| ERR_NETWORK)?;
        if !res.status().is_success() {
            return Err(status_error(&res));
        }
        res
    } else if res.status().is_success() {
        res
    } else {
        return Err(status_error(&res));
    };
    read_limited(res, MAX_DOWNLOAD).await
}

/// Las carpetas con `SKILL.md` de un zip de GitHub (ya sin la carpeta
/// `owner-repo-sha/`), dentro de `prefix` y sin buscar dentro de otra
/// skill. Y si el repo es de plugins de Claude Code (SK23).
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

/// Abre un repo: resuelve, baja y prepara sus skills (SK20).
pub async fn fetch(roots: Roots, r: RepoRef, token: Option<String>) -> Result<RepoCatalog, &'static str> {
    r.validate()?;
    let c = client()?;
    let (sha, git_ref) = resolve(&c, &r, token.as_deref()).await?;
    let bytes = download(&c, &r, &sha, token.as_deref()).await?;
    let prefix = path_parts(r.path.as_deref().unwrap_or(""))?;
    let repo_name = r.repo.clone();
    let label = match &r.path {
        Some(p) if !p.trim_matches('/').is_empty() => format!("{}@{} · {}", r.key(), &sha[..7], p.trim_matches('/')),
        _ => format!("{}@{}", r.key(), &sha[..7]),
    };
    let origin = StagedOrigin {
        kind: "github".into(),
        label,
        repo: Some(serde_json::json!({ "repo": r.key(), "ref": git_ref, "sha": sha, "path": r.path })),
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

    #[test]
    fn valida_repos() {
        let ok = RepoRef { owner: "anthropics".into(), repo: "skills".into(), git_ref: Some("v1.2/beta".into()), path: Some("skills/".into()) };
        assert!(ok.validate().is_ok());
        for (o, r, g, p) in [("a b", "x", None, None), ("a", "..", None, None), ("a", "x", Some("../main"), None), ("a", "x", None, Some("../y")), ("a", "x", Some("a;rm"), None)] {
            let bad = RepoRef { owner: o.into(), repo: r.into(), git_ref: g.map(String::from), path: p.map(String::from) };
            assert!(bad.validate().is_err(), "{o}/{r} {g:?} {p:?}");
        }
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
    }

    /// Contra GitHub de verdad (red): `cargo test --lib -- --ignored
    /// agent_skills::github`. No va en la suite normal.
    #[test]
    #[ignore]
    fn repo_publico_de_verdad() {
        use crate::extensions::agent_skills::roots::tests::Tmp;
        let t = Tmp::new("github-real");
        let repo = RepoRef { owner: "anthropics".into(), repo: "skills".into(), git_ref: None, path: Some("skills".into()) };
        let cat = tauri::async_runtime::block_on(fetch(t.roots(), repo, None)).expect("fetch");
        assert_eq!(cat.sha.len(), 40);
        assert!(cat.bundle.skills.len() > 3, "{} skills", cat.bundle.skills.len());
        assert!(cat.bundle.skills.iter().all(|s| s.rel.starts_with("skills/")));
        eprintln!("ref {} sha {} skills {} plugin {}", cat.git_ref, &cat.sha[..7], cat.bundle.skills.len(), cat.is_plugin_repo);
        eprintln!("{:?}", cat.bundle.skills.iter().map(|s| s.rel.as_str()).collect::<Vec<_>>());
    }
}
