import type { ReactNode } from 'react';
import { cn } from '../../../lib/utils';

export interface SidebarActionButtonProps {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    active?: boolean;
    nested?: boolean;
    trailing?: ReactNode;
    /** Icon-only rail (collapsed sidebar). */
    iconOnly?: boolean;
}

/**
 * Quiet primary-nav row (Terminal, Port forwarding, etc.).
 * Sentence case, light hover — not a heavy “action card.”
 */
export function SidebarActionButton({
    icon,
    label,
    onClick,
    active = false,
    nested = false,
    trailing,
    iconOnly = false,
}: SidebarActionButtonProps) {
    if (iconOnly) {
        return (
            <button
                type="button"
                title={label}
                aria-label={label}
                className={cn(
                    'group mx-auto flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent outline-none transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg',
                    'text-app-muted hover:bg-app-surface/50 hover:text-app-text',
                    active && 'bg-app-surface/55 text-app-accent',
                )}
                onClick={onClick}
            >
                <span className={cn('opacity-80 group-hover:opacity-100', active && 'opacity-100')}>
                    {icon}
                </span>
            </button>
        );
    }

    return (
        <button
            type="button"
            className={cn(
                'group relative flex w-full cursor-pointer select-none items-center rounded-md border border-transparent outline-none transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg',
                nested ? 'px-2 py-1.5' : 'px-2 py-1.5',
                'text-app-muted hover:bg-app-surface/50 hover:text-app-text',
                active && 'bg-app-surface/55 text-app-text',
            )}
            onClick={onClick}
        >
            <span
                className={cn(
                    'shrink-0 opacity-70 transition-opacity group-hover:opacity-100',
                    nested && 'ml-2',
                    active && 'opacity-100 text-app-accent',
                )}
            >
                {icon}
            </span>
            <span
                className={cn(
                    'ml-2.5 truncate text-[12px] font-medium tracking-normal opacity-90 group-hover:opacity-100',
                    active && 'opacity-100',
                )}
            >
                {label}
            </span>
            {trailing && (
                <span className="ml-auto shrink-0 opacity-60 group-hover:opacity-100">
                    {trailing}
                </span>
            )}
        </button>
    );
}
