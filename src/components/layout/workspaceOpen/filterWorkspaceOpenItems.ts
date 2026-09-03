import { WORKSPACE_OPEN_GROUP_ORDER } from './buildWorkspaceOpenItems';
import type { WorkspaceOpenGroup, WorkspaceOpenItem, WorkspaceOpenView } from './types';

export function normalizeWorkspaceOpenQuery(query: string): string {
    return query.trim().toLowerCase();
}

export function workspaceOpenItemMatches(
    item: WorkspaceOpenItem,
    query: string,
): boolean {
    const needle = normalizeWorkspaceOpenQuery(query);
    if (!needle) return true;
    if (item.label.toLowerCase().includes(needle)) return true;
    return item.keywords.some((keyword) => keyword.includes(needle));
}

export function filterWorkspaceOpenItems(
    items: readonly WorkspaceOpenItem[],
    query: string,
): WorkspaceOpenItem[] {
    return items.filter((item) => workspaceOpenItemMatches(item, query));
}

/** Root hides individual shells behind Other shells; search still finds them. */
export function visibleWorkspaceOpenItems(
    items: readonly WorkspaceOpenItem[],
    query: string,
    view: WorkspaceOpenView,
): WorkspaceOpenItem[] {
    if (view === 'shells') {
        return filterWorkspaceOpenItems(
            items.filter((item) => item.kind === 'shell'),
            query,
        );
    }
    const needle = normalizeWorkspaceOpenQuery(query);
    if (!needle) {
        return items.filter((item) => item.kind !== 'shell');
    }
    return filterWorkspaceOpenItems(
        items.filter((item) => item.kind !== 'other-shells'),
        query,
    );
}

export function groupWorkspaceOpenItems(
    items: readonly WorkspaceOpenItem[],
): Array<{ group: WorkspaceOpenGroup; items: WorkspaceOpenItem[] }> {
    const byGroup = new Map<WorkspaceOpenGroup, WorkspaceOpenItem[]>();
    for (const group of WORKSPACE_OPEN_GROUP_ORDER) {
        byGroup.set(group, []);
    }
    for (const item of items) {
        byGroup.get(item.group)?.push(item);
    }
    return WORKSPACE_OPEN_GROUP_ORDER
        .map((group) => ({ group, items: byGroup.get(group) ?? [] }))
        .filter((section) => section.items.length > 0);
}
