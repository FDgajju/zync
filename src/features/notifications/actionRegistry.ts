import type { NotificationAction } from './types.js';

const actionHandlers = new Map<string, NotificationAction[]>();

export function setNotificationActions(id: string, actions: NotificationAction[]): void {
    if (actions.length === 0) {
        actionHandlers.delete(id);
        return;
    }
    actionHandlers.set(id, actions);
}

export function getNotificationActions(id: string): NotificationAction[] | undefined {
    return actionHandlers.get(id);
}

export function deleteNotificationActions(id: string): void {
    actionHandlers.delete(id);
}

export function clearNotificationActions(): void {
    actionHandlers.clear();
}
