import type { LatencyTone } from './types.js';

const LOCAL_WORKSPACE_ID = 'local';

export const LATENCY_PROBE_INTERVAL_MS = 5_000;
const SMOOTH_PREVIOUS_WEIGHT = 0.65;
const SMOOTH_SAMPLE_WEIGHT = 0.35;
const GOOD_MS = 100;
const HIGH_MS = 250;

export function shouldMeasureConnectionLatency(options: {
  connectionId: string | null | undefined;
  enabled: boolean;
  isLive: boolean;
}): boolean {
  const { connectionId, enabled, isLive } = options;
  if (!enabled || !isLive) {
    return false;
  }
  if (!connectionId || connectionId === LOCAL_WORKSPACE_ID) {
    return false;
  }
  return true;
}

export function parseLatencyRttMs(payload: unknown): number | null {
  if (typeof payload === 'number' && Number.isFinite(payload) && payload >= 0) {
    return Math.round(payload);
  }
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const rttMs = (payload as { rttMs?: unknown }).rttMs;
  if (typeof rttMs !== 'number' || !Number.isFinite(rttMs) || rttMs < 0) {
    return null;
  }
  return Math.round(rttMs);
}

/** Exponential moving average so the status bar does not flicker. */
export function smoothLatencySample(previous: number | null, sample: number): number {
  if (previous === null) {
    return sample;
  }
  return Math.round(previous * SMOOTH_PREVIOUS_WEIGHT + sample * SMOOTH_SAMPLE_WEIGHT);
}

export function latencyTone(ms: number): LatencyTone {
  if (ms < GOOD_MS) {
    return 'good';
  }
  if (ms < HIGH_MS) {
    return 'ok';
  }
  return 'high';
}

export function formatConnectionLatencyParts(ms: number): { value: string; unit: 'ms' | 's' } {
  if (ms >= 10_000) {
    return { value: (ms / 1000).toFixed(1), unit: 's' };
  }
  return { value: String(ms), unit: 'ms' };
}

export function formatConnectionLatency(ms: number): string {
  const { value, unit } = formatConnectionLatencyParts(ms);
  return `${value}${unit}`;
}
