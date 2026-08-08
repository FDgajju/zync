import { useMemo, useState, memo } from 'react';
import { useAppStore, Connection } from '../../../store/useAppStore';
import { ChevronRight, Folder as FolderIcon, FolderOpen } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { ConnectionItem } from './ConnectionItem';
import { sortConnectionsByLiveFirst } from './sortConnections';
import type { TreeNode, ConnectionItemProps } from './types';

interface FolderItemProps {
    node: TreeNode;
    isCollapsed: boolean;
    compactMode: boolean;
    expandedFolders: Set<string>;
    toggleFolder: (p: string) => void;
    updateConnectionFolder: (id: string, f: string) => void;
    onDeleteFolder: (f: string) => void;
    onRenameFolder: (f: string) => void;
    onMoveFolder: (oldName: string, newName: string) => void;
    onOpenContextMenu: (folderPath: string, x: number, y: number) => void;
    connectionItemProps: ConnectionItemProps;
}

export const FolderItem = memo(function FolderItem({
    node,
    isCollapsed,
    compactMode,
    expandedFolders,
    toggleFolder,
    updateConnectionFolder,
    onDeleteFolder: _onDeleteFolder,
    onRenameFolder: _onRenameFolder,
    onMoveFolder,
    onOpenContextMenu,
    connectionItemProps
}: FolderItemProps) {
    const isExpanded = expandedFolders.has(node.path);
    const [isDragOver, setIsDragOver] = useState(false);
    const normalizePath = (path: string) => path.replace(/\/+$/, '');
    const orderedConnections = useMemo(
        () => sortConnectionsByLiveFirst(node.connections),
        [node.connections],
    );
    const childCount = node.connections.length + Object.keys(node.children).length;

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const connId = e.dataTransfer.getData('connection-id');
        const srcFolderPath = e.dataTransfer.getData('folder-path');

        const types = Array.from(e.dataTransfer.types);
        if (!connId && !srcFolderPath && (types.includes('Files') || types.includes('text/uri-list'))) {
            useAppStore.getState().showToast('info', 'External file drop into sidebar is currently disabled. We are working to bring this feature soon!');
            return;
        }

        if (connId) {
            updateConnectionFolder(connId, node.path);
        } else if (srcFolderPath) {
            const normalizedSource = normalizePath(srcFolderPath);
            const normalizedTargetFolder = normalizePath(node.path);

            if (normalizedSource === normalizedTargetFolder) return;
            if (normalizedTargetFolder.startsWith(`${normalizedSource}/`)) return;

            const sourceBaseName = normalizedSource.split('/').pop();
            if (!sourceBaseName) return;

            const newName = normalizePath(`${normalizedTargetFolder}/${sourceBaseName}`);
            if (newName === normalizedSource) return;

            onMoveFolder(normalizedSource, newName);
        }
    };

    return (
        <div className="select-none">
            <div
                className={cn(
                    'group relative mb-0.5 flex cursor-pointer items-center rounded-md select-none transition-colors',
                    isCollapsed
                        ? 'mx-auto my-0.5 h-9 w-9 justify-center hover:bg-app-surface/50'
                        : cn(
                            compactMode ? 'gap-1.5 px-1.5 py-1' : 'gap-1.5 px-2 py-1.5',
                            'text-app-muted hover:bg-app-surface/35 hover:text-app-text',
                        ),
                    isDragOver && 'bg-app-accent/10 text-app-text',
                    isExpanded && !isCollapsed && 'text-app-text',
                )}
                onClick={() => toggleFolder(node.path)}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                aria-label={`Folder ${node.name}`}
                title={isCollapsed ? node.name : undefined}
                onKeyDown={(e) => {
                    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        onOpenContextMenu(node.path, rect.left + 10, rect.top + 10);
                        return;
                    }
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleFolder(node.path);
                    }
                }}
                draggable
                onDragStart={(e) => {
                    e.dataTransfer.setData('folder-path', node.path);
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenContextMenu(node.path, event.clientX, event.clientY);
                }}
            >
                {isCollapsed ? (
                    <span
                        className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-semibold',
                            isExpanded
                                ? 'bg-app-accent/15 text-app-accent'
                                : 'bg-app-surface/40 text-app-muted group-hover:text-app-text',
                        )}
                    >
                        {node.name.charAt(0).toUpperCase()}
                    </span>
                ) : (
                    <>
                        <ChevronRight
                            size={13}
                            className={cn(
                                'shrink-0 opacity-55 transition-transform duration-200',
                                isExpanded && 'rotate-90 opacity-80',
                            )}
                        />
                        {isExpanded ? (
                            <FolderOpen size={14} className="shrink-0 text-app-accent/85" />
                        ) : (
                            <FolderIcon size={14} className="shrink-0 opacity-80" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                            {node.name}
                        </span>
                        {childCount > 0 && (
                            <span className="shrink-0 tabular-nums text-[10px] text-app-muted/45 group-hover:text-app-muted/70">
                                {childCount}
                            </span>
                        )}
                    </>
                )}
            </div>

            {isExpanded && (
                <div
                    className={cn(
                        'space-y-0.5',
                        !isCollapsed && 'mb-1 ml-2.5 border-l border-app-border/15 pl-1.5',
                        isCollapsed && 'mb-1 flex flex-col items-center gap-0.5',
                    )}
                >
                    {Object.keys(node.children).sort().map(key => (
                        <FolderItem
                            key={key}
                            node={node.children[key]}
                            isCollapsed={isCollapsed}
                            compactMode={compactMode}
                            expandedFolders={expandedFolders}
                            toggleFolder={toggleFolder}
                            updateConnectionFolder={updateConnectionFolder}
                            onRenameFolder={_onRenameFolder}
                            onMoveFolder={onMoveFolder}
                            onOpenContextMenu={onOpenContextMenu}
                            connectionItemProps={connectionItemProps}
                            onDeleteFolder={_onDeleteFolder}
                        />
                    ))}
                    {orderedConnections.map((conn: Connection) => (
                        <ConnectionItem
                            key={conn.id}
                            conn={conn}
                            isCollapsed={isCollapsed}
                            onEdit={connectionItemProps.onEdit}
                            onOpenContextMenu={connectionItemProps.onOpenContextMenu}
                            locations={connectionItemProps.getLocations?.(conn)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});
