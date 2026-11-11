//! Listar las skills de todas las fuentes (specs/skills-de-agentes SK1–SK3,
//! SK5, SK7).
//!
//! Cada carpeta candidata se resuelve a su ruta real y se agrupan por ella:
//! un enlace de `~/.codex/skills/x` a `~/.claude/skills/x` es una sola
//! skill con dos ubicaciones (SK2). Una carpeta real fuera de todas las
//! fuentes es un enlace externo: se muestra a dónde apunta, pero no se lee
//! (SK3).

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::files::{find_skill_md, read_text_prefix, walk, FileFlags, MAX_SKILL_MD};
use super::roots::{display_path, is_plain_absolute, Roots, SourceId, Tool};

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub name: String,
    pub marketplace: String,
    pub version: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SkillLocation {
    pub source: SourceId,
    /// Relativa a la base de la fuente, con `/`: lo que el webview manda de
    /// vuelta para actuar sobre esta ubicación.
    pub id: String,
    /// Para mostrar (`~/…`).
    pub path: String,
    pub is_link: bool,
    /// A dónde apunta el enlace, para mostrar.
    pub link_target: Option<String>,
    /// El enlace apunta a algo que no existe.
    pub broken: bool,
    /// Herramienta de esta ubicación.
    pub tool: Tool,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Origin {
    Own,
    Disabled,
    Synced,
    System,
    Admin,
    Plugin,
    External,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SkillEntry {
    /// `<fuente>:<id>` de la ubicación principal.
    pub key: String,
    /// El nombre de la carpeta principal.
    pub dir_name: String,
    pub primary: SkillLocation,
    pub locations: Vec<SkillLocation>,
    pub tools: Vec<Tool>,
    pub origin: Origin,
    pub plugin: Option<PluginInfo>,
    pub editable: bool,
    /// Texto del `SKILL.md`, hasta 256 KB; `None` si no se pudo leer o es
    /// un enlace externo.
    pub skill_md: Option<String>,
    pub skill_md_truncated: bool,
    pub file_count: usize,
    pub size_bytes: u64,
    pub modified_ms: u64,
    pub file_flags: FileFlags,
}

/// Una carpeta que puede ser una skill.
#[derive(Debug, Clone)]
struct Candidate {
    source: SourceId,
    id: String,
    path: PathBuf,
    plugin: Option<PluginInfo>,
}

fn hidden(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules"
}

/// Subcarpetas (o enlaces) de `dir`, ordenadas, sin las ocultas.
fn subdirs(dir: &Path) -> Vec<(String, PathBuf)> {
    let Ok(rd) = fs::read_dir(dir) else { return Vec::new() };
    let mut out: Vec<(String, PathBuf)> = rd
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if hidden(&name) {
                return None;
            }
            let meta = fs::symlink_metadata(e.path()).ok()?;
            (meta.is_dir() || meta.file_type().is_symlink()).then(|| (name, e.path()))
        })
        .collect();
    out.sort();
    out
}

/// Si una carpeta es candidata: un enlace siempre lo es (para mostrarlo
/// aunque esté roto o salga de las fuentes); una carpeta real, si tiene
/// `SKILL.md`.
fn is_candidate(path: &Path, bases: &[(SourceId, PathBuf)]) -> bool {
    let is_link = fs::symlink_metadata(path).map(|m| m.file_type().is_symlink()).unwrap_or(false);
    if is_link {
        return match path.canonicalize() {
            Ok(real) if bases.iter().any(|(_, b)| real.starts_with(b)) => real.is_dir() && find_skill_md(&real).is_some(),
            // Roto o externo: se muestra, sin mirar dentro.
            _ => true,
        };
    }
    find_skill_md(path).is_some()
}

fn push_children(out: &mut Vec<Candidate>, source: SourceId, base: &Path, prefix: &str, skip: &[&str], bases: &[(SourceId, PathBuf)]) {
    let dir = if prefix.is_empty() { base.to_path_buf() } else { base.join(prefix) };
    for (name, path) in subdirs(&dir) {
        if skip.contains(&name.as_str()) {
            continue;
        }
        if is_candidate(&path, bases) {
            let id = if prefix.is_empty() { name } else { format!("{prefix}/{name}") };
            out.push(Candidate { source, id, path, plugin: None });
        }
    }
}

/// `installed_plugins.json` (versión 2): `{ plugins: { "nombre@mp": [ {
/// installPath, version } ] } }`. Solo se aceptan rutas dentro de
/// `~/.claude/plugins` (SK4).
#[derive(Deserialize)]
struct InstalledPlugins {
    #[serde(default)]
    plugins: BTreeMap<String, Vec<InstalledPlugin>>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstalledPlugin {
    install_path: Option<String>,
    version: Option<String>,
}

fn split_plugin_key(key: &str) -> (String, String) {
    match key.rsplit_once('@') {
        Some((name, mp)) => (name.to_string(), mp.to_string()),
        None => (key.to_string(), String::new()),
    }
}

/// Las skills de un plugin ya ubicado: `skills/*/` o, si no hay, la raíz
/// (un plugin que es una sola skill).
fn plugin_skills(out: &mut Vec<Candidate>, source: SourceId, base_canon: &Path, install: &Path, plugin: PluginInfo, bases: &[(SourceId, PathBuf)]) {
    let Ok(rel) = install.strip_prefix(base_canon) else { return };
    let rel = rel.to_string_lossy().replace('\\', "/");
    let skills_dir = install.join("skills");
    if skills_dir.is_dir() {
        for (name, path) in subdirs(&skills_dir) {
            if is_candidate(&path, bases) {
                out.push(Candidate { source, id: format!("{rel}/skills/{name}"), path, plugin: Some(plugin.clone()) });
            }
        }
    } else if find_skill_md(install).is_some() && !rel.is_empty() {
        out.push(Candidate { source, id: rel, path: install.to_path_buf(), plugin: Some(plugin) });
    }
}

fn claude_plugin_candidates(roots: &Roots, out: &mut Vec<Candidate>, bases: &[(SourceId, PathBuf)]) {
    let Some(base) = roots.base(SourceId::ClaudePlugin).and_then(|b| b.canonicalize().ok()) else { return };
    let Ok(raw) = fs::read_to_string(base.join("installed_plugins.json")) else { return };
    let Ok(parsed) = serde_json::from_str::<InstalledPlugins>(&raw) else { return };
    for (key, installs) in parsed.plugins {
        let (name, marketplace) = split_plugin_key(&key);
        for inst in installs {
            let Some(p) = inst.install_path.map(PathBuf::from) else { continue };
            if !is_plain_absolute(&p) {
                continue;
            }
            let Ok(real) = p.canonicalize() else { continue };
            if !real.starts_with(&base) || real == base {
                continue;
            }
            let info = PluginInfo { name: name.clone(), marketplace: marketplace.clone(), version: inst.version.clone() };
            plugin_skills(out, SourceId::ClaudePlugin, &base, &real, info, bases);
        }
    }
}

/// `~/.codex/plugins/cache/<mp>/<plugin>/<versión>/`: de cada plugin, la
/// versión más reciente (las carpetas `latest` son enlaces a una de ellas).
fn codex_plugin_candidates(roots: &Roots, out: &mut Vec<Candidate>, bases: &[(SourceId, PathBuf)]) {
    let Some(base) = roots.base(SourceId::CodexPlugin).and_then(|b| b.canonicalize().ok()) else { return };
    for (mp, mp_dir) in subdirs(&base) {
        for (plugin, plugin_dir) in subdirs(&mp_dir) {
            let newest = subdirs(&plugin_dir)
                .into_iter()
                .filter(|(_, p)| fs::symlink_metadata(p).map(|m| m.is_dir()).unwrap_or(false))
                .max_by_key(|(_, p)| fs::metadata(p).and_then(|m| m.modified()).ok());
            if let Some((version, dir)) = newest {
                let Ok(real) = dir.canonicalize() else { continue };
                let info = PluginInfo { name: plugin.clone(), marketplace: mp.clone(), version: Some(version) };
                plugin_skills(out, SourceId::CodexPlugin, &base, &real, info, bases);
            }
        }
    }
}

fn candidates(roots: &Roots, bases: &[(SourceId, PathBuf)]) -> Vec<Candidate> {
    let mut out = Vec::new();
    for source in SourceId::ALL {
        let Some(base) = roots.base(source) else { continue };
        match source {
            SourceId::Claude => push_children(&mut out, source, &base, "", &["synced"], bases),
            SourceId::Agents | SourceId::CodexSystem | SourceId::CodexAdmin => {
                push_children(&mut out, source, &base, "", &[], bases)
            }
            // `.system` ya queda fuera por empezar con punto.
            SourceId::Codex => push_children(&mut out, source, &base, "", &[], bases),
            SourceId::Disabled => {
                for from in [SourceId::Claude, SourceId::Agents, SourceId::Codex] {
                    push_children(&mut out, source, &base, from.key(), &[], bases);
                }
            }
            SourceId::ClaudeSynced => {
                for (bucket, _) in subdirs(&base) {
                    push_children(&mut out, source, &base, &bucket, &[], bases);
                }
            }
            SourceId::ClaudePlugin => claude_plugin_candidates(roots, &mut out, bases),
            SourceId::CodexPlugin => codex_plugin_candidates(roots, &mut out, bases),
        }
    }
    out
}

/// La herramienta de una ubicación. Las desactivadas, la de la carpeta de
/// la que salieron (`claude/…` o `agents/…`).
fn location_tool(source: SourceId, id: &str) -> Tool {
    source.tool().unwrap_or_else(|| match id.split('/').next().and_then(SourceId::from_key).and_then(SourceId::tool) {
        Some(t) => t,
        None => Tool::Claude,
    })
}

/// Un enlace desactivado apunta a donde estaba la carpeta real, que
/// también se desactivó: `~/.claude/skills/x` pasa a ser
/// `disabled/claude/x` (design "Operaciones").
fn disabled_link_target(roots: &Roots, target: &Path) -> Option<PathBuf> {
    for from in [SourceId::Claude, SourceId::Agents, SourceId::Codex] {
        let base = roots.base(from)?;
        if let Ok(rest) = target.strip_prefix(&base) {
            return Some(roots.disabled().join(from.key()).join(rest));
        }
    }
    None
}

fn origin_of(source: SourceId) -> Origin {
    match source {
        SourceId::Claude | SourceId::Agents | SourceId::Codex => Origin::Own,
        SourceId::Disabled => Origin::Disabled,
        SourceId::ClaudeSynced => Origin::Synced,
        SourceId::CodexSystem => Origin::System,
        SourceId::CodexAdmin => Origin::Admin,
        SourceId::ClaudePlugin | SourceId::CodexPlugin => Origin::Plugin,
    }
}

struct Group {
    real: Option<PathBuf>,
    locations: Vec<(SkillLocation, Option<PluginInfo>)>,
}

/// Lista todas las skills (SK1). Las de las fuentes que no existen
/// simplemente no aparecen.
pub fn list(roots: &Roots) -> Vec<SkillEntry> {
    let bases = roots.canonical_bases();
    let mut groups: Vec<Group> = Vec::new();
    let mut by_real: BTreeMap<PathBuf, usize> = BTreeMap::new();

    for c in candidates(roots, &bases) {
        let meta = fs::symlink_metadata(&c.path).ok();
        let is_link = meta.as_ref().map(|m| m.file_type().is_symlink()).unwrap_or(false);
        let target = if is_link { fs::read_link(&c.path).ok() } else { None };
        let mut real = c.path.canonicalize().ok();
        if real.is_none() && c.source == SourceId::Disabled {
            real = target.as_deref().and_then(|t| disabled_link_target(roots, t)).and_then(|p| p.canonicalize().ok());
        }
        let inside = real.as_ref().map(|r| bases.iter().any(|(_, b)| r.starts_with(b))).unwrap_or(false);
        let loc = SkillLocation {
            source: c.source,
            tool: location_tool(c.source, &c.id),
            path: display_path(roots, &c.path),
            id: c.id,
            is_link,
            link_target: target.map(|t| display_path(roots, &t)),
            broken: is_link && real.is_none(),
        };
        if inside {
            let real = real.unwrap();
            if let Some(&i) = by_real.get(&real) {
                groups[i].locations.push((loc, c.plugin));
                continue;
            }
            by_real.insert(real.clone(), groups.len());
            groups.push(Group { real: Some(real), locations: vec![(loc, c.plugin)] });
        } else {
            groups.push(Group { real: None, locations: vec![(loc, c.plugin)] });
        }
    }

    groups.into_iter().map(|g| entry(g)).collect()
}

fn entry(mut g: Group) -> SkillEntry {
    // La principal: la que no es enlace; si todas lo son, la primera (las
    // fuentes van en el orden de `SourceId::ALL`).
    g.locations.sort_by_key(|(l, _)| (l.is_link, l.source));
    let (primary, plugin) = g.locations[0].clone();
    let mut tools: Vec<Tool> = g.locations.iter().map(|(l, _)| l.tool).collect();
    tools.sort();
    tools.dedup();
    let dir_name = primary.id.rsplit('/').next().unwrap_or(&primary.id).to_string();
    let locations: Vec<SkillLocation> = g.locations.into_iter().map(|(l, _)| l).collect();
    let key = format!("{}:{}", primary.source.key(), primary.id);

    let Some(real) = g.real else {
        return SkillEntry {
            key,
            dir_name,
            tools,
            origin: Origin::External,
            plugin,
            editable: false,
            skill_md: None,
            skill_md_truncated: false,
            file_count: 0,
            size_bytes: 0,
            modified_ms: 0,
            file_flags: FileFlags::default(),
            primary,
            locations,
        };
    };

    let w = walk(&real);
    let md_path = find_skill_md(&real);
    let md_len = md_path.as_ref().and_then(|p| fs::metadata(p).ok()).map(|m| m.len()).unwrap_or(0);
    let skill_md = md_path.and_then(|p| read_text_prefix(&p, MAX_SKILL_MD));
    let origin = origin_of(primary.source);
    SkillEntry {
        key,
        dir_name,
        tools,
        origin,
        plugin,
        editable: primary.source.editable() && locations.iter().all(|l| l.source.editable()),
        skill_md_truncated: md_len > MAX_SKILL_MD,
        skill_md,
        file_count: w.files.len(),
        size_bytes: w.size,
        modified_ms: w.modified_ms,
        file_flags: w.flags,
        primary,
        locations,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extensions::agent_skills::roots::tests::{skill, Tmp};

    fn md(name: &str) -> String {
        format!("---\nname: {name}\ndescription: d\n---\n# {name}\n")
    }

    #[test]
    fn lista_fuentes_y_exclusiones() {
        let t = Tmp::new("lista");
        let r = t.roots();
        skill(&r.claude().join("uno"), &md("uno"));
        skill(&r.claude().join("synced/cubo/sync1"), &md("sync1"));
        skill(&r.agents().join("dos"), &md("dos"));
        skill(&r.codex().join("tres"), &md("tres"));
        skill(&r.codex().join(".system/sis"), &md("sis"));
        fs::create_dir_all(r.claude().join("sin-skill-md")).unwrap();
        let list = list(&r);
        let keys: Vec<_> = list.iter().map(|e| e.key.as_str()).collect();
        assert_eq!(keys, vec!["claude:uno", "agents:dos", "codex:tres", "claude-synced:cubo/sync1", "codex-system:sis"]);
        assert_eq!(list[0].origin, Origin::Own);
        assert!(list[0].editable);
        assert_eq!(list[3].origin, Origin::Synced);
        assert!(!list[3].editable);
        assert_eq!(list[4].tools, vec![Tool::Codex]);
        assert!(list[0].skill_md.as_deref().unwrap().contains("name: uno"));
    }

    #[cfg(unix)]
    #[test]
    fn junta_enlaces_y_marca_externos_y_rotos() {
        use std::os::unix::fs::symlink;
        let t = Tmp::new("enlaces");
        let r = t.roots();
        skill(&r.claude().join("comp"), &md("comp"));
        fs::create_dir_all(r.codex()).unwrap();
        symlink(r.claude().join("comp"), r.codex().join("comp")).unwrap();
        skill(&t.0.join("fuera/ext"), &md("ext"));
        symlink(t.0.join("fuera/ext"), r.codex().join("ext")).unwrap();
        symlink(t.0.join("no-existe"), r.codex().join("rota")).unwrap();
        let list = list(&r);
        let comp = list.iter().find(|e| e.key == "claude:comp").unwrap();
        assert_eq!(comp.tools, vec![Tool::Claude, Tool::Codex]);
        assert_eq!(comp.locations.len(), 2);
        assert!(!comp.primary.is_link);
        assert!(comp.locations[1].is_link);
        let ext = list.iter().find(|e| e.key == "codex:ext").unwrap();
        assert_eq!(ext.origin, Origin::External);
        assert!(ext.skill_md.is_none());
        let rota = list.iter().find(|e| e.key == "codex:rota").unwrap();
        assert!(rota.primary.broken);
    }

    #[test]
    fn plugins_de_claude_y_codex() {
        let t = Tmp::new("plugins");
        let r = t.roots();
        let inst = r.claude_plugins().join("cache/mp/plug/1.0.0");
        skill(&inst.join("skills/ps"), &md("ps"));
        fs::write(
            r.claude_plugins().join("installed_plugins.json"),
            format!(
                r#"{{"version":2,"plugins":{{"plug@mp":[{{"installPath":"{}","version":"1.0.0"}}],"malo@mp":[{{"installPath":"/etc"}}]}}}}"#,
                inst.to_string_lossy()
            ),
        )
        .unwrap();
        let cache = r.base(SourceId::CodexPlugin).unwrap();
        skill(&cache.join("omp/cp/1.0/skills/vieja"), &md("vieja"));
        std::thread::sleep(std::time::Duration::from_millis(20));
        skill(&cache.join("omp/cp/2.0/skills/nueva"), &md("nueva"));
        let list = list(&r);
        let ps = list.iter().find(|e| e.dir_name == "ps").unwrap();
        assert_eq!(ps.origin, Origin::Plugin);
        assert_eq!(ps.plugin.as_ref().unwrap().name, "plug");
        assert_eq!(ps.primary.id, "cache/mp/plug/1.0.0/skills/ps");
        assert!(list.iter().any(|e| e.dir_name == "nueva"));
        assert!(!list.iter().any(|e| e.dir_name == "vieja"));
    }

    #[cfg(unix)]
    #[test]
    fn desactivada_con_enlace_se_junta() {
        use std::os::unix::fs::symlink;
        let t = Tmp::new("desact");
        let r = t.roots();
        skill(&r.disabled().join("claude/x"), &md("x"));
        fs::create_dir_all(r.disabled().join("codex")).unwrap();
        // El enlace sigue apuntando a donde estaba la real.
        symlink(r.claude().join("x"), r.disabled().join("codex/x")).unwrap();
        let list = list(&r);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].origin, Origin::Disabled);
        assert_eq!(list[0].tools, vec![Tool::Claude, Tool::Codex]);
    }
}
