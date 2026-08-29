use super::protocol::{header_get, is_websocket, Open, MODE_TCP};
use super::stream::{is_cancelled, StreamReaders};
use bytes::Bytes;
use futures_util::StreamExt;
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const CHUNK_SIZE: usize = 24 * 1024;
const DIAL_TIMEOUT: Duration = Duration::from_secs(10);

fn http_proxy_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(DIAL_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .build()
            .expect("share http proxy client")
    })
}

pub struct FrameWriter {
    stream_id: i64,
    write: Box<dyn Fn(serde_json::Value) -> Result<(), String> + Send + Sync>,
    sent_end: bool,
    sent_close: bool,
}

impl FrameWriter {
    pub fn new(
        stream_id: i64,
        write: impl Fn(serde_json::Value) -> Result<(), String> + Send + Sync + 'static,
    ) -> Self {
        Self {
            stream_id,
            write: Box::new(write),
            sent_end: false,
            sent_close: false,
        }
    }

    pub fn end(&mut self, status: u16, headers: HashMap<String, Vec<String>>) -> Result<(), String> {
        self.sent_end = true;
        (self.write)(serde_json::json!({
            "type": "end",
            "stream_id": self.stream_id,
            "status": status,
            "headers": headers,
        }))
    }

    pub fn data(&self, chunk: &[u8]) -> Result<(), String> {
        if chunk.is_empty() {
            return Ok(());
        }
        use base64::Engine;
        let encoded = base64::engine::general_purpose::STANDARD.encode(chunk);
        (self.write)(serde_json::json!({
            "type": "data",
            "stream_id": self.stream_id,
            "chunk": encoded,
        }))
    }

    pub fn close(&mut self) -> Result<(), String> {
        if self.sent_close {
            return Ok(());
        }
        self.sent_close = true;
        (self.write)(serde_json::json!({
            "type": "close",
            "stream_id": self.stream_id,
        }))
    }

    pub fn has_sent_end(&self) -> bool {
        self.sent_end
    }
}

pub async fn handle_open(
    target: &str,
    open: Open,
    readers: StreamReaders,
    write: impl Fn(serde_json::Value) -> Result<(), String> + Send + Sync + Clone + 'static,
) {
    let mut w = FrameWriter::new(open.stream_id, write);
    let result = if open.mode == MODE_TCP {
        proxy_tcp(target, readers, &mut w).await
    } else if is_websocket(&open) {
        proxy_websocket(target, &open, readers, &mut w).await
    } else {
        proxy_http(target, &open, readers, &mut w).await
    };
    if result.is_err() && !w.has_sent_end() {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".into(), vec!["text/plain".into()]);
        headers.insert("X-Zync-Error".into(), vec!["dial".into()]);
        let _ = w.end(502, headers);
        let _ = w.data(b"bad gateway");
    }
    let _ = w.close();
}

async fn proxy_http(
    target: &str,
    open: &Open,
    readers: StreamReaders,
    w: &mut FrameWriter,
) -> Result<(), String> {
    let target_url = parse_target_url(target)?;
    let mut req_url = target_url.clone();
    let path = if open.path.is_empty() {
        "/"
    } else {
        open.path.as_str()
    };
    req_url.set_path(path);
    req_url.set_query(if open.query.is_empty() {
        None
    } else {
        Some(open.query.as_str())
    });

    let method = if open.method.is_empty() {
        reqwest::Method::GET
    } else {
        reqwest::Method::from_bytes(open.method.as_bytes())
            .unwrap_or(reqwest::Method::GET)
    };

    let client = http_proxy_client();

    let mut builder = client.request(method.clone(), req_url);
    for (key, values) in &open.headers {
        if hop_header(key) {
            continue;
        }
        for value in values {
            builder = builder.header(key, value);
        }
    }

    let host = localhost_http_host(&target_url);
    builder = builder.header("Host", &host);
    if is_loopback_url(&target_url) {
        if header_get(&open.headers, "Origin").is_some() {
            builder = builder.header("Origin", loopback_origin(target_url.scheme(), &host));
        }
        if let Some(referer) = header_get(&open.headers, "Referer") {
            if let Ok(mut u) = url::Url::parse(&referer) {
                let _ = u.set_scheme(if target_url.scheme().is_empty() {
                    "http"
                } else {
                    target_url.scheme()
                });
                let _ = u.set_host(Some("localhost"));
                if let Ok(port) = host.rsplit(':').next().unwrap_or("").parse::<u16>() {
                    let _ = u.set_port(Some(port));
                }
                builder = builder.header("Referer", u.as_str());
            }
        }
        builder = builder.header("X-Forwarded-Host", &host);
    }

    let no_body = method == reqwest::Method::GET
        || method == reqwest::Method::HEAD
        || method == reqwest::Method::OPTIONS;
    if !no_body {
        let stream = futures_util::stream::unfold(readers.req_rx, |mut rx| async move {
            rx.recv().await.map(|chunk| (Ok::<Bytes, std::io::Error>(chunk), rx))
        });
        builder = builder.body(reqwest::Body::wrap_stream(stream));
    } else {
        drop(readers.req_rx);
    }

    let resp = builder.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let mut headers: HashMap<String, Vec<String>> = HashMap::new();
    for (key, value) in resp.headers() {
        if hop_header(key.as_str()) {
            continue;
        }
        headers
            .entry(key.to_string())
            .or_default()
            .push(String::from_utf8_lossy(value.as_bytes()).into_owned());
    }
    w.end(status, headers)?;

    let mut body = resp.bytes_stream();
    while let Some(next) = body.next().await {
        if is_cancelled(&readers.cancel_rx) {
            break;
        }
        let chunk = next.map_err(|e| e.to_string())?;
        for piece in chunk.chunks(CHUNK_SIZE) {
            w.data(piece)?;
        }
    }
    Ok(())
}

async fn proxy_websocket(
    target: &str,
    open: &Open,
    mut readers: StreamReaders,
    w: &mut FrameWriter,
) -> Result<(), String> {
    let target_url = parse_target_url(target)?;
    let addr = socket_addr(&target_url)?;
    let mut stream = tokio::time::timeout(DIAL_TIMEOUT, TcpStream::connect(addr))
        .await
        .map_err(|_| "dial timeout".to_string())?
        .map_err(|e| e.to_string())?;

    let host = localhost_http_host(&target_url);
    let path = if open.path.is_empty() { "/" } else { open.path.as_str() };
    let request_line = if open.query.is_empty() {
        format!("GET {path} HTTP/1.1\r\n")
    } else {
        format!("GET {path}?{} HTTP/1.1\r\n", open.query)
    };
    let mut req = request_line.into_bytes();
    req.extend_from_slice(format!("Host: {host}\r\n").as_bytes());
    req.extend_from_slice(b"Connection: Upgrade\r\nUpgrade: websocket\r\n");
    for (key, values) in &open.headers {
        if hop_header(key) || key.eq_ignore_ascii_case("Host") || key.eq_ignore_ascii_case("Connection") {
            continue;
        }
        if key.eq_ignore_ascii_case("Origin") && is_loopback_url(&target_url) {
            req.extend_from_slice(
                format!("Origin: {}\r\n", loopback_origin(target_url.scheme(), &host)).as_bytes(),
            );
            continue;
        }
        for value in values {
            req.extend_from_slice(format!("{key}: {value}\r\n").as_bytes());
        }
    }
    req.extend_from_slice(b"\r\n");
    stream.write_all(&req).await.map_err(|e| e.to_string())?;

    let (status, headers, leftover) = read_http_headers(&mut stream).await?;
    w.end(status, headers)?;
    if !leftover.is_empty() {
        w.data(&leftover)?;
    }

    let (mut read_half, mut write_half) = stream.into_split();
    let mut extra_rx = readers.extra_rx;
    drop(readers.req_rx);

    let uplink = async {
        while let Some(chunk) = extra_rx.recv().await {
            if write_half.write_all(&chunk).await.is_err() {
                break;
            }
        }
        let _ = write_half.shutdown().await;
    };
    let downlink = async {
        let mut buf = vec![0u8; CHUNK_SIZE];
        loop {
            match read_half.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if w.data(&buf[..n]).is_err() {
                        break;
                    }
                }
            }
        }
    };
    tokio::select! {
        _ = uplink => {}
        _ = downlink => {}
        _ = readers.cancel_rx.changed() => {}
    }
    Ok(())
}

async fn proxy_tcp(
    target: &str,
    mut readers: StreamReaders,
    w: &mut FrameWriter,
) -> Result<(), String> {
    let target_url = parse_target_url(target)?;
    let addr = socket_addr(&target_url)?;
    let stream = tokio::time::timeout(DIAL_TIMEOUT, TcpStream::connect(addr))
        .await
        .map_err(|_| "dial timeout".to_string())?
        .map_err(|e| e.to_string())?;
    let mut headers = HashMap::new();
    headers.insert("Content-Type".into(), vec!["application/octet-stream".into()]);
    w.end(200, headers)?;

    let (mut read_half, mut write_half) = stream.into_split();
    let uplink = async {
        loop {
            tokio::select! {
                chunk = readers.req_rx.recv() => {
                    match chunk {
                        Some(c) => { if write_half.write_all(&c).await.is_err() { break; } }
                        None => break,
                    }
                }
                chunk = readers.extra_rx.recv() => {
                    match chunk {
                        Some(c) => { if write_half.write_all(&c).await.is_err() { break; } }
                        None => break,
                    }
                }
            }
        }
        let _ = write_half.shutdown().await;
    };
    let downlink = async {
        let mut buf = vec![0u8; CHUNK_SIZE];
        loop {
            match read_half.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if w.data(&buf[..n]).is_err() {
                        break;
                    }
                }
            }
        }
    };
    tokio::select! {
        _ = uplink => {}
        _ = downlink => {}
        _ = readers.cancel_rx.changed() => {}
    }
    Ok(())
}

fn parse_target_url(target: &str) -> Result<url::Url, String> {
    let raw = if target.contains("://") {
        target.to_string()
    } else {
        format!("http://{target}")
    };
    let mut u = url::Url::parse(&raw).map_err(|e| e.to_string())?;
    if u.host_str().is_none() {
        return Err(format!("invalid target {target}"));
    }
    if u.scheme().is_empty() {
        let _ = u.set_scheme("http");
    }
    Ok(u)
}

fn socket_addr(target: &url::Url) -> Result<String, String> {
    let host = target.host_str().unwrap_or("127.0.0.1");
    let port = target
        .port()
        .unwrap_or(if target.scheme() == "https" { 443 } else { 80 });
    Ok(format!("{host}:{port}"))
}

fn hop_header(key: &str) -> bool {
    matches!(
        key.to_ascii_lowercase().as_str(),
        "host" | "content-length" | "transfer-encoding" | "connection" | "keep-alive" | "te"
            | "trailers" | "upgrade" | "proxy-connection"
    )
}

pub fn localhost_http_host(target: &url::Url) -> String {
    if !is_loopback_url(target) {
        return target.host_str().unwrap_or("localhost").to_string();
    }
    let port = target.port().unwrap_or(if target.scheme() == "https" {
        443
    } else {
        80
    });
    if (port == 80 && (target.scheme() == "http" || target.scheme().is_empty()))
        || (port == 443 && target.scheme() == "https")
    {
        "localhost".into()
    } else {
        format!("localhost:{port}")
    }
}

fn loopback_origin(scheme: &str, host: &str) -> String {
    let scheme = if scheme.is_empty() { "http" } else { scheme };
    format!("{scheme}://{host}")
}

fn is_loopback_url(target: &url::Url) -> bool {
    match target.host_str() {
        Some("localhost") | Some("127.0.0.1") | Some("::1") => true,
        Some(host) => host.parse::<std::net::IpAddr>().is_ok_and(|ip| ip.is_loopback()),
        None => false,
    }
}

async fn read_http_headers(
    stream: &mut TcpStream,
) -> Result<(u16, HashMap<String, Vec<String>>, Vec<u8>), String> {
    let mut buf = Vec::new();
    let mut tmp = [0u8; 1024];
    loop {
        let n = stream.read(&mut tmp).await.map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("connection closed before headers".into());
        }
        buf.extend_from_slice(&tmp[..n]);
        if let Some(pos) = find_double_crlf(&buf) {
            let header = std::str::from_utf8(&buf[..pos]).map_err(|e| e.to_string())?;
            let leftover = buf[pos + 4..].to_vec();
            return parse_status_headers(header, leftover);
        }
        if buf.len() > 64 * 1024 {
            return Err("response headers too large".into());
        }
    }
}

fn find_double_crlf(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n")
}

fn parse_status_headers(
    header: &str,
    leftover: Vec<u8>,
) -> Result<(u16, HashMap<String, Vec<String>>, Vec<u8>), String> {
    let mut lines = header.split("\r\n");
    let status_line = lines.next().ok_or("empty response")?;
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(502);
    let mut headers: HashMap<String, Vec<String>> = HashMap::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            headers
                .entry(k.trim().to_string())
                .or_default()
                .push(v.trim().to_string());
        }
    }
    Ok((status, headers, leftover))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loopback_host_includes_port() {
        let u = url::Url::parse("http://127.0.0.1:3000").unwrap();
        assert_eq!(localhost_http_host(&u), "localhost:3000");
    }
}
