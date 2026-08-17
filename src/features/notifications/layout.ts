import {
    DEFAULT_NOTIFICATION_SETTINGS,
    type NotificationPosition,
    type NotificationSettings,
} from './types.js';

const POSITIONS: readonly NotificationPosition[] = [
    'bottom-right',
    'bottom-left',
    'top-right',
    'top-left',
];

export function isNotificationPosition(value: unknown): value is NotificationPosition {
    return typeof value === 'string' && (POSITIONS as readonly string[]).includes(value);
}

export function normalizeNotificationSettings(
    raw?: Partial<NotificationSettings> | null,
): NotificationSettings {
    return {
        position: isNotificationPosition(raw?.position)
            ? raw.position
            : DEFAULT_NOTIFICATION_SETTINGS.position,
        doNotDisturb: raw?.doNotDisturb === true,
        playSound: raw?.playSound === true,
    };
}

export function notificationStackClass(position: NotificationPosition): string {
    const base = 'absolute z-[10000] flex w-[min(22rem,calc(100%-1.5rem))] items-stretch gap-2 pointer-events-auto';
    if (position === 'bottom-left') return `${base} bottom-10 left-3 flex-col-reverse`;
    if (position === 'top-right') return `${base} top-12 right-3 flex-col`;
    if (position === 'top-left') return `${base} top-12 left-3 flex-col`;
    return `${base} bottom-10 right-3 flex-col-reverse`;
}

export function notificationCenterClass(position: NotificationPosition): string {
    const base = 'absolute z-[10000] flex w-[min(22rem,calc(100%-1.5rem))] max-h-[min(24rem,calc(100%-4.5rem))] flex-col overflow-hidden rounded-lg border border-app-border bg-app-panel shadow-2xl';
    if (position === 'bottom-left') return `${base} bottom-10 left-3`;
    if (position === 'top-right') return `${base} top-12 right-3`;
    if (position === 'top-left') return `${base} top-12 left-3`;
    return `${base} bottom-10 right-3`;
}

export function toastEnterClass(position: NotificationPosition): string {
    // Project-defined utilities in index.css (not tailwindcss-animate).
    if (position === 'bottom-left' || position === 'top-left') {
        return 'animate-fade-in-from-left';
    }
    return 'animate-fade-in-from-right';
}
