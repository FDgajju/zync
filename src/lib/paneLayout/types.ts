/**
 * Workspace pane layout. A node is either a pane (one shell) or a split
 * (two children + sizes). Never both. v1 UI caps visible leaves at
 * MAX_VISIBLE_PANES; the tree already nests so a later cap raise does not
 * change this module's shape.
 *
 * `vertical` = stacked (column). `horizontal` = side by side (row).
 */

export const PANE_LAYOUT_VERSION = 1 as const;
export const MAX_VISIBLE_PANES = 2;
/** Restore/parse budget so a corrupt session file cannot nest forever. */
export const MAX_PANE_NESTING = 8;
export const MIN_PANE_RATIO = 0.2;

export type SplitDirection = 'horizontal' | 'vertical';

export type PaneContent = {
    kind: 'term';
    termId: string;
};

export type PaneLeaf = {
    type: 'pane';
    id: string;
    content: PaneContent;
};

export type PaneSplit = {
    type: 'split';
    id: string;
    direction: SplitDirection;
    sizes: [number, number];
    children: [PaneNode, PaneNode];
};

export type PaneNode = PaneLeaf | PaneSplit;

export type PaneLayout = {
    version: typeof PANE_LAYOUT_VERSION;
    root: PaneNode;
    activePaneId: string;
};

export type SplitFailReason = 'cap' | 'missing-pane' | 'not-leaf';
