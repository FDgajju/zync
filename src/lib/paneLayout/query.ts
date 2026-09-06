import {
    MAX_PANE_NESTING,
    MAX_VISIBLE_PANES,
    type FeaturePaneContent,
    type PaneLayout,
    type PaneLeaf,
    type PaneNode,
    type PaneSplit,
    type SplitFeatureId,
    type TermPaneContent,
} from './types';

export function isPaneLeaf(node: PaneNode): node is PaneLeaf {
    return node.type === 'pane';
}

export function isPaneSplit(node: PaneNode): node is PaneSplit {
    return node.type === 'split';
}

export function isTermContent(content: PaneLeaf['content']): content is TermPaneContent {
    return content.kind === 'term';
}

export function isFeatureContent(content: PaneLeaf['content']): content is FeaturePaneContent {
    return content.kind === 'feature';
}

export function collectLeaves(node: PaneNode, out: PaneLeaf[] = []): PaneLeaf[] {
    if (isPaneLeaf(node)) {
        out.push(node);
        return out;
    }
    collectLeaves(node.children[0], out);
    collectLeaves(node.children[1], out);
    return out;
}

export function leafCount(node: PaneNode | null | undefined): number {
    if (!node) return 0;
    return collectLeaves(node).length;
}

export function termLeafCount(node: PaneNode | null | undefined): number {
    if (!node) return 0;
    return collectLeaves(node).filter((leaf) => isTermContent(leaf.content)).length;
}

export function treeDepth(node: PaneNode): number {
    if (isPaneLeaf(node)) return 1;
    return 1 + Math.max(treeDepth(node.children[0]), treeDepth(node.children[1]));
}

export function isSafePaneLayout(layout: PaneLayout): boolean {
    return leafCount(layout.root) <= MAX_VISIBLE_PANES && treeDepth(layout.root) <= MAX_PANE_NESTING;
}

export function isSplitLayout(layout: PaneLayout | null | undefined): boolean {
    return Boolean(layout && isPaneSplit(layout.root));
}

export function visibleTermIds(layout: PaneLayout | null | undefined): string[] {
    if (!layout) return [];
    const ids: string[] = [];
    for (const leaf of collectLeaves(layout.root)) {
        if (isTermContent(leaf.content)) ids.push(leaf.content.termId);
    }
    return ids;
}

export function findNode(node: PaneNode, id: string): PaneNode | null {
    if (node.id === id) return node;
    if (isPaneLeaf(node)) return null;
    return findNode(node.children[0], id) ?? findNode(node.children[1], id);
}

export function findLeafByTerm(node: PaneNode, termId: string): PaneLeaf | null {
    if (isPaneLeaf(node)) {
        return isTermContent(node.content) && node.content.termId === termId ? node : null;
    }
    return findLeafByTerm(node.children[0], termId) ?? findLeafByTerm(node.children[1], termId);
}

export function findLeafByFeature(node: PaneNode, featureId: SplitFeatureId): PaneLeaf | null {
    if (isPaneLeaf(node)) {
        return isFeatureContent(node.content) && node.content.featureId === featureId ? node : null;
    }
    return findLeafByFeature(node.children[0], featureId) ?? findLeafByFeature(node.children[1], featureId);
}

export function layoutHasFeature(
    layout: PaneLayout | null | undefined,
    featureId: SplitFeatureId,
): boolean {
    return Boolean(layout && findLeafByFeature(layout.root, featureId));
}

export function findParentSplit(node: PaneNode, childId: string): PaneSplit | null {
    if (isPaneLeaf(node)) return null;
    if (node.children[0].id === childId || node.children[1].id === childId) return node;
    return findParentSplit(node.children[0], childId) ?? findParentSplit(node.children[1], childId);
}

export function firstLeaf(node: PaneNode): PaneLeaf {
    if (isPaneLeaf(node)) return node;
    return firstLeaf(node.children[0]);
}

export function firstTermLeaf(node: PaneNode): PaneLeaf | null {
    for (const leaf of collectLeaves(node)) {
        if (isTermContent(leaf.content)) return leaf;
    }
    return null;
}

export function activeTermId(layout: PaneLayout | null | undefined): string | null {
    if (!layout) return null;
    const focused = findNode(layout.root, layout.activePaneId);
    if (focused && isPaneLeaf(focused) && isTermContent(focused.content)) {
        return focused.content.termId;
    }
    const term = firstTermLeaf(layout.root);
    return term && isTermContent(term.content) ? term.content.termId : null;
}

export function isFeaturePaneFocused(
    layout: PaneLayout | null | undefined,
    featureId: SplitFeatureId,
): boolean {
    if (!layout) return false;
    const focused = findNode(layout.root, layout.activePaneId);
    return Boolean(
        focused
        && isPaneLeaf(focused)
        && isFeatureContent(focused.content)
        && focused.content.featureId === featureId,
    );
}
