use std::collections::BTreeMap;

use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::ai::AiConfig;
use crate::commands::read_effective_settings;
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
    let mut changed = false;
    let legacy = store
        .entries()
        .into_iter()
        .filter_map(|(key, value)| {
            value
                .as_str()
                .filter(|value| !value.is_empty())
                .map(|value| (key.clone(), value.to_string()))
        })
        .collect::<Vec<_>>();
    for (key, value) in legacy {
        if get_api_key(vault, &key)
            .map_err(|error| error.to_string())?
            .is_none()
        {
            save_api_key(vault, &key, &value).map_err(|error| error.to_string())?;
        }
        store.delete(&key);
        changed = true;
    }
    if changed {
        store.save().map_err(|error| error.to_string())?;
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
