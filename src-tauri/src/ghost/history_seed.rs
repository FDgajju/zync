use crate::commands::AppState;
use crate::ghost::history_import::parse_shell_history;
use crate::ghost::manager::GhostManager;
use serde::{Deserialize, Serialize};

const MAX_IMPORT_COMMANDS: usize = 500;
const REMOTE_READ_TIMEOUT_SECS: u64 = 10;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhostSeedRemoteHistoryRequest {
    pub connection_id: String,
    pub scope: Option<String>,
    pub home_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhostSeedRemoteHistoryResponse {
    pub imported: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skipped_reason: Option<String>,
}

pub async fn seed_remote_shell_history(
    request: GhostSeedRemoteHistoryRequest,
    manager: &GhostManager,
    state: &AppState,
) -> GhostSeedRemoteHistoryResponse {
    let scope = request
        .scope
        .as_deref()
        .or(Some(request.connection_id.as_str()));
    if manager.is_scope_imported(scope).await {
        return GhostSeedRemoteHistoryResponse {
            imported: 0,
            skipped_reason: Some("already_imported".to_string()),
        };
    }

    if request.connection_id == "local" {
        return GhostSeedRemoteHistoryResponse {
            imported: 0,
            skipped_reason: Some("local_scope".to_string()),
        };
    }

    let paths = history_file_paths(&request.home_path);
    if paths.is_empty() {
        return GhostSeedRemoteHistoryResponse {
            imported: 0,
            skipped_reason: Some("invalid_home".to_string()),
        };
    }

    let mut merged = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for path in paths {
        let content = match read_remote_file(state, &request.connection_id, &path).await {
            Ok(content) => content,
            Err(err) => {
                eprintln!(
                    "[Ghost] history seed read failed: {}",
                    classify_history_read_error(&err)
                );
                continue;
            }
        };

        for cmd in parse_shell_history(&content) {
            if seen.insert(cmd.clone()) {
                merged.push(cmd);
            }
        }
    }

    if merged.len() > MAX_IMPORT_COMMANDS {
        let start = merged.len().saturating_sub(MAX_IMPORT_COMMANDS);
        merged = merged[start..].to_vec();
    }

    let imported = manager.seed_shell_history(scope, &merged).await;
    GhostSeedRemoteHistoryResponse {
        imported,
        skipped_reason: if imported == 0 {
            Some("no_commands".to_string())
        } else {
            None
        },
    }
}

// Note: command text is never logged; only counts and skip reasons are returned.

fn history_file_paths(home_path: &str) -> Vec<String> {
    let trimmed = home_path.trim();
    if trimmed.is_empty() || trimmed == "~" || trimmed == "/" {
        return Vec::new();
    }
    let base = trimmed.trim_end_matches('/');
    vec![
        format!("{base}/.zsh_history"),
        format!("{base}/.bash_history"),
    ]
}

fn classify_history_read_error(err: &str) -> &'static str {
    let lower = err.to_ascii_lowercase();
    if lower.contains("timed out") {
        "timeout"
    } else if lower.contains("session closed") || lower.contains("disconnected:") {
        "session_closed"
    } else if lower.contains("no such file") || lower.contains("not found") {
        "missing_file"
    } else {
        "read_error"
    }
}

async fn read_remote_file(
    state: &AppState,
    connection_id: &str,
    path: &str,
) -> Result<String, String> {
    crate::commands::read_remote_connection_file(
        state,
        connection_id,
        path,
        REMOTE_READ_TIMEOUT_SECS,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::history_file_paths;

    #[test]
    fn history_paths_use_home_directory() {
        assert_eq!(
            history_file_paths("/home/deploy"),
            vec![
                "/home/deploy/.zsh_history".to_string(),
                "/home/deploy/.bash_history".to_string(),
            ]
        );
    }

    #[test]
    fn invalid_home_paths_are_empty() {
        assert!(history_file_paths("~").is_empty());
        assert!(history_file_paths("/").is_empty());
    }
}
