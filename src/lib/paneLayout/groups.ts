import { parsePaneLayout } from './persist';
import { sanitizePaneLayout } from './ops';
import {
    firstLeaf,
    isPaneSplit,
    isSafePaneLayout,
    isSplitLayout,
    visibleTermIds,
} from './query';
import type { PaneLayout } from './types';

/** owner tab id → split tree. One host can have several split tabs. */
export type PaneLayoutGroups = Record<string, PaneLayout>;

export function findLayoutOwner(
    groups: PaneLayoutGroups | null | undefined,
    termId: string,
): string | null {
    if (!groups || !termId) return null;
    if (groups[termId] && isSplitLayout(groups[termId])) return termId;
    for (const [owner, layout] of Object.entries(groups)) {
        if (visibleTermIds(layout).includes(termId)) return owner;
    }
    return null;
}

export function layoutForTerm(
    groups: PaneLayoutGroups | null | undefined,
    termId: string,
): PaneLayout | undefined {
    const owner = findLayoutOwner(groups, termId);
    return owner ? groups![owner] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isLegacyLayout(raw: Record<string, unknown>): boolean {
    return 'root' in raw && 'activePaneId' in raw;
}

/** Restore per-tab groups. Old session files stored one tree per host. */
export function parsePaneLayoutGroups(raw: unknown, knownTermIds: ReadonlySet<string>): PaneLayoutGroups {
    if (!isRecord(raw)) return {};
    if (isLegacyLayout(raw)) {
        const layout = parsePaneLayout(raw, knownTermIds);
        if (!layout || !isSplitLayout(layout)) return {};
        const leaf = firstLeaf(layout.root);
        const owner = leaf.content.kind === 'term' ? leaf.content.termId : '';
        if (!owner || !knownTermIds.has(owner)) return {};
        return { [owner]: layout };
    }
    const out: PaneLayoutGroups = {};
    for (const [owner, value] of Object.entries(raw)) {
        if (!knownTermIds.has(owner)) continue;
        const layout = parsePaneLayout(value, knownTermIds);
        if (layout && isSplitLayout(layout)) {
            out[owner] = layout;
        }
    }
    return out;
}

export function snapshotPaneLayoutGroups(
    layouts: Record<string, PaneLayoutGroups | null | undefined>,
    terminals: Record<string, { id: string }[]>,
): Record<string, PaneLayoutGroups> {
    const out: Record<string, PaneLayoutGroups> = {};
    for (const [scopeId, groups] of Object.entries(layouts)) {
        if (!groups) continue;
        const known = new Set((terminals[scopeId] ?? []).map((tab) => tab.id));
        const groupOut: PaneLayoutGroups = {};
        for (const [owner, layout] of Object.entries(groups)) {
            if (!layout || !known.has(owner) || !isPaneSplit(layout.root)) continue;
            const clean = sanitizePaneLayout(layout, known);
            if (clean && isSplitLayout(clean) && isSafePaneLayout(clean)) {
                groupOut[owner] = clean;
            }
        }
        if (Object.keys(groupOut).length > 0) {
            out[scopeId] = groupOut;
        }
    }
    return out;
}
