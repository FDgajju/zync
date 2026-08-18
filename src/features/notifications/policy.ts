import type { NotifyOptions, ToastType } from './types.js';

export function defaultToastDuration(type: ToastType, duration?: number): number {
    if (duration !== undefined && Number.isFinite(duration) && duration >= 0) {
        return duration;
    }
    if (type === 'error') return 8000;
    if (type === 'warning') return 6000;
    return 4000;
}

/**
 * Short-lived feedback (copy, “saved”) stays on screen only.
 * Inbox when the user may need to revisit: errors, warnings, sticky, actions, or overrides.
 */
export function shouldStoreInHistory(
    type: ToastType,
    options: {
        history?: boolean;
        persist?: boolean;
        duration?: number;
        hasActions?: boolean;
        channel?: NotifyOptions['channel'];
    } = {},
): boolean {
    if (options.channel === 'toast') return false;
    if (options.channel === 'inbox' || options.channel === 'both') return true;

    if (options.history === false) return false;
    if (options.history === true) return true;
    if (options.persist || options.duration === 0) return true;
    if (options.hasActions) return true;
    return type === 'error' || type === 'warning';
}

export function resolveNotifyOptions(
    durationOrOptions?: number | NotifyOptions,
): NotifyOptions {
    if (typeof durationOrOptions === 'number') return { duration: durationOrOptions };
    return durationOrOptions ?? {};
}

export function resolveDuration(type: ToastType, options: NotifyOptions): number {
    if (options.persist) return 0;
    return defaultToastDuration(type, options.duration);
}
