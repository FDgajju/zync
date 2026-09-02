import { normalizeSizes, sanitizePaneLayout } from './ops';
import { isPaneLeaf, isPaneSplit, isSafePaneLayout } from './query';
import { MAX_PANE_NESTING, PANE_LAYOUT_VERSION, type PaneLayout, type PaneNode, type SplitDirection } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseNode(raw: unknown, depth = 1): PaneNode | null {
    if (depth > MAX_PANE_NESTING) return null;
    if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id) return null;
    if (raw.type === 'pane') {
        const content = raw.content;
        if (!isRecord(content) || content.kind !== 'term' || typeof content.termId !== 'string' || !content.termId) {
            return null;
        }
        return { type: 'pane', id: raw.id, content: { kind: 'term', termId: content.termId } };
    }
    if (raw.type === 'split') {
        const direction = raw.direction === 'horizontal' ? 'horizontal' : raw.direction === 'vertical' ? 'vertical' : null;
        if (!direction) return null;
        if (!Array.isArray(raw.children) || raw.children.length !== 2) return null;
        const left = parseNode(raw.children[0], depth + 1);
        const right = parseNode(raw.children[1], depth + 1);
        if (!left || !right) return null;
        return {
            type: 'split',
            id: raw.id,
            direction: direction as SplitDirection,
            sizes: parseSizes(raw.sizes),
            children: [left, right],
        };
    }
    return null;
}

function parseSizes(raw: unknown): [number, number] {
    if (!Array.isArray(raw) || raw.length !== 2) return [0.5, 0.5];
    const a = Number(raw[0]);
    const b = Number(raw[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return [0.5, 0.5];
    return normalizeSizes([a, b]);
}

/** Accept persisted JSON; drop unknown terms; null if unusable. */
export function parsePaneLayout(raw: unknown, knownTermIds: ReadonlySet<string>): PaneLayout | null {
    if (!isRecord(raw)) return null;
    const root = parseNode(raw.root);
    if (!root) return null;
    const activePaneId = typeof raw.activePaneId === 'string' ? raw.activePaneId : (isPaneLeaf(root) ? root.id : root.id);
    const layout: PaneLayout = {
        version: PANE_LAYOUT_VERSION,
        root,
        activePaneId,
    };
    const clean = sanitizePaneLayout(layout, knownTermIds);
    if (!clean || !isSafePaneLayout(clean)) return null;
    return clean;
}

export function snapshotPaneLayouts(
    layouts: Record<string, PaneLayout | null | undefined>,
    terminals: Record<string, { id: string }[]>,
): Record<string, PaneLayout> {
    const out: Record<string, PaneLayout> = {};
    for (const [scopeId, layout] of Object.entries(layouts)) {
        if (!layout || !isPaneSplit(layout.root)) continue;
        const known = new Set((terminals[scopeId] ?? []).map((tab) => tab.id));
        const clean = sanitizePaneLayout(layout, known);
        if (clean && isPaneSplit(clean.root) && isSafePaneLayout(clean)) {
            out[scopeId] = clean;
        }
    }
    return out;
}
