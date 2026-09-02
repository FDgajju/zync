import { isEditorOverlayOpen } from '../../components/editor/overlayState';
import { useAppStore, type Tab } from '../../store/useAppStore';

let sidebarCollapseTimer: ReturnType<typeof setTimeout> | null = null;

function emit(name: string, detail?: unknown): void {
    window.dispatchEvent(detail === undefined ? new CustomEvent(name) : new CustomEvent(name, { detail }));
}

function connectionFeature(feature: string): boolean {
    const { activeTabId, tabs } = useAppStore.getState();
    if (!activeTabId) return false;
    const current = tabs.find((t: Tab) => t.id === activeTabId);
    if (current?.type !== 'connection') return false;
    emit('ssh-ui:open-feature', { feature, tabId: activeTabId });
    return true;
}

/** Returns false if the event must not be consumed (pass through). */
export function runShortcutCommand(id: string, event: KeyboardEvent): boolean {
    const store = useAppStore.getState();

    switch (id) {
        case 'toggleSidebar': {
            emit('zync:layout-transition-start');
            void store.updateSettings({ sidebarCollapsed: !store.settings.sidebarCollapsed });
            if (sidebarCollapseTimer) clearTimeout(sidebarCollapseTimer);
            sidebarCollapseTimer = setTimeout(() => {
                emit('zync:layout-transition-end');
                sidebarCollapseTimer = null;
            }, 320);
            return true;
        }
        case 'openNewConnection':
            store.setAddConnectionModalOpen(true);
            return true;
        case 'newLocalTerminal':
            store.openTab('local');
            return true;
        case 'newHostTerminal':
            if (store.activeConnectionId) {
                emit('ssh-ui:new-terminal-tab', { connectionId: store.activeConnectionId });
            }
            return true;
        case 'closeTerminalTab':
            if (store.activeConnectionId) {
                emit('ssh-ui:close-terminal-tab', { connectionId: store.activeConnectionId });
            }
            return true;
        case 'splitPanes':
            if (!store.activeConnectionId) return false;
            store.splitPanes(store.activeConnectionId, 'vertical');
            return true;
        case 'toggleSettings':
            if (store.isSettingsOpen) store.closeSettings();
            else store.openSettings();
            return true;
        case 'commandPalette':
            emit('zync:open-command-palette', { commandMode: false });
            return true;
        case 'commandPaletteMode':
            emit('zync:open-command-palette', { commandMode: true });
            return true;
        case 'aiCommandBar':
            store.toggleAiSidebar();
            return true;
        case 'closeTab':
            if (isEditorOverlayOpen()) {
                return false;
            }
            event.stopPropagation();
            emit('zync:close-active-tab');
            return true;
        case 'switchTabNext': {
            event.stopPropagation();
            const { tabs, activeTabId, activateTab } = store;
            if (tabs.length > 1) {
                const currentIndex = tabs.findIndex((t: Tab) => t.id === activeTabId);
                if (currentIndex !== -1) {
                    activateTab(tabs[(currentIndex + 1) % tabs.length].id);
                }
            }
            return true;
        }
        case 'switchTabPrev': {
            event.stopPropagation();
            const { tabs, activeTabId, activateTab } = store;
            if (tabs.length > 1) {
                const currentIndex = tabs.findIndex((t: Tab) => t.id === activeTabId);
                if (currentIndex !== -1) {
                    activateTab(tabs[(currentIndex - 1 + tabs.length) % tabs.length].id);
                }
            }
            return true;
        }
        case 'termCopy':
            emit('ssh-ui:term-copy');
            return true;
        case 'termPaste':
            emit('ssh-ui:term-paste');
            return true;
        case 'termFind':
            emit('ssh-ui:term-find');
            return true;
        case 'zoomIn':
            void window.ipcRenderer?.invoke('app:zoomIn');
            return true;
        case 'zoomOut':
            void window.ipcRenderer?.invoke('app:zoomOut');
            return true;
        case 'filesFeature':
            return connectionFeature('files');
        case 'tunnelsFeature':
            return connectionFeature('port-forwarding');
        case 'snippetsFeature': {
            const { activeTabId, tabs } = store;
            if (activeTabId) {
                const current = tabs.find((t: Tab) => t.id === activeTabId);
                if (current?.type === 'connection') {
                    emit('ssh-ui:toggle-snippet-sidebar', { tabId: activeTabId });
                }
            }
            return true;
        }
        case 'dashboardFeature':
            return connectionFeature('dashboard');
        default: {
            if (id.startsWith('switchTab')) {
                const index = Number.parseInt(id.slice('switchTab'.length), 10) - 1;
                if (Number.isInteger(index) && store.tabs[index]) {
                    store.activateTab(store.tabs[index].id);
                }
                return true;
            }
            return false;
        }
    }
}
