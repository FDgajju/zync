import {
    NOTIFICATION_HISTORY_LIMIT,
    NOTIFICATION_HISTORY_MAX_AGE_MS,
    type NotificationRecord,
    type Toast,
    type ToastType,
} from './types.js';

const TOAST_TYPES: readonly ToastType[] = ['success', 'error', 'warning', 'info'];

export function toNotificationRecord(toast: Toast, read: boolean): NotificationRecord {
    return {
        id: toast.id,
        type: toast.type,
        message: toast.message,
        createdAt: toast.createdAt,
        read,
        ...(toast.actions && toast.actions.length > 0 ? { actions: toast.actions } : {}),
    };
}

export function prependHistory(
    history: NotificationRecord[],
    record: NotificationRecord,
    limit = NOTIFICATION_HISTORY_LIMIT,
): NotificationRecord[] {
    const without = history.filter(item => item.id !== record.id);
    return pruneHistory([record, ...without], limit);
}

export function unreadCount(history: NotificationRecord[]): number {
    return history.reduce((count, item) => count + (item.read ? 0 : 1), 0);
}

export function markHistoryRead(history: NotificationRecord[]): NotificationRecord[] {
    if (history.every(item => item.read)) return history;
    return history.map(item => (item.read ? item : { ...item, read: true }));
}

/** Drop entries older than maxAge (and enforce cap). */
export function pruneHistory(
    history: NotificationRecord[],
    limit = NOTIFICATION_HISTORY_LIMIT,
    maxAgeMs = NOTIFICATION_HISTORY_MAX_AGE_MS,
    now = Date.now(),
): NotificationRecord[] {
    const cutoff = now - maxAgeMs;
    const fresh = history.filter(item => item.createdAt >= cutoff);
    return fresh.slice(0, limit);
}

function isToastType(value: unknown): value is ToastType {
    return typeof value === 'string' && (TOAST_TYPES as readonly string[]).includes(value);
}

export function sanitizeHistory(raw: unknown): NotificationRecord[] {
    if (!Array.isArray(raw)) return [];
    const items: NotificationRecord[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const record = entry as Record<string, unknown>;
        if (typeof record.id !== 'string' || !record.id) continue;
        if (!isToastType(record.type)) continue;
        if (typeof record.message !== 'string' || !record.message) continue;
        const createdAt = typeof record.createdAt === 'number' ? record.createdAt : Date.now();
        items.push({
            id: record.id,
            type: record.type,
            message: record.message,
            createdAt,
            read: record.read === true,
        });
    }
    // Age-prune first, then cap — so fresh rows after expired ones are kept.
    return pruneHistory(items);
}
