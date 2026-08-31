use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const PROTOCOL_VERSION: i32 = 1;

pub const TYPE_HELLO: &str = "hello";
pub const TYPE_OK: &str = "ok";
pub const TYPE_ERROR: &str = "error";
pub const TYPE_OPEN: &str = "open";
pub const TYPE_DATA: &str = "data";
pub const TYPE_CLOSE: &str = "close";
pub const TYPE_PING: &str = "ping";

pub const MODE_STREAM: &str = "stream";
pub const MODE_TCP: &str = "tcp";

#[derive(Debug, Deserialize)]
pub struct Envelope {
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Debug, Serialize)]
pub struct Hello {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub v: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ticket: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resume_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

impl Hello {
    pub fn new(
        ticket: Option<String>,
        resume_token: Option<String>,
        session_id: Option<String>,
    ) -> Self {
        Self {
            kind: TYPE_HELLO,
            v: PROTOCOL_VERSION,
            ticket,
            resume_token,
            session_id,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct OkMsg {
    pub slug: String,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub resume_token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ErrorMsg {
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Open {
    pub stream_id: i64,
    #[serde(default)]
    pub method: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    pub headers: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub mode: String,
}

#[derive(Debug, Deserialize)]
pub struct DataMsg {
    pub stream_id: i64,
    #[serde(default)]
    pub chunk: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Close {
    #[serde(rename = "type")]
    pub kind: String,
    pub stream_id: i64,
}

pub fn is_websocket(open: &Open) -> bool {
    if open.mode == MODE_STREAM {
        return true;
    }
    header_has_token(&open.headers, "Upgrade", "websocket")
}

pub fn header_get(headers: &HashMap<String, Vec<String>>, key: &str) -> Option<String> {
    for (existing, values) in headers {
        if existing.eq_ignore_ascii_case(key) {
            return values.first().cloned();
        }
    }
    None
}

pub fn header_has_token(headers: &HashMap<String, Vec<String>>, key: &str, token: &str) -> bool {
    for (existing, values) in headers {
        if !existing.eq_ignore_ascii_case(key) {
            continue;
        }
        for value in values {
            for part in value.split(',') {
                if part.trim().eq_ignore_ascii_case(token) {
                    return true;
                }
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hello_uses_type_field() {
        let hello = Hello::new(Some("t".into()), None, None);
        let v = serde_json::to_value(&hello).unwrap();
        assert_eq!(v["type"], "hello");
        assert_eq!(v["v"], 1);
        assert_eq!(v["ticket"], "t");
        assert!(v.get("resume_token").is_none());
    }
}
