import { sanitizeHistory } from './historyOps.js';
import { NOTIFICATION_HISTORY_STORAGE_KEY, type NotificationRecord } from './types.js';

export function getDefaultNotificationStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage;
    } catch {
        return null;
    }
}

export function loadPersistedHistory(
    storage: Pick<Storage, 'getItem'> | null | undefined = getDefaultNotificationStorage(),
): NotificationRecord[] {
    if (!storage) return [];
    try {
        const raw = storage.getItem(NOTIFICATION_HISTORY_STORAGE_KEY);
        if (!raw) return [];
        return sanitizeHistory(JSON.parse(raw));
    } catch {
        return [];
    }
}

export function persistHistory(
    history: NotificationRecord[],
    storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined = getDefaultNotificationStorage(),
): void {
    if (!storage) return;
    try {
        const serializable = history.map(({ id, type, message, createdAt, read }) => ({
            id,
            type,
            message,
            createdAt,
            read,
        }));
        if (serializable.length === 0) {
            storage.removeItem(NOTIFICATION_HISTORY_STORAGE_KEY);
            return;
        }
        storage.setItem(NOTIFICATION_HISTORY_STORAGE_KEY, JSON.stringify(serializable));
    } catch {
        // Quota / private mode — inbox still works in-session.
    }
}
