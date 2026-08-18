import type { NotificationChannel, NotifyOptions, ToastType } from './types.js';

const TOAST_TYPES: readonly ToastType[] = ['success', 'error', 'warning', 'info'];
const CHANNELS: readonly NotificationChannel[] = ['auto', 'toast', 'inbox', 'both'];

export interface PluginNotifyAction {
    id: string;
    label: string;
    dismiss?: boolean;
}

export interface PluginNotifyPayload {
    type?: string;
    message?: string;
    body?: string;
    title?: string;
    duration?: number;
    persist?: boolean;
    silent?: boolean;
    history?: boolean;
    channel?: string;
    id?: string;
    source?: string;
    actions?: Array<{ id?: string; label?: string; dismiss?: boolean }>;
}

export interface ParsedPluginNotify {
    type: ToastType;
    message: string;
    options: NotifyOptions & { source: string };
    /** Serializable action specs from the plugin (no callbacks). */
    actionSpecs: PluginNotifyAction[];
}

function isToastType(value: unknown): value is ToastType {
    return typeof value === 'string' && (TOAST_TYPES as readonly string[]).includes(value);
}

function isChannel(value: unknown): value is NotificationChannel {
    return typeof value === 'string' && (CHANNELS as readonly string[]).includes(value);
}

/** Host-scoped notification id so plugins cannot collide with each other or the app. */
export function namespacePluginNotificationId(pluginId: string, id: string): string {
    const trimmed = id.trim();
    if (!trimmed) return trimmed;
    const prefix = `plugin:${pluginId}:`;
    if (trimmed.startsWith(prefix)) return trimmed;
    return `${prefix}${trimmed}`;
}

/**
 * Map a plugin `api:ui:notify` payload into host notify args.
 * JSON-only: no functions cross the worker boundary.
 */
export function parsePluginUiNotify(
    pluginId: string,
    payload: PluginNotifyPayload | null | undefined,
): ParsedPluginNotify {
    const raw = payload && typeof payload === 'object' ? payload : {};
    const type: ToastType = isToastType(raw.type) ? raw.type : 'info';
    const message = (
        (typeof raw.message === 'string' && raw.message)
        || (typeof raw.body === 'string' && raw.body)
        || (typeof raw.title === 'string' && raw.title)
        || 'Plugin notification'
    ).trim() || 'Plugin notification';

    const options: NotifyOptions & { source: string } = {
        source: `plugin:${pluginId}`,
    };

    if (typeof raw.duration === 'number' && Number.isFinite(raw.duration) && raw.duration >= 0) {
        options.duration = raw.duration;
    }
    if (raw.persist === true) options.persist = true;
    if (raw.silent === true) options.silent = true;
    if (raw.history === true) options.history = true;
    if (raw.history === false) options.history = false;
    if (isChannel(raw.channel)) options.channel = raw.channel;
    if (typeof raw.id === 'string' && raw.id.trim()) {
        options.id = namespacePluginNotificationId(pluginId, raw.id);
    }

    const actionSpecs: PluginNotifyAction[] = [];
    if (Array.isArray(raw.actions)) {
        for (const entry of raw.actions) {
            if (!entry || typeof entry !== 'object') continue;
            const id = typeof entry.id === 'string' ? entry.id.trim() : '';
            const label = typeof entry.label === 'string' ? entry.label.trim() : '';
            if (!id || !label) continue;
            actionSpecs.push({
                id,
                label,
                ...(entry.dismiss === false ? { dismiss: false } : {}),
            });
        }
    }

    return { type, message, options, actionSpecs };
}
