import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useAppStore, Connection, Folder } from '../../store/useAppStore';
import { Files, Info, Network, PanelLeft, Pencil, Plus, Power, RefreshCw, Search, Server, TerminalIcon, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';
import { ConfirmModal } from '../ui/ConfirmModal';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { buildTree } from './sidebar/buildTree';
import { SidebarSection } from './sidebar/SidebarSection';
import { ConnectionItem } from './sidebar/ConnectionItem';
import { FolderItem } from './sidebar/FolderItem';
import { FolderFormModal } from './sidebar/FolderFormModal';
import { SidebarActionButton } from './sidebar/SidebarActionButton';
import { VaultNavSection } from './sidebar/VaultNavSection';
import { RemoteHostItem } from './sidebar/RemoteHostItem';
import { sortConnectionsByLiveFirst } from './sidebar/sortConnections';
import { AddConnectionModal } from '../modals/AddConnectionModal';
import { AddTunnelModal } from '../modals/AddTunnelModal';
import {
    connectionLogicalId,
    normalizeFolderPath,
    type HostCatalogEntry,
    type HostCatalogFilter,
} from '../../features/connections/domain';
import { materializeHostsOnDevice } from '../../features/connections/domain/hostMaterialize';
import { useHostCatalog } from '../../features/connections/presentation/useHostCatalog';
import {
    exportConnectionsToFileIpc,
    type ConnectionExchangeExportFormat,
} from '../../features/connections/infrastructure/connectionTransfer';
import { FEATURE_META, type FeatureId } from './featureMeta';
import { GLOBAL_SNIPPETS_CONNECTION_ID, LOCAL_TERMINAL_CONNECTION_ID } from '../../features/connections/application/tabService';

// Lazy Load Modals
const SettingsModal = lazy(() => import('../settings/SettingsModal').then(mod => ({ default: mod.SettingsModal })));
const ConnectionDetailsModal = lazy(() => import('../modals/ConnectionDetailsModal').then(mod => ({ default: mod.ConnectionDetailsModal })));
const ExportConnectionsModal = lazy(() => import('../modals/ExportConnectionsModal').then(mod => ({ default: mod.ExportConnectionsModal })));

const FEATURE_ITEMS: Array<{ id: FeatureId; label: string }> = [
    { id: 'files', label: 'File Manager' },
    { id: 'port-forwarding', label: 'Port Forwarding' },
    { id: 'snippets', label: 'Snippets' },
    { id: 'dashboard', label: 'Dashboard' },
];


const HOST_FILTERS: Array<{ id: HostCatalogFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'local', label: 'Local' },
    { id: 'remote', label: 'Remote' },
];

/** Collapsed sidebar icon rail width (keeps nav reachable). */
const SIDEBAR_RAIL_WIDTH = 52;

export function Sidebar({ className }: { className?: string }) {
    const [viewingDetailsId, setViewingDetailsId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Connection Store Hooks
    const connections = useAppStore(state => state.connections);
    const activeConnectionId = useAppStore(state => state.activeConnectionId);
    const openTab = useAppStore(state => state.openTab);
    const openPortForwardingTab = useAppStore(state => state.openPortForwardingTab);
    const folders = useAppStore(state => state.folders);
    const addFolder = useAppStore(state => state.addFolder);
    const updateConnectionFolder = useAppStore(state => state.updateConnectionFolder);
    const deleteFolder = useAppStore(state => state.deleteFolder);
    const deleteConnection = useAppStore(state => state.deleteConnection);
    const renameFolder = useAppStore(state => state.renameFolder);
    const connect = useAppStore(state => state.connect);
    const disconnect = useAppStore(state => state.disconnect);
    const loadConnections = useAppStore(state => state.loadConnections);
    
    // Settings Store Hooks
    const settings = useAppStore(state => state.settings);
    const updateSettings = useAppStore(state => state.updateSettings);
    const showToast = useAppStore(state => state.showToast);
    
    // Modal open/close actions extracted from store
    const isSettingsOpen = useAppStore(state => state.isSettingsOpen);
    const closeSettings = useAppStore(state => state.closeSettings);
    const isAddConnectionModalOpen = useAppStore(state => state.isAddConnectionModalOpen);
    const editingConnectionId      = useAppStore(state => state.editingConnectionId);
    const openConnectionModal      = useAppStore(state => state.openConnectionModal);
    const setAddConnectionModalOpen = useAppStore(state => state.setAddConnectionModalOpen);
    const closeAddConnectionModal = useCallback(() => {
        setAddConnectionModalOpen(false);
    }, [setAddConnectionModalOpen]);

    const compactMode = settings.compactMode;
    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);

    const [isRenameFolderModalOpen, setIsRenameFolderModalOpen] = useState(false);
    const [folderToRename, setFolderToRename] = useState<string | null>(null);
    const isCollapsed = settings.sidebarCollapsed;

    const [isAddTunnelModalOpen, setIsAddTunnelModalOpen] = useState(false);
    const [deletingConnection, setDeletingConnection] = useState<Connection | null>(null);
    const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
    const [connectionContextMenu, setConnectionContextMenu] = useState<{ x: number; y: number; connectionId: string } | null>(null);
    const [allHostsContextMenu, setAllHostsContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [folderContextMenu, setFolderContextMenu] = useState<{ x: number; y: number; folderPath: string } | null>(null);
    const [exportModalState, setExportModalState] = useState<{
        title: string;
        scopeKey: string;
        scopeLabel: string;
        defaultFileBaseName: string;
        connections: Connection[];
    } | null>(null);

    // Resize Logic
    const [width, setWidth] = useState(settings.sidebarWidth || 288);
    const [isResizing, setIsResizing] = useState(false);
    const widthRef = useRef(width);

    useEffect(() => {
        widthRef.current = width;
    }, [width]);

    const sidebarRef = useRef<HTMLDivElement>(null);
    const hostListRef = useRef<HTMLDivElement>(null);
    const typeaheadRef = useRef({ buffer: '', timer: 0 as ReturnType<typeof setTimeout> | undefined });

    // Sync width if settings change externally (e.g. via reset)
    useEffect(() => {
        if (settings.sidebarWidth && !isResizing) {
            setWidth(settings.sidebarWidth);
            widthRef.current = settings.sidebarWidth;
        }
    }, [settings.sidebarWidth, isResizing]);

    const startResizing = useCallback((e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
        document.body.style.cursor = 'col-resize';
        window.dispatchEvent(new CustomEvent('zync:layout-transition-start'));
    }, []);

    useEffect(() => {
        if (!isResizing) return;

        const resize = (e: MouseEvent) => {
            const newWidth = Math.max(200, Math.min(e.clientX, 600)); // Clamp between 200px and 600px
            widthRef.current = newWidth;
            setWidth(newWidth);
        };

        const stopResizing = () => {
            setIsResizing(false);
            document.body.style.cursor = '';
            // Save final width
            updateSettings({ sidebarWidth: widthRef.current });
            // Notify terminal that layout is now stable
            window.dispatchEvent(new CustomEvent('zync:layout-transition-end'));
        };

        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);

        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, updateSettings]);

    const hostCatalog = useHostCatalog(connections, searchTerm);
    const {
        filter: hostFilter,
        setFilter: setHostFilter,
        localConnections: catalogLocalConnections,
        remoteOnlyEntries,
        locationsByLogicalId,
        inventoryStatus,
        inventoryFromCache,
        inventoryError,
        providerConnected,
        refreshInventory,
        materializingIds,
        setMaterializing,
        filteredEntries,
        entries: catalogEntries,
    } = hostCatalog;

    // Without a provider, All/Local/Remote filters are meaningless — force All.
    useEffect(() => {
        if (!providerConnected && hostFilter !== 'all') {
            setHostFilter('all');
        }
    }, [providerConnected, hostFilter, setHostFilter]);

    const filteredHostCount = filteredEntries.length;
    const totalHostCount = catalogEntries.length;
    const hasAnyHosts = totalHostCount > 0;

    const materializeHost = useCallback(async (
        entry: HostCatalogEntry,
        options: { silentSuccess?: boolean; openAfter?: boolean },
    ) => {
        setMaterializing(entry.logicalId, true);
        try {
            const result = await materializeHostsOnDevice({
                logicalIds: [entry.logicalId],
                includeBundle: false,
                silentSuccess: options.silentSuccess,
                showToast,
                loadConnections,
            });
            if (options.openAfter && result.ok) {
                // Unblock UI and open before any inventory re-list.
                setMaterializing(entry.logicalId, false);
                openTab(entry.logicalId);
                void refreshInventory();
                return;
            }
            // Keep-only: inventory refresh is non-blocking (Drive re-list felt slow).
            void refreshInventory();
        } finally {
            setMaterializing(entry.logicalId, false);
        }
    }, [loadConnections, openTab, refreshInventory, setMaterializing, showToast]);

    const handleKeepOnDevice = useCallback(async (entry: HostCatalogEntry) => {
        await materializeHost(entry, { silentSuccess: false, openAfter: false });
    }, [materializeHost]);

    const handleKeepAndConnect = useCallback(async (entry: HostCatalogEntry) => {
        // Fast path: host + credentials only (no tunnels/snippets). Open tab ASAP.
        await materializeHost(entry, { silentSuccess: true, openAfter: true });
    }, [materializeHost]);

    const openEditConnection = useCallback((conn: Connection) => {
        openConnectionModal(conn.id);
    }, [openConnectionModal]);

    // Listen for global events (Command Palette)
    useEffect(() => {
        const handleOpenFolder = () => setIsFolderModalOpen(true);
        const handleOpenTunnel = () => setIsAddTunnelModalOpen(true);

        window.addEventListener('ssh-ui:open-folder-modal', handleOpenFolder);
        window.addEventListener('ssh-ui:open-new-tunnel', handleOpenTunnel);

        return () => {
            window.removeEventListener('ssh-ui:open-folder-modal', handleOpenFolder);
            window.removeEventListener('ssh-ui:open-new-tunnel', handleOpenTunnel);
        };
    }, []);

    // Filter out active connections for the main tree; respect catalog filter (local subset).
    const treeConnections = useMemo(() => {
        return catalogLocalConnections.filter((c: Connection) => c.status !== 'connected');
    }, [catalogLocalConnections]);

    // Build Recursive Tree (search already applied in catalog; re-apply for tree safety)
    const treeRoot = useMemo(
        () => buildTree(treeConnections, folders, searchTerm),
        [treeConnections, folders, searchTerm],
    );

    const toggleExpandedFolder = useAppStore(state => state.toggleExpandedFolder);

    const expandedFolders = useMemo(() => new Set(settings.expandedFolders), [settings.expandedFolders]);

    const toggleFolder = useCallback((folderPath: string) => {
        toggleExpandedFolder(folderPath);
    }, [toggleExpandedFolder]);

    const handleAllHostsDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const connId = e.dataTransfer.getData('connection-id');
        const folderPath = e.dataTransfer.getData('folder-path');

        if (connId) {
            updateConnectionFolder(connId, '');
        } else if (folderPath) {
            // Move folder to root -> Rename to just its basename
            const baseName = folderPath.split('/').pop();
            if (baseName && baseName !== folderPath) {
                renameFolder(folderPath, baseName);
            }
        }
    }, [renameFolder, updateConnectionFolder]);

    const handleAllHostsDragOver = useCallback((e: React.DragEvent) => {
        const types = Array.from(e.dataTransfer.types || []);
        if (types.includes('connection-id') || types.includes('folder-path')) {
            e.preventDefault();
        }
    }, []);

    const handleRenameFolder = useCallback((path: string) => {
        setFolderToRename(path);
        setIsRenameFolderModalOpen(true);
    }, []);

    const openConnectionContextMenu = useCallback((conn: Connection, x: number, y: number) => {
        setConnectionContextMenu({ x, y, connectionId: conn.id });
    }, []);

    const contextMenuConnection = useMemo(() => {
        if (!connectionContextMenu) return null;
        return connections.find((c: Connection) => c.id === connectionContextMenu.connectionId) || null;
    }, [connectionContextMenu, connections]);

    const exportConnections = useCallback(async (
        format: ConnectionExchangeExportFormat,
        options?: { connectionIds?: string[]; baseName?: string; includeSecrets?: boolean },
    ) => {
        const baseName = options?.baseName?.trim() || 'connections';
        const extension = format === 'csv'
            ? 'csv'
            : format === 'json'
                ? 'json'
                : format === 'zync'
                    ? 'zync.json'
                    : 'config';
        const filePath = await saveDialog({
            defaultPath: `${baseName}.${extension}`,
        });
        if (!filePath) return;

        try {
            await exportConnectionsToFileIpc({
                path: filePath,
                format,
                connectionIds: options?.connectionIds,
                includeSecrets: options?.includeSecrets,
            });
            showToast('success', 'Connections exported to file.');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            showToast('error', `Failed to export connections: ${message}`);
        }
    }, [showToast]);

    const toFileBaseName = useCallback((value: string, fallback: string) => {
        const normalized = value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        return normalized || fallback;
    }, []);

    const getExportableConnectionsForFolder = useCallback((folderPath: string) => {
        const normalizedFolder = normalizeFolderPath(folderPath);
        if (!normalizedFolder) return [] as Connection[];
        return connections.filter((connection) => {
            if (connection.id === 'local') return false;
            const connectionFolder = normalizeFolderPath(connection.folder || '');
            return connectionFolder === normalizedFolder || connectionFolder.startsWith(`${normalizedFolder}/`);
        });
    }, [connections]);

    useEffect(() => {
        if (!connectionContextMenu) return;
        if (contextMenuConnection) return;
        setConnectionContextMenu(null);
    }, [connectionContextMenu, contextMenuConnection]);

    const connectionContextMenuItems = useMemo<ContextMenuItem[]>(() => {
        if (!contextMenuConnection) return [];

        return [
            {
                label: contextMenuConnection.status === 'connected' ? 'Disconnect' : 'Connect',
                icon: (
                    <Power
                        size={14}
                        className={contextMenuConnection.status === 'connected' ? 'text-red-400' : 'text-emerald-400'}
                    />
                ),
                action: () => {
                    if (contextMenuConnection.status === 'connected') {
                        disconnect(contextMenuConnection.id);
                        return;
                    }
                    connect(contextMenuConnection.id);
                    openTab(contextMenuConnection.id);
                }
            },
            {
                label: 'Details',
                icon: <Info size={14} />,
                action: () => setViewingDetailsId(contextMenuConnection.id)
            },
            { separator: true },
            ...FEATURE_ITEMS.map(({ id, label }) => {
                const Icon = FEATURE_META[id].icon;
                return {
                    label,
                    icon: <Icon size={14} />,
                    action: () => openTab(contextMenuConnection.id, id),
                };
            }),
            { separator: true },
            {
                label: 'Edit',
                icon: <Pencil size={14} />,
                action: () => openEditConnection(contextMenuConnection)
            },
            {
                label: 'Export...',
                icon: <Files size={14} />,
                action: () => {
                    setExportModalState({
                        title: 'Export Connections',
                        scopeKey: `connection:${contextMenuConnection.id}`,
                        scopeLabel: `Connection: ${contextMenuConnection.name || contextMenuConnection.host}`,
                        defaultFileBaseName: toFileBaseName(
                            contextMenuConnection.name || contextMenuConnection.host || 'connection',
                            'connection',
                        ),
                        connections: [contextMenuConnection],
                    });
                },
            },
            {
                label: 'Delete',
                icon: <Trash2 size={14} />,
                variant: 'danger',
                action: () => setDeletingConnection(contextMenuConnection)
            }
        ];
    }, [connect, contextMenuConnection, disconnect, openEditConnection, openTab, toFileBaseName]);

    const folderContextMenuItems = useMemo<ContextMenuItem[]>(() => {
        if (!folderContextMenu) return [];
        const folderConnections = getExportableConnectionsForFolder(folderContextMenu.folderPath);
        return [
            {
                label: 'Export...',
                icon: <Files size={14} />,
                disabled: folderConnections.length === 0,
                action: () => {
                    setExportModalState({
                        title: 'Export Connections',
                        scopeKey: `folder:${folderContextMenu.folderPath}`,
                        scopeLabel: `Folder: ${folderContextMenu.folderPath}`,
                        defaultFileBaseName: toFileBaseName(folderContextMenu.folderPath, 'folder-connections'),
                        connections: folderConnections,
                    });
                },
            },
            { separator: true },
            {
                label: 'Rename',
                icon: <Pencil size={14} />,
                action: () => handleRenameFolder(folderContextMenu.folderPath),
            },
            {
                label: 'Delete',
                icon: <Trash2 size={14} />,
                variant: 'danger',
                action: () => setDeletingFolder(folderContextMenu.folderPath),
            },
        ];
    }, [folderContextMenu, getExportableConnectionsForFolder, toFileBaseName]);

    const allHostsContextMenuItems = useMemo<ContextMenuItem[]>(() => {
        if (!allHostsContextMenu) return [];
        const allHostConnections = connections.filter((connection) => connection.id !== 'local');
        return [
            {
                label: 'New host',
                icon: <Plus size={14} />,
                action: () => openConnectionModal(),
            },
            {
                label: 'Export...',
                icon: <Files size={14} />,
                disabled: allHostConnections.length === 0,
                action: () => {
                    setExportModalState({
                        title: 'Export Connections',
                        scopeKey: 'all-hosts',
                        scopeLabel: 'All Hosts',
                        defaultFileBaseName: 'all-hosts',
                        connections: allHostConnections,
                    });
                },
            },
        ];
    }, [allHostsContextMenu, connections, openConnectionModal]);

    const connectionItemProps = useMemo(() => ({
        onEdit: openEditConnection,
        onOpenContextMenu: openConnectionContextMenu,
        getLocations: (conn: Connection) => locationsByLogicalId.get(connectionLogicalId(conn)),
    }), [locationsByLogicalId, openEditConnection, openConnectionContextMenu]);

    const inventoryHint = useMemo(() => {
        if (inventoryStatus === 'loading' && !inventoryFromCache) return 'Loading remote hosts…';
        if (inventoryStatus === 'not_configured') {
            return 'Set up Google encryption in Sync & Backup to list remote hosts.';
        }
        if (inventoryStatus === 'locked') {
            return inventoryFromCache
                ? 'Showing last-known remote hosts · unlock Google encryption to refresh.'
                : 'Unlock Google encryption in Sync & Backup to list remote hosts.';
        }
        if (inventoryStatus === 'cached') {
            return 'Showing last-known remote hosts.';
        }
        if (inventoryStatus === 'unavailable') {
            return inventoryFromCache ? 'Showing last-known remote hosts · provider offline.' : null;
        }
        if (inventoryStatus === 'error') {
            if (inventoryFromCache) return 'Showing last-known remote hosts · refresh failed.';
            return inventoryError ?? 'Could not load remote hosts.';
        }
        return null;
    }, [inventoryError, inventoryFromCache, inventoryStatus]);

    const searchPlaceholder = useMemo(() => {
        if (filteredHostCount <= 0) return 'Search hosts';
        const n = filteredHostCount > 99 ? '99+' : String(filteredHostCount);
        return `Search ${n} host${filteredHostCount === 1 ? '' : 's'}`;
    }, [filteredHostCount]);

    const emptyListMessage = useMemo(() => {
        if (searchTerm.trim()) {
            return {
                title: 'No matches',
                detail: 'Try a different search.',
            };
        }
        if (providerConnected && hostFilter === 'local') {
            return {
                title: 'No local hosts',
                detail: 'Hosts only on a provider appear under Remote. Keep one to use it here.',
            };
        }
        if (providerConnected && hostFilter === 'remote') {
            if (inventoryStatus === 'not_configured') {
                return {
                    title: 'Encryption not set up',
                    detail: 'Open Sync & Backup and set up Google encryption first.',
                };
            }
            if (inventoryStatus === 'locked') {
                return {
                    title: 'Encryption locked',
                    detail: 'Unlock Google encryption in Sync & Backup, then refresh.',
                };
            }
            if (inventoryStatus === 'error') {
                return {
                    title: 'Could not load remote hosts',
                    detail: inventoryError
                        ?? 'Refresh failed. Check encryption passphrase and try again.',
                };
            }
            if (inventoryStatus === 'loading') {
                return {
                    title: 'Loading remote hosts…',
                    detail: 'Fetching encrypted host list from the provider.',
                };
            }
            return {
                title: 'No remote hosts',
                detail: 'This collection has no host records, or refresh to try again.',
            };
        }
        if (!hasAnyHosts) {
            return {
                title: 'No hosts yet',
                detail: providerConnected
                    ? 'Use New host above, or refresh Remote after unlocking sync.'
                    : 'Use New host above to get started.',
            };
        }
        return {
            title: 'Nothing here',
            detail: 'No hosts match the current view.',
        };
    }, [hasAnyHosts, hostFilter, inventoryError, inventoryStatus, providerConnected, searchTerm]);

    const allHostsToolbar = useMemo(() => (
        <div className="space-y-1.5">
            {/* Empty catalog — primary CTA lives here; otherwise + is on the section header */}
            {!hasAnyHosts && (
                <button
                    type="button"
                    onClick={() => openConnectionModal()}
                    className={cn(
                        'flex w-full items-center justify-center gap-1.5 rounded-md px-2.5 py-2',
                        'text-[12px] font-medium',
                        'bg-app-accent/12 text-app-accent hover:bg-app-accent/18 transition-colors',
                    )}
                >
                    <Plus size={14} aria-hidden />
                    New host
                </button>
            )}
            {(hasAnyHosts || searchTerm.trim()) && (
                <div className="relative">
                    <Search
                        size={13}
                        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-app-muted/50"
                        aria-hidden="true"
                    />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        aria-label="Search hosts"
                        placeholder={searchPlaceholder}
                        className={cn(
                            'w-full rounded-md border border-app-border/25 bg-app-bg/40',
                            'py-1.5 pl-8 pr-3 text-[12px] text-app-text',
                            'placeholder:text-app-muted/45',
                            'focus:border-app-accent/45 focus:bg-app-bg/55 focus:outline-none',
                        )}
                    />
                </div>
            )}
            {providerConnected && (
                <div className="flex items-center gap-1">
                    <div
                        className="inline-flex min-w-0 flex-1 rounded-md bg-app-bg/35 p-0.5"
                        role="tablist"
                        aria-label="Host location filter"
                    >
                        {HOST_FILTERS.map(item => (
                            <button
                                key={item.id}
                                type="button"
                                role="tab"
                                aria-selected={hostFilter === item.id}
                                onClick={() => setHostFilter(item.id)}
                                className={cn(
                                    'min-w-0 flex-1 truncate rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors',
                                    hostFilter === item.id
                                        ? 'bg-app-surface/90 text-app-text shadow-sm'
                                        : 'text-app-muted hover:text-app-text',
                                )}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => { void refreshInventory(); }}
                        className={cn(
                            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                            'text-app-muted hover:bg-app-surface/50 hover:text-app-text',
                        )}
                        title="Refresh provider host list"
                        aria-label="Refresh provider host list"
                    >
                        <RefreshCw size={13} className={cn(inventoryStatus === 'loading' && 'animate-spin')} />
                    </button>
                </div>
            )}
        </div>
    ), [
        hasAnyHosts,
        hostFilter,
        inventoryStatus,
        openConnectionModal,
        providerConnected,
        refreshInventory,
        searchPlaceholder,
        searchTerm,
        setHostFilter,
    ]);

    useEffect(() => {
        return () => {
            if (typeaheadRef.current.timer) clearTimeout(typeaheadRef.current.timer);
        };
    }, []);

    const handleHostListKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
        const root = hostListRef.current;
        if (!root) return;

        const items = Array.from(root.querySelectorAll<HTMLElement>('[data-host-row="1"]'));
        if (!items.length) return;

        const active = document.activeElement as HTMLElement | null;
        let idx = items.findIndex((el) => el === active || el.contains(active));

        if (event.key === 'ArrowDown' || event.key === 'j') {
            if (event.key === 'j' && (event.target as HTMLElement)?.tagName === 'INPUT') return;
            event.preventDefault();
            const next = idx < 0 ? 0 : Math.min(items.length - 1, idx + 1);
            items[next]?.focus();
            return;
        }
        if (event.key === 'ArrowUp' || event.key === 'k') {
            if (event.key === 'k' && (event.target as HTMLElement)?.tagName === 'INPUT') return;
            event.preventDefault();
            const next = idx < 0 ? items.length - 1 : Math.max(0, idx - 1);
            items[next]?.focus();
            return;
        }
        if (event.key === 'Home') {
            event.preventDefault();
            items[0]?.focus();
            return;
        }
        if (event.key === 'End') {
            event.preventDefault();
            items[items.length - 1]?.focus();
            return;
        }

        // Type-ahead: jump to host whose label starts with the typed buffer.
        if (
            event.key.length === 1
            && !event.ctrlKey
            && !event.metaKey
            && !event.altKey
            && (event.target as HTMLElement)?.tagName !== 'INPUT'
        ) {
            const ch = event.key.toLocaleLowerCase();
            if (!/[\p{L}\p{N}._-]/u.test(ch)) return;

            if (typeaheadRef.current.timer) clearTimeout(typeaheadRef.current.timer);
            typeaheadRef.current.buffer = `${typeaheadRef.current.buffer}${ch}`;
            typeaheadRef.current.timer = setTimeout(() => {
                typeaheadRef.current.buffer = '';
            }, 700);

            const buf = typeaheadRef.current.buffer;
            const start = idx < 0 ? 0 : idx + 1;
            const order = [...items.slice(start), ...items.slice(0, start)];
            const match = order.find((el) => (el.dataset.hostLabel || '').startsWith(buf));
            if (match) {
                event.preventDefault();
                match.focus();
            }
        }
    }, []);

    const allHostsContent = useMemo(() => {
        const showEmpty =
            remoteOnlyEntries.length === 0
            && treeRoot.connections.length === 0
            && Object.keys(treeRoot.children).length === 0;

        const orderedRootConnections = sortConnectionsByLiveFirst(treeRoot.connections);

        return (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {/* Toolbar fixed; list scrolls — no nested card chrome */}
                <div className="shrink-0 space-y-1.5 px-0.5 pb-1">
                    {allHostsToolbar}

                    {inventoryHint && (
                        <p
                            className={cn(
                                'px-0.5 text-[11px] leading-snug',
                                inventoryStatus === 'error'
                                    ? 'rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-amber-900 dark:text-amber-200/90'
                                    : 'text-app-muted/55',
                            )}
                        >
                            {inventoryHint}
                        </p>
                    )}
                </div>

                <div
                    ref={hostListRef}
                    className="min-h-0 flex-1 space-y-0.5 overflow-y-auto scrollbar-hide px-0.5 pt-1 outline-none"
                    onDragOver={handleAllHostsDragOver}
                    onDrop={handleAllHostsDrop}
                    onKeyDown={handleHostListKeyDown}
                    role="list"
                    aria-label="Hosts"
                    tabIndex={0}
                >
                    {Object.keys(treeRoot.children).sort().map(key => (
                        <FolderItem
                            key={key}
                            node={treeRoot.children[key]}
                            isCollapsed={false}
                            compactMode={compactMode}
                            expandedFolders={expandedFolders}
                            toggleFolder={toggleFolder}
                            updateConnectionFolder={updateConnectionFolder}
                            onDeleteFolder={(f) => setDeletingFolder(f)}
                            onRenameFolder={handleRenameFolder}
                            onMoveFolder={renameFolder}
                            onOpenContextMenu={(folderPath, x, y) => setFolderContextMenu({ folderPath, x, y })}
                            connectionItemProps={connectionItemProps}
                        />
                    ))}
                    {orderedRootConnections.map(conn => (
                        <ConnectionItem
                            key={conn.id}
                            conn={conn}
                            isCollapsed={false}
                            locations={connectionItemProps.getLocations?.(conn)}
                            onEdit={connectionItemProps.onEdit}
                            onOpenContextMenu={connectionItemProps.onOpenContextMenu}
                        />
                    ))}

                    {remoteOnlyEntries.map(entry => (
                        <RemoteHostItem
                            key={`remote-${entry.logicalId}`}
                            entry={entry}
                            compactMode={compactMode}
                            isMaterializing={materializingIds.has(entry.logicalId)}
                            onKeepOnDevice={handleKeepOnDevice}
                            onKeepAndConnect={handleKeepAndConnect}
                        />
                    ))}

                    {showEmpty && (
                        <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                            <Server size={20} className="text-app-muted/35" aria-hidden />
                            <div className="space-y-1">
                                <p className="text-[13px] font-medium text-app-muted/85">
                                    {emptyListMessage.title}
                                </p>
                                <p className="max-w-[14rem] text-[11px] leading-relaxed text-app-muted/55">
                                    {emptyListMessage.detail}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }, [
        allHostsToolbar,
        compactMode,
        connectionItemProps,
        emptyListMessage,
        expandedFolders,
        handleAllHostsDragOver,
        handleAllHostsDrop,
        handleHostListKeyDown,
        handleKeepAndConnect,
        handleKeepOnDevice,
        handleRenameFolder,
        inventoryHint,
        inventoryStatus,
        materializingIds,
        remoteOnlyEntries,
        renameFolder,
        toggleFolder,
        treeRoot.children,
        treeRoot.connections,
        updateConnectionFolder,
    ]);

    const railHosts = useMemo(
        () => sortConnectionsByLiveFirst(
            connections.filter(
                (c) => c.id !== LOCAL_TERMINAL_CONNECTION_ID
                    && c.id !== 'port-forwarding'
                    && c.id !== GLOBAL_SNIPPETS_CONNECTION_ID,
            ),
        ),
        [connections],
    );

    const expandSidebar = useCallback(() => {
        void updateSettings({ sidebarCollapsed: false });
    }, [updateSettings]);

    const initialConnectionId = activeConnectionId && activeConnectionId !== 'local' && activeConnectionId !== 'port-forwarding'
        ? activeConnectionId
        : undefined;

    const contentWidth = isCollapsed ? SIDEBAR_RAIL_WIDTH : width;

    return (
        <div
            ref={sidebarRef}
            className={cn(
                "bg-app-panel flex flex-col h-full shrink-0 relative z-50 overflow-hidden",
                "border-r border-app-border/50",
                !isResizing ? "transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)]" : "",
                className
            )}
            style={{
                width: contentWidth,
                willChange: isResizing ? 'auto' : 'width'
            }}
        >
            {/* Resize Handle (expanded only) */}
            {!isCollapsed && width >= 40 && (
                <div
                    className="absolute right-0 top-0 bottom-0 w-1 hover:w-1.5 cursor-col-resize hover:bg-app-accent/50 transition-all z-[100] group"
                    onMouseDown={startResizing}
                >
                    <div className="absolute inset-y-0 right-0 w-4 -z-10" /> {/* Larger hit area */}
                </div>
            )}

            {/* Content Wrapper */}
            <div
                style={{ width: contentWidth, minWidth: contentWidth }}
                className="flex h-full flex-col pt-1"
            >
                {isCollapsed ? (
                    /* ── Icon rail ── */
                    <div className="flex h-full flex-col items-stretch px-1.5 pb-2 pt-1.5">
                        <nav className="flex flex-col items-center gap-0.5" aria-label="Workspace">
                            <SidebarActionButton
                                icon={<TerminalIcon size={15} />}
                                label="Terminal"
                                iconOnly
                                onClick={() => openTab('local')}
                            />
                            <SidebarActionButton
                                icon={<Network size={15} />}
                                label="Port forwarding"
                                iconOnly
                                onClick={() => openPortForwardingTab()}
                            />
                            <VaultNavSection iconOnly />
                        </nav>

                        <div className="mx-1 my-2 h-px bg-app-border/20" />

                        <div
                            className="flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto scrollbar-hide"
                            role="list"
                            aria-label="Hosts"
                        >
                            <button
                                type="button"
                                title="New host"
                                aria-label="New host"
                                onClick={() => openConnectionModal()}
                                className={cn(
                                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                                    'text-app-muted hover:bg-app-surface/50 hover:text-app-text',
                                )}
                            >
                                <Plus size={15} />
                            </button>
                            {railHosts.map((conn) => (
                                <ConnectionItem
                                    key={`rail-${conn.id}`}
                                    conn={conn}
                                    isCollapsed
                                    locations={connectionItemProps.getLocations?.(conn)}
                                    onEdit={connectionItemProps.onEdit}
                                    onOpenContextMenu={connectionItemProps.onOpenContextMenu}
                                />
                            ))}
                        </div>

                        <button
                            type="button"
                            title="Expand sidebar"
                            aria-label="Expand sidebar"
                            onClick={expandSidebar}
                            className={cn(
                                'mt-1 flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-md',
                                'text-app-muted hover:bg-app-surface/50 hover:text-app-text',
                            )}
                        >
                            <PanelLeft size={15} />
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Quiet primary nav */}
                        <div className={cn(compactMode ? 'mb-1.5 px-2 pt-1.5' : 'mb-1.5 px-2.5 pt-2')}>
                            <nav className="flex w-full flex-col gap-0.5" aria-label="Workspace">
                                <SidebarActionButton
                                    icon={<TerminalIcon size={14} />}
                                    label="Terminal"
                                    onClick={() => openTab('local')}
                                />

                                <SidebarActionButton
                                    icon={<Network size={14} />}
                                    label="Port forwarding"
                                    onClick={() => openPortForwardingTab()}
                                />

                                <VaultNavSection />
                            </nav>
                        </div>

                        <div className="mx-3 mb-1.5 h-px bg-app-border/15" />

                        {/* Single host list — live sessions pin to top, no Active duplicate */}
                        <div className={cn(
                            'flex min-h-0 flex-1 flex-col overflow-hidden pb-2',
                            compactMode ? 'gap-1 px-1.5' : 'gap-1 px-2',
                        )}>
                            <SidebarSection
                                title="Hosts"
                                compactMode={compactMode}
                                variant="action"
                                fill
                                icon={<Server size={14} />}
                                count={filteredEntries.length > 0 ? filteredEntries.length : undefined}
                                headerActions={hasAnyHosts ? (
                                    <button
                                        type="button"
                                        onClick={() => openConnectionModal()}
                                        className={cn(
                                            'inline-flex h-7 w-7 items-center justify-center rounded-md',
                                            'text-app-muted hover:bg-app-surface/50 hover:text-app-text',
                                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent',
                                        )}
                                        title="New host"
                                        aria-label="New host"
                                    >
                                        <Plus size={14} />
                                    </button>
                                ) : undefined}
                                onContextMenu={(event) => {
                                    event.preventDefault();
                                    setAllHostsContextMenu({ x: event.clientX, y: event.clientY });
                                }}
                            >
                                {allHostsContent}
                            </SidebarSection>
                        </div>
                    </>
                )}
            </div>

            {/* Modals */}
            {isAddConnectionModalOpen && (
                <AddConnectionModal
                    isOpen={isAddConnectionModalOpen}
                    onClose={closeAddConnectionModal}
                    editingConnectionId={editingConnectionId}
                />
            )}

            {/* Create Folder Modal */}
            {isFolderModalOpen && (
                <FolderFormModal
                    isOpen={isFolderModalOpen}
                    onClose={() => setIsFolderModalOpen(false)}
                    onSubmit={(name, tags) => {
                        addFolder(name, tags);
                        setIsFolderModalOpen(false);
                    }}
                />
            )}

            {/* Modals */}
            {isAddTunnelModalOpen && (
                <AddTunnelModal
                    isOpen={isAddTunnelModalOpen}
                    onClose={() => setIsAddTunnelModalOpen(false)}
                    initialConnectionId={initialConnectionId}
                />
            )}

            <Suspense fallback={null}>
                {viewingDetailsId && (
                    <ConnectionDetailsModal
                        isOpen={!!viewingDetailsId}
                        onClose={() => setViewingDetailsId(null)}
                        connection={connections.find((c: Connection) => c.id === viewingDetailsId) || null}
                    />
                )}

                {isSettingsOpen && <SettingsModal isOpen={isSettingsOpen} onClose={closeSettings} />}
                {exportModalState && (
                    <ExportConnectionsModal
                        isOpen={!!exportModalState}
                        title={exportModalState.title}
                        scopeKey={exportModalState.scopeKey}
                        scopeLabel={exportModalState.scopeLabel}
                        defaultFileBaseName={exportModalState.defaultFileBaseName}
                        connections={exportModalState.connections}
                        onClose={() => setExportModalState(null)}
                        onExport={async (format, connectionIds, fileBaseName, includeSecrets) => {
                            await exportConnections(format, { connectionIds, baseName: fileBaseName, includeSecrets });
                        }}
                    />
                )}
            </Suspense>

            {connectionContextMenu && contextMenuConnection && (
                <ContextMenu
                    x={connectionContextMenu.x}
                    y={connectionContextMenu.y}
                    items={connectionContextMenuItems}
                    onClose={() => setConnectionContextMenu(null)}
                />
            )}
            {folderContextMenu && (
                <ContextMenu
                    x={folderContextMenu.x}
                    y={folderContextMenu.y}
                    items={folderContextMenuItems}
                    onClose={() => setFolderContextMenu(null)}
                />
            )}
            {allHostsContextMenu && (
                <ContextMenu
                    x={allHostsContextMenu.x}
                    y={allHostsContextMenu.y}
                    items={allHostsContextMenuItems}
                    onClose={() => setAllHostsContextMenu(null)}
                />
            )}

            <FolderFormModal
                isOpen={isRenameFolderModalOpen}
                onClose={() => setIsRenameFolderModalOpen(false)}
                initialName={folderToRename || ''}
                initialTags={folders.find((f: Folder) => f.name === folderToRename)?.tags || []}
                onSubmit={(newName, newTags) => {
                    if (folderToRename) {
                        renameFolder(folderToRename, newName, newTags);
                    }
                    setIsRenameFolderModalOpen(false);
                }}
            />

            {/* Delete Connection Confirmation */}
            <ConfirmModal
                isOpen={!!deletingConnection}
                onClose={() => setDeletingConnection(null)}
                onConfirm={() => {
                    if (deletingConnection) {
                        deleteConnection(deletingConnection.id);
                        setDeletingConnection(null);
                    }
                }}
                title="Delete Connection"
                message={
                    <span className="text-app-text/90">
                        Are you sure you want to delete connection <span className="text-app-accent font-bold">"{deletingConnection?.name || deletingConnection?.host}"</span>? This action cannot be undone.
                    </span>
                }
                confirmLabel="Delete"
                variant="danger"
            />

            {/* Delete Folder Confirmation */}
            <ConfirmModal
                isOpen={!!deletingFolder}
                onClose={() => setDeletingFolder(null)}
                onConfirm={() => {
                    if (deletingFolder) {
                        deleteFolder(deletingFolder);
                        setDeletingFolder(null);
                    }
                }}
                title="Delete Folder"
                message={
                    <span className="text-app-text/90">
                        Delete folder <span className="text-app-accent font-bold">"{deletingFolder}"</span>? Connections within this folder will be ungrouped.
                    </span>
                }
                confirmLabel="Delete"
                variant="danger"
            />
        </div>
    );
}
