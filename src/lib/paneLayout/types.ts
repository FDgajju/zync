/** `vertical` = stacked (column). `horizontal` = side by side (row). */

export const PANE_LAYOUT_VERSION = 1 as const;
export const MAX_VISIBLE_PANES = 4;
/** Restore/parse budget so a corrupt session file cannot nest forever. */
export const MAX_PANE_NESTING = 8;
export const MIN_PANE_RATIO = 0.2;

/** Host feature tabs that may occupy a split leaf. Plugins stay full-view. */
export const SPLIT_FEATURE_IDS = ['files', 'port-forwarding', 'dashboard', 'snippets'] as const;
export type SplitFeatureId = (typeof SPLIT_FEATURE_IDS)[number];

const SPLIT_FEATURE_ID_SET: ReadonlySet<string> = new Set(SPLIT_FEATURE_IDS);

export type SplitDirection = 'horizontal' | 'vertical';

export type TermPaneContent = {
    kind: 'term';
    termId: string;
};

export type FeaturePaneContent = {
    kind: 'feature';
    featureId: SplitFeatureId;
};

export type PaneContent = TermPaneContent | FeaturePaneContent;

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
export type SplitInsert = 'before' | 'after';
export type DockEdge = 'left' | 'right' | 'top' | 'bottom';

export type DockPayload =
    | { kind: 'term'; termId: string }
    | { kind: 'feature'; featureId: SplitFeatureId };

export type DockResult = 'opened' | 'focused' | 'moved' | 'refused-cap' | 'no-target' | 'self';

export type OpenSplitFeatureResult = DockResult;

export function isSplitFeatureId(value: unknown): value is SplitFeatureId {
    return typeof value === 'string' && SPLIT_FEATURE_ID_SET.has(value);
}

export function termPaneContent(termId: string): TermPaneContent {
    return { kind: 'term', termId };
}

export function featurePaneContent(featureId: SplitFeatureId): FeaturePaneContent {
    return { kind: 'feature', featureId };
}
