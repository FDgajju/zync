use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhostSuggestProviders {
    #[serde(default)]
    pub history: Option<bool>,
    #[serde(default)]
    pub filesystem: Option<bool>,
}

impl Default for GhostSuggestProviders {
    fn default() -> Self {
        Self {
            history: Some(true),
            filesystem: Some(true),
        }
    }
}

impl GhostSuggestProviders {
    pub fn history_enabled(&self) -> bool {
        self.history.unwrap_or(true)
    }

    pub fn filesystem_enabled(&self) -> bool {
        self.filesystem.unwrap_or(true)
    }
}

/// Backend-first inline ghost request (P5).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhostSuggestV2Request {
    pub prefix: String,
    pub scope: Option<String>,
    pub cwd: Option<String>,
    /// Shell override id (`wsl`, `wsl:Distro`, etc.).
    pub shell_id: Option<String>,
    /// Connection id for filesystem listing (defaults to scope).
    pub fs_connection_id: Option<String>,
    /// Recent in-session commands from terminal scrollback (P6 ranking).
    pub recent_commands: Option<Vec<String>>,
    #[serde(default)]
    pub providers: GhostSuggestProviders,
    /// When true, response includes raw suffix + spacing decision (dev/debug).
    #[serde(default)]
    pub debug: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhostSuggestV2Response {
    pub suffix: String,
    pub confidence: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suppress_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_suffix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spacing_reason: Option<String>,
}

impl GhostSuggestV2Response {
    pub fn empty(reason: impl Into<String>) -> Self {
        Self {
            suffix: String::new(),
            confidence: 0.0,
            suppress_reason: Some(reason.into()),
            raw_suffix: None,
            spacing_reason: None,
        }
    }

    pub fn hit(suffix: String, confidence: f32) -> Self {
        Self::hit_with_debug(suffix, confidence, None, None)
    }

    pub fn hit_with_debug(
        suffix: String,
        confidence: f32,
        raw_suffix: Option<String>,
        spacing_reason: Option<String>,
    ) -> Self {
        Self {
            suffix,
            confidence,
            suppress_reason: None,
            raw_suffix,
            spacing_reason,
        }
    }
}
