import { useState, memo } from 'react';
import { ChevronRight, Folder as FolderIcon, FolderOpen } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { Connection } from '../../../store/useAppStore';
import { ConnectionItem } from './ConnectionItem';
import type { ConnectionItemProps } from './types';

interface ConnectedHostsGroupProps {
    connections: Connection[];
    compactMode: boolean;
    connectionItemProps: ConnectionItemProps;
}

/**
 * Virtual folder at the top of All Hosts — live sessions only.
 * Always starts expanded; hides entirely when empty.
 */
export const ConnectedHostsGroup = memo(function ConnectedHostsGroup({
    connections,
    compactMode,
    connectionItemProps,
}: ConnectedHostsGroupProps) {
    // Always open by default so live sessions are visible immediately.
    const [expanded, setExpanded] = useState(true);

    if (connections.length === 0) return null;

    return (
        <div className="select-none transition-all duration-200">
            <div
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                aria-label={`Connected hosts, ${connections.length}`}
                onClick={() => setExpanded((v) => !v)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpanded((v) => !v);
                    }
                }}
                className={cn(
                    'group relative mb-1 flex cursor-pointer items-center rounded-lg select-none transition-colors',
                    compactMode ? 'gap-2 px-2 py-1 text-xs' : 'gap-2 px-4 py-1.5 text-sm',
                    'text-app-muted hover:bg-app-surface/30 hover:text-app-text',
                    expanded && 'text-app-text',
                )}
            >
                <div className={cn('transition-transform duration-200', expanded && 'rotate-90')}>
                    <ChevronRight size={compactMode ? 12 : 14} />
                </div>
                {expanded ? (
                    <FolderOpen
                        size={compactMode ? 14 : 16}
                        className="shrink-0 text-app-accent/80"
                    />
                ) : (
                    <FolderIcon size={compactMode ? 14 : 16} className="shrink-0" />
                )}
                <span className="flex min-w-0 flex-1 items-center gap-2 truncate font-semibold">
                    Connected
                    <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/90"
                        title="Live sessions"
                        aria-hidden
                    />
                </span>
                <span className="ml-auto mr-1 text-[10px] tabular-nums text-app-muted/50 group-hover:text-app-muted/70">
                    {connections.length}
                </span>
            </div>

            {expanded && (
                <div
                    className={cn(
                        'space-y-1 border-l border-app-border/30 ml-4 pl-1',
                        compactMode ? 'mb-1 space-y-0.5' : 'mb-2',
                    )}
                >
                    {connections.map((conn) => (
                        <ConnectionItem
                            key={`connected-${conn.id}`}
                            conn={conn}
                            isCollapsed={false}
                            locations={connectionItemProps.getLocations?.(conn)}
                            onEdit={connectionItemProps.onEdit}
                            onOpenContextMenu={connectionItemProps.onOpenContextMenu}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});
