#![cfg_attr(test, allow(dead_code))]

use secrecy::{ExposeSecret, SecretString};
use sha2::{Digest, Sha256};
use std::path::{Component, Path, PathBuf};

const KEYRING_SERVICE: &str = "Zync SSH Key Passphrase";

fn normalize_lexically(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if matches!(
                    normalized.components().next_back(),
                    Some(Component::Normal(_))
                ) {
                    normalized.pop();
                } else if !normalized.has_root() {
                    normalized.push(component.as_os_str());
                }
            }
            Component::Prefix(_) | Component::RootDir | Component::Normal(_) => {
                normalized.push(component.as_os_str());
            }
        }
    }
    normalized
}

fn normalized_key_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let path = PathBuf::from(trimmed);
    let absolute = if path.is_absolute() {
        path
    } else {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(path)
    };
    let normalized = normalize_lexically(&absolute).to_string_lossy().to_string();
    #[cfg(windows)]
    {
        normalized.to_lowercase()
    }
    #[cfg(not(windows))]
    {
        normalized
    }
}

pub fn keyring_account(path: &str) -> String {
    let digest = Sha256::digest(normalized_key_path(path).as_bytes());
    let encoded = digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("key:{encoded}")
}

#[cfg(not(test))]
fn keyring_entry(path: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, &keyring_account(path))
        .map_err(|error| format!("SSH key credential entry failed: {error}"))
}

#[cfg(not(test))]
pub fn load(path: &str) -> Result<Option<SecretString>, String> {
    match keyring_entry(path)?.get_password() {
        Ok(value) => Ok(Some(SecretString::from(value))),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("SSH key credential read failed: {error}")),
    }
}

#[cfg(test)]
pub fn load(path: &str) -> Result<Option<SecretString>, String> {
    Ok(test_store()
        .lock()
        .map_err(|_| "test key store lock poisoned".to_string())?
        .get(&keyring_account(path))
        .cloned()
        .map(SecretString::from))
}

#[cfg(not(test))]
pub fn save(path: &str, passphrase: &SecretString) -> Result<(), String> {
    keyring_entry(path)?
        .set_password(passphrase.expose_secret())
        .map_err(|error| format!("SSH key credential write failed: {error}"))
}

#[cfg(test)]
pub fn save(path: &str, passphrase: &SecretString) -> Result<(), String> {
    test_store()
        .lock()
        .map_err(|_| "test key store lock poisoned".to_string())?
        .insert(
            keyring_account(path),
            passphrase.expose_secret().to_string(),
        );
    Ok(())
}

#[cfg(not(test))]
pub fn clear(path: &str) -> Result<(), String> {
    match keyring_entry(path)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("SSH key credential delete failed: {error}")),
    }
}

#[cfg(test)]
pub fn clear(path: &str) -> Result<(), String> {
    test_store()
        .lock()
        .map_err(|_| "test key store lock poisoned".to_string())?
        .remove(&keyring_account(path));
    Ok(())
}

#[cfg(test)]
fn test_store() -> &'static std::sync::Mutex<std::collections::HashMap<String, String>> {
    static STORE: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, String>>> =
        std::sync::OnceLock::new();
    STORE.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

#[cfg(test)]
mod tests {
    use super::{clear, keyring_account, load, normalized_key_path, save};
    use secrecy::{ExposeSecret, SecretString};

    #[test]
    fn account_does_not_expose_the_key_path() {
        let account = keyring_account("/home/alice/.ssh/id_ed25519");

        assert!(account.starts_with("key:"));
        assert!(!account.contains("alice"));
        assert!(!account.contains("id_ed25519"));
    }

    #[test]
    fn saves_loads_and_clears_passphrases() {
        let path = "/tmp/zync-key-cache-test";
        let passphrase = SecretString::from("correct horse".to_string());

        save(path, &passphrase).expect("save passphrase");
        let loaded = load(path).expect("load passphrase").expect("stored value");
        assert_eq!(loaded.expose_secret(), "correct horse");

        clear(path).expect("clear passphrase");
        assert!(load(path).expect("load after clear").is_none());
    }

    #[test]
    fn account_is_stable_for_missing_relative_paths() {
        let base = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
        let expected = base.join("missing-key").to_string_lossy().to_string();
        #[cfg(windows)]
        let expected = expected.to_lowercase();

        assert_eq!(
            normalized_key_path(" ./missing-key "),
            normalized_key_path("missing-key")
        );
        assert_eq!(normalized_key_path("missing-key/../missing-key"), expected);
    }
}
