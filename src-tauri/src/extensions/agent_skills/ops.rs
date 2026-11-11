//! Cambiar las skills propias (specs/skills-de-agentes, fase 2): crear,
//! guardar el SKILL.md, mandar a la papelera, desactivar o activar y
//! compartir con la otra herramienta (SK9–SK13).
//!
//! Solo actúa en las fuentes que se pueden cambiar (`~/.claude/skills`,
//! `~/.agents/skills`, `~/.codex/skills` y las desactivadas). Nunca
//! ejecuta nada ni pone bits de ejecución (SK28). La confirmación nativa de
//! lo que agrega contenido (SK29) la piden los comandos, antes de llamar
//! aquí.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use super::files::{find_skill_md, sha256_hex};
use super::roots::{split_relative, join, Roots, SourceId, Tool, ERR_INVALID, ERR_NOT_FOUND, ERR_READ_ONLY};

pub const ERR_OCCUPIED: &str = "occupied";
pub const ERR_CHANGED: &str = "changed_on_disk";
pub const ERR_HAS_LINKS: &str = "has_links";
pub const ERR_TRASH: &str = "trash_failed";
pub const ERR_IO: &str = "io_error";
pub const ERR_BAD_CONTENT: &str = "bad_content";

/// Lo que se acepta como SKILL.md al crear o guardar.
pub const MAX_SAVE: usize = 256 * 1024;

/// Las fuentes propias en las que se puede crear o a las que se puede
/// devolver una skill desactivada.
pub const OWN: [SourceId; 3] = [SourceId::Claude, SourceId::Agents, SourceId::Codex];

/// Regla de la especificación abierta (SK9): 1-64, `a-z0-9-`, sin guion
/// al principio ni al final ni dos seguidos.
pub fn valid_skill_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        && !name.starts_with('-')
        && !name.ends_with('-')
        && !name.contains("--")
}

/// Una ubicación propia `(fuente, id)`: en `Claude`, `Agents` y `Codex` el
/// `id` es el nombre de la carpeta; en `Disabled`, `<fuente>/<carpeta>`.
/// Devuelve la ruta sin resolver enlaces (un enlace se quita como enlace).
pub fn own_location(roots: &Roots, source: SourceId, id: &str) -> Result<PathBuf, &'static str> {
    if !source.editable() {
        return Err(ERR_READ_ONLY);
    }
    let parts = split_relative(id)?;
    let ok = match source {
        SourceId::Disabled => parts.len() == 2 && OWN.iter().any(|s| s.key() == parts[0]),
        _ => parts.len() == 1,
    };
    if !ok || parts.iter().any(|p| p.starts_with('.')) {
        return Err(ERR_INVALID);
    }
    let base = roots.base(source).ok_or(ERR_NOT_FOUND)?;
    let path = join(&base, &parts);
    fs::symlink_metadata(&path).map_err(|_| ERR_NOT_FOUND)?;
    Ok(path)
}

fn is_link(p: &Path) -> bool {
    fs::symlink_metadata(p).map(|m| m.file_type().is_symlink()).unwrap_or(false)
}

/// La carpeta real de una ubicación propia. Debe caer dentro de una fuente
/// propia o de las desactivadas: no se cambia nada fuera (SK26).
fn own_real(roots: &Roots, loc: &Path) -> Result<PathBuf, &'static str> {
    let real = loc.canonicalize().map_err(|_| ERR_NOT_FOUND)?;
    let inside = OWN
        .iter()
        .chain([SourceId::Disabled].iter())
        .filter_map(|s| roots.base(*s).and_then(|b| b.canonicalize().ok()))
        .any(|b| real.starts_with(&b) && real != b);
    if inside && real.is_dir() {
        Ok(real)
    } else {
        Err(ERR_READ_ONLY)
    }
}

/// Escribe un archivo sin dejarlo a medias: a un temporal al lado y luego
/// `rename`. Con permisos normales (sin ejecución).
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), &'static str> {
    let name = path.file_name().ok_or(ERR_INVALID)?.to_string_lossy().to_string();
    let tmp = path.with_file_name(format!(".{name}.logday-tmp"));
    fs::write(&tmp, bytes).map_err(|_| ERR_IO)?;
    fs::rename(&tmp, path).map_err(|_| {
        let _ = fs::remove_file(&tmp);
        ERR_IO
    })
}

/// Un SKILL.md aceptable: texto, con frontmatter al principio, y con tope.
fn check_content(content: &str) -> Result<(), &'static str> {
    let trimmed = content.trim_start_matches('\u{feff}');
    if content.len() > MAX_SAVE || content.contains('\0') || !trimmed.starts_with("---") {
        return Err(ERR_BAD_CONTENT);
    }
    Ok(())
}

/// Dónde va una skill nueva según las herramientas (decisiones 2 y 3): la
/// carpeta real en Claude Code si la incluye, si no en `~/.agents/skills`;
/// con las dos, un enlace en `~/.agents/skills`.
pub fn destinations(roots: &Roots, name: &str, tools: &[Tool]) -> Result<(PathBuf, Option<PathBuf>), &'static str> {
    let claude = tools.contains(&Tool::Claude);
    let codex = tools.contains(&Tool::Codex);
    match (claude, codex) {
        (true, true) => Ok((roots.claude().join(name), Some(roots.agents().join(name)))),
        (true, false) => Ok((roots.claude().join(name), None)),
        (false, true) => Ok((roots.agents().join(name), None)),
        (false, false) => Err(ERR_INVALID),
    }
}

fn exists(p: &Path) -> bool {
    fs::symlink_metadata(p).is_ok()
}

/// Enlace a la carpeta real (en Windows, copia: crear enlaces pide
/// permisos de administrador o el modo de desarrollador, SK13).
pub fn link_or_copy(real: &Path, link: &Path) -> Result<(), &'static str> {
    if let Some(parent) = link.parent() {
        fs::create_dir_all(parent).map_err(|_| ERR_IO)?;
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(real, link).map_err(|_| ERR_IO)
    }
    #[cfg(not(unix))]
    {
        copy_tree(real, link)
    }
}

/// Copia una carpeta sin seguir enlaces (los enlaces se omiten) y sin
/// copiar permisos: los archivos quedan sin bit de ejecución (SK16).
pub fn copy_tree(from: &Path, to: &Path) -> Result<(), &'static str> {
    fs::create_dir_all(to).map_err(|_| ERR_IO)?;
    for entry in fs::read_dir(from).map_err(|_| ERR_IO)?.flatten() {
        let meta = fs::symlink_metadata(entry.path()).map_err(|_| ERR_IO)?;
        let dest = to.join(entry.file_name());
        if meta.file_type().is_symlink() {
            continue;
        } else if meta.is_dir() {
            copy_tree(&entry.path(), &dest)?;
        } else if meta.is_file() {
            let bytes = fs::read(entry.path()).map_err(|_| ERR_IO)?;
            fs::write(&dest, bytes).map_err(|_| ERR_IO)?;
        }
    }
    Ok(())
}

/// `rename`, y si cruza de disco (la carpeta de la app en otro volumen),
/// copiar y borrar.
pub fn move_path(from: &Path, to: &Path) -> Result<(), &'static str> {
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|_| ERR_IO)?;
    }
    match fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::CrossesDevices => {
            if is_link(from) {
                let target = fs::read_link(from).map_err(|_| ERR_IO)?;
                link_or_copy(&target, to)?;
                fs::remove_file(from).map_err(|_| ERR_IO)
            } else {
                copy_tree(from, to)?;
                fs::remove_dir_all(from).map_err(|_| ERR_IO)
            }
        }
        Err(_) => Err(ERR_IO),
    }
}

/// A la papelera del sistema. En macOS, con NSFileManager: el método por
/// defecto (pedirle al Finder) pide permiso de Automatización y suena.
pub fn to_trash(path: &Path) -> Result<(), &'static str> {
    #[allow(unused_mut)]
    let mut ctx = trash::TrashContext::default();
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        ctx.set_delete_method(DeleteMethod::NsFileManager);
    }
    ctx.delete(path).map_err(|_| ERR_TRASH)
}

/// Si ya hay una skill con ese nombre en alguna de las herramientas
/// elegidas. En Codex cuentan las dos carpetas (`~/.agents/skills` y la
/// antigua `~/.codex/skills`): dos con el mismo nombre confunden al agente.
pub fn name_taken(roots: &Roots, name: &str, tools: &[Tool]) -> bool {
    let mut paths = Vec::new();
    if tools.contains(&Tool::Claude) {
        paths.push(roots.claude().join(name));
    }
    if tools.contains(&Tool::Codex) {
        paths.push(roots.agents().join(name));
        paths.push(roots.codex().join(name));
    }
    paths.iter().any(|p| exists(p))
}

/// Crea una skill (SK9). Devuelve la fuente y el id de la principal.
pub fn create(roots: &Roots, name: &str, content: &str, tools: &[Tool]) -> Result<(SourceId, String), &'static str> {
    if !valid_skill_name(name) {
        return Err(ERR_INVALID);
    }
    check_content(content)?;
    let (primary, link) = destinations(roots, name, tools)?;
    if name_taken(roots, name, tools) {
        return Err(ERR_OCCUPIED);
    }
    fs::create_dir_all(&primary).map_err(|_| ERR_IO)?;
    write_atomic(&primary.join("SKILL.md"), content.as_bytes())?;
    if let Some(link) = link {
        link_or_copy(&primary, &link)?;
    }
    let source = if primary.starts_with(roots.claude()) { SourceId::Claude } else { SourceId::Agents };
    Ok((source, name.to_string()))
}

/// Huella del SKILL.md, para saber si cambió en disco desde que se abrió
/// (SK10).
pub fn skill_md_hash(real: &Path) -> Option<String> {
    let p = find_skill_md(real)?;
    fs::read(p).ok().map(|b| sha256_hex(&b))
}

/// Guarda el SKILL.md de una skill propia (SK10). Si `expected` no
/// coincide con lo que hay en disco y no se fuerza, `changed_on_disk`.
pub fn save(roots: &Roots, source: SourceId, id: &str, content: &str, expected: Option<&str>, force: bool) -> Result<PathBuf, &'static str> {
    check_content(content)?;
    let loc = own_location(roots, source, id)?;
    let real = own_real(roots, &loc)?;
    if !force {
        if let Some(exp) = expected {
            if skill_md_hash(&real).as_deref() != Some(exp) {
                return Err(ERR_CHANGED);
            }
        }
    }
    let target = find_skill_md(&real).unwrap_or_else(|| real.join("SKILL.md"));
    write_atomic(&target, content.as_bytes())?;
    Ok(real)
}

/// Las ubicaciones propias (y desactivadas) de una carpeta real: ella
/// misma y los enlaces que apuntan a ella. Un enlace desactivado apunta a
/// donde estaba la real (`~/.claude/skills/x`), así que se compara también
/// con esa ruta.
pub fn same_skill(roots: &Roots, real: &Path) -> Vec<(SourceId, String, PathBuf)> {
    let mut out = Vec::new();
    let original = original_of_disabled(roots, real);
    let mut check = |source: SourceId, id: String, p: PathBuf| {
        let canon = p.canonicalize().ok();
        let matches = canon.as_deref() == Some(real)
            || (is_link(&p)
                && fs::read_link(&p).ok().map(|t| Some(t.clone()) == original || t == real).unwrap_or(false));
        if matches {
            out.push((source, id, p));
        }
    };
    for source in OWN {
        let Some(base) = roots.base(source) else { continue };
        let Ok(rd) = fs::read_dir(&base) else { continue };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if !name.starts_with('.') {
                check(source, name, e.path());
            }
        }
        let dis = roots.disabled().join(source.key());
        if let Ok(rd) = fs::read_dir(&dis) {
            for e in rd.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                check(SourceId::Disabled, format!("{}/{name}", source.key()), e.path());
            }
        }
    }
    out
}

/// Si `real` está en las desactivadas (`disabled/claude/x`), dónde estaba
/// (`~/.claude/skills/x`).
fn original_of_disabled(roots: &Roots, real: &Path) -> Option<PathBuf> {
    let dis = roots.disabled().canonicalize().ok()?;
    let rest = real.strip_prefix(&dis).ok()?;
    let mut parts = rest.iter();
    let source = SourceId::from_key(&parts.next()?.to_string_lossy())?;
    let base = roots.base(source)?;
    Some(base.join(parts.as_path()))
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrashScope {
    /// Solo esta ubicación: un enlace se quita; la carpeta real, si nadie
    /// la enlaza.
    Location,
    /// La carpeta real a la papelera y todos sus enlaces fuera.
    All,
}

/// Borra (SK11): los enlaces se quitan con `remove_file` (nunca su
/// destino) y la carpeta real va a la papelera.
pub fn trash_skill(roots: &Roots, source: SourceId, id: &str, scope: TrashScope) -> Result<(), &'static str> {
    let loc = own_location(roots, source, id)?;
    // Un enlace roto o externo: solo se quita el enlace.
    if is_link(&loc) && (scope == TrashScope::Location || own_real(roots, &loc).is_err()) {
        return fs::remove_file(&loc).map_err(|_| ERR_IO);
    }
    let real = own_real(roots, &loc)?;
    let group = same_skill(roots, &real);
    let links: Vec<&PathBuf> = group.iter().map(|(_, _, p)| p).filter(|p| is_link(p)).collect();
    if scope == TrashScope::Location && !links.is_empty() {
        return Err(ERR_HAS_LINKS);
    }
    for l in links {
        fs::remove_file(l).map_err(|_| ERR_IO)?;
    }
    to_trash(&real)
}

/// Desactiva (SK12): mueve cada ubicación de la skill, enlaces incluidos,
/// a `disabled/<fuente>/<carpeta>`. Si alguna ya está ocupada, no mueve
/// ninguna.
pub fn disable(roots: &Roots, source: SourceId, id: &str) -> Result<(), &'static str> {
    if source == SourceId::Disabled {
        return Err(ERR_INVALID);
    }
    let loc = own_location(roots, source, id)?;
    let moves: Vec<(PathBuf, PathBuf)> = match own_real(roots, &loc) {
        Ok(real) => same_skill(roots, &real)
            .into_iter()
            .filter(|(s, _, _)| *s != SourceId::Disabled)
            .map(|(s, name, p)| (p, roots.disabled().join(s.key()).join(name)))
            .collect(),
        // Un enlace roto: se mueve solo él.
        Err(_) => vec![(loc.clone(), roots.disabled().join(source.key()).join(id))],
    };
    if moves.iter().any(|(_, to)| exists(to)) {
        return Err(ERR_OCCUPIED);
    }
    for (from, to) in &moves {
        move_path(from, to)?;
    }
    Ok(())
}

/// Activa (SK12): devuelve cada ubicación desactivada de la skill a su
/// fuente. Si alguna ya está ocupada, no mueve ninguna.
pub fn enable(roots: &Roots, id: &str) -> Result<(), &'static str> {
    let loc = own_location(roots, SourceId::Disabled, id)?;
    let target_of = |sub: &str| -> Option<PathBuf> {
        let (src, name) = sub.split_once('/')?;
        Some(roots.base(SourceId::from_key(src)?)?.join(name))
    };
    let moves: Vec<(PathBuf, PathBuf)> = match loc.canonicalize().ok().filter(|r| r.is_dir()) {
        Some(real) => same_skill(roots, &real)
            .into_iter()
            .filter(|(s, _, _)| *s == SourceId::Disabled)
            .filter_map(|(_, sub, p)| target_of(&sub).map(|to| (p, to)))
            .collect(),
        None => {
            // El enlace desactivado apunta a donde estará la real: se
            // activa la real, y con ella él.
            let real = fs::read_link(&loc).ok().and_then(|t| {
                let rest = OWN.iter().find_map(|s| t.strip_prefix(roots.base(*s)?).ok().map(|r| (s.key(), r.to_path_buf())))?;
                roots.disabled().join(rest.0).join(rest.1).canonicalize().ok()
            });
            match real {
                Some(real) => same_skill(roots, &real)
                    .into_iter()
                    .filter(|(s, _, _)| *s == SourceId::Disabled)
                    .filter_map(|(_, sub, p)| target_of(&sub).map(|to| (p, to)))
                    .collect(),
                None => vec![(loc.clone(), target_of(id).ok_or(ERR_INVALID)?)],
            }
        }
    };
    if moves.is_empty() {
        return Err(ERR_NOT_FOUND);
    }
    if moves.iter().any(|(_, to)| exists(to)) {
        return Err(ERR_OCCUPIED);
    }
    for (from, to) in &moves {
        move_path(from, to)?;
    }
    Ok(())
}

/// Comparte una skill propia con la otra herramienta (SK13). Devuelve la
/// ruta nueva.
pub fn share(roots: &Roots, source: SourceId, id: &str, to: Tool) -> Result<PathBuf, &'static str> {
    if source == SourceId::Disabled {
        return Err(ERR_INVALID);
    }
    let loc = own_location(roots, source, id)?;
    let real = own_real(roots, &loc)?;
    let name = loc.file_name().ok_or(ERR_INVALID)?.to_string_lossy().to_string();
    let dest = match to {
        Tool::Claude => roots.claude().join(&name),
        Tool::Codex => roots.agents().join(&name),
    };
    if exists(&dest) || (to == Tool::Codex && exists(&roots.codex().join(&name))) {
        return Err(ERR_OCCUPIED);
    }
    link_or_copy(&real, &dest)?;
    Ok(dest)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extensions::agent_skills::roots::tests::{skill, Tmp};

    const MD: &str = "---\nname: nueva\ndescription: d\n---\n# Nueva\n";

    #[test]
    fn nombres_validos() {
        for ok in ["a", "pdf", "skill-creator", "a1-b2"] {
            assert!(valid_skill_name(ok), "{ok}");
        }
        for bad in ["", "-a", "a-", "a--b", "A", "a_b", "../a", "a/b", ".a"] {
            assert!(!valid_skill_name(bad), "{bad}");
        }
    }

    #[test]
    fn crear_en_una_o_las_dos_herramientas() {
        let t = Tmp::new("crear");
        let r = t.roots();
        assert_eq!(create(&r, "nueva", MD, &[Tool::Claude]).unwrap(), (SourceId::Claude, "nueva".into()));
        assert!(r.claude().join("nueva/SKILL.md").is_file());
        assert_eq!(create(&r, "nueva", MD, &[Tool::Claude]).unwrap_err(), ERR_OCCUPIED);
        assert_eq!(create(&r, "otra", MD, &[Tool::Codex]).unwrap(), (SourceId::Agents, "otra".into()));
        assert!(r.agents().join("otra/SKILL.md").is_file());
        create(&r, "ambas", MD, &[Tool::Claude, Tool::Codex]).unwrap();
        #[cfg(unix)]
        assert!(is_link(&r.agents().join("ambas")));
        assert_eq!(create(&r, "x", "sin frontmatter", &[Tool::Claude]).unwrap_err(), ERR_BAD_CONTENT);
        assert_eq!(create(&r, "Mal", MD, &[Tool::Claude]).unwrap_err(), ERR_INVALID);
        // Ocupado en la carpeta antigua de Codex.
        skill(&r.codex().join("vieja"), MD);
        assert_eq!(create(&r, "vieja", MD, &[Tool::Codex]).unwrap_err(), ERR_OCCUPIED);
        assert!(create(&r, "vieja", MD, &[Tool::Claude]).is_ok());
    }

    #[test]
    fn guardar_con_huella() {
        let t = Tmp::new("guardar");
        let r = t.roots();
        skill(&r.claude().join("s"), MD);
        let h = skill_md_hash(&r.claude().join("s")).unwrap();
        save(&r, SourceId::Claude, "s", "---\nname: s\n---\nv2", Some(&h), false).unwrap();
        // Cambió en disco: pide forzar.
        assert_eq!(save(&r, SourceId::Claude, "s", "---\nv3", Some(&h), false).unwrap_err(), ERR_CHANGED);
        save(&r, SourceId::Claude, "s", "---\nv3", Some(&h), true).unwrap();
        assert_eq!(fs::read_to_string(r.claude().join("s/SKILL.md")).unwrap(), "---\nv3");
        // Solo lectura.
        skill(&r.claude().join("synced/c/x"), MD);
        assert_eq!(save(&r, SourceId::ClaudeSynced, "c/x", MD, None, true).unwrap_err(), ERR_READ_ONLY);
        assert_eq!(save(&r, SourceId::Claude, "../x", MD, None, true).unwrap_err(), ERR_INVALID);
    }

    #[cfg(unix)]
    #[test]
    fn papelera_enlaces_y_ubicaciones() {
        let t = Tmp::new("papelera");
        let r = t.roots();
        create(&r, "comp", MD, &[Tool::Claude, Tool::Codex]).unwrap();
        // Desde Claude, con un enlace en Codex: pide elegir.
        assert_eq!(trash_skill(&r, SourceId::Claude, "comp", TrashScope::Location).unwrap_err(), ERR_HAS_LINKS);
        // Quitar solo de Codex: se va el enlace, la real queda.
        trash_skill(&r, SourceId::Agents, "comp", TrashScope::Location).unwrap();
        assert!(!exists(&r.agents().join("comp")));
        assert!(r.claude().join("comp").is_dir());
        // Un enlace roto se quita.
        fs::create_dir_all(r.codex()).unwrap();
        std::os::unix::fs::symlink(t.0.join("no-existe"), r.codex().join("rota")).unwrap();
        trash_skill(&r, SourceId::Codex, "rota", TrashScope::Location).unwrap();
        assert!(!exists(&r.codex().join("rota")));
    }

    #[cfg(unix)]
    #[test]
    fn desactivar_y_activar_con_enlaces() {
        let t = Tmp::new("desactivar");
        let r = t.roots();
        create(&r, "comp", MD, &[Tool::Claude, Tool::Codex]).unwrap();
        disable(&r, SourceId::Agents, "comp").unwrap();
        assert!(!exists(&r.claude().join("comp")) && !exists(&r.agents().join("comp")));
        assert!(r.disabled().join("claude/comp/SKILL.md").is_file());
        assert!(is_link(&r.disabled().join("agents/comp")));
        // Ocupado al volver: no mueve nada.
        skill(&r.claude().join("comp"), MD);
        assert_eq!(enable(&r, "claude/comp").unwrap_err(), ERR_OCCUPIED);
        fs::remove_dir_all(r.claude().join("comp")).unwrap();
        // Activar desde el enlace desactivado trae las dos.
        enable(&r, "agents/comp").unwrap();
        assert!(r.claude().join("comp/SKILL.md").is_file());
        assert!(r.agents().join("comp").canonicalize().unwrap().ends_with("comp"));
        assert!(r.agents().join("comp/SKILL.md").is_file());
    }

    #[cfg(unix)]
    #[test]
    fn compartir_con_la_otra() {
        let t = Tmp::new("compartir");
        let r = t.roots();
        create(&r, "s", MD, &[Tool::Claude]).unwrap();
        share(&r, SourceId::Claude, "s", Tool::Codex).unwrap();
        assert!(is_link(&r.agents().join("s")));
        assert_eq!(share(&r, SourceId::Claude, "s", Tool::Codex).unwrap_err(), ERR_OCCUPIED);
        create(&r, "c", MD, &[Tool::Codex]).unwrap();
        share(&r, SourceId::Agents, "c", Tool::Claude).unwrap();
        assert!(is_link(&r.claude().join("c")));
        // Nunca fuera de las fuentes propias.
        skill(&r.claude().join("synced/b/x"), MD);
        assert_eq!(share(&r, SourceId::ClaudeSynced, "b/x", Tool::Codex).unwrap_err(), ERR_READ_ONLY);
    }
}
