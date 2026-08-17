/**
 * Back-compat facade — prefer `from '../features/notifications'` for new code.
 */
export {
    DEFAULT_NOTIFICATION_SETTINGS,
    NOTIFICATION_HISTORY_LIMIT,
    NOTIFICATION_HISTORY_MAX_AGE_MS,
    NOTIFICATION_HISTORY_STORAGE_KEY,
} from './types.js';
export type {
    NotificationAction,
    NotificationActionSpec,
    NotificationChannel,
    NotificationPosition,
    NotificationRecord,
    NotificationSettings,
    NotifyOptions,
    Toast,
    ToastType,
} from './types.js';
export { defaultToastDuration, shouldStoreInHistory } from './policy.js';
export {
    markHistoryRead,
    prependHistory,
    pruneHistory,
    sanitizeHistory,
    toNotificationRecord,
    unreadCount,
} from './historyOps.js';
export { loadPersistedHistory, persistHistory } from './storage.js';
export {
    isNotificationPosition,
    normalizeNotificationSettings,
    notificationCenterClass,
    notificationStackClass,
    toastEnterClass,
} from './layout.js';
