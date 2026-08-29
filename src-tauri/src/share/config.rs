#[derive(Debug, Clone)]
pub struct ShareConfig {
    pub api_base: String,
    pub relay_url: String,
}

impl ShareConfig {
    pub fn from_env() -> Self {
        let api_base = option_env!("ZYNC_SHARE_API_BASE")
            .unwrap_or("https://zync-share.thesudoer.in")
            .trim_end_matches('/')
            .to_string();
        let relay_url = option_env!("ZYNC_SHARE_RELAY_URL")
            .unwrap_or("https://relay.thesudoer.in")
            .trim_end_matches('/')
            .to_string();
        Self {
            api_base,
            relay_url,
        }
    }

    pub fn api_url(&self, path: &str) -> String {
        format!("{}{}", self.api_base, path)
    }
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
            to_ws_url("https://relay.thesudoer.in/agent").unwrap(),
            "wss://relay.thesudoer.in/agent"
        );
    }
}
