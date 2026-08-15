use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::commands::AppState;
use crate::fs::FileEntry;
use crate::ghost::context::recent_entry_name_bonus;
use crate::ghost::token::{
    get_command_name, get_last_arg, has_path_separator, is_directory_command,
    is_file_aware_command, line_for_suggestion_parsing, strip_leading_unmatched_quote,
};

const FS_LIST_CACHE_TTL_MS: u64 = 1200;
const INLINE_FS_TIMEOUT_MS: u64 = 160;
const REMOTE_FS_LIST_TIMEOUT_MS: u64 = 900;
const WSL_FS_LIST_TIMEOUT_MS: u64 = 1200;
const REMOTE_HOME_CACHE_TTL_MS: u64 = 60_000;

struct CachedEntries {
    at: Instant,
    entries: Vec<FileEntry>,
}

struct CachedHome {
    at: Instant,
    path: String,
}

static FS_LIST_CACHE: OnceLock<Mutex<HashMap<String, CachedEntries>>> = OnceLock::new();
static REMOTE_HOME_CACHE: OnceLock<Mutex<HashMap<String, CachedHome>>> = OnceLock::new();
static WSL_HOME_CACHE: OnceLock<Mutex<HashMap<String, CachedHome>>> = OnceLock::new();

fn fs_list_cache() -> &'static Mutex<HashMap<String, CachedEntries>> {
    FS_LIST_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn remote_home_cache() -> &'static Mutex<HashMap<String, CachedHome>> {
    REMOTE_HOME_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn wsl_home_cache() -> &'static Mutex<HashMap<String, CachedHome>> {
    WSL_HOME_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn shell_id_indicates_wsl(shell_id: &str) -> bool {
    shell_id == "wsl" || shell_id.starts_with("wsl:")
}

pub fn parse_wsl_distro(shell_id: &str) -> Option<String> {
    if shell_id == "wsl" {
        return None;
    }
    shell_id
        .strip_prefix("wsl:")
        .map(|d| d.trim().to_string())
        .filter(|d| !d.is_empty())
}

fn expand_tilde_path_for_remote(path: &str, home: &str) -> String {
    let trimmed = path.trim();
    if trimmed == "~" {
        return home.to_string();
    }
    if let Some(rest) = trimmed
        .strip_prefix("~/")
        .or_else(|| trimmed.strip_prefix("~\\"))
    {
        let rest = rest.replace('\\', "/").trim_start_matches('/').to_string();
        return if rest.is_empty() {
            home.to_string()
        } else {
            format!("{home}/{rest}")
        };
    }
    path.to_string()
}

async fn get_remote_home_dir(state: &AppState, connection_id: &str) -> Option<String> {
    {
        let cache = remote_home_cache().lock().ok()?;
        if let Some(entry) = cache.get(connection_id) {
            if entry.at.elapsed() < Duration::from_millis(REMOTE_HOME_CACHE_TTL_MS) {
                return Some(entry.path.clone());
            }
        }
    }
    let home = crate::commands::ghost_fs_cwd(state, connection_id)
        .await
        .ok()?;
    let trimmed = home.trim();
    if !trimmed.starts_with('/') {
        return None;
    }
    if let Ok(mut cache) = remote_home_cache().lock() {
        cache.insert(
            connection_id.to_string(),
            CachedHome {
                at: Instant::now(),
                path: trimmed.to_string(),
            },
        );
    }
    Some(trimmed.to_string())
}

async fn get_wsl_home_dir(shell_id: &str) -> Option<String> {
    {
        let cache = wsl_home_cache().lock().ok()?;
        if let Some(entry) = cache.get(shell_id) {
            if entry.at.elapsed() < Duration::from_millis(REMOTE_HOME_CACHE_TTL_MS) {
                return Some(entry.path.clone());
            }
        }
    }
    let distro = parse_wsl_distro(shell_id);
    let home = crate::commands::ghost_wsl_get_cwd(distro).await.ok()?;
    let trimmed = home.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(mut cache) = wsl_home_cache().lock() {
        cache.insert(
            shell_id.to_string(),
            CachedHome {
                at: Instant::now(),
                path: trimmed.to_string(),
            },
        );
    }
    Some(trimmed.to_string())
}

fn is_windows_path(arg: &str) -> bool {
    let bytes = arg.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'/' || bytes[2] == b'\\')
        || arg.starts_with("\\\\")
}

fn looks_like_remote_target(arg: &str) -> bool {
    if is_windows_path(arg) {
        return false;
    }
    let colon = arg.find(':');
    let Some(colon) = colon else {
        return false;
    };
    if colon == 0 {
        return false;
    }
    let slash = arg.find(['/', '\\']);
    match slash {
        None => true,
        Some(slash) => colon < slash,
    }
}

fn split_path(arg: &str) -> Option<(String, String, char)> {
    let sep = if is_windows_path(arg) { '\\' } else { '/' };
    let last_sep = arg.rfind('/').into_iter().chain(arg.rfind('\\')).max()?;
    Some((
        arg[..=last_sep].to_string(),
        arg[last_sep + 1..].to_string(),
        sep,
    ))
}

fn is_absolute_or_home_path(path: &str) -> bool {
    path.starts_with('/')
        || path.starts_with('~')
        || path.starts_with("\\\\")
        || is_windows_path(path)
}

fn resolve_dir(dir: &str, cwd: &str, sep: char) -> String {
    if is_absolute_or_home_path(dir) {
        return dir.to_string();
    }
    let base = if cwd.ends_with(sep) {
        &cwd[..cwd.len() - 1]
    } else {
        cwd
    };
    let resolved = if dir.starts_with("./") || dir.starts_with(".\\") {
        format!("{base}{sep}{}", &dir[2..])
    } else {
        format!("{base}{sep}{dir}")
    };
    if sep == '\\' {
        resolved.replace('/', "\\")
    } else {
        resolved.replace('\\', "/")
    }
}

fn strip_trailing_sep(path: &str) -> String {
    if path == "/" {
        return path.to_string();
    }
    let bytes = path.as_bytes();
    if bytes.len() == 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'/' || bytes[2] == b'\\')
    {
        return path.to_string();
    }
    path.trim_end_matches(['/', '\\']).to_string()
}

fn normalize_fs_list_path(path: &str, connection_id: &str, use_wsl: bool) -> String {
    if path == "~" {
        if connection_id != "local" || use_wsl {
            return "~".to_string();
        }
        return String::new();
    }
    if path.is_empty() && connection_id != "local" {
        return ".".to_string();
    }
    path.to_string()
}

fn infer_separator(cwd: Option<&str>) -> char {
    if cwd.is_some_and(|c| c.contains('\\')) {
        '\\'
    } else {
        '/'
    }
}

fn fs_list_timeout_ms(connection_id: &str, wsl_shell_id: Option<&str>) -> u64 {
    if wsl_shell_id.is_some_and(shell_id_indicates_wsl) {
        return WSL_FS_LIST_TIMEOUT_MS;
    }
    if connection_id != "local" {
        return REMOTE_FS_LIST_TIMEOUT_MS;
    }
    INLINE_FS_TIMEOUT_MS
}

fn normalize_entry_type(t: &str) -> &'static str {
    match t {
        "d" | "directory" => "directory",
        "l" | "symlink" => "symlink",
        _ => "file",
    }
}

async fn invoke_fs_list(
    state: &AppState,
    connection_id: &str,
    path: &str,
    timeout_ms: u64,
    wsl_shell_id: Option<&str>,
) -> Result<Vec<FileEntry>, String> {
    let use_wsl = wsl_shell_id.is_some_and(shell_id_indicates_wsl);
    let request = async {
        if use_wsl {
            let distro = wsl_shell_id.and_then(|id| parse_wsl_distro(id));
            crate::commands::ghost_fs_list_wsl(distro, path.to_string()).await
        } else {
            crate::commands::ghost_fs_list(state, connection_id, path).await
        }
    };
    match tokio::time::timeout(Duration::from_millis(timeout_ms.max(50)), request).await {
        Ok(Ok(entries)) => Ok(entries),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("fs_list timeout".to_string()),
    }
}

pub struct PathSuggestParams<'a> {
    pub line: &'a str,
    pub cwd: Option<&'a str>,
    pub connection_id: &'a str,
    pub wsl_shell_id: Option<&'a str>,
    pub recent_commands: &'a [String],
    pub state: &'a AppState,
}

pub async fn path_suggestion(params: PathSuggestParams<'_>) -> Option<String> {
    let suggestions = path_suggestions(PathSuggestionsParams {
        line: params.line,
        cwd: params.cwd,
        connection_id: params.connection_id,
        wsl_shell_id: params.wsl_shell_id,
        recent_commands: params.recent_commands,
        state: params.state,
        limit: 1,
    })
    .await;
    suggestions.into_iter().next()
}

struct PathSuggestionsParams<'a> {
    line: &'a str,
    cwd: Option<&'a str>,
    connection_id: &'a str,
    wsl_shell_id: Option<&'a str>,
    recent_commands: &'a [String],
    state: &'a AppState,
    limit: usize,
}

fn path_entry_suffix(entry_name: &str, partial: &str) -> String {
    if partial.is_empty() {
        return entry_name.to_string();
    }
    if entry_name.starts_with(partial) {
        return entry_name[partial.len()..].to_string();
    }
    let entry_lower = entry_name.to_ascii_lowercase();
    let partial_lower = partial.to_ascii_lowercase();
    if entry_lower.starts_with(&partial_lower) {
        let byte_idx = entry_name
            .char_indices()
            .nth(partial.chars().count())
            .map(|(i, _)| i)
            .unwrap_or(entry_name.len());
        return entry_name[byte_idx..].to_string();
    }
    entry_name.to_string()
}

/// True when the active segment is only the command token (optional trailing space).
/// `cd` / `cd ` → true; `cd cd` / `cd Doc` → false.
fn is_bare_directory_command_line(parse_line: &str) -> bool {
    parse_line.trim_end().split_whitespace().count() <= 1
}

/// Classify path partial + whether a leading space is required for a new arg.
/// Extracted for unit tests (avoids async fs listing).
fn classify_directory_path_partial(
    parse_line: &str,
    last_arg: &str,
    command_name: &str,
    is_directory_only: bool,
) -> (String, bool) {
    let mut partial = last_arg.to_string();
    let mut new_path_arg = false;
    let bare_command = is_bare_directory_command_line(parse_line);
    if is_directory_only
        && bare_command
        && !partial.is_empty()
        && partial.to_ascii_lowercase() == command_name.to_ascii_lowercase()
    {
        partial.clear();
        new_path_arg = true;
    } else if last_arg.is_empty() {
        new_path_arg = true;
    }
    (partial, new_path_arg)
}

async fn path_suggestions(params: PathSuggestionsParams<'_>) -> Vec<String> {
    let timeout_ms = fs_list_timeout_ms(params.connection_id, params.wsl_shell_id);
    let parse_line = line_for_suggestion_parsing(params.line);
    let last_arg = strip_leading_unmatched_quote(&get_last_arg(&parse_line)).to_string();

    if looks_like_remote_target(&last_arg) {
        return Vec::new();
    }

    let command_name = get_command_name(&parse_line);
    let is_directory_only = is_directory_command(&command_name);
    let is_file_aware = is_file_aware_command(&command_name);

    let mut dir = String::new();
    let partial;
    let mut sep = infer_separator(params.cwd);
    // True when the completion is a brand-new path token after a bare command
    // (`cd` → ` Documents/`), not a mid-token fragment (`cd Doc` → `uments/`).
    // Path owns this leading space so history mid-token (`ls` → `blk`) never
    // gets a space invented by suffix normalize.
    let mut new_path_arg = false;

    if has_path_separator(&last_arg) {
        let Some((d, p, s)) = split_path(&last_arg) else {
            return Vec::new();
        };
        dir = d;
        partial = p;
        sep = s;
    } else {
        if command_name.is_empty() {
            return Vec::new();
        }
        if !is_directory_only && !is_file_aware {
            return Vec::new();
        }
        if last_arg.starts_with('-') {
            return Vec::new();
        }
        if !is_directory_only {
            let cwd = params.cwd.unwrap_or("");
            if params.cwd.is_none()
                || last_arg.is_empty()
                || last_arg.eq_ignore_ascii_case(&command_name)
            {
                return Vec::new();
            }
            if cwd.is_empty() {
                return Vec::new();
            }
        }
        let (classified_partial, classified_new) = classify_directory_path_partial(
            &parse_line,
            &last_arg,
            &command_name,
            is_directory_only,
        );
        partial = classified_partial;
        new_path_arg = classified_new;
    }

    let use_wsl = params.wsl_shell_id.is_some_and(shell_id_indicates_wsl);

    let mut effective_cwd = params.cwd.map(|s| s.to_string());
    if let Some(ref cwd) = effective_cwd {
        if cwd.contains('~') {
            if params.connection_id != "local" {
                let Some(home) = get_remote_home_dir(params.state, params.connection_id).await
                else {
                    return Vec::new();
                };
                effective_cwd = Some(expand_tilde_path_for_remote(cwd, &home));
            } else if use_wsl {
                let Some(shell_id) = params.wsl_shell_id else {
                    return Vec::new();
                };
                let Some(home) = get_wsl_home_dir(shell_id).await else {
                    return Vec::new();
                };
                effective_cwd = Some(expand_tilde_path_for_remote(cwd, &home));
            }
        }
    }

    let resolved_dir = if let Some(ref cwd) = effective_cwd {
        resolve_dir(&dir, cwd, sep)
    } else {
        dir.clone()
    };

    let mut api_path = normalize_fs_list_path(
        &strip_trailing_sep(&resolved_dir),
        params.connection_id,
        use_wsl,
    );

    if params.connection_id != "local" && api_path.contains('~') {
        let Some(home) = get_remote_home_dir(params.state, params.connection_id).await else {
            return Vec::new();
        };
        api_path = expand_tilde_path_for_remote(&api_path, &home);
    } else if use_wsl {
        if let Some(shell_id) = params.wsl_shell_id {
            if api_path.contains('~') {
                let Some(home) = get_wsl_home_dir(shell_id).await else {
                    return Vec::new();
                };
                api_path = expand_tilde_path_for_remote(&api_path, &home);
            }
        }
    }

    let cache_key = if use_wsl {
        format!(
            "wsl:{}::{}",
            params
                .wsl_shell_id
                .and_then(parse_wsl_distro)
                .unwrap_or_else(|| "default".to_string()),
            api_path
        )
    } else {
        format!("{}::{}", params.connection_id, api_path)
    };

    let entries = {
        let cache_hit = {
            if let Ok(cache) = fs_list_cache().lock() {
                if let Some(entry) = cache.get(&cache_key) {
                    if entry.at.elapsed() < Duration::from_millis(FS_LIST_CACHE_TTL_MS) {
                        Some(entry.entries.clone())
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            }
        };
        if let Some(hit) = cache_hit {
            hit
        } else {
            match invoke_fs_list(
                params.state,
                params.connection_id,
                &api_path,
                timeout_ms,
                params.wsl_shell_id,
            )
            .await
            {
                Ok(entries) => {
                    if let Ok(mut cache) = fs_list_cache().lock() {
                        cache.insert(
                            cache_key.clone(),
                            CachedEntries {
                                at: Instant::now(),
                                entries: entries.clone(),
                            },
                        );
                        if cache.len() > 128 {
                            let now = Instant::now();
                            cache.retain(|_, v| {
                                now.duration_since(v.at)
                                    < Duration::from_millis(FS_LIST_CACHE_TTL_MS)
                            });
                            while cache.len() > 112 {
                                if let Some(key) = cache.keys().next().cloned() {
                                    cache.remove(&key);
                                } else {
                                    break;
                                }
                            }
                        }
                    }
                    entries
                }
                Err(_) => {
                    if let Ok(cache) = fs_list_cache().lock() {
                        cache
                            .get(&cache_key)
                            .map(|e| e.entries.clone())
                            .unwrap_or_default()
                    } else {
                        Vec::new()
                    }
                }
            }
        }
    };

    if entries.is_empty() {
        return Vec::new();
    }

    let partial_lower = partial.to_ascii_lowercase();
    let mut matches: Vec<&FileEntry> = entries
        .iter()
        .filter(|e| {
            e.name != "."
                && e.name != ".."
                && e.name != partial
                && (partial.is_empty() || e.name.to_ascii_lowercase().starts_with(&partial_lower))
        })
        .collect();

    if matches.is_empty() {
        return Vec::new();
    }

    if is_directory_only {
        matches.retain(|e| {
            let t = normalize_entry_type(&e.r#type);
            t == "directory" || t == "symlink"
        });
        if matches.is_empty() {
            return Vec::new();
        }
    }

    matches.retain(|e| !e.name.ends_with('~'));
    matches.sort_by(|a, b| {
        let a_recent = recent_entry_name_bonus(&a.name, params.recent_commands);
        let b_recent = recent_entry_name_bonus(&b.name, params.recent_commands);
        if a_recent != b_recent {
            return a_recent.cmp(&b_recent).reverse();
        }
        let a_exact = !partial.is_empty() && a.name.starts_with(&partial);
        let b_exact = !partial.is_empty() && b.name.starts_with(&partial);
        if a_exact != b_exact {
            return a_exact.cmp(&b_exact).reverse();
        }
        let a_dir = normalize_entry_type(&a.r#type) == "directory";
        let b_dir = normalize_entry_type(&b.r#type) == "directory";
        if a_dir != b_dir {
            return a_dir.cmp(&b_dir).reverse();
        }
        a.name.cmp(&b.name)
    });

    let limit = params.limit.max(1);
    let mut out = Vec::new();
    for entry in matches.into_iter().take(limit) {
        let name_suffix = path_entry_suffix(&entry.name, &partial);
        let trailing_sep = {
            let t = normalize_entry_type(&entry.r#type);
            if t == "directory" || t == "symlink" {
                sep.to_string()
            } else {
                String::new()
            }
        };
        let piece = format!("{name_suffix}{trailing_sep}");
        if new_path_arg && !piece.is_empty() && !piece.starts_with([' ', '\t']) {
            out.push(format!(" {piece}"));
        } else {
            out.push(piece);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expand_tilde_remote_paths() {
        assert_eq!(
            expand_tilde_path_for_remote("~/proj", "/home/me"),
            "/home/me/proj"
        );
        assert_eq!(expand_tilde_path_for_remote("~", "/home/me"), "/home/me");
    }

    #[test]
    fn split_path_unix() {
        let (dir, partial, sep) = split_path("/usr/lo").unwrap();
        assert_eq!(dir, "/usr/");
        assert_eq!(partial, "lo");
        assert_eq!(sep, '/');
    }

    #[test]
    fn path_entry_suffix_preserves_entry_casing() {
        assert_eq!(path_entry_suffix("Documents", "doc"), "uments");
        assert_eq!(path_entry_suffix("Documents", "Doc"), "uments");
    }

    #[test]
    fn bare_cd_clears_partial_and_marks_new_arg() {
        let (partial, new_arg) = classify_directory_path_partial("cd", "cd", "cd", true);
        assert_eq!(partial, "");
        assert!(new_arg);

        let (partial_sp, new_arg_sp) = classify_directory_path_partial("cd ", "", "cd", true);
        assert_eq!(partial_sp, "");
        assert!(new_arg_sp);
    }

    #[test]
    fn cd_cd_keeps_partial_without_leading_space() {
        // Argument equals command name but is a second token — not bare `cd`.
        let (partial, new_arg) = classify_directory_path_partial("cd cd", "cd", "cd", true);
        assert_eq!(partial, "cd");
        assert!(!new_arg);

        let (partial_pd, new_arg_pd) =
            classify_directory_path_partial("pushd pushd", "pushd", "pushd", true);
        assert_eq!(partial_pd, "pushd");
        assert!(!new_arg_pd);

        // Mid-token path fragment still glues without new-arg space.
        let (partial_doc, new_arg_doc) =
            classify_directory_path_partial("cd Doc", "Doc", "cd", true);
        assert_eq!(partial_doc, "Doc");
        assert!(!new_arg_doc);
    }

    #[test]
    fn path_entry_suffix_for_cd_cd_style_partial() {
        // Completing an arg that starts with "cd" should glue, not inject a space.
        assert_eq!(path_entry_suffix("cdrom", "cd"), "rom");
        assert_eq!(path_entry_suffix("cd", "cd"), "");
    }
}
