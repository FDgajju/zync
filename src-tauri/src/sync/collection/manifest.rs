use super::super::types::{SyncCollectionManifest, SyncError, SyncProviderKind, SyncResult};
use std::path::{Path, PathBuf};

pub(super) const SYNC_COLLECTION_VERSION: u32 = 1;

fn manifest_path(data_dir: &Path, provider: SyncProviderKind) -> PathBuf {
    data_dir.join(format!("sync-collection-{}.json", provider.as_str()))
}

pub fn load_manifest(
    data_dir: &Path,
    provider: SyncProviderKind,
) -> SyncResult<Option<SyncCollectionManifest>> {
    let path = manifest_path(data_dir, provider);
    if !path.exists() {
        return Ok(None);
    }

    let raw = std::fs::read_to_string(&path).map_err(|e| {
        SyncError::new(
            "sync_collection_read_failed",
            format!("Failed to read sync collection manifest: {e}"),
        )
    })?;

    let mut manifest = serde_json::from_str::<SyncCollectionManifest>(&raw).map_err(|e| {
        SyncError::new(
            "sync_collection_parse_failed",
            format!("Failed to parse sync collection manifest: {e}"),
        )
    })?;

    if manifest.version != SYNC_COLLECTION_VERSION {
        return Err(SyncError::new(
            "sync_collection_version_unsupported",
            format!(
                "Unsupported sync collection manifest version {} (expected {}).",
                manifest.version, SYNC_COLLECTION_VERSION
            ),
        ));
    }

    if manifest.provider.is_empty() {
        manifest.provider = provider.as_str().to_string();
    }

    Ok(Some(manifest))
}

pub fn save_manifest(data_dir: &Path, manifest: &SyncCollectionManifest) -> SyncResult<()> {
    std::fs::create_dir_all(data_dir).map_err(|e| {
        SyncError::new(
            "sync_collection_write_failed",
            format!("Failed to create sync collection dir: {e}"),
        )
    })?;

    let payload = serde_json::to_string_pretty(manifest).map_err(|e| {
        SyncError::new(
            "sync_collection_write_failed",
            format!("Failed to serialize sync collection manifest: {e}"),
        )
    })?;

    let final_path = manifest_path(data_dir, provider_from_str(&manifest.provider)?);
    crate::atomic_io::durable_replace(&final_path, payload.as_bytes()).map_err(|e| {
        SyncError::new(
            "sync_collection_write_failed",
            format!("Failed to write sync collection manifest: {e}"),
        )
    })
}

pub(super) fn provider_from_str(value: &str) -> SyncResult<SyncProviderKind> {
    SyncProviderKind::parse(value).ok_or_else(|| {
        SyncError::new(
            "sync_collection_invalid_provider",
            format!("Invalid provider in sync collection manifest: {value}"),
        )
    })
}
