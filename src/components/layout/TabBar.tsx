import { X, Settings as SettingsIcon, Network, Gift, Plus, Laptop, FolderPlus, Home, Shield, UserRound, ChevronDown, LogOut, RefreshCw, Monitor, Link2 } from 'lucide-react';
import { GoogleMarkIcon } from '../icons/providerIcons';
import { OSIcon } from '../icons/OSIcon';
import { ZyncMark } from '../brand/ZyncMark';
import { LOCAL_TERMINAL_CONNECTION_ID } from '../../features/connections/application/tabService';
import { useAppStore, Tab, Connection } from '../../store/useAppStore'; // Updated Import
import { cn } from '../../lib/utils';
import { WindowControls } from './WindowControls';
import { NotificationBell, useNotificationBellPlacement } from '../notifications/NotificationBell';
import { useState, useEffect, useRef, useCallback } from 'react';

import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { ConfirmModal } from '../ui/ConfirmModal';
import { TopbarDropdown } from '../ui/TopbarDropdown';
import { useWindowDrag } from '../../hooks/useWindowDrag';
import { isEditorOverlayOpen } from '../editor/overlayState';
import { syncIpc, SYNC_STATUS_CHANGED_EVENT, type SyncProviderStatus } from '../../vault/syncIpc';
import { useShareStore } from '../../features/share/useShareStore';
import { parseShareError } from '../../features/share/ipc';
import { PublicUrlsLabel } from '../share/PublicUrlsLabel';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    DragStartEvent,
    DragEndEvent
} from '@dnd-kit/core';
import {
    SortableContext,
    useSortable,
    horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function getIconForTab(tab: Tab, connections: Connection[], size: 12 | 13 = 12) {
    if (tab.type === 'port-forwarding') return <Network size={size} />;
    if (tab.type === 'public-urls') return <Link2 size={size} />;
    if (tab.type === 'settings') return <SettingsIcon size={size} />;
    if (tab.type === 'release-notes') return <Gift size={size} className="text-[var(--color-app-accent)]" />;
    if (tab.type === 'vault') return <Shield size={size} />;
    if (tab.type === 'sync') return <GoogleMarkIcon size={size} variant="mono" />;
    // Local workspace — same Monitor mark as status bar + sidebar
    if (tab.connectionId === LOCAL_TERMINAL_CONNECTION_ID) {
        return <Monitor size={size} className="text-app-muted" />;
    }

    const conn = connections.find((c: Connection) => c.id === tab.connectionId);
    const iconClassName = size === 13 ? "w-[13px] h-[13px]" : "w-[12px] h-[12px]";
    return <OSIcon icon={conn?.icon || 'Server'} className={iconClassName} />;
}

function googleConnectErrorMessage(error: unknown): string {
    const raw = (error instanceof Error ? error.message : String(error ?? 'Unknown error')).trim();
    const normalized = raw.toLowerCase();

    if (normalized.includes('access_denied') || normalized.includes('oauth denied') || normalized.includes('user denied')) {
        return 'Google sign-in was cancelled or access was denied. Retry and approve Drive access on the Google consent screen.';
    }
    if (normalized.includes('popup') && normalized.includes('block')) {
        return 'Google sign-in did not open. Allow the browser window or popup, then retry Connect Google Sync.';
    }
    if (normalized.includes('timed out') || normalized.includes('timeout')) {
        return 'Google sign-in timed out. Check your network and retry Connect Google Sync.';
    }
    if (normalized.includes('network') || normalized.includes('dns') || normalized.includes('connection refused')) {
        return 'Google sync could not reach the network. Check connectivity, proxy, or firewall settings and retry.';
    }

    return raw;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        }),
    ]);
}

// Extract SortableTab component
function SortableTab({
    tab,
    isActive,
    onActivate,
    onClose,
    connections
}: {
    tab: Tab;
    isActive: boolean;
    onActivate: (id: string) => void;
    onClose: (id: string, e: React.MouseEvent) => void;
    connections: Connection[];
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: tab.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 'auto',
        opacity: isDragging ? 0.3 : 1
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={() => onActivate(tab.id)}
            className={cn(
                "group flex items-center gap-1 px-2 py-1 h-7 text-[11px] rounded-md cursor-pointer select-none border border-transparent shrink-0 outline-none drag-none transition-all duration-200",
                isActive
                    ? "bg-app-surface text-app-text shadow-sm font-semibold"
                    : "text-app-muted hover:bg-app-surface/60 hover:text-app-text border-transparent"
            )}
            title={tab.type === 'public-urls' ? 'Public URLs (Beta)' : tab.title}
        >
            {/* Icon based on type */}
            {getIconForTab(tab, connections, 12)}

            {tab.type === 'public-urls' ? (
                <PublicUrlsLabel className="text-[11px] font-semibold max-w-[120px]" />
            ) : (
                <span className="truncate max-w-[90px]">{tab.title}</span>
            )}

            <button
                onClick={(e) => onClose(tab.id, e)}
                // Prevent drag on close button
                onPointerDown={(e) => e.stopPropagation()}
                className={cn(
                    "p-0.5 rounded-sm hover:bg-black/10 dark:hover:bg-white/10 transition-colors",
                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
            >
                <X size={12} />
            </button>
        </div>
    );
}

export function TabBar() {
    // Zustand Integrations
    const tabs = useAppStore(state => state.tabs);
    const activeTabId = useAppStore(state => state.activeTabId);
    const activateTab = useAppStore(state => state.activateTab);
    const handleActivateTab = useCallback((tabId: string) => {
        activateTab(tabId);
    }, [activateTab]);
    const closeTab = useAppStore(state => state.closeTab);
    const connections = useAppStore(state => state.connections);
    const reorderTabs = useAppStore(state => state.reorderTabs);

    // Settings Slice
    const goHome = useAppStore(state => state.goHome);
    const openSettings = useAppStore(state => state.openSettings);
    const openVaultTab = useAppStore(state => state.openVaultTab);
    const openSyncBackupTab = useAppStore(state => state.openSyncBackupTab);
    const openPublicUrlsTab = useAppStore(state => state.openPublicUrlsTab);
    const shareAuth = useShareStore(state => state.auth);
    const shareBusy = useShareStore(state => state.busy);
    const shareHydrate = useShareStore(state => state.hydrate);
    const shareLogout = useShareStore(state => state.logout);
    const setAddConnectionModalOpen = useAppStore(state => state.setAddConnectionModalOpen);
    const showToast = useAppStore(state => state.showToast);
    const { showInTitleLeft, showInTitleRight } = useNotificationBellPlacement();

    const [tabToClose, setTabToClose] = useState<string | null>(null);

    // Add menu state
    const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
    const addMenuRef = useRef<HTMLDivElement>(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const [googleSync, setGoogleSync] = useState<SyncProviderStatus | null>(null);
    const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
    const [isGoogleSyncConnecting, setIsGoogleSyncConnecting] = useState(false);
    const [isGoogleSyncDisconnecting, setIsGoogleSyncDisconnecting] = useState(false);
    const googleSyncOperationRef = useRef<Promise<unknown> | null>(null);

    // Click outside to close the Add menu
    useEffect(() => {
        if (!isAddMenuOpen && !isProfileMenuOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
                setIsAddMenuOpen(false);
            }
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setIsProfileMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isAddMenuOpen, isProfileMenuOpen]);

    useEffect(() => {
        const refreshGoogleSync = () => {
            syncIpc.status('google')
                .then(setGoogleSync)
                .catch(() => setGoogleSync(null));
        };

        refreshGoogleSync();
        void shareHydrate();
        const onSyncStatusChanged = (event: Event) => {
            const detail = (event as CustomEvent<{ provider?: string }>).detail;
            if (!detail?.provider || detail.provider === 'google') {
                refreshGoogleSync();
            }
        };
        window.addEventListener(SYNC_STATUS_CHANGED_EVENT, onSyncStatusChanged);
        return () => window.removeEventListener(SYNC_STATUS_CHANGED_EVENT, onSyncStatusChanged);
    }, [shareHydrate]);

    // Window drag hook for Linux compatibility
    const dragRegionRef = useRef<HTMLDivElement>(null);
    useWindowDrag(dragRegionRef, true);

    const handleCloseTab = (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();

        // Use fresh state
        const state = useAppStore.getState();
        const tab = state.tabs.find((t: Tab) => t.id === id);
        if (!tab) return;

        // Check if it's an active host connection (not Settings, Port Forwarding, or Local)
        if (tab.type === 'connection' && tab.connectionId && tab.connectionId !== 'local') {
            const conn = state.connections.find((c: Connection) => c.id === tab.connectionId);
            if (conn && conn.status === 'connected') {
                setTabToClose(id);
                return;
            }
        }

        // Otherwise close immediately using store action
        state.closeTab(id);
    };

    const confirmClose = () => {
        if (tabToClose) {
            closeTab(tabToClose);
            setTabToClose(null);
        }
    };

    useEffect(() => {
        const onCloseActiveTab = () => {
            if (isEditorOverlayOpen()) {
                return;
            }
            const activeId = useAppStore.getState().activeTabId;
            if (activeId) {
                handleCloseTab(activeId);
            }
        };
        window.addEventListener('zync:close-active-tab', onCloseActiveTab);
        return () => window.removeEventListener('zync:close-active-tab', onCloseActiveTab);
    }, []);


    const [activeDragId, setActiveDragId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = tabs.findIndex(t => t.id === active.id);
            const newIndex = tabs.findIndex(t => t.id === over.id);
            reorderTabs(oldIndex, newIndex);
        }
        setActiveDragId(null);
    };

    const platform = window.electronUtils?.platform || 'linux';
    const isMac = platform === 'darwin';
    const zyncEmail = shareAuth.signed_in && typeof shareAuth.email === 'string'
        ? shareAuth.email
        : undefined;
    const zyncAvatarUrl = shareAuth.signed_in && typeof shareAuth.avatar_url === 'string'
        ? shareAuth.avatar_url
        : undefined;
    const profileAvatarUrl = zyncAvatarUrl || googleSync?.avatarUrl || null;
    const profileInitial = (
        zyncEmail?.trim().charAt(0)
        || googleSync?.email?.trim().charAt(0)
        || 'U'
    ).toUpperCase();

    useEffect(() => {
        setAvatarLoadFailed(false);
    }, [profileAvatarUrl]);

    return (
        <>
            <div ref={dragRegionRef} className={cn(
                "relative z-[60] flex h-10 bg-app-bg items-center pr-1 gap-1 app-drag-region shrink-0 select-none",
                isMac ? "pl-2" : "pl-1"
            )} data-tauri-drag-region>

                {/* macOS Controls on Left (Always at far edge) */}
                {isMac && (
                    <div className="shrink-0 flex items-center pr-2 pl-1">
                        <WindowControls />
                    </div>
                )}

                {/* Brand & Add (Now back on left) */}
                <div className="flex items-center gap-1.5 shrink-0 drag-none px-1">
                    {/* Zync mark → Home on hover (single control) */}
                    <Tooltip content="Welcome Screen" position="bottom">
                        <button
                            type="button"
                            onClick={goHome}
                            aria-label="Go to welcome screen"
                            className="group relative h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-app-muted hover:text-app-text hover:bg-app-surface border border-transparent hover:border-app-border/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
                        >
                            <span className="absolute inset-0 flex items-center justify-center opacity-90 transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0">
                                <ZyncMark size={20} variant="theme" frame="bare" />
                            </span>
                            <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                                <Home size={14} />
                            </span>
                        </button>
                    </Tooltip>

                    {showInTitleLeft && <NotificationBell tooltipPosition="bottom" size="title" />}

                    {/* Add New Button */}
                    <div className="relative shrink-0" ref={addMenuRef}>
                        <Tooltip content="Add New..." position="bottom" disabled={isAddMenuOpen}>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                                className={cn(
                                    "h-7 w-7 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 focus-visible:ring-offset-0",
                                    isAddMenuOpen
                                        ? "bg-app-accent/20 text-app-text"
                                        : "text-app-muted hover:bg-app-surface hover:text-app-text"
                                )}
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </Tooltip>

                        {isAddMenuOpen && (
                            <TopbarDropdown widthClass="w-48">
                                <button
                                    onClick={() => { setAddConnectionModalOpen(true); setIsAddMenuOpen(false); }}
                                    className="w-full text-left px-3 py-2 text-xs font-medium text-app-text hover:bg-black/5 dark:hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors"
                                >
                                    <Laptop size={13} className="text-app-muted" />
                                    <span>New Host</span>
                                </button>
                                <button
                                    onClick={() => { window.dispatchEvent(new Event('ssh-ui:open-folder-modal')); setIsAddMenuOpen(false); }}
                                    className="w-full text-left px-3 py-2 text-xs font-medium text-app-text hover:bg-black/5 dark:hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors"
                                >
                                    <FolderPlus size={13} className="text-app-muted" />
                                    <span>New Folder</span>
                                </button>
                                
                                <div className="h-px bg-app-border/40 my-1 mx-2" />
                                
                                <button
                                    onClick={() => { window.dispatchEvent(new Event('ssh-ui:open-new-tunnel')); setIsAddMenuOpen(false); }}
                                    className="w-full text-left px-3 py-2 text-xs font-medium text-app-text hover:bg-black/5 dark:hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors"
                                >
                                    <Network size={13} className="text-app-muted" />
                                    <span>New Tunnel</span>
                                </button>
                            </TopbarDropdown>
                        )}
                    </div>
                </div>

                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <div
                        className="flex items-center gap-1 flex-1 overflow-x-auto no-scrollbar min-w-0 h-full"
                        onDoubleClick={() => {
                            window.ipcRenderer?.send('window:maximize');
                        }}
                        data-tauri-drag-region
                    >
                        <SortableContext
                            items={tabs.map(t => t.id)}
                            strategy={horizontalListSortingStrategy}
                        >
                            {tabs.map((tab) => (
                                <SortableTab
                                    key={tab.id}
                                    tab={tab}
                                    isActive={activeTabId === tab.id}
                                    onActivate={handleActivateTab}
                                    onClose={handleCloseTab}
                                    connections={connections}
                                />
                            ))}
                        </SortableContext>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 drag-none px-1">
                        {/* Header Actions (sidebar + AI toggles live in the bottom status bar) */}
                        <div className="flex items-center gap-1">
                            {showInTitleRight && <NotificationBell tooltipPosition="bottom" size="title" />}
                            {/* Profile / Sync */}
                            <div className="relative" ref={profileMenuRef}>
                                <Tooltip content="Profile & Sync" position="bottom" disabled={isProfileMenuOpen}>
                                    <button
                                        onClick={() => setIsProfileMenuOpen(open => !open)}
                                        className={cn(
                                            "h-7 px-2 shrink-0 rounded-md text-app-muted hover:text-app-text hover:bg-app-surface border border-transparent hover:border-app-border/40 transition-colors drag-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 focus-visible:ring-offset-0 flex items-center justify-center gap-1.5",
                                            isProfileMenuOpen && "bg-app-surface text-app-text border-app-border/40"
                                        )}
                                        aria-label="Profile and sync menu"
                                    >
                                        <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-app-accent/20 border border-app-accent/40 text-[10px] font-bold text-app-text overflow-hidden shadow-sm">
                                            {profileAvatarUrl && !avatarLoadFailed ? (
                                                <img
                                                    src={profileAvatarUrl}
                                                    alt="Profile"
                                                    className="h-full w-full object-cover"
                                                    referrerPolicy="no-referrer"
                                                    onError={() => setAvatarLoadFailed(true)}
                                                />
                                            ) : zyncEmail || googleSync?.email ? (
                                                profileInitial
                                            ) : (
                                                <UserRound size={10} />
                                            )}
                                        </span>
                                        <ChevronDown size={12} />
                                    </button>
                                </Tooltip>

                                {isProfileMenuOpen && (
                                    <TopbarDropdown align="right" widthClass="w-64">
                                        <button
                                            onClick={() => {
                                                openSettings();
                                                setIsProfileMenuOpen(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-app-text hover:bg-black/5 dark:hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors"
                                        >
                                            <SettingsIcon size={13} className="text-app-muted" />
                                            <span>Settings</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                openVaultTab('local');
                                                setIsProfileMenuOpen(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-app-text hover:bg-black/5 dark:hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors"
                                        >
                                            <Shield size={13} className="text-app-muted" />
                                            <span>Vault Credentials</span>
                                        </button>
                                        <div className="h-px bg-app-border/40 my-1 mx-1" />
                                        <button
                                            onClick={() => {
                                                openSyncBackupTab();
                                                setIsProfileMenuOpen(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-app-text hover:bg-black/5 dark:hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors"
                                        >
                                            <GoogleMarkIcon size={13} variant="mono" className="text-app-muted shrink-0" />
                                            <span className="min-w-0">
                                                <span className="block">Sync & Backup</span>
                                                <span className="block text-[10px] font-normal text-app-muted truncate">
                                                    {googleSync?.email || 'Google Drive'}
                                                </span>
                                            </span>
                                        </button>
                                        {!googleSync?.connected && (
                                            <button
                                                onClick={async () => {
                                                    if (googleSyncOperationRef.current) return;
                                                    setIsGoogleSyncConnecting(true);
                                                    const originalPromise = syncIpc.connect('google');
                                                    googleSyncOperationRef.current = originalPromise;
                                                    void originalPromise
                                                        .catch(error => console.warn('[Sync] Google connect completed with an error:', error))
                                                        .finally(() => {
                                                            if (googleSyncOperationRef.current === originalPromise) {
                                                                googleSyncOperationRef.current = null;
                                                                setIsGoogleSyncConnecting(false);
                                                            }
                                                        });
                                                    try {
                                                        await withTimeout(
                                                            originalPromise,
                                                            30000,
                                                            'Google sync connection timed out'
                                                        );
                                                        showToast('success', 'Google sync connected');
                                                    } catch (error) {
                                                        showToast('error', googleConnectErrorMessage(error));
                                                    } finally {
                                                        setIsProfileMenuOpen(false);
                                                    }
                                                }}
                                                disabled={isGoogleSyncConnecting}
                                                className="w-full text-left px-3 py-2 text-xs font-medium text-app-text hover:bg-black/5 dark:hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-60"
                                            >
                                                {isGoogleSyncConnecting ? (
                                                    <RefreshCw size={13} className="text-app-muted animate-spin" />
                                                ) : (
                                                    <Network size={13} className="text-app-muted" />
                                                )}
                                                <span>{isGoogleSyncConnecting ? 'Connecting…' : 'Connect Google Drive'}</span>
                                            </button>
                                        )}
                                        {googleSync?.connected && (
                                            <button
                                                onClick={async () => {
                                                    if (googleSyncOperationRef.current) return;
                                                    setIsGoogleSyncDisconnecting(true);
                                                    const originalPromise = syncIpc.disconnect('google');
                                                    googleSyncOperationRef.current = originalPromise;
                                                    void originalPromise
                                                        .catch(error => console.warn('[Sync] Google disconnect completed with an error:', error))
                                                        .finally(() => {
                                                            if (googleSyncOperationRef.current === originalPromise) {
                                                                googleSyncOperationRef.current = null;
                                                                setIsGoogleSyncDisconnecting(false);
                                                            }
                                                        });
                                                    try {
                                                        await withTimeout(
                                                            originalPromise,
                                                            15000,
                                                            'Google sync disconnect timed out'
                                                        );
                                                        showToast('success', 'Google sync disconnected');
                                                    } catch (error) {
                                                        showToast('error', googleConnectErrorMessage(error));
                                                    } finally {
                                                        setIsProfileMenuOpen(false);
                                                    }
                                                }}
                                                disabled={isGoogleSyncDisconnecting}
                                                className="w-full text-left px-3 py-2 text-xs font-medium text-red-300 hover:text-red-200 hover:bg-red-500/10 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-60"
                                            >
                                                {isGoogleSyncDisconnecting ? (
                                                    <RefreshCw size={13} className="animate-spin" />
                                                ) : (
                                                    <LogOut size={13} />
                                                )}
                                                <span>{isGoogleSyncDisconnecting ? 'Disconnecting…' : 'Disconnect Drive'}</span>
                                            </button>
                                        )}
                                        <div className="h-px bg-app-border/40 my-1 mx-1" />
                                        <button
                                            onClick={() => {
                                                openPublicUrlsTab();
                                                setIsProfileMenuOpen(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-xs font-medium text-app-text hover:bg-black/5 dark:hover:bg-white/10 rounded-lg flex items-center gap-2 transition-colors"
                                        >
                                            {shareAuth.signed_in && shareAuth.avatar_url ? (
                                                <img
                                                    src={shareAuth.avatar_url}
                                                    alt=""
                                                    className="h-[13px] w-[13px] rounded-full object-cover shrink-0"
                                                    referrerPolicy="no-referrer"
                                                />
                                            ) : (
                                                <Link2 size={13} className="text-app-muted shrink-0" />
                                            )}
                                            <span className="min-w-0">
                                                <span className="block">
                                                    <PublicUrlsLabel className="text-xs font-medium" />
                                                </span>
                                                <span className="block text-[10px] font-normal text-app-muted truncate">
                                                    {shareAuth.signed_in
                                                        ? 'Signed in to Zync'
                                                        : 'Sign in to Zync'}
                                                </span>
                                            </span>
                                        </button>
                                        {shareAuth.signed_in && (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await shareLogout();
                                                        showToast('success', 'Signed out of Zync');
                                                    } catch (error) {
                                                        showToast('error', parseShareError(error).message);
                                                    } finally {
                                                        setIsProfileMenuOpen(false);
                                                    }
                                                }}
                                                disabled={shareBusy}
                                                className="w-full text-left px-3 py-2 text-xs font-medium text-red-300 hover:text-red-200 hover:bg-red-500/10 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-60"
                                            >
                                                <LogOut size={13} />
                                                <span>Sign out of Zync</span>
                                            </button>
                                        )}
                                    </TopbarDropdown>
                                )}
                            </div>

                            {/* Windows/Linux Controls inline with app actions */}
                            {!isMac && (
                                <div className="shrink-0 self-stretch flex flex-col justify-center">
                                    <WindowControls className="px-0" />
                                </div>
                            )}
                        </div>
                    </div>
                    <DragOverlay>
                        {activeDragId ? (
                            <div className="opacity-80">
                                {(() => {
                                    const tab = tabs.find(t => t.id === activeDragId);
                                    if (!tab) return null;
                                    return (
                                        <div className="flex items-center gap-2 px-2.5 py-1.5 h-8 text-sm rounded-md bg-app-surface text-app-text shadow-lg font-medium border border-app-border/50">
                                            {getIconForTab(tab, connections, 13)}
                                            {tab.type === 'public-urls' ? (
                                                <PublicUrlsLabel className="text-sm font-medium max-w-[140px]" />
                                            ) : (
                                                <span className="truncate max-w-[120px]">{tab.title}</span>
                                            )}
                                            <div className="p-0.5">
                                                <X size={12} />
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>

            </div>

            <ConfirmModal
                isOpen={!!tabToClose}
                onClose={() => setTabToClose(null)}
                onConfirm={confirmClose}
                title="Disconnect & Close?"
                message="This will disconnect the active SSH session."
                confirmLabel="Disconnect"
                variant="danger"
            />
        </>
    );
}
