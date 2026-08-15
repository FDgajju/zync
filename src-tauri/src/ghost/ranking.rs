use crate::ghost::context::{cwd_context_bonus, recent_session_bonus, RankingContext};
use crate::ghost::parser::history_suffix_for_command;
use crate::ghost::token::history_entry_safe_to_store;
use crate::ghost::types::ScopeHistory;

fn command_name(prefix: &str) -> &str {
    prefix.split_whitespace().next().unwrap_or("")
}

fn has_shell_separator(s: &str) -> bool {
    s.contains(';') || s.contains('|') || s.contains('&') || s.contains('\n') || s.contains('\r')
}

fn suffix_bonus_for_command(prefix: &str, suffix: &str) -> i32 {
    let mut bonus = 0;
    let cmd = command_name(prefix).to_ascii_lowercase();
    let suffix_trimmed = suffix.trim_start();
    let has_space = suffix_trimmed.contains(' ');

    match cmd.as_str() {
        "cd" | "pushd" => {
            if suffix_trimmed.starts_with('/')
                || suffix_trimmed.starts_with("~/")
                || suffix_trimmed.starts_with("./")
                || suffix_trimmed.starts_with("../")
            {
                bonus += 3;
            }
            // Prefer single path token completions over chained command tails.
            if !has_space {
                bonus += 3;
            } else {
                bonus -= 2;
            }
        }
        "ssh" | "scp" | "sftp" | "rsync" => {
            if suffix_trimmed.contains('@') {
                bonus += 2;
            }
            if suffix_trimmed.contains('.')
                || suffix_trimmed.contains('-')
                || suffix_trimmed.contains(':')
            {
                bonus += 1;
            }
            if !has_space {
                bonus += 1;
            } else {
                bonus -= 2;
            }
        }
        _ => {}
    }

    if has_shell_separator(suffix) {
        bonus -= 3;
    }

    bonus
}

/// True when the suffix continues the current token (e.g. `ls` + `blk` → `lsblk`)
/// rather than starting a new word (`ls` + ` blk` / `ssh` + ` 172…`).
fn is_mid_token_suffix(prefix: &str, suffix: &str) -> bool {
    if prefix.ends_with(' ') || prefix.ends_with('\t') {
        return false;
    }
    if suffix.is_empty() {
        return false;
    }
    !suffix.starts_with(' ') && !suffix.starts_with('\t')
}

/// Rank boost for mid-token (no leading-space) history suffixes so `lsblk`
/// outranks a corrupted spaced entry like `ls blk` even with higher frecency.
const MID_TOKEN_RANK_BONUS: f64 = 50.0;

/// Frecency + structural preference. Mid-token command continuations outrank
/// spaced new-word suffixes so a real `lsblk` history beat beats a corrupted
/// `ls blk` entry that may have been accepted from a buggy ghost.
fn effective_rank_score(frecency: f64, bonus: i32, mid_token: bool) -> f64 {
    let mid = if mid_token { MID_TOKEN_RANK_BONUS } else { 0.0 };
    frecency + mid + f64::from(bonus)
}

/// Return the best inline suffix for a prefix match, ranked by:
///   1. effective score (frecency + mid-token preference + command bonus)
///   2. shorter suffix length
///   3. recency order in history (stable fallback)
pub fn best_suffix_for_prefix(
    scope: &ScopeHistory,
    prefix: &str,
    case_insensitive: bool,
    context: RankingContext<'_>,
) -> Option<String> {
    let mut best_suffix: Option<String> = None;
    let mut best_effective = f64::NEG_INFINITY;
    let mut best_suffix_len = usize::MAX;
    let mut best_idx = usize::MAX;

    for (idx, cmd) in scope.history.iter().enumerate() {
        if !history_entry_safe_to_store(cmd) {
            continue;
        }
        let Some(suffix) = history_suffix_for_command(cmd, prefix, case_insensitive) else {
            continue;
        };

        let score = scope.scores.get(cmd).map(|e| e.live_score()).unwrap_or(0.0);
        let suffix_len = suffix.chars().count();
        let bonus = suffix_bonus_for_command(prefix, &suffix)
            + cwd_context_bonus(prefix, cmd, context.cwd)
            + recent_session_bonus(cmd, context.recent_commands);
        let mid_token = is_mid_token_suffix(prefix, &suffix);
        let effective = effective_rank_score(score, bonus, mid_token);

        if effective > best_effective
            || (effective == best_effective && suffix_len < best_suffix_len)
            || (effective == best_effective && suffix_len == best_suffix_len && idx < best_idx)
        {
            best_suffix = Some(suffix);
            best_effective = effective;
            best_suffix_len = suffix_len;
            best_idx = idx;
        }
    }

    best_suffix
}

pub fn ranked_candidates_for_prefix(
    scope: &ScopeHistory,
    prefix: &str,
    case_insensitive: bool,
    limit: usize,
    context: RankingContext<'_>,
) -> Vec<String> {
    if limit == 0 {
        return Vec::new();
    }
    let mut candidates: Vec<(String, f64, usize, usize)> = Vec::new();

    for (idx, cmd) in scope.history.iter().enumerate() {
        if !history_entry_safe_to_store(cmd) {
            continue;
        }
        let Some(suffix) = history_suffix_for_command(cmd, prefix, case_insensitive) else {
            continue;
        };

        let score = scope.scores.get(cmd).map(|e| e.live_score()).unwrap_or(0.0);
        let suffix_len = suffix.chars().count();
        let bonus = suffix_bonus_for_command(prefix, &suffix)
            + cwd_context_bonus(prefix, cmd, context.cwd)
            + recent_session_bonus(cmd, context.recent_commands);
        let mid_token = is_mid_token_suffix(prefix, &suffix);
        let effective = effective_rank_score(score, bonus, mid_token);
        candidates.push((suffix, effective, suffix_len, idx));
    }

    candidates.sort_by(|a, b| {
        // effective score desc, suffix_len asc, recency asc(index)
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.2.cmp(&b.2))
            .then_with(|| a.3.cmp(&b.3))
    });

    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut seen_ci = std::collections::HashSet::new();
    for (suffix, _, _, _) in candidates {
        let suffix_ci = suffix.to_ascii_lowercase();
        if seen.insert(suffix.clone()) && seen_ci.insert(suffix_ci) {
            out.push(suffix);
            if out.len() >= limit {
                break;
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::{best_suffix_for_prefix, ranked_candidates_for_prefix};
    use crate::ghost::context::RankingContext;
    use crate::ghost::types::ScopeHistory;

    #[test]
    fn prefers_shorter_suffix_when_scores_equal() {
        let scope = ScopeHistory {
            history: vec![
                "git checkout main".to_string(),
                "git checkout feature/very-long-branch".to_string(),
            ],
            scores: Default::default(),
        };

        let best = best_suffix_for_prefix(&scope, "git checkout ", false, RankingContext::empty())
            .expect("expected best suffix");
        assert_eq!(best, "main");
    }

    #[test]
    fn ranked_candidates_are_unique_and_stable() {
        let scope = ScopeHistory {
            history: vec![
                "git status".to_string(),
                "git stash".to_string(),
                "git status".to_string(),
            ],
            scores: Default::default(),
        };

        let out =
            ranked_candidates_for_prefix(&scope, "git st", false, 10, RankingContext::empty());
        assert_eq!(out, vec!["ash".to_string(), "atus".to_string()]);
    }

    #[test]
    fn command_bonus_prefers_pathy_cd_suffixes_without_cwd() {
        let scope = ScopeHistory {
            history: vec!["cd notes".to_string(), "cd /var/log".to_string()],
            scores: Default::default(),
        };

        let best = best_suffix_for_prefix(&scope, "cd ", false, RankingContext::empty())
            .expect("expected suffix");
        assert_eq!(best, "/var/log");
    }

    #[test]
    fn cwd_context_prefers_relative_cd_under_current_directory() {
        let scope = ScopeHistory {
            history: vec!["cd /var/log".to_string(), "cd Documents".to_string()],
            scores: Default::default(),
        };
        let ctx = RankingContext {
            cwd: Some("/home/me/projects"),
            recent_commands: &[],
        };
        let best = best_suffix_for_prefix(&scope, "cd ", false, ctx).expect("expected suffix");
        assert_eq!(best, "Documents");
    }

    #[test]
    fn command_bonus_prefers_user_host_for_ssh() {
        let scope = ScopeHistory {
            history: vec!["ssh prod".to_string(), "ssh root@prod".to_string()],
            scores: Default::default(),
        };

        let best = best_suffix_for_prefix(&scope, "ssh ", false, RankingContext::empty())
            .expect("expected suffix");
        assert_eq!(best, "root@prod");
    }

    #[test]
    fn command_bonus_penalizes_chained_cd_suffixes() {
        let scope = ScopeHistory {
            history: vec!["cd Documents && ls".to_string(), "cd Documents".to_string()],
            scores: Default::default(),
        };

        let best = best_suffix_for_prefix(&scope, "cd Doc", false, RankingContext::empty())
            .expect("expected suffix");
        assert_eq!(best, "uments");
    }

    #[test]
    fn pipeline_history_suffix_uses_active_segment_spacing() {
        let scope = ScopeHistory {
            history: vec!["echo hi && git checkout staging".to_string()],
            scores: Default::default(),
        };

        assert_eq!(
            best_suffix_for_prefix(&scope, "git", false, RankingContext::empty()),
            Some(" checkout staging".to_string())
        );
        assert_eq!(
            best_suffix_for_prefix(&scope, "git ", false, RankingContext::empty()),
            Some("checkout staging".to_string())
        );
    }

    #[test]
    fn prefers_command_name_continuation_over_spaced_arg() {
        // Real history: `lsblk`. Corrupted/accepted ghost history: `ls blk`.
        // Typing `ls` must complete to `lsblk` (suffix `blk`), not `ls blk`.
        use crate::ghost::types::FrecencyEntry;
        let mut scores = std::collections::HashMap::new();
        // Give the spaced entry much higher raw frecency — mid-token must still win.
        let mut spaced = FrecencyEntry::new_with_bump();
        spaced.bump();
        spaced.bump();
        spaced.bump();
        spaced.bump();
        scores.insert("ls blk".to_string(), spaced);
        scores.insert("lsblk".to_string(), FrecencyEntry::new_with_bump());
        let scope = ScopeHistory {
            history: vec!["ls blk".to_string(), "lsblk".to_string()],
            scores,
        };
        let best = best_suffix_for_prefix(&scope, "ls", false, RankingContext::empty())
            .expect("expected suffix");
        assert_eq!(best, "blk");
    }

    #[test]
    fn recent_session_boosts_matching_history() {
        let scope = ScopeHistory {
            history: vec!["git stash".to_string(), "git status".to_string()],
            scores: Default::default(),
        };
        let recent = vec!["git status".to_string()];
        let ctx = RankingContext {
            cwd: None,
            recent_commands: &recent,
        };
        let best = best_suffix_for_prefix(&scope, "git st", false, ctx).expect("expected suffix");
        assert_eq!(best, "atus");
    }

    #[test]
    fn ranked_candidates_dedup_case_insensitive() {
        let scope = ScopeHistory {
            history: vec!["git status".to_string(), "git Status".to_string()],
            scores: Default::default(),
        };

        let out = ranked_candidates_for_prefix(&scope, "git st", true, 10, RankingContext::empty());
        assert_eq!(out.len(), 1);
    }
}
