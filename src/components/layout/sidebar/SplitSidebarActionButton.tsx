import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface SplitSidebarActionButtonProps {
    icon: ReactNode;
    label: string;
    expanded: boolean;
    active?: boolean;
    /** Soft attention treatment — notice without shouting. */
    attention?: 'none' | 'setup' | 'secure' | 'locked' | 'ready';
    /** Optional compact badge (e.g. unsecured host count). */
    badge?: string | number | null;
    badgeTitle?: string;
    onPrimaryClick: () => void;
    onToggleClick: () => void;
    toggleAriaLabel?: string;
    /** Icon-only rail (collapsed sidebar) — primary action only. */
    iconOnly?: boolean;
}

/**
 * Quiet split nav row (Vault): primary opens destination, chevron opens menu.
 * Matches SidebarActionButton density / sentence-case type.
 */
export function SplitSidebarActionButton({
    icon,
    label,
    expanded,
    active = false,
    attention = 'none',
    badge = null,
    badgeTitle,
    onPrimaryClick,
    onToggleClick,
    toggleAriaLabel = 'Toggle section menu',
    iconOnly = false,
}: SplitSidebarActionButtonProps) {
    if (iconOnly) {
        return (
            <button
                type="button"
                title={badgeTitle || label}
                aria-label={label}
                className={cn(
                    'group relative mx-auto flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border outline-none transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg',
                    'text-app-muted hover:bg-app-surface/50 hover:text-app-text',
                    attention === 'none' && (active ? 'border-app-border/25 bg-app-surface/55 text-app-accent' : 'border-transparent'),
                    attention === 'setup' && 'border-app-accent/25 bg-app-accent/[0.06] text-app-accent',
                    attention === 'secure' && 'border-amber-500/25 bg-amber-500/[0.06] text-[var(--color-app-warning)]',
                    attention === 'locked' && 'border-amber-500/20 bg-amber-500/[0.05] text-[var(--color-app-warning)]',
                    attention === 'ready' && (active ? 'border-emerald-500/25 text-emerald-500' : 'border-transparent'),
                )}
                onClick={onPrimaryClick}
            >
                <span className="opacity-90 group-hover:opacity-100">{icon}</span>
                {badge != null && badge !== '' && (
                    <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-app-accent" aria-hidden />
                )}
            </button>
        );
    }

    const shellClassName = cn(
        'flex w-full overflow-hidden rounded-md border',
        'bg-transparent',
        active && 'bg-app-surface/55 text-app-text',
        attention === 'none' && (active ? 'border-app-border/25' : 'border-transparent'),
        attention === 'setup' && 'border-app-accent/20 bg-app-accent/[0.04]',
        attention === 'secure' && 'border-amber-500/20 bg-amber-500/[0.04]',
        attention === 'locked' && 'border-amber-500/15 bg-amber-500/[0.03]',
        attention === 'ready' && (active ? 'border-emerald-500/20' : 'border-transparent'),
    );

    const segmentClassName = cn(
        'group cursor-pointer select-none outline-none transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg',
        'text-app-muted hover:bg-app-surface/45 hover:text-app-text',
    );

    const badgeClassName = cn(
        'ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none',
        attention === 'setup' && 'bg-app-accent/15 text-app-accent',
        attention === 'secure' && 'bg-amber-500/15 text-amber-900 dark:text-amber-200',
        attention === 'locked' && 'bg-amber-500/12 text-amber-900 dark:text-amber-200',
        attention === 'ready' && 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
        attention === 'none' && 'bg-app-muted/15 text-app-muted',
    );

    return (
        <div className={shellClassName}>
            <button
                type="button"
                title={badgeTitle}
                className={cn(
                    segmentClassName,
                    'flex min-w-0 flex-1 items-center px-2 py-1.5',
                    active && 'text-app-text',
                    attention === 'setup' && 'text-app-text/90',
                    attention === 'secure' && 'text-app-text/90',
                )}
                onClick={onPrimaryClick}
            >
                <span
                    className={cn(
                        'shrink-0 opacity-70 group-hover:opacity-100',
                        active && 'opacity-100 text-app-accent',
                        attention === 'setup' && 'text-app-accent opacity-90',
                        attention === 'secure' && 'text-[var(--color-app-warning)] opacity-90',
                        attention === 'locked' && 'text-[var(--color-app-warning)] opacity-85',
                        attention === 'ready' && 'text-emerald-600 opacity-90 dark:text-emerald-400',
                    )}
                >
                    {icon}
                </span>
                <span className="ml-2.5 truncate text-[12px] font-medium tracking-normal opacity-90 group-hover:opacity-100">
                    {label}
                </span>
                {badge != null && badge !== '' && (
                    <span className={badgeClassName} title={badgeTitle}>
                        {badge}
                    </span>
                )}
            </button>
            <button
                type="button"
                aria-expanded={expanded}
                aria-label={toggleAriaLabel}
                className={cn(
                    segmentClassName,
                    'flex w-7 shrink-0 items-center justify-center border-l border-app-border/20',
                )}
                onClick={onToggleClick}
            >
                <ChevronDown
                    size={12}
                    className={cn(
                        'opacity-55 transition-transform duration-200 group-hover:opacity-100',
                        expanded && 'rotate-180',
                    )}
                />
            </button>
        </div>
    );
}
