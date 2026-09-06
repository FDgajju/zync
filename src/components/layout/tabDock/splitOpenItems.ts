import type { ContextMenuItem } from '../../ui/ContextMenu';
import type { DockEdge } from '../../../lib/paneLayout';

const SPLIT_SIDES: Array<{ edge: DockEdge; label: string }> = [
    { edge: 'left', label: 'To the Left' },
    { edge: 'right', label: 'To the Right' },
    { edge: 'bottom', label: 'To the Bottom' },
];

/** Shared right-click actions: click still opens a tab; these dock into the current split. */
export function splitOpenMenuItems(
    onOpen: (edge: DockEdge) => void,
    disabled = false,
): ContextMenuItem[] {
    return [
        {
            label: 'Open in split to the Right',
            disabled,
            action: () => onOpen('right'),
        },
        {
            label: 'Open in split to the Bottom',
            disabled,
            action: () => onOpen('bottom'),
        },
    ];
}

/** Nested Left / Right / Bottom — used next to an existing “Open … Here” row. */
export function splitOpenSubmenu(
    label: string,
    onOpen: (edge: DockEdge) => void,
    disabled = false,
): ContextMenuItem {
    return {
        label,
        disabled,
        children: SPLIT_SIDES.map((side) => ({
            label: side.label,
            disabled,
            action: () => onOpen(side.edge),
        })),
    };
}

/** One row: new tab plus split placements, so the parent menu stays short. */
export function openHerePlacementItems(
    onTab: () => void,
    onSplit: (edge: DockEdge) => void,
    splitDisabled = false,
): ContextMenuItem[] {
    return [
        {
            label: 'In a new tab',
            action: onTab,
        },
        { separator: true },
        ...SPLIT_SIDES.map((side) => ({
            label: side.label,
            disabled: splitDisabled,
            action: () => onSplit(side.edge),
        })),
    ];
}
