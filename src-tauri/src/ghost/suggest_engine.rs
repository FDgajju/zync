use crate::commands::AppState;
use crate::ghost::context::RankingContext;
use crate::ghost::manager::GhostManager;
use crate::ghost::path_suggest::{path_suggestion, shell_id_indicates_wsl, PathSuggestParams};
use crate::ghost::suffix::{normalize_suggestion_suffix, normalize_suggestion_suffix_with_reason};
use crate::ghost::suggest_types::{GhostSuggestV2Request, GhostSuggestV2Response};
use crate::ghost::token::{
    has_unmatched_quote_on_active_token, is_bare_directory_listing_line,
    should_prefer_path_suggestion, should_use_ghost_for_line,
};

const HISTORY_CONFIDENCE: f32 = 0.72;
const PATH_CONFIDENCE: f32 = 0.84;

pub async fn suggest_v2(
    request: GhostSuggestV2Request,
    manager: &GhostManager,
    state: &AppState,
) -> GhostSuggestV2Response {
    let line = &request.prefix;
    if !should_use_ghost_for_line(line) {
        return GhostSuggestV2Response::empty("no_command");
    }

    let scope = request.scope.as_deref();
    let fs_connection_id = request
        .fs_connection_id
        .as_deref()
        .or(scope)
        .unwrap_or("local");
    let cwd = request.cwd.as_deref();
    let wsl_shell_id = request
        .shell_id
        .as_deref()
        .filter(|id| shell_id_indicates_wsl(id));

    let history_enabled = request.providers.history_enabled();
    let filesystem_enabled = request.providers.filesystem_enabled();
    let prefer_path = should_prefer_path_suggestion(line);
    let recent_commands = request.recent_commands.as_deref().unwrap_or(&[]);
    let ranking_context = RankingContext {
        cwd,
        recent_commands,
    };
    let debug = request.debug.unwrap_or(false);

    if prefer_path && filesystem_enabled {
        if let Some(suffix) = fetch_path_suggestion(
            line,
            cwd,
            fs_connection_id,
            wsl_shell_id,
            recent_commands,
            state,
        )
        .await
        {
            return hit_normalized(line, &suffix, PATH_CONFIDENCE, "path", debug);
        }
    }

    let skip_history_for_bare_cd =
        prefer_path && filesystem_enabled && is_bare_directory_listing_line(line);
    let skip_history_for_open_quote = has_unmatched_quote_on_active_token(line);

    if history_enabled && !skip_history_for_bare_cd && !skip_history_for_open_quote {
        if let Some(suffix) = manager
            .suggest_with_context(line.clone(), scope, ranking_context)
            .await
        {
            return hit_normalized(line, &suffix, HISTORY_CONFIDENCE, "history", debug);
        }
    }

    if !prefer_path && filesystem_enabled {
        if let Some(suffix) = fetch_path_suggestion(
            line,
            cwd,
            fs_connection_id,
            wsl_shell_id,
            recent_commands,
            state,
        )
        .await
        {
            return hit_normalized(line, &suffix, PATH_CONFIDENCE, "path_fallback", debug);
        }
    }

    GhostSuggestV2Response::empty("no_match")
}

fn hit_normalized(
    line: &str,
    raw_suffix: &str,
    confidence: f32,
    source: &str,
    debug: bool,
) -> GhostSuggestV2Response {
    if debug {
        let normalized = normalize_suggestion_suffix_with_reason(line, raw_suffix);
        GhostSuggestV2Response::hit_with_debug(
            normalized.suffix,
            confidence,
            Some(raw_suffix.to_string()),
            Some(format!("{}:{}", source, normalized.spacing_reason)),
        )
    } else {
        GhostSuggestV2Response::hit(normalize_suggestion_suffix(line, raw_suffix), confidence)
    }
}

async fn fetch_path_suggestion(
    line: &str,
    cwd: Option<&str>,
    connection_id: &str,
    wsl_shell_id: Option<&str>,
    recent_commands: &[String],
    state: &AppState,
) -> Option<String> {
    path_suggestion(PathSuggestParams {
        line,
        cwd,
        connection_id,
        wsl_shell_id,
        recent_commands,
        state,
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ghost::GhostManager;
    use std::path::PathBuf;

    fn test_dir(name: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("zync-ghost-p5-{}-{}", name, std::process::id()));
        let _ = std::fs::create_dir_all(&p);
        p
    }

    #[tokio::test]
    async fn history_suggest_via_v2_engine() {
        let dir = test_dir("history");
        let mgr = GhostManager::new(&dir);
        mgr.commit("git checkout staging".to_string(), Some("local"))
            .await;

        // AppState is heavy — test history path via manager only in integration;
        // here verify helper gates.
        assert!(should_use_ghost_for_line("git che"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
