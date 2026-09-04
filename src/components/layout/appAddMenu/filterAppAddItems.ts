import { APP_ADD_GROUP_ORDER } from './buildAppAddItems';
import type { AppAddGroup, AppAddItem } from './types';

export function normalizeAppAddQuery(query: string): string {
    return query.trim().toLowerCase();
}

export function appAddItemMatches(item: AppAddItem, query: string): boolean {
    const needle = normalizeAppAddQuery(query);
    if (!needle) return true;
    if (item.label.toLowerCase().includes(needle)) return true;
    return item.keywords.some((keyword) => keyword.includes(needle));
}

export function visibleAppAddItems(
    items: readonly AppAddItem[],
    query: string,
): AppAddItem[] {
    const needle = normalizeAppAddQuery(query);
    if (!needle) return [...items];
    return items.filter((item) => {
        if (item.group === 'create') return true;
        return appAddItemMatches(item, query);
    });
}

export function groupAppAddItems(
    items: readonly AppAddItem[],
): Array<{ group: AppAddGroup; items: AppAddItem[] }> {
    const byGroup = new Map<AppAddGroup, AppAddItem[]>();
    for (const group of APP_ADD_GROUP_ORDER) {
        byGroup.set(group, []);
    }
    for (const item of items) {
        byGroup.get(item.group)?.push(item);
    }
    return APP_ADD_GROUP_ORDER
        .map((group) => ({ group, items: byGroup.get(group) ?? [] }))
        .filter((section) => section.items.length > 0);
}
