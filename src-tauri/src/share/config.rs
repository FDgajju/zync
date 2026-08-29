/// Loopback defaults for `cargo tauri dev` / debug tests only. Release builds
/// must set `ZYNC_SHARE_API_BASE` and `ZYNC_SHARE_RELAY_URL` at compile time.
const DEBUG_API_BASE: &str = "http://127.0.0.1:8080";
const DEBUG_RELAY_URL: &str = "http://127.0.0.1:8081";

#[derive(Debug, Clone)]
pub struct ShareConfig {
    pub api_base: String,
    pub relay_url: String,
}

impl ShareConfig {
    pub fn from_env() -> Self {
        Self {
            api_base: baked_url(option_env!("ZYNC_SHARE_API_BASE"), DEBUG_API_BASE),
            relay_url: baked_url(option_env!("ZYNC_SHARE_RELAY_URL"), DEBUG_RELAY_URL),
        }
    }

    pub fn is_configured(&self) -> bool {
        !self.api_base.is_empty() && !self.relay_url.is_empty()
    }

    pub fn api_url(&self, path: &str) -> String {
        format!("{}{}", self.api_base, path)
    }
}

fn baked_url(compiled: Option<&str>, debug_fallback: &str) -> String {
    if let Some(raw) = compiled {
        let trimmed = raw.trim().trim_end_matches('/');
        if !trimmed.is_empty() {
            return accept_share_url(trimmed);
        }
    }
    if cfg!(debug_assertions) {
        return debug_fallback.trim_end_matches('/').to_string();
    }
    String::new()
}

/// Release builds only accept https (so tickets/API never use cleartext http/ws).
/// Debug keeps http://127.0.0.1 for local zync-share.
fn accept_share_url(url: &str) -> String {
    let lower = url.to_ascii_lowercase();
    if lower.starts_with("https://") || lower.starts_with("wss://") {
        return url.to_string();
    }
    if cfg!(debug_assertions) && (lower.starts_with("http://") || lower.starts_with("ws://")) {
        return url.to_string();
    }
    String::new()
}

pub fn to_ws_url(http_url: &str) -> Result<String, String> {
    let mut u = url::Url::parse(http_url).map_err(|e| format!("invalid relay url: {e}"))?;
    match u.scheme() {
        "https" => {
            let _ = u.set_scheme("wss");
        }
        "http" => {
            let _ = u.set_scheme("ws");
        }
        "wss" | "ws" => {}
        other => return Err(format!("unsupported scheme {other}")),
    }
    Ok(u.to_string())
}

#[cfg(test)]
mod tests {
    use super::to_ws_url;

    #[test]
    fn https_becomes_wss() {
        assert_eq!(
            to_ws_url("https://example.com/agent").unwrap(),
            "wss://example.com/agent"
        );
    }

    #[test]
    fn baked_url_keeps_explicit_host() {
        assert_eq!(
            super::baked_url(Some("https://example.com/"), "http://127.0.0.1:8080"),
            "https://example.com"
        );
    }

    #[test]
    fn baked_url_ignores_blank_compiled_value() {
        let got = super::baked_url(Some("   "), "http://127.0.0.1:8080");
        if cfg!(debug_assertions) {
            assert_eq!(got, "http://127.0.0.1:8080");
        } else {
            assert!(got.is_empty());
        }
    }

    #[test]
    fn accept_share_url_allows_https() {
        assert_eq!(
            super::accept_share_url("https://example.com"),
            "https://example.com"
        );
    }

    #[test]
    fn accept_share_url_rejects_cleartext_in_release() {
        let got = super::accept_share_url("http://example.com");
        if cfg!(debug_assertions) {
            assert_eq!(got, "http://example.com");
        } else {
            assert!(got.is_empty());
        }
    }
}
