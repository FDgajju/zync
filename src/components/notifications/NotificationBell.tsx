import { Bell } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { unreadCount } from '../../store/toastSlice';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../../features/notifications/notificationHistory';
import { cn } from '../../lib/utils';
import { Tooltip } from '../ui/Tooltip';

interface NotificationBellProps {
    tooltipPosition?: 'top' | 'bottom';
    size?: 'status' | 'title';
}

export function NotificationBell({
    tooltipPosition = 'top',
    size = 'status',
}: NotificationBellProps) {
    const history = useAppStore(state => state.notificationHistory);
    const notificationCenterOpen = useAppStore(state => state.notificationCenterOpen);
    const toggleNotificationCenter = useAppStore(state => state.toggleNotificationCenter);
    const unread = unreadCount(history);

    return (
        <Tooltip
            content={unread > 0 ? `Notifications (${unread} new)` : 'Notifications'}
            position={tooltipPosition}
        >
            <button
                type="button"
                data-notification-bell
                onClick={toggleNotificationCenter}
                className={cn(
                    'relative shrink-0 rounded-md text-app-muted hover:text-app-text hover:bg-app-surface border border-transparent hover:border-app-border/40 transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 focus-visible:ring-offset-0',
                    size === 'title' ? 'h-7 w-7' : 'h-6 w-6',
                    notificationCenterOpen && 'text-app-accent bg-app-accent/10 border-app-accent/20',
                )}
                aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
                aria-expanded={notificationCenterOpen}
            >
                <Bell size={14} />
                {unread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-app-accent px-0.5 text-[8px] font-semibold leading-none text-white">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>
        </Tooltip>
    );
}

export function useNotificationBellPlacement() {
    const position = useAppStore(state =>
        state.settings.notifications?.position ?? DEFAULT_NOTIFICATION_SETTINGS.position,
    );
    return {
        position,
        showInTitleLeft: position === 'top-left',
        showInTitleRight: position === 'top-right',
        showInStatusLeft: position === 'bottom-left',
        showInStatusRight: position === 'bottom-right',
    };
}
