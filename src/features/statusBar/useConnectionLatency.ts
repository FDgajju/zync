import { useEffect, useRef, useState } from 'react';
import { measureConnectionLatencyIpc } from '../connections/infrastructure/connectionIpc.js';
import {
  LATENCY_PROBE_INTERVAL_MS,
  parseLatencyRttMs,
  shouldMeasureConnectionLatency,
  smoothLatencySample,
} from './latency.js';

export function useConnectionLatency(options: {
  connectionId: string | null | undefined;
  enabled: boolean;
  isLive: boolean;
}): number | null {
  const { connectionId, enabled, isLive } = options;
  const [ms, setMs] = useState<number | null>(null);
  const smoothedRef = useRef<number | null>(null);

  useEffect(() => {
    smoothedRef.current = null;
    setMs(null);
  }, [connectionId]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = (delay: number) => {
      clearTimer();
      timer = setTimeout(() => {
        void probe();
      }, delay);
    };

    const probe = async () => {
      if (cancelled || inFlight) {
        return;
      }

      if (!shouldMeasureConnectionLatency({ connectionId, enabled, isLive })) {
        smoothedRef.current = null;
        setMs(null);
        return;
      }

      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }

      inFlight = true;
      try {
        const payload = await measureConnectionLatencyIpc(connectionId!);
        if (cancelled) {
          return;
        }
        const sample = parseLatencyRttMs(payload);
        if (sample === null) {
          return;
        }
        const next = smoothLatencySample(smoothedRef.current, sample);
        smoothedRef.current = next;
        setMs(next);
      } catch {
        // Fail soft: keep last good sample until disconnect / disable.
      } finally {
        inFlight = false;
        if (!cancelled && shouldMeasureConnectionLatency({ connectionId, enabled, isLive })) {
          schedule(LATENCY_PROBE_INTERVAL_MS);
        }
      }
    };

    if (!shouldMeasureConnectionLatency({ connectionId, enabled, isLive })) {
      smoothedRef.current = null;
      setMs(null);
      return () => {
        cancelled = true;
        clearTimer();
      };
    }

    void probe();

    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      if (!inFlight) {
        void probe();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      cancelled = true;
      clearTimer();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [connectionId, enabled, isLive]);

  return ms;
}
