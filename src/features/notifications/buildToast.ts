import { resolveDuration, resolveNotifyOptions, shouldStoreInHistory } from './policy.js';
import type { NotificationAction, NotificationActionSpec, NotifyOptions, Toast, ToastType } from './types.js';

function toActionSpecs(actions?: NotificationAction[]): NotificationActionSpec[] | undefined {
    if (!actions || actions.length === 0) return undefined;
    return actions.map(({ id, label, dismiss }) => ({ id, label, dismiss }));
}

function newToastId(): string {
    return Math.random().toString(36).slice(2, 11);
}

export interface BuiltToast {
    toast: Toast;
    actions?: NotificationAction[];
    options: NotifyOptions;
}

/** Pure builder — no store side effects. Safe for unit tests and external prep. */
export function buildToast(
    type: ToastType,
    message: string,
    durationOrOptions?: number | NotifyOptions,
): BuiltToast {
    const options = resolveNotifyOptions(durationOrOptions);
    const resolvedDuration = resolveDuration(type, options);
    const storeInHistory = shouldStoreInHistory(type, {
        history: options.history,
        persist: options.persist,
        duration: options.persist ? 0 : options.duration,
        hasActions: Boolean(options.actions && options.actions.length > 0),
        channel: options.channel,
    });

    const toast: Toast = {
        id: options.id?.trim() || newToastId(),
        type,
        message,
        duration: resolvedDuration,
        createdAt: Date.now(),
        storeInHistory,
        actions: toActionSpecs(options.actions),
    };

    return {
        toast,
        actions: options.actions,
        options,
    };
}
