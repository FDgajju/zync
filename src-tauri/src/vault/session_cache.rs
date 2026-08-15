#![cfg_attr(test, allow(dead_code))]

//! OS keychain-backed vault session cache for optional "remember on this device".
//!
//! The cached value is the vault encryption key (VEK) for a specific `vault_id`.
//! It is protected by the platform credential store and is cleared when the user
//! chooses "Forget this device" or disables remember-on-unlock.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

use super::crypto::SecretKey;
use super::error::VaultError;

type HmacSha256 = Hmac<Sha256>;

const SESSION_CACHE_VERSION_PREFIX: &str = "v2.";

const VAULT_SESSION_KEYRING_SERVICE: &str = "Zync Vault Session";

pub fn session_cache_account(vault_id: &str) -> String {
    format!("vault:{vault_id}")
}

/// Cached VEK loaded from the OS keychain.
pub struct CachedVek {
    pub vek: SecretKey,
    /// `true` when the payload included a vault-bound integrity proof (v2 format).
    pub proof_verified: bool,
}

fn session_cache_proof(vault_id: &str, vek: &SecretKey) -> Result<String, VaultError> {
    let mut mac = HmacSha256::new_from_slice(vault_id.as_bytes())
        .map_err(|error| VaultError::InvalidData(format!("session cache proof failed: {error}")))?;
    mac.update(vek.as_bytes());
    Ok(URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes()))
}

fn encode_session_payload(vault_id: &str, vek: &SecretKey) -> Result<String, VaultError> {
    let vek_encoded = URL_SAFE_NO_PAD.encode(vek.as_bytes());
    let proof = session_cache_proof(vault_id, vek)?;
    Ok(format!(
        "{SESSION_CACHE_VERSION_PREFIX}{vek_encoded}.{proof}"
    ))
}

fn decode_vek_bytes(encoded: &str) -> Result<SecretKey, VaultError> {
    let bytes = URL_SAFE_NO_PAD.decode(encoded).map_err(|error| {
        VaultError::InvalidData(format!("invalid session cache encoding: {error}"))
    })?;
    let vek_bytes: [u8; 32] = bytes
        .as_slice()
        .try_into()
        .map_err(|_| VaultError::InvalidData("session cache VEK wrong length".into()))?;
    Ok(SecretKey::from_bytes(vek_bytes))
}

fn keyring_entry(account: &str) -> Result<keyring::Entry, VaultError> {
    keyring::Entry::new(VAULT_SESSION_KEYRING_SERVICE, account)
        .map_err(|error| VaultError::InvalidData(format!("keyring entry failed: {error}")))
}

#[cfg(not(test))]
pub fn has_session_cache(vault_id: &str) -> Result<bool, VaultError> {
    let entry = keyring_entry(&session_cache_account(vault_id))?;
    match entry.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(VaultError::InvalidData(format!(
            "keyring read failed: {error}"
        ))),
    }
}

#[cfg(test)]
pub fn has_session_cache(vault_id: &str) -> Result<bool, VaultError> {
    Ok(test_key_store()
        .lock()
        .map_err(|_| VaultError::InvalidData("test key store lock poisoned".into()))?
        .contains_key(&session_cache_account(vault_id)))
}

#[cfg(not(test))]
pub fn save_session_cache(vault_id: &str, vek: &SecretKey) -> Result<(), VaultError> {
    let encoded = encode_session_payload(vault_id, vek)?;
    let entry = keyring_entry(&session_cache_account(vault_id))?;
    entry
        .set_password(&encoded)
        .map_err(|error| VaultError::InvalidData(format!("keyring write failed: {error}")))
}

#[cfg(test)]
pub fn save_session_cache(vault_id: &str, vek: &SecretKey) -> Result<(), VaultError> {
    let encoded = encode_session_payload(vault_id, vek)?;
    test_key_store()
        .lock()
        .map_err(|_| VaultError::InvalidData("test key store lock poisoned".into()))?
        .insert(session_cache_account(vault_id), encoded);
    Ok(())
}

#[cfg(not(test))]
pub fn load_session_cache(vault_id: &str) -> Result<Option<CachedVek>, VaultError> {
    let entry = keyring_entry(&session_cache_account(vault_id))?;
    let encoded = match entry.get_password() {
        Ok(value) => value,
        Err(keyring::Error::NoEntry) => return Ok(None),
        Err(error) => {
            return Err(VaultError::InvalidData(format!(
                "keyring read failed: {error}"
            )))
        }
    };
    decode_session_payload(vault_id, &encoded).map(Some)
}

#[cfg(test)]
pub fn load_session_cache(vault_id: &str) -> Result<Option<CachedVek>, VaultError> {
    let encoded = test_key_store()
        .lock()
        .map_err(|_| VaultError::InvalidData("test key store lock poisoned".into()))?
        .get(&session_cache_account(vault_id))
        .cloned();
    encoded
        .map(|value| decode_session_payload(vault_id, &value))
        .transpose()
}

#[cfg(not(test))]
pub fn clear_session_cache(vault_id: &str) -> Result<(), VaultError> {
    let entry = keyring_entry(&session_cache_account(vault_id))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(VaultError::InvalidData(format!(
            "keyring delete failed: {error}"
        ))),
    }
}

#[cfg(test)]
pub fn clear_session_cache(vault_id: &str) -> Result<(), VaultError> {
    test_key_store()
        .lock()
        .map_err(|_| VaultError::InvalidData("test key store lock poisoned".into()))?
        .remove(&session_cache_account(vault_id));
    Ok(())
}

fn decode_session_payload(vault_id: &str, encoded: &str) -> Result<CachedVek, VaultError> {
    if let Some(rest) = encoded.strip_prefix(SESSION_CACHE_VERSION_PREFIX) {
        let (vek_encoded, proof) = rest.split_once('.').ok_or_else(|| {
            VaultError::InvalidData("session cache v2 payload missing proof".into())
        })?;
        let vek = decode_vek_bytes(vek_encoded)?;
        let expected_proof = session_cache_proof(vault_id, &vek)?;
        if expected_proof != proof {
            return Err(VaultError::InvalidData(
                "session cache integrity proof mismatch".into(),
            ));
        }
        return Ok(CachedVek {
            vek,
            proof_verified: true,
        });
    }

    // Legacy v1: raw base64 VEK without vault-bound proof.
    let vek = decode_vek_bytes(encoded)?;
    Ok(CachedVek {
        vek,
        proof_verified: false,
    })
}

#[cfg(test)]
fn test_key_store() -> &'static std::sync::Mutex<std::collections::HashMap<String, String>> {
    static STORE: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, String>>> =
        std::sync::OnceLock::new();
    STORE.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_and_load_round_trip_v2_payload_with_proof() {
        let vault_id = "vault-test-1";
        let vek = SecretKey::from_bytes([7u8; 32]);
        save_session_cache(vault_id, &vek).expect("save session cache");
        let cached = load_session_cache(vault_id)
            .expect("load session cache")
            .expect("cached vek");
        assert!(cached.proof_verified);
        assert_eq!(cached.vek.as_bytes(), vek.as_bytes());
        clear_session_cache(vault_id).expect("clear session cache");
    }

    #[test]
    fn load_rejects_tampered_v2_proof() {
        let vault_id = "vault-test-2";
        let vek = SecretKey::from_bytes([9u8; 32]);
        let mut payload = encode_session_payload(vault_id, &vek).expect("encode payload");
        payload.push('x');
        test_key_store()
            .lock()
            .expect("lock test store")
            .insert(session_cache_account(vault_id), payload);
        assert!(matches!(
            load_session_cache(vault_id),
            Err(VaultError::InvalidData(_))
        ));
        clear_session_cache(vault_id).expect("clear session cache");
    }
}
