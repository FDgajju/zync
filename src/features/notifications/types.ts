export type ToastType = 'success' | 'error' | 'warning' | 'info';

export type NotificationPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

/** Channel for emitters — maps to live toast vs inbox policy. */
export type NotificationChannel = 'auto' | 'toast' | 'inbox' | 'both';

export interface NotificationAction {
    id: string;
    label: string;
    /** Default true — dismiss/archive after click. */
    dismiss?: boolean;
    onClick?: () => void;
}

/** Serializable action metadata (no callbacks). */
export interface NotificationActionSpec {
    id: string;
    label: string;
    dismiss?: boolean;
}

export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration: number;
    createdAt: number;
    /** When false, live toast only — never enters the inbox. */
    storeInHistory: boolean;
    actions?: NotificationActionSpec[];
}

export interface NotificationRecord {
    id: string;
    type: ToastType;
    message: string;
    createdAt: number;
    read: boolean;
    actions?: NotificationActionSpec[];
}

export interface NotificationSettings {
    position: NotificationPosition;
    doNotDisturb: boolean;
    playSound: boolean;
}

/**
 * Full options for any emitter (store `showToast` or public `notify`).
 * Prefer named fields over magic numbers when integrating new code.
 */
export interface NotifyOptions {
    /** Auto-hide ms. `0` = sticky until dismiss. */
    duration?: number;
    /** Alias for sticky on-screen + inbox. */
    persist?: boolean;
    /** Skip sound even if prefs enable it. */
    silent?: boolean;
    /**
     * Inbox membership override.
     * - true: always inbox
     * - false: never inbox (toast-only / dropped under DND)
     * - omit: policy by type / sticky / actions
     */
    history?: boolean;
    /**
     * Explicit channel (optional). When set, overrides default type policy:
     * - toast: force ephemeral (history false)
     * - inbox: force history, may still show live unless DND
     * - both: force history + live when allowed
     * - auto: use type/options policy
     */
    channel?: NotificationChannel;
    actions?: NotificationAction[];
    /** Stable id for dedupe/update (optional). */
    id?: string;
    /** Source tag for debugging / future filters (e.g. `files`, `plugin:foo`). */
    source?: string;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
    position: 'bottom-right',
    doNotDisturb: false,
    playSound: false,
};

/** Max inbox rows kept (oldest dropped). */
export const NOTIFICATION_HISTORY_LIMIT = 50;

/**
 * Max age of inbox items. Older entries are pruned on load/write so history
 * does not accumulate forever without Clear all.
 */
export const NOTIFICATION_HISTORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const NOTIFICATION_HISTORY_STORAGE_KEY = 'zync.notificationHistory.v1';
