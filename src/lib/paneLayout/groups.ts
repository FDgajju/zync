import { parsePaneLayout } from './persist';
import { dropTerm, sanitizePaneLayout } from './ops';
import {
    activeTermId,
    firstTermLeaf,
    isPaneSplit,
    isSafePaneLayout,
    isSplitLayout,
    visibleTermIds,
} from './query';
import type { PaneLayout } from './types';

/** owner tab id → split tree. One host can have several split tabs. */
export type PaneLayoutGroups = Record<string, PaneLayout>;

export function sameSplitGroup(
    groups: PaneLayoutGroups | null | undefined,
    termA: string,
    termB: string,
): boolean {
    if (!termA || !termB) return false;
    return (findLayoutOwner(groups, termA) ?? termA) === (findLayoutOwner(groups, termB) ?? termB);
}

/** Dragging a shell already in this group is a no-op — no layout write. */
export function sameGroupTermDock(
    groups: PaneLayoutGroups | null | undefined,
    owner: string,
    termId: string,
): 'self' | null {
    return sameSplitGroup(groups, owner, termId) ? 'self' : null;
}

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

/** Prefer the layout's focused leaf over a stale active-terminal id after restore. */
export function focusedTermIdForRestore(
    groups: PaneLayoutGroups | null | undefined,
    requestedTermId: string | null | undefined,
    fallbackTermId: string | null,
): string | null {
    const fromLayout = (termId: string | null | undefined): string | null => {
        if (!termId || !groups) return null;
        const owner = findLayoutOwner(groups, termId);
        if (!owner) return null;
        return activeTermId(groups[owner]) ?? termId;
    };
    return fromLayout(requestedTermId)
        ?? fromLayout(fallbackTermId)
        ?? requestedTermId
        ?? fallbackTermId;
}

/**
 * Drop one shell from its split group without closing the rest.
 * Rekeys the group when the owner tab's PTY is the one that left.
 */
export function detachTermFromGroups(
    groups: PaneLayoutGroups | undefined,
    termId: string,
): {
    next: PaneLayoutGroups | undefined;
    remainingIds: string[];
    nextOwner: string | null;
} {
    const owner = findLayoutOwner(groups, termId);
    if (!owner || !groups) {
        return { next: groups, remainingIds: [], nextOwner: null };
    }
    const layout = groups[owner];
    if (!layout) {
        return { next: groups, remainingIds: [], nextOwner: null };
    }

    const dropped = dropTerm(layout, termId);
    const next: PaneLayoutGroups = { ...groups };
    delete next[owner];
    const remainingIds = dropped ? visibleTermIds(dropped).filter((id) => id !== termId) : [];

    if (dropped && isSplitLayout(dropped) && remainingIds.length > 0) {
        const nextOwner = remainingIds.includes(owner) ? owner : remainingIds[0];
        next[nextOwner] = dropped;
        return { next, remainingIds, nextOwner };
    }

    return {
        next: Object.keys(next).length > 0 ? next : undefined,
        remainingIds,
        nextOwner: remainingIds[0] ?? null,
    };
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
        const leaf = firstTermLeaf(layout.root);
        const owner = leaf && leaf.content.kind === 'term' ? leaf.content.termId : '';
        if (!owner || !knownTermIds.has(owner)) return {};
        return { [owner]: layout };
    }
    const out: PaneLayoutGroups = {};
    const seen = new Set<string>();
    for (const [owner, value] of Object.entries(raw)) {
        if (!knownTermIds.has(owner)) continue;
        const layout = parsePaneLayout(value, knownTermIds);
        if (!layout || !isSplitLayout(layout)) continue;
        const ids = visibleTermIds(layout);
        if (!ids.includes(owner)) continue;
        if (ids.some((id) => seen.has(id))) continue;
        for (const id of ids) seen.add(id);
        out[owner] = layout;
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
