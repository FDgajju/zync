import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function BetaBadge({ className }: { className?: string }) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide leading-none',
                'border border-app-accent/30 bg-app-accent/10 text-app-accent',
                className,
            )}
        >
            Beta
        </span>
    );
}

/** “Public URLs” plus a Beta chip for titles and nav. */
export function PublicUrlsLabel({
    className,
    badgeClassName,
    children = 'Public URLs',
}: {
    className?: string;
    badgeClassName?: string;
    children?: ReactNode;
}) {
    return (
        <span className={cn('inline-flex items-center gap-1.5 min-w-0', className)}>
            <span className="truncate">{children}</span>
            <BetaBadge className={badgeClassName} />
        </span>
    );
}
