use std::collections::BTreeMap;

use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::ai::AiConfig;
use crate::commands::{
    persist_settings_after_secret_migration, read_effective_settings,
    scrub_settings_backup_after_secret_migration,
};
use crate::vault::credential::primary_secret_value;
use crate::vault::error::VaultError;
use crate::vault::store::VaultService;

pub(crate) const PROVIDERS: [&str; 5] = ["gemini", "openai", "claude", "groq", "mistral"];
const API_KEY_LOGICAL_ID_PREFIX: &str = "zync.ai.api-key.";

pub(crate) fn api_key_logical_id(provider: &str) -> String {
    format!("{API_KEY_LOGICAL_ID_PREFIX}{provider}")
}

pub(crate) fn is_local_only_credential_logical_id(logical_id: &str) -> bool {
    logical_id.starts_with(API_KEY_LOGICAL_ID_PREFIX)
}

fn api_key_label(provider: &str) -> String {
    if PROVIDERS.contains(&provider) {
        format!("{} API key", provider.to_ascii_uppercase())
    } else {
        format!("{provider} secret")
    }
}

pub(crate) fn get_api_key(
    vault: &VaultService,
    provider: &str,
) -> Result<Option<String>, VaultError> {
    match vault.item_get_by_logical_id(&api_key_logical_id(provider)) {
        Ok(record) => Ok(primary_secret_value(&record).map(str::to_string)),
        Err(VaultError::RecordNotFound(_)) => Ok(None),
        Err(error) => Err(error),
    }
}

pub(crate) fn save_api_key(
    vault: &VaultService,
    provider: &str,
    value: &str,
) -> Result<(), VaultError> {
    let values = BTreeMap::from([("token".to_string(), value.to_string())]);
    match vault.item_get_by_logical_id(&api_key_logical_id(provider)) {
        Ok(record) => {
            vault.item_update_with_secret_values(
                &record.id,
                &api_key_label(provider),
                "api-token",
                &values,
                None,
                None,
            )?;
        }
        Err(VaultError::RecordNotFound(_)) => {
            vault.item_create_with_secret_values(
                &api_key_label(provider),
                "api-token",
                &values,
                None,
                Some(&api_key_logical_id(provider)),
            )?;
        }
        Err(error) => return Err(error),
    }
    Ok(())
}

pub(crate) fn delete_api_key(vault: &VaultService, provider: &str) -> Result<(), VaultError> {
    match vault.item_get_by_logical_id(&api_key_logical_id(provider)) {
        Ok(record) => vault.item_delete(&record.id),
        Err(VaultError::RecordNotFound(_)) => Ok(()),
        Err(error) => Err(error),
    }
}

pub(crate) fn migrate_legacy_api_keys(app: &AppHandle, vault: &VaultService) -> Result<(), String> {
    let store = app
        .store("secrets.json")
        .map_err(|error| error.to_string())?;
    let store_keys = known_api_key_values(store.entries());
    let mut settings = read_effective_settings(app)?;
    let settings_keys = settings_api_key_values(&settings);

    migrate_legacy_api_key_values(vault, &store_keys, &settings_keys)
        .map_err(|error| error.to_string())?;

    let mut store_changed = false;
    for provider in PROVIDERS {
        if store.get(provider).is_some() {
            store.delete(provider);
            store_changed = true;
        }
    }
    if store_changed {
        store.save().map_err(|error| error.to_string())?;
    }
    if scrub_settings_api_keys(&mut settings) {
        persist_settings_after_secret_migration(app, &settings)?;
    }
    scrub_settings_backup_after_secret_migration(app, &PROVIDERS)?;
    Ok(())
}

fn known_api_key_values(
    entries: impl IntoIterator<Item = (String, serde_json::Value)>,
) -> BTreeMap<String, String> {
    entries
        .into_iter()
        .filter(|(key, _)| PROVIDERS.contains(&key.as_str()))
        .filter_map(|(key, value)| {
            value
                .as_str()
                .filter(|value| !value.is_empty())
                .map(|value| (key, value.to_string()))
        })
        .collect()
}

fn settings_api_key_values(settings: &serde_json::Value) -> BTreeMap<String, String> {
    settings
        .get("ai")
        .and_then(|ai| ai.get("keys"))
        .and_then(serde_json::Value::as_object)
        .map(|keys| known_api_key_values(keys.clone()))
        .unwrap_or_default()
}

fn scrub_settings_api_keys(settings: &mut serde_json::Value) -> bool {
    let Some(keys) = settings
        .get_mut("ai")
        .and_then(|ai| ai.get_mut("keys"))
        .and_then(serde_json::Value::as_object_mut)
    else {
        return false;
    };
    let mut changed = false;
    for provider in PROVIDERS {
        changed |= keys.remove(provider).is_some();
    }
    changed
}

fn migrate_legacy_api_key_values(
    vault: &VaultService,
    store_keys: &BTreeMap<String, String>,
    settings_keys: &BTreeMap<String, String>,
) -> Result<(), VaultError> {
    for provider in PROVIDERS {
        if get_api_key(vault, provider)?.is_none() {
            if let Some(value) = store_keys
                .get(provider)
                .or_else(|| settings_keys.get(provider))
            {
                save_api_key(vault, provider, value)?;
            }
        }
    }
    Ok(())
}

fn merge_secret_keys(vault: &VaultService, mut config: AiConfig) -> AiConfig {
    // Never trust settings.json as a secret source; keys only come from the vault.
    let mut merged_keys = std::collections::HashMap::new();
    config.keys = None;
    for provider in PROVIDERS {
        if let Ok(Some(value)) = get_api_key(vault, provider) {
            merged_keys.insert(provider.to_string(), value);
        }
    }
    config.keys = if merged_keys.is_empty() {
        None
    } else {
        Some(merged_keys)
    };
    config
}

fn default_ai_config() -> AiConfig {
    AiConfig::default()
}

pub fn read_ai_config(app: &AppHandle, vault: &VaultService) -> AiConfig {
    match read_effective_settings(app) {
        Ok(settings) => {
            if let Some(ai) = settings.get("ai") {
                match serde_json::from_value::<AiConfig>(ai.clone()) {
                    Ok(config) => return merge_secret_keys(vault, config),
                    Err(e) => {
                        // Soft-parse: fill missing fields from defaults instead of
                        // throwing away a valid provider selection (e.g. mistral without `enabled`).
                        #[cfg(debug_assertions)]
                        eprintln!(
                            "[zync/ai] Partial AI config parse failed ({e}); merging with defaults"
                        );
                        let defaults = serde_json::to_value(AiConfig::default())
                            .unwrap_or_else(|_| serde_json::json!({}));
                        // Only apply non-null overlay fields so explicit JSON null
                        // cannot wipe valid defaults (e.g. "enabled": null).
                        let merged = match (defaults, ai.clone()) {
                            (
                                serde_json::Value::Object(mut base),
                                serde_json::Value::Object(overlay),
                            ) => {
                                for (k, v) in overlay {
                                    if !v.is_null() {
                                        base.insert(k, v);
                                    }
                                }
                                serde_json::Value::Object(base)
                            }
                            (_, overlay) => overlay,
                        };
                        if let Ok(config) = serde_json::from_value::<AiConfig>(merged) {
                            return merge_secret_keys(vault, config);
                        }
                        #[cfg(debug_assertions)]
                        eprintln!(
                            "[zync/ai] Failed to recover AI config after merge with defaults"
                        );
                    }
                }
            } else {
                #[cfg(debug_assertions)]
                eprintln!("[zync/ai] effective settings has no 'ai' key, using defaults");
            }
        }
        #[cfg(debug_assertions)]
        Err(e) => eprintln!("[zync/ai] Failed to read effective settings: {e}"),
        #[cfg(not(debug_assertions))]
        Err(_) => {}
    }

    merge_secret_keys(vault, default_ai_config())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_keys_are_encrypted_in_the_vault_file() {
        let dir = std::env::temp_dir().join(format!("zync-ai-key-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("create test directory");
        let mut vault = VaultService::new(dir.clone());
        vault
            .initialize("test-passphrase", false)
            .expect("initialize vault");

        let secret = "sk-plaintext-must-not-appear";
        save_api_key(&vault, "openai", secret).expect("save api key");
        assert_eq!(
            get_api_key(&vault, "openai").unwrap().as_deref(),
            Some(secret)
        );
        drop(vault);
        let bytes = std::fs::read(dir.join("vault.redb")).expect("read vault file");
        assert!(!bytes
            .windows(secret.len())
            .any(|window| window == secret.as_bytes()));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn api_token_create_rotate_reopen_and_delete_preserves_identity_without_plaintext() {
        let dir =
            std::env::temp_dir().join(format!("zync-ai-key-lifecycle-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("create test directory");
        let passphrase = "test-passphrase";
        let first = "sk-first-plaintext-must-not-appear";
        let second = "sk-second-plaintext-must-not-appear";
        let logical_id = api_key_logical_id("openai");

        let mut vault = VaultService::new(dir.clone());
        vault
            .initialize(passphrase, false)
            .expect("initialize vault");
        save_api_key(&vault, "openai", first).expect("create API token");
        let original = vault
            .item_get_by_logical_id(&logical_id)
            .expect("load original token");

        save_api_key(&vault, "openai", second).expect("rotate API token");
        let rotated = vault
            .item_get_by_logical_id(&logical_id)
            .expect("load rotated token");
        assert_eq!(rotated.id, original.id);
        assert_eq!(rotated.logical_id.as_deref(), Some(logical_id.as_str()));
        assert_eq!(rotated.kind, "api-token");
        assert_eq!(
            rotated.secret_values.get("token").map(String::as_str),
            Some(second)
        );
        assert_eq!(rotated.revision, 2);
        assert_eq!(
            vault
                .item_revision_history(&rotated.id)
                .expect("load rotation history")
                .len(),
            1
        );
        drop(vault);

        let bytes = std::fs::read(dir.join("vault.redb")).expect("read vault file");
        for secret in [first, second] {
            assert!(!bytes
                .windows(secret.len())
                .any(|window| window == secret.as_bytes()));
        }

        let mut reopened = VaultService::new(dir.clone());
        reopened
            .unlock(passphrase, false)
            .expect("reopen and unlock vault");
        assert_eq!(
            get_api_key(&reopened, "openai").unwrap().as_deref(),
            Some(second)
        );
        delete_api_key(&reopened, "openai").expect("delete API token");
        assert_eq!(get_api_key(&reopened, "openai").unwrap(), None);
        drop(reopened);

        let mut after_delete = VaultService::new(dir.clone());
        after_delete
            .unlock(passphrase, false)
            .expect("reopen vault after deletion");
        assert_eq!(get_api_key(&after_delete, "openai").unwrap(), None);
        drop(after_delete);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn legacy_api_key_migration_uses_vault_then_store_then_settings_and_scopes_providers() {
        let dir =
            std::env::temp_dir().join(format!("zync-ai-key-migration-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("create test directory");
        let mut vault = VaultService::new(dir.clone());
        vault
            .initialize("test-passphrase", false)
            .expect("initialize vault");
        save_api_key(&vault, "openai", "vault-wins").expect("save existing token");

        let store_keys = known_api_key_values([
            ("openai".to_string(), serde_json::json!("legacy-openai")),
            ("claude".to_string(), serde_json::json!("store-claude")),
            ("gemini".to_string(), serde_json::json!("")),
            ("groq".to_string(), serde_json::json!(42)),
            ("unknown".to_string(), serde_json::json!("do-not-migrate")),
        ]);
        let mut settings = serde_json::json!({
            "theme": "dark",
            "ai": {
                "keys": {
                    "claude": "settings-claude",
                    "gemini": "settings-gemini",
                    "unknown": "keep-unknown"
                }
            }
        });
        let settings_keys = settings_api_key_values(&settings);

        migrate_legacy_api_key_values(&vault, &store_keys, &settings_keys)
            .expect("migrate legacy entries");

        assert_eq!(
            get_api_key(&vault, "openai").unwrap().as_deref(),
            Some("vault-wins")
        );
        assert_eq!(
            get_api_key(&vault, "claude").unwrap().as_deref(),
            Some("store-claude")
        );
        assert_eq!(
            get_api_key(&vault, "gemini").unwrap().as_deref(),
            Some("settings-gemini")
        );
        assert_eq!(get_api_key(&vault, "groq").unwrap(), None);
        assert_eq!(get_api_key(&vault, "unknown").unwrap(), None);

        assert!(scrub_settings_api_keys(&mut settings));
        assert_eq!(settings["theme"], "dark");
        assert_eq!(settings["ai"]["keys"]["unknown"], "keep-unknown");
        for provider in PROVIDERS {
            assert!(settings["ai"]["keys"].get(provider).is_none());
        }

        drop(vault);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn api_keys_are_excluded_from_exported_vaults() {
        let root =
            std::env::temp_dir().join(format!("zync-ai-key-export-test-{}", uuid::Uuid::new_v4()));
        let source_dir = root.join("source");
        let export_dir = root.join("export");
        std::fs::create_dir_all(&source_dir).expect("create source directory");
        std::fs::create_dir_all(&export_dir).expect("create export directory");

        let passphrase = "test-passphrase";
        let mut vault = VaultService::new(source_dir);
        vault
            .initialize(passphrase, false)
            .expect("initialize vault");
        save_api_key(&vault, "openai", "sk-local-only").expect("save API key");
        vault
            .item_create_with_secret_values(
                "SSH password",
                "ssh-password",
                &BTreeMap::from([("password".to_string(), "export-me".to_string())]),
                None,
                Some("ssh-password-export-test"),
            )
            .expect("save exportable credential");

        vault
            .export_vault(&export_dir.join("vault.redb"))
            .expect("export vault");
        let mut exported = VaultService::new(export_dir);
        exported
            .unlock(passphrase, false)
            .expect("unlock exported vault");

        assert_eq!(get_api_key(&exported, "openai").unwrap(), None);
        assert!(exported
            .item_get_by_logical_id("ssh-password-export-test")
            .is_ok());

        drop(exported);
        drop(vault);
        let _ = std::fs::remove_dir_all(root);
    }
}
