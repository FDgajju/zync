use russh::client::Handle;
use std::time::{Duration, Instant};
use tokio::time::timeout;

use crate::ssh::Client;

const PROBE_TIMEOUT: Duration = Duration::from_secs(4);
const MAX_RTT_MS: u64 = 60_000;

/// Caps a measured duration so UI / IPC never see unbounded values.
pub fn clamp_rtt_ms(elapsed_ms: u128) -> u64 {
    elapsed_ms.min(u128::from(MAX_RTT_MS)) as u64
}

/// SSH-layer RTT: time until a session channel is confirmed, then close it.
/// Does not run a remote command (no shell history / login noise).
pub async fn measure_session_rtt_ms(session: &Handle<Client>) -> Result<u64, String> {
    let started = Instant::now();
    let channel = timeout(PROBE_TIMEOUT, session.channel_open_session())
        .await
        .map_err(|_| "SSH latency probe timed out".to_string())?
        .map_err(|error| format!("SSH latency probe failed: {error}"))?;
    let rtt_ms = clamp_rtt_ms(started.elapsed().as_millis());
    let _ = channel.close().await;
    Ok(rtt_ms)
}

#[cfg(test)]
mod tests {
    use super::{clamp_rtt_ms, MAX_RTT_MS};

    #[test]
    fn clamp_rtt_ms_keeps_typical_values() {
        assert_eq!(clamp_rtt_ms(0), 0);
        assert_eq!(clamp_rtt_ms(42), 42);
        assert_eq!(clamp_rtt_ms(1_200), 1_200);
    }

    #[test]
    fn clamp_rtt_ms_caps_unbounded_samples() {
        assert_eq!(clamp_rtt_ms(u128::from(MAX_RTT_MS)), MAX_RTT_MS);
        assert_eq!(clamp_rtt_ms(u128::from(MAX_RTT_MS) + 1), MAX_RTT_MS);
        assert_eq!(clamp_rtt_ms(u128::MAX), MAX_RTT_MS);
    }
}
