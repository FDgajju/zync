import { cn } from '../../lib/utils';
import { Tooltip } from '../../components/ui/Tooltip';
import { formatConnectionLatency, formatConnectionLatencyParts, latencyTone } from './latency.js';

export function StatusBarLatency({ ms }: { ms: number | null }) {
  if (ms === null) {
    return null;
  }

  const tone = latencyTone(ms);
  const { value, unit } = formatConnectionLatencyParts(ms);
  const label = formatConnectionLatency(ms);

  return (
    <Tooltip content={`SSH latency ${label}`} position="top">
      <span
        className={cn(
          'inline-flex h-[18px] shrink-0 items-center justify-center gap-px rounded-md border px-1.5 leading-none transition-colors duration-300',
          tone === 'good' && 'border-app-success/25 bg-app-success/10 text-app-success',
          tone === 'ok' && 'border-app-border/50 bg-app-surface/70 text-app-muted',
          tone === 'high' && 'border-app-warning/30 bg-app-warning/10 text-app-warning',
        )}
        aria-label={`SSH latency ${label}`}
      >
        <span className="font-mono text-[10px] leading-none tabular-nums">{value}</span>
        <span className="text-[9px] leading-none opacity-80">{unit}</span>
      </span>
    </Tooltip>
  );
}
