//! Todos los secretos de las extensiones en una sola entrada del llavero
//! (`ext:vault`, un JSON `{ "ext:<id>:<clave>": valor }`), en macOS.
//!
//! En macOS, cada entrada del llavero pide permiso por separado cuando la
//! app cambia de firma (cada build de QA y cada versión, porque se firma
//! ad hoc). Con una entrada por secreto eran varios avisos seguidos; con
//! una sola, uno. Se lee una vez y queda en memoria.
//!
//! Las entradas viejas (`ext:<id>:<clave>`) se pasan solas a esta la primera
//! vez que se leen, y se borran. En Windows y Linux se sigue con una entrada
//! por secreto: no tienen ese aviso, y Windows limita el tamaño de cada
//! una.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::{Mutex, OnceLock};

use super::{SECRET_KEYCHAIN_ERROR, SECRET_NOT_FOUND};

pub const VAULT_ACCOUNT: &str = "ext:vault";

/// El llavero, visto como cuentas con un valor. En las pruebas, un mapa.
pub trait Store {
    fn get(&self, account: &str) -> Result<Option<String>, &'static str>;
    fn set(&self, account: &str, value: &str) -> Result<(), &'static str>;
    fn delete(&self, account: &str) -> Result<(), &'static str>;
}

#[derive(Default)]
pub struct Vault {
    loaded: bool,
    secrets: BTreeMap<String, String>,
    /// Cuentas viejas ya miradas en esta sesión: no se vuelve a preguntar
    /// al llavero por una que no estaba.
    legacy_checked: HashSet<String>,
}

impl Vault {
    fn load(&mut self, store: &dyn Store) -> Result<(), &'static str> {
        if self.loaded {
            return Ok(());
        }
        if let Some(raw) = store.get(VAULT_ACCOUNT)? {
            // Si no se puede leer, no se pisa: se avisa.
            self.secrets = serde_json::from_str(&raw).map_err(|_| SECRET_KEYCHAIN_ERROR)?;
        }
        self.loaded = true;
        Ok(())
    }

    fn save(&self, store: &dyn Store) -> Result<(), &'static str> {
        let raw = serde_json::to_string(&self.secrets).map_err(|_| SECRET_KEYCHAIN_ERROR)?;
        store.set(VAULT_ACCOUNT, &raw)
    }

    pub fn read(&mut self, store: &dyn Store, account: &str) -> Result<String, &'static str> {
        self.load(store)?;
        if let Some(v) = self.secrets.get(account) {
            return Ok(v.clone());
        }
        if self.legacy_checked.insert(account.to_string()) {
            if let Some(v) = store.get(account)? {
                self.secrets.insert(account.to_string(), v.clone());
                self.save(store)?;
                // Ya está en la entrada única; si no se puede borrar la vieja,
                // no pasa nada: no se vuelve a leer.
                let _ = store.delete(account);
                return Ok(v);
            }
        }
        Err(SECRET_NOT_FOUND)
    }

    pub fn write(&mut self, store: &dyn Store, account: &str, value: &str) -> Result<(), &'static str> {
        self.load(store)?;
        self.secrets.insert(account.to_string(), value.to_string());
        self.save(store)?;
        self.drop_legacy(store, account);
        Ok(())
    }

    pub fn delete(&mut self, store: &dyn Store, account: &str) -> Result<(), &'static str> {
        self.load(store)?;
        if self.secrets.remove(account).is_some() {
            self.save(store)?;
        }
        self.drop_legacy(store, account);
        Ok(())
    }

    /// La entrada vieja de esa cuenta, si quedó, ya no vale.
    fn drop_legacy(&mut self, store: &dyn Store, account: &str) {
        if self.legacy_checked.insert(account.to_string()) {
            let _ = store.delete(account);
        }
    }
}

struct Keyring<'a> {
    service: &'a str,
}

impl Store for Keyring<'_> {
    fn get(&self, account: &str) -> Result<Option<String>, &'static str> {
        match keyring::Entry::new(self.service, account).map_err(|_| SECRET_KEYCHAIN_ERROR)?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(SECRET_KEYCHAIN_ERROR),
        }
    }

    fn set(&self, account: &str, value: &str) -> Result<(), &'static str> {
        keyring::Entry::new(self.service, account)
            .map_err(|_| SECRET_KEYCHAIN_ERROR)?
            .set_password(value)
            .map_err(|_| SECRET_KEYCHAIN_ERROR)
    }

    fn delete(&self, account: &str) -> Result<(), &'static str> {
        match keyring::Entry::new(self.service, account).map_err(|_| SECRET_KEYCHAIN_ERROR)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(SECRET_KEYCHAIN_ERROR),
        }
    }
}

/// Una entrada única por servicio (la app de QA y la de producción tienen
/// cada una la suya). El candado cubre leer, cambiar y guardar.
pub fn with<T>(service: &str, f: impl FnOnce(&mut Vault, &dyn Store) -> Result<T, &'static str>) -> Result<T, &'static str> {
    static VAULTS: OnceLock<Mutex<HashMap<String, Vault>>> = OnceLock::new();
    let mut vaults = VAULTS.get_or_init(Default::default).lock().map_err(|_| SECRET_KEYCHAIN_ERROR)?;
    let vault = vaults.entry(service.to_string()).or_default();
    f(vault, &Keyring { service })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct Fake {
        items: RefCell<BTreeMap<String, String>>,
        gets: RefCell<Vec<String>>,
    }

    impl Store for Fake {
        fn get(&self, account: &str) -> Result<Option<String>, &'static str> {
            self.gets.borrow_mut().push(account.to_string());
            Ok(self.items.borrow().get(account).cloned())
        }
        fn set(&self, account: &str, value: &str) -> Result<(), &'static str> {
            self.items.borrow_mut().insert(account.to_string(), value.to_string());
            Ok(())
        }
        fn delete(&self, account: &str) -> Result<(), &'static str> {
            self.items.borrow_mut().remove(account);
            Ok(())
        }
    }

    #[test]
    fn todo_en_una_entrada() {
        let store = Fake::default();
        let mut v = Vault::default();
        v.write(&store, "ext:mcp:token", "t1").unwrap();
        v.write(&store, "ext:openproject:token", "t2").unwrap();
        assert_eq!(store.items.borrow().keys().cloned().collect::<Vec<_>>(), vec![VAULT_ACCOUNT.to_string()]);
        // Otra sesión la lee de una sola vez.
        store.gets.borrow_mut().clear();
        let mut again = Vault::default();
        assert_eq!(again.read(&store, "ext:openproject:token"), Ok("t2".into()));
        assert_eq!(again.read(&store, "ext:mcp:token"), Ok("t1".into()));
        assert_eq!(store.gets.borrow().iter().filter(|a| *a == VAULT_ACCOUNT).count(), 1);
    }

    #[test]
    fn pasa_las_viejas_y_las_borra() {
        let store = Fake::default();
        store.set("ext:granola:refresh", "r").unwrap();
        let mut v = Vault::default();
        assert_eq!(v.read(&store, "ext:granola:refresh"), Ok("r".into()));
        assert!(!store.items.borrow().contains_key("ext:granola:refresh"));
        let raw = store.items.borrow().get(VAULT_ACCOUNT).cloned().unwrap();
        assert_eq!(serde_json::from_str::<BTreeMap<String, String>>(&raw).unwrap()["ext:granola:refresh"], "r");
    }

    #[test]
    fn una_que_no_esta_se_mira_una_vez() {
        let store = Fake::default();
        let mut v = Vault::default();
        assert_eq!(v.read(&store, "ext:x:y"), Err(SECRET_NOT_FOUND));
        assert_eq!(v.read(&store, "ext:x:y"), Err(SECRET_NOT_FOUND));
        assert_eq!(store.gets.borrow().iter().filter(|a| *a == "ext:x:y").count(), 1);
    }

    #[test]
    fn borrar_quita_de_la_unica_y_de_la_vieja() {
        let store = Fake::default();
        store.set("ext:a:b", "viejo").unwrap();
        let mut v = Vault::default();
        v.write(&store, "ext:c:d", "1").unwrap();
        v.delete(&store, "ext:a:b").unwrap();
        v.delete(&store, "ext:c:d").unwrap();
        assert!(!store.items.borrow().contains_key("ext:a:b"));
        assert_eq!(v.read(&store, "ext:c:d"), Err(SECRET_NOT_FOUND));
    }

    #[test]
    fn una_entrada_rota_no_se_pisa() {
        let store = Fake::default();
        store.set(VAULT_ACCOUNT, "no es json").unwrap();
        let mut v = Vault::default();
        assert_eq!(v.write(&store, "ext:a:b", "x"), Err(SECRET_KEYCHAIN_ERROR));
        assert_eq!(store.items.borrow().get(VAULT_ACCOUNT).map(String::as_str), Some("no es json"));
    }
}
