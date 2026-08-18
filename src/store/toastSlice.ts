import { StateCreator } from 'zustand';
import type { AppStore } from './useAppStore';
import { setNotificationActions, getNotificationActions, deleteNotificationActions, clearNotificationActions } from '../features/notifications/actionRegistry';
import { buildToast } from '../features/notifications/buildToast';
import {
    markHistoryRead,
    prependHistory,
    pruneHistory,
    toNotificationRecord,
    unreadCount,
} from '../features/notifications/historyOps';
import {
    clearAllHideTimers,
    clearHideTimer,
    pauseHideTimer,
    resumeHideTimer,
    scheduleHideTimer,
} from '../features/notifications/hideTimers';
import { bindNotifyDispatcher } from '../features/notifications/notify';
import { playNotificationSound } from '../features/notifications/notificationSound';
import { loadPersistedHistory, persistHistory } from '../features/notifications/storage';
import {
    DEFAULT_NOTIFICATION_SETTINGS,
    type NotificationRecord,
    type NotifyOptions,
    type Toast,
    type ToastType,
} from '../features/notifications/types';

export type {
    NotificationAction,
    NotificationRecord,
    Toast,
    ToastType,
} from '../features/notifications/types';

/** @deprecated Prefer `NotifyOptions` from features/notifications */
export type ShowToastOptions = NotifyOptions;

export interface ToastSlice {
    toasts: Toast[];
    notificationHistory: NotificationRecord[];
    notificationCenterOpen: boolean;
    notificationHistoryHydrated: boolean;
    showToast: (type: ToastType, message: string, durationOrOptions?: number | NotifyOptions) => void;
    archiveToast: (id: string, read?: boolean) => void;
    removeToast: (id: string) => void;
    removeNotification: (id: string) => void;
    clearNotifications: () => void;
    openNotificationCenter: () => void;
    closeNotificationCenter: () => void;
    toggleNotificationCenter: () => void;
    pauseToastHide: (id: string) => void;
    resumeToastHide: (id: string) => void;
    runNotificationAction: (id: string, actionId: string) => void;
    loadNotificationHistory: () => void;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(history: NotificationRecord[]) {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persistTimer = null;
        persistHistory(pruneHistory(history));
    }, 200);
}

export const createToastSlice: StateCreator<AppStore, [], [], ToastSlice> = (set, get) => {
    const showToast: ToastSlice['showToast'] = (type, message, durationOrOptions) => {
        const { toast, actions, options } = buildToast(type, message, durationOrOptions);
        if (actions && actions.length > 0) {
            setNotificationActions(toast.id, actions);
        }

        const notificationPrefs = get().settings?.notifications ?? DEFAULT_NOTIFICATION_SETTINGS;
        const suppressLive = notificationPrefs.doNotDisturb || get().notificationCenterOpen;
        const playSound = notificationPrefs.playSound
            && !notificationPrefs.doNotDisturb
            && !options.silent
            && toast.storeInHistory;

        if (suppressLive) {
            if (!toast.storeInHistory) {
                deleteNotificationActions(toast.id);
                return;
            }
            set((state) => {
                const notificationHistory = prependHistory(
                    state.notificationHistory,
                    toNotificationRecord(toast, state.notificationCenterOpen),
                );
                schedulePersist(notificationHistory);
                return { notificationHistory };
            });
        } else {
            // Replace same-id live toast: drop its hide timer so it cannot archive the replacement.
            clearHideTimer(toast.id);
            set((state) => {
                const without = state.toasts.filter(item => item.id !== toast.id);
                return { toasts: [...without, toast] };
            });
            if (toast.duration > 0) {
                scheduleHideTimer(toast.id, toast.duration, (id) => get().archiveToast(id, false));
            }
        }

        if (playSound) playNotificationSound();
    };

    // Always rebind so HMR / store recreation keeps notify.* on the active store.
    bindNotifyDispatcher(showToast);

    return {
        toasts: [],
        notificationHistory: [],
        notificationCenterOpen: false,
        notificationHistoryHydrated: false,

        loadNotificationHistory: () => {
            if (get().notificationHistoryHydrated) return;
            const history = pruneHistory(loadPersistedHistory());
            set({ notificationHistory: history, notificationHistoryHydrated: true });
            schedulePersist(history);
        },

        showToast,

        archiveToast: (id, read = false) => {
            clearHideTimer(id);
            const live = get().toasts.find(toast => toast.id === id);
            if (!live) return;
            if (!live.storeInHistory) {
                deleteNotificationActions(id);
                set((state) => ({
                    toasts: state.toasts.filter(toast => toast.id !== id),
                }));
                return;
            }
            set((state) => {
                const notificationHistory = prependHistory(
                    state.notificationHistory,
                    toNotificationRecord(live, read || state.notificationCenterOpen),
                );
                schedulePersist(notificationHistory);
                return {
                    toasts: state.toasts.filter(toast => toast.id !== id),
                    notificationHistory,
                };
            });
        },

        removeToast: (id) => {
            get().archiveToast(id, true);
        },

        removeNotification: (id) => {
            clearHideTimer(id);
            deleteNotificationActions(id);
            set((state) => {
                const notificationHistory = state.notificationHistory.filter(item => item.id !== id);
                schedulePersist(notificationHistory);
                return {
                    toasts: state.toasts.filter(toast => toast.id !== id),
                    notificationHistory,
                };
            });
        },

        clearNotifications: () => {
            clearAllHideTimers();
            clearNotificationActions();
            schedulePersist([]);
            set({
                toasts: [],
                notificationHistory: [],
            });
        },

        openNotificationCenter: () => {
            const { toasts } = get();
            for (const toast of toasts) clearHideTimer(toast.id);
            for (const toast of toasts) {
                if (!toast.storeInHistory) deleteNotificationActions(toast.id);
            }
            set((state) => {
                const historyWorthy = toasts.filter(toast => toast.storeInHistory);
                const notificationHistory = markHistoryRead(
                    historyWorthy.reduce(
                        (history, toast) => prependHistory(history, toNotificationRecord(toast, true)),
                        state.notificationHistory,
                    ),
                );
                schedulePersist(notificationHistory);
                return {
                    notificationCenterOpen: true,
                    toasts: [],
                    notificationHistory,
                };
            });
        },

        closeNotificationCenter: () => {
            set({ notificationCenterOpen: false });
        },

        toggleNotificationCenter: () => {
            if (get().notificationCenterOpen) {
                get().closeNotificationCenter();
            } else {
                get().openNotificationCenter();
            }
        },

        pauseToastHide: (id) => {
            pauseHideTimer(id);
        },

        resumeToastHide: (id) => {
            resumeHideTimer(id, (expiredId) => get().archiveToast(expiredId, false));
        },

        runNotificationAction: (id, actionId) => {
            const actions = getNotificationActions(id);
            const action = actions?.find(item => item.id === actionId);
            if (!action) return;
            action.onClick?.();
            if (action.dismiss === false) return;
            const live = get().toasts.some(toast => toast.id === id);
            if (live) get().archiveToast(id, true);
            else get().removeNotification(id);
            deleteNotificationActions(id);
        },
    };
};

export { unreadCount };
