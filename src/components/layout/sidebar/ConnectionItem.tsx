import { useRef, useState, memo } from 'react';
import { useAppStore, Connection, Tab } from '../../../store/useAppStore';
import { getCurrentDragSource } from '../../../lib/dragDrop';
import { OSIcon } from '../../icons/OSIcon';
import { cn } from '../../../lib/utils';
import { useConnectionDisplayLabels } from '../../../features/connections/presentation/useConnectionDisplayLabels';
import type { HostLocationTag } from '../../../features/connections/domain/hostCatalog';
import { HostLocationChips } from './HostLocationChips';

interface ConnectionItemComponentProps {
    conn: Connection;
    isCollapsed: boolean;
    onEdit: (c: Connection) => void;
    onOpenContextMenu: (c: Connection, x: number, y: number) => void;
    /** Multi-location chips (local / google / …). Optional for callers that do not load catalog yet. */
    locations?: HostLocationTag[];
}

function statusDotClass(status: Connection['status'], hasTab: boolean): string | null {
    if (status === 'connected') {
        return hasTab
            ? 'bg-emerald-500 shadow-[0_0_0_2px_var(--color-app-panel)]'
            : 'bg-emerald-500/70 shadow-[0_0_0_2px_var(--color-app-panel)]';
    }
    if (status === 'connecting') {
        return 'bg-amber-400 animate-pulse shadow-[0_0_0_2px_var(--color-app-panel)]';
    }
    if (status === 'error') {
        return 'bg-app-danger shadow-[0_0_0_2px_var(--color-app-panel)]';
    }
    return null;
}

function statusTitle(status: Connection['status'], hasTab: boolean): string | undefined {
    if (status === 'connected') return hasTab ? 'Connected' : 'Connected (background)';
    if (status === 'connecting') return 'Connecting…';
    if (status === 'error') return 'Connection error';
    return undefined;
}

export const ConnectionItem = memo(function ConnectionItem({
    conn,
    isCollapsed,
    onEdit: _onEdit,
    onOpenContextMenu,
    locations,
}: ConnectionItemComponentProps) {
    // Selective subscriptions — only re-render when relevant values change
    const isActive = useAppStore(state => state.activeConnectionId === conn.id);
    const hasTab = useAppStore(state => state.tabs.some((t: Tab) => t.connectionId === conn.id));
    const compactMode = useAppStore(state => state.settings.compactMode);
    const { primary, secondary, ariaLabel } = useConnectionDisplayLabels(conn);

    // Actions (stable references from zustand, don't cause re-renders)
    const openTab = useAppStore(state => state.openTab);
    const showToast = useAppStore(state => state.showToast);
    const addTransfer = useAppStore(state => state.addTransfer);
    const failTransfer = useAppStore(state => state.failTransfer);

    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const rowRef = useRef<HTMLDivElement>(null);

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setDropTargetId(null);
        try {
            const jsonData = e.dataTransfer.getData('application/json');
            if (jsonData) {
                const dragData = JSON.parse(jsonData);
                if (dragData.type === 'server-file' && dragData.connectionId !== conn.id) {
                    let destPath: string;
                    try {
                        const rawHomeDir = await window.ipcRenderer.invoke('sftp:cwd', { id: conn.id });
                        const homeDir = rawHomeDir === '/' ? '' : rawHomeDir.replace(/\/+$/, '');
                        const fileName = dragData.name;
                        destPath = `${homeDir}/${fileName}`;
                    } catch {
                        showToast('error', 'Failed to get home directory');
                        return;
                    }

                    const transferId = addTransfer({
                        sourceConnectionId: dragData.connectionId,
                        sourcePath: dragData.path,
                        destinationConnectionId: conn.id,
                        destinationPath: destPath
                    });

                    showToast('info', `Copying to ${conn.name || conn.host}...`);

                    (async () => {
                        try {
                            await window.ipcRenderer.invoke('sftp:copyToServer', {
                                sourceConnectionId: dragData.connectionId,
                                sourcePath: dragData.path,
                                destinationConnectionId: conn.id,
                                destinationPath: destPath,
                                transferId
                            });
                        } catch (error: any) {
                            failTransfer(transferId, error?.message || String(error));
                            if (error.message && !error.message.includes('destroy')) {
                                showToast('error', `Transfer failed: ${error.message}`);
                            }
                        }
                    })();
                }
            }
        } catch (err) {
            console.error('Drop handling failed:', err);
            showToast('error', `Drag & drop failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        const draggingConnection = e.dataTransfer.types.includes('connection-id');
        const draggingFolder = e.dataTransfer.types.includes('folder-path');
        if (draggingConnection || draggingFolder) {
            e.preventDefault();
            return;
        }

        const dragSource = getCurrentDragSource();
        if (dragSource && dragSource.connectionId !== conn.id && conn.status === 'connected') {
            e.preventDefault();
            setDropTargetId(conn.id);
        }
    };

    const dotClass = statusDotClass(conn.status, hasTab);
    const showLocationChips = Boolean(
        locations
        && locations.length > 0
        && !(locations.length === 1 && locations[0] === 'local'),
    );

    return (
        <div
            ref={rowRef}
            data-host-row="1"
            data-host-label={primary.toLocaleLowerCase()}
            className={cn(
                'group relative flex cursor-pointer items-center select-none border border-transparent transition-colors',
                isCollapsed
                    ? 'mx-auto h-9 w-9 justify-center rounded-md p-1'
                    : compactMode
                        ? 'gap-2 rounded-md px-1.5 py-1.5'
                        : 'gap-2 rounded-md px-2 py-1.5',
                'hover:bg-app-surface/40',
                isActive
                    ? 'bg-app-accent/[0.09] text-app-text'
                    : 'text-app-muted hover:text-app-text',
                dropTargetId === conn.id && 'bg-app-accent/15 ring-1 ring-app-accent/35',
            )}
            onClick={(e) => {
                e.preventDefault();
                openTab(conn.id);
            }}
            role="button"
            tabIndex={0}
            title={isCollapsed ? primary : undefined}
            aria-label={ariaLabel}
            aria-current={isActive ? 'true' : undefined}
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenContextMenu(conn, e.clientX, e.clientY);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openTab(conn.id);
                    return;
                }

                const isContextMenuKey =
                    (e.shiftKey && e.key === 'F10')
                    || e.key === 'ContextMenu'
                    || e.code === 'ContextMenu';

                if (isContextMenuKey) {
                    e.preventDefault();
                    const rect = rowRef.current?.getBoundingClientRect();
                    const x = rect ? rect.left + rect.width / 2 : 0;
                    const y = rect ? rect.top + rect.height / 2 : 0;
                    onOpenContextMenu(conn, x, y);
                }
            }}
            onDoubleClick={() => openTab(conn.id)}
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData('connection-id', conn.id);
                e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={handleDragOver}
            onDragLeave={() => setDropTargetId(null)}
            onDrop={handleDrop}
        >
            {isActive && (
                <div
                    className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-app-accent"
                    aria-hidden
                />
            )}

            <div
                className={cn(
                    'relative flex shrink-0 items-center justify-center',
                    compactMode ? 'h-6 w-6' : 'h-7 w-7',
                )}
            >
                <OSIcon
                    icon={conn.icon || 'Server'}
                    className={cn(
                        'h-4 w-4 transition-colors',
                        isActive ? 'text-app-accent' : 'text-app-muted group-hover:text-app-text',
                    )}
                />
                {dotClass && (
                    <div
                        className={cn('absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full', dotClass)}
                        title={statusTitle(conn.status, hasTab)}
                        aria-hidden
                    />
                )}
            </div>

            {!isCollapsed && (
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
                    <div className="flex min-w-0 items-center gap-1.5">
                        <span
                            className={cn(
                                'min-w-0 truncate text-[13px] leading-tight',
                                isActive ? 'font-semibold text-app-text' : 'font-medium text-app-text/90',
                            )}
                        >
                            {primary}
                        </span>
                        {showLocationChips && locations && (
                            <HostLocationChips
                                locations={locations}
                                compact
                                hideLocalOnly
                                className="ml-auto"
                            />
                        )}
                    </div>
                    {secondary ? (
                        <span className="truncate text-[11px] leading-tight text-app-muted/55 group-hover:text-app-muted/70">
                            {secondary}
                        </span>
                    ) : null}
                </div>
            )}
        </div>
    );
});
