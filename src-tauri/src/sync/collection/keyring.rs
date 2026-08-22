use super::super::profiles::now_secs;
use super::super::types::{SyncCollectionManifest, SyncError, SyncResult};
use super::manifest::save_manifest;
use base64::Engine;

pub const SYNC_COLLECTION_KEY_CACHE_TTL_SECS: u64 = 12 * 60 * 60;
use std::path::Path;

#[cfg(not(test))]
const SYNC_COLLECTION_KEYRING_SERVICE: &str = "Zync Sync Collection Keys";

pub fn load_collection_key(manifest: &SyncCollectionManifest) -> SyncResult<[u8; 32]> {
    let account = collection_key_account(manifest);
    let encoded = load_collection_key_secret(&account)?;
    decode_collection_key(&encoded)
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn is_collection_key_cached(manifest: &SyncCollectionManifest) -> bool {
    let account = collection_key_account(manifest);
    load_collection_key_secret(&account).is_ok()
}

pub fn collection_key_cache_metadata_fresh(manifest: &SyncCollectionManifest) -> bool {
    let Some(anchor) = manifest.key_cache_unlocked_at else {
        return false;
    };
    let ttl = manifest
        .key_cache_ttl_secs
        .unwrap_or(SYNC_COLLECTION_KEY_CACHE_TTL_SECS);
    now_secs().saturating_sub(anchor) < ttl
}

pub fn clear_collection_key_cache(manifest: &SyncCollectionManifest) -> SyncResult<()> {
    let account = collection_key_account(manifest);
    delete_collection_key_secret(&account)
}

pub fn enforce_collection_key_cache_ttl(
    data_dir: &Path,
    manifest: &mut SyncCollectionManifest,
) -> SyncResult<bool> {
    // No unlock anchor means nothing to expire — avoid clear+save churn.
    if manifest.key_cache_unlocked_at.is_none() {
        return Ok(false);
    }
    if collection_key_cache_metadata_fresh(manifest) {
        return Ok(false);
    }

    let now = now_secs();
    clear_collection_key_cache(manifest)?;
    manifest.key_cache_unlocked_at = None;
    manifest.updated_at = now;
    save_manifest(data_dir, manifest)?;
    Ok(true)
}

pub(super) fn persist_collection_key(
    manifest: &SyncCollectionManifest,
    key: &[u8; 32],
) -> SyncResult<()> {
    let account = collection_key_account(manifest);
    let encoded = base64::engine::general_purpose::STANDARD.encode(key);
    save_collection_key_secret(&account, &encoded)?;
    Ok(())
}

pub(super) fn persist_collection_key_and_manifest(
    data_dir: &Path,
    manifest: &SyncCollectionManifest,
    key: &[u8; 32],
) -> SyncResult<()> {
    let account = collection_key_account(manifest);
    let previous_secret = load_optional_collection_key_secret(&account)?;
    persist_collection_key(manifest, key)?;
    if let Err(error) = save_manifest(data_dir, manifest) {
        let rollback_result = match previous_secret {
            Some(secret) => save_collection_key_secret(&account, &secret),
            None => delete_collection_key_secret(&account),
        };
        if let Err(rollback_error) = rollback_result {
            return Err(SyncError::new(
                "sync_collection_keyring_rollback_failed",
                format!(
                    "{}; additionally failed to restore the previous cached sync key: {}",
                    error.message, rollback_error.message
                ),
            ));
        }
        return Err(error);
    }
    Ok(())
}

pub(super) fn decode_collection_key(encoded: &str) -> SyncResult<[u8; 32]> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| {
            SyncError::new(
                "sync_collection_key_decode_failed",
                format!("Failed to decode sync collection key: {e}"),
            )
        })?;
    let key: [u8; 32] = bytes
        .as_slice()
        .try_into()
        .map_err(|_| SyncError::new("sync_collection_key_decode_failed", "Invalid key size"))?;
    Ok(key)
}

pub(super) fn collection_key_account(manifest: &SyncCollectionManifest) -> String {
    format!(
        "{}:{}",
        manifest.provider.to_ascii_lowercase(),
        manifest.sync_collection_id
    )
}

#[cfg(not(test))]
pub(super) fn load_collection_key_secret(account: &str) -> SyncResult<String> {
    let entry = keyring::Entry::new(SYNC_COLLECTION_KEYRING_SERVICE, account)
        .map_err(|e| SyncError::new("sync_collection_keyring_failed", e.to_string()))?;
    entry
        .get_password()
        .map_err(|e| SyncError::new("sync_collection_keyring_failed", e.to_string()))
}

#[cfg(not(test))]
fn load_optional_collection_key_secret(account: &str) -> SyncResult<Option<String>> {
    let entry = keyring::Entry::new(SYNC_COLLECTION_KEYRING_SERVICE, account)
        .map_err(|e| SyncError::new("sync_collection_keyring_failed", e.to_string()))?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(SyncError::new(
            "sync_collection_keyring_failed",
            error.to_string(),
        )),
    }
}

#[cfg(not(test))]
fn save_collection_key_secret(account: &str, value: &str) -> SyncResult<()> {
    let entry = keyring::Entry::new(SYNC_COLLECTION_KEYRING_SERVICE, account)
        .map_err(|e| SyncError::new("sync_collection_keyring_failed", e.to_string()))?;
    entry
        .set_password(value)
        .map_err(|e| SyncError::new("sync_collection_keyring_failed", e.to_string()))
}

#[cfg(not(test))]
fn delete_collection_key_secret(account: &str) -> SyncResult<()> {
    let entry = keyring::Entry::new(SYNC_COLLECTION_KEYRING_SERVICE, account)
        .map_err(|e| SyncError::new("sync_collection_keyring_failed", e.to_string()))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(SyncError::new(
            "sync_collection_keyring_failed",
            error.to_string(),
        )),
    }
}

#[cfg(test)]
pub(super) fn load_collection_key_secret(account: &str) -> SyncResult<String> {
    let store = key_store();
    let lock = store.lock().map_err(|_| {
        SyncError::new(
            "sync_collection_keyring_failed",
            "test key store lock poisoned",
        )
    })?;
    lock.get(account)
        .cloned()
        .ok_or_else(|| SyncError::new("sync_collection_keyring_failed", "key not found"))
}

#[cfg(test)]
fn load_optional_collection_key_secret(account: &str) -> SyncResult<Option<String>> {
    let store = key_store();
    let lock = store.lock().map_err(|_| {
        SyncError::new(
            "sync_collection_keyring_failed",
            "test key store lock poisoned",
        )
    })?;
    Ok(lock.get(account).cloned())
}

#[cfg(test)]
pub(super) fn save_collection_key_secret(account: &str, value: &str) -> SyncResult<()> {
    let store = key_store();
    let mut lock = store.lock().map_err(|_| {
        SyncError::new(
            "sync_collection_keyring_failed",
            "test key store lock poisoned",
        )
    })?;
    lock.insert(account.to_string(), value.to_string());
    Ok(())
}

#[cfg(test)]
fn delete_collection_key_secret(account: &str) -> SyncResult<()> {
    let store = key_store();
    let mut lock = store.lock().map_err(|_| {
        SyncError::new(
            "sync_collection_keyring_failed",
            "test key store lock poisoned",
        )
    })?;
    lock.remove(account);
    Ok(())
}

#[cfg(test)]
pub(super) fn key_store() -> &'static std::sync::Mutex<std::collections::HashMap<String, String>> {
    static STORE: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, String>>> =
        std::sync::OnceLock::new();
    STORE.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}
