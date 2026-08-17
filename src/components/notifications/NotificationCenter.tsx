import { useEffect, useRef, useState } from 'react';
import { BellOff, BellRing, Settings2, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { ZPortal } from '../ui/ZPortal';
import { useAppStore } from '../../store/useAppStore';
import { toastAccentClass, toastTypeIcon } from './notificationAppearance';
import {
    DEFAULT_NOTIFICATION_SETTINGS,
    notificationCenterClass,
    type NotificationPosition,
} from '../../features/notifications/notificationHistory';
import { cn } from '../../lib/utils';

const POSITION_OPTIONS: ReadonlyArray<{ value: NotificationPosition; label: string }> = [
    { value: 'top-left', label: 'Top left' },
    { value: 'top-right', label: 'Top right' },
    { value: 'bottom-left', label: 'Bottom left' },
    { value: 'bottom-right', label: 'Bottom right' },
];

const RELATIVE_TIME_TICK_MS = 15_000;

function formatRelativeTime(createdAt: number, now: number): string {
    const delta = Math.max(0, now - createdAt);
    if (delta < 15_000) return 'Just now';
    if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
    if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
    return `${Math.floor(delta / 86_400_000)}d ago`;
}

export function NotificationCenter() {
    const open = useAppStore(state => state.notificationCenterOpen);
    const history = useAppStore(state => state.notificationHistory);
    const closeNotificationCenter = useAppStore(state => state.closeNotificationCenter);
    const clearNotifications = useAppStore(state => state.clearNotifications);
    const removeNotification = useAppStore(state => state.removeNotification);
    const runNotificationAction = useAppStore(state => state.runNotificationAction);
    const notificationSettings = useAppStore(state =>
        state.settings.notifications ?? DEFAULT_NOTIFICATION_SETTINGS,
    );
    const updateSettings = useAppStore(state => state.updateSettings);
    const [prefsOpen, setPrefsOpen] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const panelRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const position = notificationSettings.position;

    const patchNotifications = (patch: Partial<typeof notificationSettings>) => {
        void updateSettings({
            notifications: { ...notificationSettings, ...patch },
        });
    };

    useEffect(() => {
        if (!open) return;

        const getFocusable = (root: HTMLElement): HTMLElement[] => {
            const nodes = root.querySelectorAll<HTMLElement>(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            );
            return [...nodes].filter((el) => {
                if (el.getAttribute('aria-hidden') === 'true') return false;
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden';
            });
        };

        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeNotificationCenter();
                return;
            }
            if (event.key !== 'Tab' || !panelRef.current) return;

            const focusable = getFocusable(panelRef.current);
            if (focusable.length === 0) {
                event.preventDefault();
                panelRef.current.focus({ preventScroll: true });
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement;
            const onDialogShell = active === panelRef.current;

            if (event.shiftKey) {
                // Dialog shell is the first focus stop after open — Shift+Tab wraps to last control.
                if (active === first || onDialogShell || !panelRef.current.contains(active)) {
                    event.preventDefault();
                    last.focus();
                }
            } else if (active === last || (!onDialogShell && !panelRef.current.contains(active))) {
                event.preventDefault();
                first.focus();
            }
        };

        const onPointer = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target) return;
            if (target.closest('[data-notification-center]') || target.closest('[data-notification-bell]')) {
                return;
            }
            closeNotificationCenter();
        };

        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onPointer);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onPointer);
        };
    }, [closeNotificationCenter, open]);

    useEffect(() => {
        if (!open) {
            setPrefsOpen(false);
            return;
        }
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), RELATIVE_TIME_TICK_MS);
        return () => window.clearInterval(timer);
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const active = document.activeElement;
        previousFocusRef.current = active instanceof HTMLElement ? active : null;

        const focusPanel = () => {
            panelRef.current?.focus({ preventScroll: true });
        };
        const raf = window.requestAnimationFrame(focusPanel);

        return () => {
            window.cancelAnimationFrame(raf);
            const previous = previousFocusRef.current;
            previousFocusRef.current = null;
            if (previous && document.contains(previous)) {
                previous.focus({ preventScroll: true });
            }
        };
    }, [open]);

    if (!open) return null;

    return (
        <ZPortal className="pointer-events-auto">
            <div
                ref={panelRef}
                data-notification-center
                role="dialog"
                aria-modal="true"
                aria-label="Notifications"
                tabIndex={-1}
                className={cn(notificationCenterClass(position), 'outline-none')}
            >
                <div className="flex items-center justify-between gap-2 border-b border-app-border px-3 py-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-app-muted">
                        Notifications
                    </span>
                    <div className="flex items-center gap-1">
                        {history.length > 0 && (
                            <button
                                type="button"
                                onClick={clearNotifications}
                                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-app-muted hover:bg-app-surface hover:text-app-text"
                            >
                                <Trash2 size={11} />
                                Clear all
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setPrefsOpen(prefsWereOpen => !prefsWereOpen)}
                            className={cn(
                                'rounded-md p-1 text-app-muted hover:bg-app-surface hover:text-app-text',
                                prefsOpen && 'bg-app-accent/15 text-app-accent',
                            )}
                            aria-expanded={prefsOpen}
                            aria-label="Notification settings"
                        >
                            <Settings2 size={13} />
                        </button>
                        <button
                            type="button"
                            onClick={closeNotificationCenter}
                            className="rounded-md p-1 text-app-muted hover:bg-app-surface hover:text-app-text"
                            aria-label="Close notifications"
                        >
                            <X size={13} />
                        </button>
                    </div>
                </div>
                {prefsOpen && (
                    <div className="space-y-2.5 border-b border-app-border px-3 py-2.5">
                        <div>
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-app-muted">
                                Position
                            </p>
                            <div className="grid grid-cols-2 gap-1">
                                {POSITION_OPTIONS.map(option => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => patchNotifications({ position: option.value })}
                                        className={cn(
                                            'rounded-md border px-2 py-1 text-[10px] font-medium transition-colors',
                                            position === option.value
                                                ? 'border-app-accent bg-app-accent/15 text-app-text'
                                                : 'border-app-border text-app-muted hover:text-app-text',
                                        )}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => patchNotifications({ doNotDisturb: !notificationSettings.doNotDisturb })}
                                className={cn(
                                    'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] font-medium transition-colors',
                                    notificationSettings.doNotDisturb
                                        ? 'border-app-accent bg-app-accent/15 text-app-text'
                                        : 'border-app-border text-app-muted hover:text-app-text',
                                )}
                                aria-pressed={notificationSettings.doNotDisturb}
                            >
                                {notificationSettings.doNotDisturb ? <BellOff size={12} /> : <BellRing size={12} />}
                                Do not disturb
                            </button>
                            <button
                                type="button"
                                onClick={() => patchNotifications({ playSound: !notificationSettings.playSound })}
                                className={cn(
                                    'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] font-medium transition-colors',
                                    notificationSettings.playSound
                                        ? 'border-app-accent bg-app-accent/15 text-app-text'
                                        : 'border-app-border text-app-muted hover:text-app-text',
                                )}
                                aria-pressed={notificationSettings.playSound}
                            >
                                {notificationSettings.playSound ? <Volume2 size={12} /> : <VolumeX size={12} />}
                                Sound
                            </button>
                        </div>
                    </div>
                )}
                {history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-app-muted">
                        <BellOff size={18} className="opacity-60" />
                        <p className="text-xs">No notifications</p>
                    </div>
                ) : (
                    <ul className="min-h-0 flex-1 overflow-y-auto py-1">
                        {history.map(item => (
                            <li
                                key={item.id}
                                className={cn(
                                    'group flex items-start gap-2 border-l-2 px-3 py-2 hover:bg-app-surface/50',
                                    toastAccentClass(item.type),
                                )}
                            >
                                <span className="mt-0.5">{toastTypeIcon(item.type, 'w-3.5 h-3.5 shrink-0')}</span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs leading-4 text-app-text">{item.message}</p>
                                    <p className="mt-0.5 text-[10px] text-app-muted">
                                        {formatRelativeTime(item.createdAt, now)}
                                    </p>
                                    {item.actions && item.actions.length > 0 && (
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                            {item.actions.map(action => (
                                                <button
                                                    key={action.id}
                                                    type="button"
                                                    onClick={() => runNotificationAction(item.id, action.id)}
                                                    className="rounded-md bg-app-bg px-2 py-0.5 text-[10px] font-medium text-app-text hover:bg-app-border"
                                                >
                                                    {action.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeNotification(item.id)}
                                    className="shrink-0 rounded-md p-0.5 text-app-muted opacity-0 transition-opacity hover:bg-app-bg hover:text-app-text hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 group-hover:opacity-100"
                                    aria-label="Clear notification"
                                >
                                    <X size={12} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </ZPortal>
    );
}
