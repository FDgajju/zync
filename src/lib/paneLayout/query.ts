import { MAX_PANE_NESTING, MAX_VISIBLE_PANES, type PaneLayout, type PaneLeaf, type PaneNode, type PaneSplit } from './types';

export function isPaneLeaf(node: PaneNode): node is PaneLeaf {
    return node.type === 'pane';
}

export function isPaneSplit(node: PaneNode): node is PaneSplit {
    return node.type === 'split';
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
    return collectLeaves(layout.root)
        .filter((leaf) => leaf.content.kind === 'term')
        .map((leaf) => leaf.content.termId);
}

export function findNode(node: PaneNode, id: string): PaneNode | null {
    if (node.id === id) return node;
    if (isPaneLeaf(node)) return null;
    return findNode(node.children[0], id) ?? findNode(node.children[1], id);
}

export function findLeafByTerm(node: PaneNode, termId: string): PaneLeaf | null {
    if (isPaneLeaf(node)) {
        return node.content.kind === 'term' && node.content.termId === termId ? node : null;
    }
    return findLeafByTerm(node.children[0], termId) ?? findLeafByTerm(node.children[1], termId);
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

export function activeTermId(layout: PaneLayout | null | undefined): string | null {
    if (!layout) return null;
    const focused = findNode(layout.root, layout.activePaneId);
    if (focused && isPaneLeaf(focused) && focused.content.kind === 'term') {
        return focused.content.termId;
    }
    const leaf = firstLeaf(layout.root);
    return leaf.content.kind === 'term' ? leaf.content.termId : null;
}
