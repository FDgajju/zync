import { useState, type ReactNode } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface SidebarSectionProps {
    title: string;
    count?: number;
    children: React.ReactNode;
    defaultExpanded?: boolean;
    compactMode?: boolean;
    /** Match Port Forwarding / Vault action-button chrome (recommended for All Hosts). */
    variant?: 'plain' | 'action';
    /**
     * Fill remaining sidebar height; keep the section header fixed and let
     * children manage their own scroll (used by All Hosts).
     */
    fill?: boolean;
    icon?: ReactNode;
    /** Optional trailing controls in the header (e.g. New host). */
    headerActions?: ReactNode;
    onDrop?: (e: React.DragEvent) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
}

export function SidebarSection({
    title,
    count,
    children,
    defaultExpanded = true,
    compactMode = false,
    variant = 'plain',
    fill = false,
    icon,
    headerActions,
    onDrop,
    onContextMenu
}: SidebarSectionProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const isAction = variant === 'action';

    return (
        <div
            className={cn(
                isAction ? 'mb-1' : 'mb-2',
                fill && 'flex min-h-0 flex-1 flex-col',
            )}
            onDragOver={onDrop ? (e) => {
                e.preventDefault();
                e.stopPropagation();
            } : undefined}
            onDrop={onDrop ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                const types = Array.from(e.dataTransfer.types || []);
                const isExternal = types.includes('Files') || types.includes('text/uri-list');
                if (isExternal) {
                    useAppStore.getState().showToast('info', 'External drop here is currently disabled. We are working to bring this feature to Zync soon!');
                    return;
                }
                onDrop(e);
            } : undefined}
        >
            <div
                className={cn(
                    'group flex w-full shrink-0 items-center select-none',
                    isAction ? 'gap-0.5' : 'gap-1 mb-1',
                    !isAction && (compactMode ? 'px-2' : 'px-4'),
                )}
                onContextMenu={onContextMenu}
            >
                <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    aria-expanded={isExpanded}
                    className={cn(
                        'flex min-w-0 flex-1 items-center rounded-md outline-none transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg',
                        isAction
                            ? cn(
                                'gap-2 px-1.5 py-1.5',
                                'text-app-muted hover:bg-app-surface/40 hover:text-app-text',
                                isExpanded && 'text-app-text',
                            )
                            : cn(
                                'gap-1 py-0.5',
                                'text-app-muted hover:text-app-text',
                            ),
                    )}
                >
                    {isAction ? (
                        <>
                            {icon && (
                                <span className="shrink-0 opacity-65 group-hover:opacity-100">
                                    {icon}
                                </span>
                            )}
                            <span className="truncate text-[12px] font-semibold tracking-normal opacity-90">
                                {title}
                            </span>
                            {count !== undefined && count > 0 && (
                                <span className="ml-1 rounded-full bg-app-surface/80 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-app-muted">
                                    {count}
                                </span>
                            )}
                            <span className="ml-auto flex shrink-0 items-center justify-center opacity-50 group-hover:opacity-90">
                                <ChevronRight
                                    size={13}
                                    className={cn(
                                        'transition-transform duration-200',
                                        isExpanded && 'rotate-90',
                                    )}
                                />
                            </span>
                        </>
                    ) : (
                        <>
                            <ChevronRight
                                size={12}
                                className={cn(
                                    'text-app-muted transition-transform duration-200 group-hover:text-app-text',
                                    isExpanded && 'rotate-90',
                                )}
                            />
                            <span className="text-[12px] font-semibold tracking-normal text-app-muted group-hover:text-app-text">
                                {title}
                            </span>
                            {count !== undefined && count > 0 && (
                                <span className="ml-auto rounded-full bg-app-surface/80 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-app-muted">
                                    {count}
                                </span>
                            )}
                        </>
                    )}
                </button>
                {headerActions ? (
                    <div className="flex shrink-0 items-center gap-0.5 pr-0.5">
                        {headerActions}
                    </div>
                ) : null}
            </div>

            {isExpanded && (
                <div
                    className={cn(
                        'animate-in fade-in slide-in-from-top-1 duration-150',
                        isAction ? 'mt-1' : undefined,
                        fill && 'flex min-h-0 flex-1 flex-col overflow-hidden',
                    )}
                >
                    {children}
                </div>
            )}
        </div>
    );
}
