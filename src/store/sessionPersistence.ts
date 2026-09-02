import type { Tab } from '../features/connections/domain/types.js';
import type { VaultProfileId } from '../vault/profileTypes.js';
import { snapshotPaneLayoutGroups, visibleTermIds, type PaneLayoutGroups } from '../lib/paneLayout';

export interface TerminalTabSnapshot {
    id: string;
    title: string;
    cwd?: string;
    initialPath?: string;
    isSynced?: boolean;
    shellOverride?: string;
    tabVisible?: boolean;
}

export interface TabSnapshot {
    id: string;
    tabType: string;
    title: string;
    connectionId?: string;
    vaultProfileId?: VaultProfileId;
    view: string;
}

export interface SessionData {
    version: number;
    showWelcomeScreen: boolean;
    activeTabId?: string;
    activeConnectionId?: string;
    tabs: TabSnapshot[];
    terminals: Record<string, TerminalTabSnapshot[]>;
    activeTerminalIds: Record<string, string>;
    paneLayouts?: Record<string, PaneLayoutGroups>;
}

export interface SessionStoreSnapshot {
    showWelcomeScreen?: boolean;
    activeTabId: string | null;
    activeConnectionId: string | null;
    tabs: Tab[];
    terminals: Record<string, SessionTerminalTabState[]>;
    activeTerminalIds: Record<string, string | null>;
    paneLayouts?: Record<string, PaneLayoutGroups | undefined>;
}

export interface SessionTerminalTabState {
    id: string;
    title: string;
    lastKnownCwd?: string;
    initialPath?: string;
    isSynced?: boolean;
    shellOverride?: string;
    tabVisible?: boolean;
}

export const MAX_TABS_PER_SCOPE = 20;

function keepTerminalsForSession(
    tabs: SessionTerminalTabState[],
    groups: PaneLayoutGroups | undefined,
    cap = MAX_TABS_PER_SCOPE,
): SessionTerminalTabState[] {
    const visibleAll = tabs.filter(t => t.tabVisible !== false);
    const byId = new Map(tabs.map(t => [t.id, t]));
    const keptVisible: SessionTerminalTabState[] = [];
    const keptHidden: SessionTerminalTabState[] = [];
    let remaining = cap;

    for (const tab of visibleAll) {
        const extraHidden: SessionTerminalTabState[] = [];
        const layout = groups?.[tab.id];
        if (layout) {
            for (const id of visibleTermIds(layout)) {
                if (id === tab.id) continue;
                const extra = byId.get(id);
                if (extra && extra.tabVisible === false) extraHidden.push(extra);
            }
        }
        const needed = 1 + extraHidden.length;
        if (needed > remaining) continue;
        keptVisible.push(tab);
        keptHidden.push(...extraHidden);
        remaining -= needed;
    }

    return [...keptVisible, ...keptHidden];
}

export function buildSessionData(state: SessionStoreSnapshot): SessionData {
    const filteredTabs = (state.tabs ?? []).filter(t => t.type !== 'settings');
    const terminals = Object.fromEntries(
        Object.entries(state.terminals ?? {}).map(([connId, tabs]) => {
            const kept = keepTerminalsForSession(tabs, state.paneLayouts?.[connId]);
            return [connId, kept.map(t => ({
                id: t.id,
                title: t.title,
                cwd: t.lastKnownCwd,
                initialPath: t.initialPath,
                isSynced: t.isSynced,
                ...(t.shellOverride !== undefined && { shellOverride: t.shellOverride }),
                ...(t.tabVisible === false && { tabVisible: false as const }),
            }))];
        }),
    ) as Record<string, TerminalTabSnapshot[]>;

    return {
        version: 1,
        showWelcomeScreen: Boolean(state.showWelcomeScreen),
        activeTabId: filteredTabs.some(t => t.id === state.activeTabId)
            ? (state.activeTabId ?? undefined)
            : undefined,
        activeConnectionId: state.activeConnectionId ?? undefined,
        // Exclude transient UI-only tabs (settings) from persistence.
        tabs: filteredTabs.map(t => ({
            id: t.id,
            tabType: t.type,
            title: t.title,
            connectionId: t.connectionId,
            ...(t.vaultProfileId !== undefined && { vaultProfileId: t.vaultProfileId }),
            view: t.view,
        })),
        terminals,
        activeTerminalIds: Object.fromEntries(
            (Object.entries(state.activeTerminalIds ?? {}) as [string, string | null][])
                .filter(
                    (entry): entry is [string, string] =>
                        entry[1] != null &&
                        (terminals[entry[0]] ?? []).some(tab => tab.id === entry[1]),
                ),
        ),
        paneLayouts: snapshotPaneLayoutGroups(state.paneLayouts ?? {}, terminals),
    };
}
