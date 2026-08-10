/**
 * Compact relative time for list rows and connection metadata.
 * Examples: "just now", "12m", "3h", "2d", or a short date for older stamps.
 */
export function getRelativeTime(ts: number): string {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 0) return 'just now';
    const m = Math.floor(diff / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(diff / 3_600_000);
    if (h < 24) return `${h}h`;
    const d = Math.floor(diff / 86_400_000);
    if (d < 7) return `${d}d`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Sentence-style last-connected label for resume / disconnect cards. */
export function formatLastConnectedLabel(ts: number | undefined): string | null {
    if (!ts) return null;
    const rel = getRelativeTime(ts);
    if (!rel) return null;
    if (rel === 'just now') return 'Last connected just now';
    // Compact units from getRelativeTime: "12m", "3h", "2d"
    if (/^\d+[mhd]$/.test(rel)) return `Last connected ${rel} ago`;
    return `Last connected ${rel}`;
}
