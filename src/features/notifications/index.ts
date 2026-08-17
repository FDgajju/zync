/**
 * Zync notifications — modular public surface.
 *
 * - `notify` — preferred external/feature API
 * - policy / types — pure, testable
 * - store still exposes `showToast` for existing call sites
 */

export { notify, bindNotifyDispatcher, unbindNotifyDispatcher } from './notify.js';
export { buildToast } from './buildToast.js';
export {
    defaultToastDuration,
    resolveDuration,
    resolveNotifyOptions,
    shouldStoreInHistory,
} from './policy.js';
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
export {
    markHistoryRead,
    prependHistory,
    pruneHistory,
    sanitizeHistory,
    toNotificationRecord,
    unreadCount,
} from './historyOps.js';
export { loadPersistedHistory, persistHistory, getDefaultNotificationStorage } from './storage.js';
export {
    isNotificationPosition,
    normalizeNotificationSettings,
    notificationCenterClass,
    notificationStackClass,
    toastEnterClass,
} from './layout.js';
export { playNotificationSound } from './notificationSound.js';
export { parsePluginUiNotify, namespacePluginNotificationId } from './pluginNotify.js';
export type { ParsedPluginNotify, PluginNotifyAction, PluginNotifyPayload } from './pluginNotify.js';
export {
    PLUGIN_NOTIFY_ACTION_TIMEOUT_MS,
    createPluginNotifyActionRequestId,
    resolvePluginNotifyActionResponse,
    waitForPluginNotifyActionResult,
} from './pluginNotifyAction.js';
export type {
    PluginNotifyActionRequest,
    PluginNotifyActionResult,
} from './pluginNotifyAction.js';
