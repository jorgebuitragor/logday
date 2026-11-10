//! De dónde vino cada skill instalada desde un repo (specs/skills-de-
//! agentes SK21): `<datos>/agent-skills/installed.json`, que escribe solo
//! Rust (FsScope veta esa carpeta al webview). Sirve para saber si hay una
//! actualización y si la skill se cambió a mano desde que se instaló.

use std::collections::BTreeMap;
use std::fs;

use serde::{Deserialize, Serialize};

use super::files::content_hash;
use super::ops::write_atomic;
use super::roots::{resolve_skill, Roots, SourceId};

const FILE: &str = "installed.json";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstalledRecord {
    /// `owner/repo`.
    pub repo: String,
    /// La ruta de la skill en lo preparado (la del repo; una en la raíz
    /// lleva el nombre del repo).
    pub rel: String,
    pub sha: String,
    /// Huella de lo que se instaló.
    pub hash: String,
    pub installed_at: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct Stored {
    /// Por `<fuente>:<id>` de la ubicación principal.
    skills: BTreeMap<String, InstalledRecord>,
}

fn read(roots: &Roots) -> Stored {
    fs::read_to_string(roots.data.join(FILE)).ok().and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or_default()
}

/// Guarda lo instalado desde un repo. Lo de antes con la misma clave se
/// pisa (una actualización).
pub fn record(roots: &Roots, entries: Vec<(SourceId, String, InstalledRecord)>) -> Result<(), &'static str> {
    let mut stored = read(roots);
    for (source, id, rec) in entries {
        stored.skills.insert(format!("{}:{id}", source.key()), rec);
    }
    fs::create_dir_all(&roots.data).map_err(|_| super::ops::ERR_IO)?;
    let json = serde_json::to_vec_pretty(&stored).map_err(|_| super::ops::ERR_IO)?;
    write_atomic(&roots.data.join(FILE), &json)
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstalledInfo {
    pub key: String,
    #[serde(flatten)]
    pub record: InstalledRecord,
    /// Huella actual en disco; distinta de `record.hash` si se cambió a
    /// mano. `None` si no se pudo calcular.
    pub current_hash: Option<String>,
}

/// Lo instalado desde repos que sigue existiendo, con su huella actual.
pub fn list(roots: &Roots) -> Vec<InstalledInfo> {
    read(roots)
        .skills
        .into_iter()
        .filter_map(|(key, record)| {
            let (src, id) = key.split_once(':')?;
            let skill = resolve_skill(roots, SourceId::from_key(src)?, id).ok()?;
            Some(InstalledInfo { current_hash: content_hash(&skill.real).ok(), key, record })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extensions::agent_skills::roots::tests::{skill, Tmp};

    #[test]
    fn registra_y_lista_con_la_huella_actual() {
        let t = Tmp::new("manifest");
        let r = t.roots();
        skill(&r.claude().join("pdf"), "---\nname: pdf\n---\n");
        let hash = content_hash(&r.claude().join("pdf")).unwrap();
        let rec = InstalledRecord { repo: "o/r".into(), rel: "skills/pdf".into(), sha: "a".repeat(40), hash: hash.clone(), installed_at: 1 };
        record(&r, vec![(SourceId::Claude, "pdf".into(), rec.clone()), (SourceId::Claude, "borrada".into(), rec)]).unwrap();
        let l = list(&r);
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].key, "claude:pdf");
        assert_eq!(l[0].current_hash.as_deref(), Some(hash.as_str()));
        fs::write(r.claude().join("pdf/SKILL.md"), "cambiada").unwrap();
        assert_ne!(list(&r)[0].current_hash.as_deref(), Some(hash.as_str()));
    }
}
