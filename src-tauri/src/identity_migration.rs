use std::collections::HashSet;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

const LEGACY_APP_IDENTIFIERS: &[&str] = &["zync", "com.zync.desktop"];
const IDENTITY_MIGRATION_MARKER: &str = ".zync-identity-migration-v1.json";

pub(crate) fn migrate_default_dirs(
    app: &AppHandle,
    default_data_dir: &Path,
    has_custom_data_path: bool,
) {
    if !has_custom_data_path {
        migrate_default_dir(
            "data",
            default_data_dir,
            legacy_app_data_dir_candidates(Some(default_data_dir)),
        );
    }

    if let Ok(default_config_dir) = app.path().app_config_dir() {
        migrate_default_dir(
            "config",
            &default_config_dir,
            legacy_app_config_dir_candidates(Some(default_config_dir.as_path())),
        );
    }
}

pub(crate) fn legacy_app_data_dir_candidates(default_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(root) = dirs::data_dir() {
        push_legacy_identifier_dirs(&mut candidates, &root);
    }
    dedupe_and_exclude(candidates, default_dir)
}

pub(crate) fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for path in paths {
        let key = normalize_path_key(&path);
        if seen.insert(key) {
            deduped.push(path);
        }
    }
    deduped
}

fn migrate_default_dir(kind: &str, target: &Path, candidates: Vec<PathBuf>) {
    if !is_dir_effectively_empty(target) {
        return;
    }

    let Some(source) = candidates
        .into_iter()
        .find(|candidate| is_migration_source(candidate, target))
    else {
        return;
    };

    let staging = staging_dir_for(target);
    let _ = std::fs::remove_dir_all(&staging);

    if let Err(error) = copy_dir_contents(&source, &staging)
        .and_then(|_| write_identity_migration_marker(&staging, kind, &source))
        .and_then(|_| install_staged_dir(&staging, target))
    {
        let _ = std::fs::remove_dir_all(&staging);
        eprintln!(
            "[IdentityMigration] Failed to migrate {kind} directory from {:?} to {:?}: {}",
            source, target, error
        );
        return;
    }

    eprintln!(
        "[IdentityMigration] Migrated {kind} directory from {:?} to {:?}.",
        source, target
    );
}

fn legacy_app_config_dir_candidates(default_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(root) = dirs::config_dir() {
        push_legacy_identifier_dirs(&mut candidates, &root);
    }
    if let Some(root) = dirs::data_dir() {
        push_legacy_identifier_dirs(&mut candidates, &root);
    }
    dedupe_and_exclude(candidates, default_dir)
}

fn push_legacy_identifier_dirs(candidates: &mut Vec<PathBuf>, root: &Path) {
    for identifier in LEGACY_APP_IDENTIFIERS {
        candidates.push(root.join(identifier));
    }
}

fn dedupe_and_exclude(paths: Vec<PathBuf>, excluded: Option<&Path>) -> Vec<PathBuf> {
    let excluded_key = excluded.map(normalize_path_key);
    dedupe_paths(paths)
        .into_iter()
        .filter(|path| Some(normalize_path_key(path)) != excluded_key)
        .collect()
}

fn normalize_path_key(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    #[cfg(windows)]
    {
        normalized.to_ascii_lowercase()
    }
    #[cfg(not(windows))]
    {
        normalized
    }
}

fn is_dir_effectively_empty(path: &Path) -> bool {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => return false,
        Ok(_) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => return true,
        Err(_) => return false,
    }

    match std::fs::read_dir(path) {
        Ok(mut entries) => entries.next().is_none(),
        Err(error) if error.kind() == ErrorKind::NotFound => true,
        Err(_) => false,
    }
}

fn is_migration_source(source: &Path, target: &Path) -> bool {
    let Ok(metadata) = std::fs::symlink_metadata(source) else {
        return false;
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() || is_dir_effectively_empty(source) {
        return false;
    }
    if let Ok(target_metadata) = std::fs::symlink_metadata(target) {
        if target_metadata.file_type().is_symlink() {
            return false;
        }
    }
    if normalize_path_key(source) == normalize_path_key(target) {
        return false;
    }
    match (source.canonicalize(), target.canonicalize()) {
        (Ok(source), Ok(target)) => source != target,
        _ => true,
    }
}

fn copy_dir_contents(source: &Path, target: &Path) -> Result<(), String> {
    std::fs::create_dir_all(target).map_err(|error| error.to_string())?;
    for entry in std::fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        copy_path_recursive(&source_path, &target_path)?;
    }
    Ok(())
}

fn staging_dir_for(target: &Path) -> PathBuf {
    let suffix = uuid::Uuid::new_v4();
    let name = target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("zync-identity-target");
    target.with_file_name(format!("{name}.migration-{suffix}"))
}

fn install_staged_dir(staging: &Path, target: &Path) -> Result<(), String> {
    if !is_dir_effectively_empty(target) {
        return Err("target directory changed during identity migration".to_string());
    }

    if !target.exists() {
        return std::fs::rename(staging, target).map_err(|error| error.to_string());
    }

    let backup = staging_dir_for(target);
    std::fs::rename(target, &backup).map_err(|error| error.to_string())?;
    match std::fs::rename(staging, target) {
        Ok(()) => {
            let _ = std::fs::remove_dir_all(&backup);
            Ok(())
        }
        Err(error) => {
            let restore_result = std::fs::rename(&backup, target);
            if let Err(restore_error) = restore_result {
                return Err(format!(
                    "{}; additionally failed to restore empty target directory: {}",
                    error, restore_error
                ));
            }
            Err(error.to_string())
        }
    }
}

fn copy_path_recursive(source: &Path, target: &Path) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(source).map_err(|error| error.to_string())?;
    if metadata.is_dir() {
        std::fs::create_dir_all(target).map_err(|error| error.to_string())?;
        for entry in std::fs::read_dir(source).map_err(|error| error.to_string())? {
            let entry = entry.map_err(|error| error.to_string())?;
            copy_path_recursive(&entry.path(), &target.join(entry.file_name()))?;
        }
        return Ok(());
    }

    if metadata.file_type().is_symlink() {
        return Ok(());
    }
    if !metadata.is_file() {
        return Ok(());
    }

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    std::fs::copy(source, target)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn write_identity_migration_marker(
    target: &Path,
    kind: &str,
    migrated_from: &Path,
) -> Result<(), String> {
    let marker = serde_json::json!({
        "version": 1,
        "kind": kind,
        "migratedFrom": migrated_from.to_string_lossy(),
        "migratedAtMs": now_millis(),
    });
    let marker_path = target.join(IDENTITY_MIGRATION_MARKER);
    let json = serde_json::to_vec_pretty(&marker).map_err(|error| error.to_string())?;
    crate::atomic_io::durable_replace(&marker_path, &json).map_err(|error| error.to_string())
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::{
        copy_dir_contents, is_dir_effectively_empty, migrate_default_dir, IDENTITY_MIGRATION_MARKER,
    };
    use std::path::Path;

    #[cfg(unix)]
    fn symlink_dir(source: &Path, link: &Path) -> std::io::Result<()> {
        std::os::unix::fs::symlink(source, link)
    }

    #[cfg(windows)]
    fn symlink_dir(source: &Path, link: &Path) -> std::io::Result<()> {
        std::os::windows::fs::symlink_dir(source, link)
    }

    #[test]
    fn copies_legacy_dir_without_deleting_source() {
        let root = std::env::temp_dir().join(format!(
            "zync-identity-migration-copy-{}",
            uuid::Uuid::new_v4()
        ));
        let source = root.join("zync");
        let target = root.join("in.thesudoer.zync");
        std::fs::create_dir_all(source.join("keys")).expect("create legacy directory");
        std::fs::write(source.join("connections.json"), "{}").expect("write connection data");
        std::fs::write(source.join("keys").join("id_ed25519"), "secret").expect("write key");

        migrate_default_dir("data", &target, vec![source.clone()]);

        assert!(source.join("connections.json").exists());
        assert_eq!(
            std::fs::read_to_string(target.join("connections.json")).expect("read copied data"),
            "{}"
        );
        assert_eq!(
            std::fs::read_to_string(target.join("keys").join("id_ed25519"))
                .expect("read copied key"),
            "secret"
        );
        assert!(target.join(IDENTITY_MIGRATION_MARKER).exists());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn does_not_copy_over_existing_target_data() {
        let root = std::env::temp_dir().join(format!(
            "zync-identity-migration-skip-{}",
            uuid::Uuid::new_v4()
        ));
        let source = root.join("zync");
        let target = root.join("in.thesudoer.zync");
        std::fs::create_dir_all(&source).expect("create legacy directory");
        std::fs::create_dir_all(&target).expect("create target directory");
        std::fs::write(source.join("connections.json"), "legacy").expect("write legacy data");
        std::fs::write(target.join("connections.json"), "new").expect("write target data");

        migrate_default_dir("data", &target, vec![source]);

        assert_eq!(
            std::fs::read_to_string(target.join("connections.json")).expect("read target data"),
            "new"
        );
        assert!(!target.join(IDENTITY_MIGRATION_MARKER).exists());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn helpers_treat_missing_dir_as_empty_and_skip_symlinks() {
        let root = std::env::temp_dir().join(format!(
            "zync-identity-migration-helper-{}",
            uuid::Uuid::new_v4()
        ));
        let source = root.join("source");
        let target = root.join("target");
        assert!(is_dir_effectively_empty(&target));
        std::fs::create_dir_all(&source).expect("create source");
        std::fs::write(source.join("data.json"), "data").expect("write source data");
        let external = root.join("external");
        std::fs::create_dir_all(&external).expect("create external");
        std::fs::write(external.join("outside.json"), "outside").expect("write external data");
        let link = source.join("linked-external");
        let symlink_created = symlink_dir(&external, &link).is_ok();

        copy_dir_contents(&source, &target).expect("copy source");
        assert_eq!(
            std::fs::read_to_string(target.join("data.json")).expect("read copied data"),
            "data"
        );
        if symlink_created {
            assert!(!target.join("linked-external").exists());
            assert!(!target.join("linked-external").join("outside.json").exists());
        }

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn migration_rejects_symlinked_source_and_target_roots() {
        let root = std::env::temp_dir().join(format!(
            "zync-identity-migration-symlink-root-{}",
            uuid::Uuid::new_v4()
        ));
        let real_source = root.join("real-source");
        let source_link = root.join("source-link");
        let target = root.join("target");
        std::fs::create_dir_all(&real_source).expect("create real source");
        std::fs::write(real_source.join("connections.json"), "legacy").expect("write source data");

        if symlink_dir(&real_source, &source_link).is_ok() {
            migrate_default_dir("data", &target, vec![source_link]);
            assert!(!target.exists());
        }

        let target_real = root.join("target-real");
        let target_link = root.join("target-link");
        std::fs::create_dir_all(&target_real).expect("create real target");
        if symlink_dir(&target_real, &target_link).is_ok() {
            migrate_default_dir("data", &target_link, vec![real_source]);
            assert!(!target_real.join("connections.json").exists());
            assert!(!target_real.join(IDENTITY_MIGRATION_MARKER).exists());
        }

        let _ = std::fs::remove_dir_all(root);
    }
}
