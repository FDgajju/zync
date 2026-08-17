import { X } from 'lucide-react';
import { ZPortal } from './ZPortal';
import { useAppStore } from '../../store/useAppStore';
import type { Toast, ToastType } from '../../store/toastSlice';
import { toastAccentClass, toastTypeIcon } from '../notifications/notificationAppearance';
import {
    DEFAULT_NOTIFICATION_SETTINGS,
    notificationStackClass,
    toastEnterClass,
} from '../../features/notifications/notificationHistory';
import { cn } from '../../lib/utils';

export type { ToastType };

function shouldReleaseToastHide(current: HTMLElement, related: EventTarget | null): boolean {
    return !(related instanceof Node && current.contains(related));
}

export function ToastContainer() {
    const toasts = useAppStore(state => state.toasts);
    const removeToast = useAppStore(state => state.removeToast);
    const pauseToastHide = useAppStore(state => state.pauseToastHide);
    const resumeToastHide = useAppStore(state => state.resumeToastHide);
    const runNotificationAction = useAppStore(state => state.runNotificationAction);
    const notificationCenterOpen = useAppStore(state => state.notificationCenterOpen);
    const position = useAppStore(state =>
        state.settings.notifications?.position ?? DEFAULT_NOTIFICATION_SETTINGS.position,
    );

    // Keep an aria-live host mounted so screen readers can pick up new toasts.
    // Hide the stack entirely while the inbox is open (live toasts are archived/discarded there).
    if (notificationCenterOpen) return null;

    const stackFromBottom = position === 'bottom-left' || position === 'bottom-right';

    return (
        <ZPortal className={notificationStackClass(position)}>
            <div
                aria-live="polite"
                aria-relevant="additions text"
                aria-atomic="false"
                className={cn(
                    'flex w-full items-stretch gap-2',
                    stackFromBottom ? 'flex-col-reverse' : 'flex-col',
                )}
            >
                {toasts.map((toast: Toast) => (
                    <div
                        key={toast.id}
                        role={toast.type === 'error' ? 'alert' : 'status'}
                        aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
                        onMouseEnter={() => pauseToastHide(toast.id)}
                        onMouseLeave={(event) => {
                            if (shouldReleaseToastHide(event.currentTarget, event.relatedTarget)) {
                                resumeToastHide(toast.id);
                            }
                        }}
                        onFocus={() => pauseToastHide(toast.id)}
                        onBlur={(event) => {
                            if (shouldReleaseToastHide(event.currentTarget, event.relatedTarget)) {
                                resumeToastHide(toast.id);
                            }
                        }}
                        className={cn(
                            'flex items-start gap-2.5 rounded-lg border border-app-border border-l-2 bg-app-panel/95 px-3 py-2.5 text-app-text shadow-xl backdrop-blur-md',
                            toastEnterClass(position),
                            toastAccentClass(toast.type),
                        )}
                    >
                        <span className="mt-0.5">{toastTypeIcon(toast.type, 'w-3.5 h-3.5 shrink-0')}</span>
                        <div className="min-w-0 flex-1">
                            <span className="block text-xs font-medium leading-4">{toast.message}</span>
                            {toast.actions && toast.actions.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                    {toast.actions.map(action => (
                                        <button
                                            key={action.id}
                                            type="button"
                                            onClick={() => runNotificationAction(toast.id, action.id)}
                                            className="rounded-md bg-app-surface px-2 py-0.5 text-[10px] font-medium text-app-text hover:bg-app-border"
                                        >
                                            {action.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => removeToast(toast.id)}
                            className="shrink-0 rounded-md p-0.5 text-app-muted opacity-60 transition-opacity hover:bg-app-surface hover:text-app-text hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
                            aria-label="Dismiss notification"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </ZPortal>
    );
}
