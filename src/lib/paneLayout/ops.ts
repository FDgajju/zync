import { createPaneId } from './ids';
import {
    activeTermId,
    collectLeaves,
    findLeafByTerm,
    findNode,
    findParentSplit,
    firstLeaf,
    isPaneLeaf,
    isPaneSplit,
    leafCount,
} from './query';
import {
    MAX_VISIBLE_PANES,
    MIN_PANE_RATIO,
    PANE_LAYOUT_VERSION,
    type PaneContent,
    type PaneLayout,
    type PaneNode,
    type SplitDirection,
    type SplitFailReason,
} from './types';

export function singlePane(termId: string, paneId = createPaneId()): PaneLayout {
    return {
        version: PANE_LAYOUT_VERSION,
        root: { type: 'pane', id: paneId, content: { kind: 'term', termId } },
        activePaneId: paneId,
    };
}

export function canSplit(layout: PaneLayout | null | undefined, cap = MAX_VISIBLE_PANES): boolean {
    if (!layout) return true;
    return leafCount(layout.root) < cap;
}

function mapNode(node: PaneNode, id: string, replace: (current: PaneNode) => PaneNode): PaneNode {
    if (node.id === id) return replace(node);
    if (isPaneLeaf(node)) return node;
    return {
        ...node,
        children: [
            mapNode(node.children[0], id, replace),
            mapNode(node.children[1], id, replace),
        ],
    };
}

export function normalizeSizes(sizes: [number, number]): [number, number] {
    const a = Number.isFinite(sizes[0]) ? sizes[0] : 1;
    const b = Number.isFinite(sizes[1]) ? sizes[1] : 1;
    const sum = a + b;
    if (sum <= 0) return [0.5, 0.5];
    let left = a / sum;
    left = Math.min(1 - MIN_PANE_RATIO, Math.max(MIN_PANE_RATIO, left));
    return [left, 1 - left];
}

export function splitPane(
    layout: PaneLayout,
    paneId: string,
    direction: SplitDirection,
    content: PaneContent,
    cap = MAX_VISIBLE_PANES,
): { ok: true; layout: PaneLayout; newPaneId: string } | { ok: false; reason: SplitFailReason } {
    if (leafCount(layout.root) >= cap) {
        return { ok: false, reason: 'cap' };
    }
    const target = findNode(layout.root, paneId);
    if (!target) return { ok: false, reason: 'missing-pane' };
    if (!isPaneLeaf(target)) return { ok: false, reason: 'not-leaf' };

    const newLeaf: PaneNode = { type: 'pane', id: createPaneId(), content };
    const splitId = createPaneId();
    const root = mapNode(layout.root, paneId, (current) => ({
        type: 'split',
        id: splitId,
        direction,
        sizes: [0.5, 0.5],
        children: [current, newLeaf],
    }));

    return { ok: true, layout: { ...layout, root }, newPaneId: newLeaf.id };
}

export function unsplitPane(layout: PaneLayout, paneId: string): PaneLayout {
    const parent = findParentSplit(layout.root, paneId);
    if (!parent) {
        return layout;
    }
    const sibling = parent.children[0].id === paneId ? parent.children[1] : parent.children[0];
    const root = parent.id === layout.root.id
        ? sibling
        : mapNode(layout.root, parent.id, () => sibling);

    const focused = findNode(root, layout.activePaneId)
        ? layout.activePaneId
        : firstLeaf(sibling).id;
    return { ...layout, root, activePaneId: focused };
}

export function focusPane(layout: PaneLayout, paneId: string): PaneLayout {
    if (!findNode(layout.root, paneId)) return layout;
    return { ...layout, activePaneId: paneId };
}

export function selectTerm(layout: PaneLayout, termId: string): PaneLayout {
    const existing = findLeafByTerm(layout.root, termId);
    if (existing) {
        return focusPane(layout, existing.id);
    }
    const focused = findNode(layout.root, layout.activePaneId);
    const targetId = focused && isPaneLeaf(focused) ? focused.id : firstLeaf(layout.root).id;
    const root = mapNode(layout.root, targetId, (current) => {
        if (!isPaneLeaf(current)) return current;
        return { ...current, content: { kind: 'term', termId } };
    });
    return { ...layout, root, activePaneId: targetId };
}

export function setSplitSizes(layout: PaneLayout, splitId: string, sizes: [number, number]): PaneLayout {
    const next = normalizeSizes(sizes);
    const root = mapNode(layout.root, splitId, (current) => {
        if (!isPaneSplit(current)) return current;
        return { ...current, sizes: next };
    });
    return { ...layout, root };
}

export function dropTerm(layout: PaneLayout, termId: string): PaneLayout | null {
    const leaves = collectLeaves(layout.root).filter(
        (leaf) => leaf.content.kind === 'term' && leaf.content.termId === termId,
    );
    if (leaves.length === 0) return layout;
    let next: PaneLayout | null = layout;
    for (const leaf of leaves) {
        if (!next) break;
        if (isPaneLeaf(next.root) && next.root.id === leaf.id) {
            return null;
        }
        next = unsplitPane(next, leaf.id);
        if (isPaneLeaf(next.root) && next.root.content.kind === 'term' && next.root.content.termId === termId) {
            return null;
        }
    }
    return next;
}

export function sanitizePaneLayout(layout: PaneLayout, knownTermIds: ReadonlySet<string>): PaneLayout | null {
    const prune = (node: PaneNode): PaneNode | null => {
        if (isPaneLeaf(node)) {
            if (node.content.kind !== 'term') return node;
            return knownTermIds.has(node.content.termId) ? node : null;
        }
        const left = prune(node.children[0]);
        const right = prune(node.children[1]);
        if (left && right) {
            return { ...node, children: [left, right] };
        }
        return left ?? right;
    };

    const root = prune(layout.root);
    if (!root) return null;
    const active = findNode(root, layout.activePaneId) ? layout.activePaneId : firstLeaf(root).id;
    return { version: PANE_LAYOUT_VERSION, root, activePaneId: active };
}

export function layoutActiveTermId(layout: PaneLayout | null | undefined): string | null {
    return activeTermId(layout);
}
