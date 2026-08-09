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
    onDrop,
    onContextMenu
}: SidebarSectionProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const isAction = variant === 'action';

    return (
        <div
            className={cn(
                isAction ? 'mb-1.5' : 'mb-2',
                fill && 'flex-1 min-h-0 flex flex-col',
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
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                aria-expanded={isExpanded}
                onContextMenu={onContextMenu}
                className={cn(
                    'group w-full flex items-center select-none outline-none transition-all shrink-0',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg',
                    isAction
                        ? cn(
                            'gap-0 rounded-lg border border-transparent py-2 px-3',
                            'bg-app-surface/30 hover:bg-app-surface hover:border-app-border/30',
                            'text-app-muted hover:text-app-text',
                            isExpanded && 'text-app-text border-app-border/20',
                        )
                        : cn(
                            'gap-1 mb-1',
                            compactMode ? 'px-2' : 'px-4',
                        ),
                )}
            >
                {isAction ? (
                    <>
                        {icon && (
                            <span className="shrink-0 opacity-70 group-hover:opacity-100">
                                {icon}
                            </span>
                        )}
                        <span
                            className={cn(
                                'truncate font-medium text-[10px] uppercase tracking-wider opacity-80 group-hover:opacity-100',
                                icon ? 'ml-3' : undefined,
                            )}
                        >
                            {title}
                        </span>
                        {count !== undefined && count > 0 && (
                            <span className="ml-2 text-[10px] font-medium text-app-accent bg-app-accent/10 px-1.5 rounded-full">
                                {count}
                            </span>
                        )}
                        <span className="ml-auto shrink-0 flex items-center justify-center opacity-60 group-hover:opacity-100">
                            <ChevronRight
                                size={12}
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
                                'text-app-muted group-hover:text-app-text transition-transform duration-200',
                                isExpanded && 'rotate-90',
                            )}
                        />
                        <span className="text-xs font-bold text-app-muted group-hover:text-app-text transition-colors uppercase tracking-wider">
                            {title}
                        </span>
                        {count !== undefined && count > 0 && (
                            <span className="ml-auto text-[10px] font-medium text-app-accent bg-app-accent/10 px-1.5 rounded-full">
                                {count}
                            </span>
                        )}
                    </>
                )}
            </button>

            {isExpanded && (
                <div
                    className={cn(
                        'animate-in fade-in slide-in-from-top-1 duration-200',
                        isAction ? 'mt-1.5' : undefined,
                        fill && 'flex-1 min-h-0 flex flex-col overflow-hidden',
                    )}
                >
                    {children}
                </div>
            )}
        </div>
    );
}
