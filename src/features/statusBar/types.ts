export interface StatusBarSettings {
  /** Show SSH round-trip latency next to the connected host. */
  showConnectionLatency: boolean;
}

export type LatencyTone = 'good' | 'ok' | 'high';
