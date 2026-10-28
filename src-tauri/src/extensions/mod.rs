//! Comandos Rust de las extensiones (specs/extensiones/design.md).
//!
//! Aquí van los secretos genéricos (llavero del SO) y, en un archivo por
//! extensión, los comandos que hablan con servicios externos. El webview
//! nunca lee un secreto: lo escribe una vez con `ext_secret_set`, y lo usa
//! el comando Rust de la extensión (R10, R17).

pub mod mcp;
pub mod team_chat;
pub mod team_chat_google;

use tauri::AppHandle;

/// Errores del llavero que llegan al webview. Nunca llevan el valor del
/// secreto, solo un código.
pub const SECRET_NOT_FOUND: &str = "secret_not_found";
pub const SECRET_INVALID_NAME: &str = "secret_invalid_name";
pub const SECRET_KEYCHAIN_ERROR: &str = "keychain_error";

/// Servicio del llavero: el identificador de la app. En producción es
/// `com.jorgebuitrago.logday`; un build de QA con otro identificador usa
/// otras entradas y no toca las del usuario.
pub(crate) fn keychain_service(app: &AppHandle) -> String {
    app.config().identifier.clone()
}

/// `ext:<id>:<clave>`. Solo minúsculas, dígitos, `-` y `_`, para que el
/// webview no pueda escribir en otras cuentas del llavero.
pub fn secret_account(id: &str, key: &str) -> Result<String, &'static str> {
    let valid = |s: &str| {
        !s.is_empty()
            && s.len() <= 64
            && s.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
    };
    if valid(id) && valid(key) {
        Ok(format!("ext:{id}:{key}"))
    } else {
        Err(SECRET_INVALID_NAME)
    }
}

fn entry(service: &str, account: &str) -> Result<keyring::Entry, &'static str> {
    keyring::Entry::new(service, account).map_err(|_| SECRET_KEYCHAIN_ERROR)
}

/// Lee un secreto del llavero. Solo para los comandos Rust de las
/// extensiones; no se expone al webview.
pub fn read_secret(service: &str, id: &str, key: &str) -> Result<String, &'static str> {
    let account = secret_account(id, key)?;
    match entry(service, &account)?.get_password() {
        Ok(v) => Ok(v),
        Err(keyring::Error::NoEntry) => Err(SECRET_NOT_FOUND),
        Err(_) => Err(SECRET_KEYCHAIN_ERROR),
    }
}

/// Guarda un secreto desde un comando Rust (p. ej. un token de OAuth que
/// nunca pasa por el webview).
pub fn write_secret(service: &str, id: &str, key: &str, value: &str) -> Result<(), &'static str> {
    let account = secret_account(id, key)?;
    entry(service, &account)?.set_password(value).map_err(|_| SECRET_KEYCHAIN_ERROR)
}

/// Borra un secreto desde un comando Rust. Que no exista no es un error.
pub fn delete_secret(service: &str, id: &str, key: &str) -> Result<(), &'static str> {
    let account = secret_account(id, key)?;
    match entry(service, &account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(SECRET_KEYCHAIN_ERROR),
    }
}

/// Pista para mostrar en vez del secreto: el host (si es una URL) y los
/// últimos 4 caracteres. P. ej. "chat.googleapis.com …a1b2".
pub fn secret_hint(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let tail: String = chars[chars.len().saturating_sub(4)..].iter().collect();
    match reqwest::Url::parse(value).ok().and_then(|u| u.host_str().map(str::to_string)) {
        Some(host) => format!("{host} …{tail}"),
        None => format!("…{tail}"),
    }
}

/// El llavero puede bloquear (en macOS, a veces pide permiso), así que
/// se usa fuera del hilo principal.
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, &'static str> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|_| SECRET_KEYCHAIN_ERROR.to_string())?
        .map_err(str::to_string)
}

/// Guarda un secreto y devuelve su pista.
#[tauri::command]
pub async fn ext_secret_set(app: AppHandle, id: String, key: String, value: String) -> Result<String, String> {
    let service = keychain_service(&app);
    blocking(move || {
        let account = secret_account(&id, &key)?;
        entry(&service, &account)?
            .set_password(&value)
            .map_err(|_| SECRET_KEYCHAIN_ERROR)?;
        Ok(secret_hint(&value))
    })
    .await
}

/// Borra un secreto. Que no exista no es un error.
#[tauri::command]
pub async fn ext_secret_clear(app: AppHandle, id: String, key: String) -> Result<(), String> {
    let service = keychain_service(&app);
    blocking(move || {
        let account = secret_account(&id, &key)?;
        match entry(&service, &account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(SECRET_KEYCHAIN_ERROR),
        }
    })
    .await
}

/// La pista del secreto guardado, o `None` si no hay ninguno (R14: la
/// extensión pide volver a configurarla).
#[tauri::command]
pub async fn ext_secret_hint(app: AppHandle, id: String, key: String) -> Result<Option<String>, String> {
    let service = keychain_service(&app);
    blocking(move || match read_secret(&service, &id, &key) {
        Ok(v) => Ok(Some(secret_hint(&v))),
        Err(SECRET_NOT_FOUND) => Ok(None),
        Err(e) => Err(e),
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cuenta_valida() {
        assert_eq!(secret_account("team-chat", "webhook").unwrap(), "ext:team-chat:webhook");
    }

    #[test]
    fn cuenta_rechaza_nombres_raros() {
        for (id, key) in [("", "webhook"), ("team-chat", ""), ("Team", "x"), ("a:b", "x"), ("a", "x y"), ("../a", "x")] {
            assert_eq!(secret_account(id, key), Err(SECRET_INVALID_NAME), "{id}/{key}");
        }
    }

    #[test]
    fn pista_de_url_y_de_texto() {
        assert_eq!(
            secret_hint("https://chat.googleapis.com/v1/spaces/AAA/messages?key=k&token=a1b2"),
            "chat.googleapis.com …a1b2"
        );
        assert_eq!(secret_hint("token-xyz9"), "…xyz9");
        assert_eq!(secret_hint("ab"), "…ab");
    }
}
