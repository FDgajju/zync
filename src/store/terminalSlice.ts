import { StateCreator } from 'zustand';
import type { AppStore } from './useAppStore';
import { terminalService } from '../lib/terminal';
import type { TerminalTabSnapshot } from './sessionPersistence';
import { scheduleSaveSession } from './sessionSlice';
import {
    canSplit,
    dropTerm,
    findNode,
    firstLeaf,
    focusPane as focusPaneInLayout,
    isSplitLayout,
    layoutActiveTermId,
    findLayoutOwner,
    layoutForTerm,
    parsePaneLayoutGroups,
    setSplitSizes,
    singlePane,
    splitPane,
    unsplitPane,
    visibleTermIds,
    type PaneLayout,
    type PaneLayoutGroups,
    type SplitDirection,
} from '../lib/paneLayout';

export interface TerminalTab {
    id: string;
    title: string;
    initialPath?: string;
    lastKnownCwd?: string;
    isSynced?: boolean;
    /** True for SSH terminal tabs restored from session — PTY not yet spawned, waiting for reconnect. */
    pendingRestore?: boolean;
    /** Shell override passed to the backend PTY spawner for this specific tab.
     *  Undefined means "use the global default shell setting". */
    shellOverride?: string;
    /** False = split-only pane; hidden from the shell tab bar. Default true. */
    tabVisible?: boolean;
}

export interface TerminalSlice {
    /** Keyed by connectionId, stores the list of terminal tabs for each connection */
    terminals: Record<string, TerminalTab[]>;
    /** Keyed by connectionId, stores the ID of the currently active terminal tab */
    activeTerminalIds: Record<string, string | null>;
    /** Keyed by connectionId, stores the ID of the terminal that is currently synced with the File Manager */
    syncedTerminalId: Record<string, string | null>;
    /** Split trees per connection, keyed by the tab that owns the split. */
    paneLayouts: Record<string, PaneLayoutGroups | undefined>;

    // Actions
    /**
     * Creates a new terminal tab for a specific connection.
     * @param connectionId The ID of the connection to create the terminal for.
     * @param opts Optional creation options.
     * @returns The generated ID of the new terminal.
     */
    createTerminal: (connectionId: string, opts?: { initialPath?: string; isSynced?: boolean; shellOverride?: string; title?: string }) => string;

    /**
     * Ensures at least one terminal exists for a connection. Creates one if none exist.
     * @param connectionId The ID of the connection to check.
     * @param initialPath Optional starting directory for the new terminal if one is created.
     * @returns The ID of the ensured terminal.
     */
    ensureTerminal: (connectionId: string, initialPath?: string) => string;

    /**
     * Closes a specific terminal tab and cleans up associated backend processes and AI history.
     * @param connectionId The ID of the connection the terminal belongs to.
     * @param termId The ID of the terminal to close.
     */
    closeTerminal: (connectionId: string, termId: string) => void;

    /**
     * Sets a specific terminal as the active one for a connection.
     * @param connectionId The ID of the connection.
     * @param termId The ID of the terminal to make active.
     */
    setActiveTerminal: (connectionId: string, termId: string) => void;

    /**
     * Clears all terminal tabs for a specific connection and prunes all associated AI history.
     * @param connectionId The ID of the connection to clear terminals for.
     * @param options Optional. If preservePendingRestore is true, keep the tab list but mark with pendingRestore=true (for SSH reconnect flow) instead of fully deleting.
     */
    clearTerminals: (connectionId: string, options?: { preservePendingRestore?: boolean }) => void;

    /**
     * Updates the last known CWD of a terminal.
     */
    setTerminalCwd: (connectionId: string, termId: string, path: string) => void;

    /**
     * Updates the initialPath of a terminal tab record.
     */
    setTerminalInitialPath: (connectionId: string, termId: string, path: string) => void;

    /** Persist the shell used for a tab (e.g. after spawn when only settings had `wsl`). */
    setTerminalShellOverride: (connectionId: string, termId: string, shellOverride: string) => void;

    /**
     * Restore persisted terminal tabs for a connection on app start.
     * Uses saved IDs and metadata directly without spawning new UUIDs.
     * SSH tabs are marked pendingRestore=true until the connection reconnects.
     * Only called by sessionSlice.loadSession() during restore.
     */
    restoreTerminalTabs: (
        connectionId: string,
        snapshots: TerminalTabSnapshot[],
        activeTerminalId: string | null,
        paneLayout?: unknown,
    ) => void;

    splitPanes: (connectionId: string, direction?: SplitDirection) => void;
    unsplitPanes: (connectionId: string) => void;
    togglePanes: (connectionId: string) => void;
    resizePanes: (connectionId: string, splitId: string, sizes: [number, number], persist?: boolean) => void;
    focusPane: (connectionId: string, paneId: string) => void;

    /**
     * Clears the pendingRestore flag on all terminal tabs for a connection.
     * Called after a successful SSH reconnect so tabs can spawn their PTYs.
     */
    clearPendingRestore: (connectionId: string) => void;
}

// @ts-ignore
const ipc = window.ipcRenderer;

function isTabVisible(tab: TerminalTab): boolean {
    return tab.tabVisible !== false;
}

function setGroupLayout(
    groups: PaneLayoutGroups | undefined,
    owner: string,
    layout: PaneLayout | null,
): PaneLayoutGroups | undefined {
    const next = { ...(groups ?? {}) };
    if (layout && isSplitLayout(layout)) {
        next[owner] = layout;
        return next;
    }
    delete next[owner];
    return Object.keys(next).length > 0 ? next : undefined;
}

export const createTerminalSlice: StateCreator<AppStore, [], [], TerminalSlice> = (set, get) => ({
    terminals: {},
    activeTerminalIds: {},
    syncedTerminalId: {},
    paneLayouts: {},

    /** @inheritdoc */
    createTerminal: (connectionId, opts) => {
        const initialPath = opts?.initialPath;
        const isSynced = opts?.isSynced ?? false;
        const newId = `term-${crypto.randomUUID()}`;
        set(state => {
            const currentTabs = state.terminals[connectionId] || [];
            const visibleCount = currentTabs.filter(t => t.tabVisible !== false).length;
            const defaultTitle = `Shell ${visibleCount + 1}`;
            const newTab: TerminalTab = {
                id: newId,
                title: opts?.title ?? (isSynced ? `Synced Terminal` : defaultTitle),
                initialPath,
                isSynced,
                shellOverride: opts?.shellOverride,
                tabVisible: true,
            };

            const nextSyncedIds = { ...state.syncedTerminalId };
            if (isSynced) {
                // If we are creating a new synced terminal, it becomes the primary synced one for this connection
                nextSyncedIds[connectionId] = newId;
            }

            return {
                terminals: {
                    ...state.terminals,
                    [connectionId]: [...currentTabs, newTab]
                },
                activeTerminalIds: {
                    ...state.activeTerminalIds,
                    [connectionId]: newId
                },
                syncedTerminalId: nextSyncedIds,
            };
        });
        scheduleSaveSession(() => get().saveSession());
        return newId;
    },

    /** @inheritdoc */
    ensureTerminal: (connectionId, initialPath) => {
        const state = get();
        const currentTabs = state.terminals[connectionId] || [];
        const barTabs = currentTabs.filter(isTabVisible);
        if (barTabs.length === 0) {
            return get().createTerminal(connectionId, { initialPath });
        }
        const activeId = state.activeTerminalIds[connectionId];
        if (activeId && currentTabs.some((tab) => tab.id === activeId)) {
            return activeId;
        }
        const fallbackId = barTabs[0].id;
        set(prev => ({
            activeTerminalIds: {
                ...prev.activeTerminalIds,
                [connectionId]: fallbackId,
            },
        }));
        scheduleSaveSession(() => get().saveSession());
        return fallbackId;
    },

    /** @inheritdoc */
    closeTerminal: (connectionId, termId) => {
        const owned = get().paneLayouts[connectionId]?.[termId];
        const extraIds = owned
            ? visibleTermIds(owned).filter((id) => id !== termId)
            : [];
        for (const id of [termId, ...extraIds]) {
            ipc.send('terminal:kill', { termId: id });
            terminalService.destroy(id);
        }

        set(state => {
            const currentTabs = state.terminals[connectionId] || [];
            const groups = state.paneLayouts[connectionId];
            const removeIds = new Set([termId, ...extraIds]);

            const newTabs = currentTabs.filter(t => !removeIds.has(t.id));

            // Determine new active tab if we closed the active one
            let newActiveId = state.activeTerminalIds[connectionId];
            if (newActiveId && removeIds.has(newActiveId)) {
                const barTabs = newTabs.filter(isTabVisible);
                newActiveId = barTabs.length > 0 ? barTabs[barTabs.length - 1].id : (newTabs[0]?.id ?? null);
            }

            // Cleanup synced terminal reference if closed
            const nextSyncedIds = { ...state.syncedTerminalId };
            if (nextSyncedIds[connectionId] && removeIds.has(nextSyncedIds[connectionId]!)) {
                nextSyncedIds[connectionId] = null;
            }

            let nextConversations = state.aiConversations;
            let nextDisplay = state.aiDisplayHistory;
            for (const id of removeIds) {
                const { [id]: _c, ...restC } = nextConversations;
                const { [id]: _d, ...restD } = nextDisplay;
                nextConversations = restC;
                nextDisplay = restD;
            }

            let nextGroups = { ...(groups ?? {}) };
            delete nextGroups[termId];
            for (const [owner, layout] of Object.entries(nextGroups)) {
                const contained = visibleTermIds(layout).includes(termId);
                const dropped = dropTerm(layout, termId);
                if (dropped && isSplitLayout(dropped)) {
                    nextGroups[owner] = dropped;
                    if (contained) {
                        const remaining = layoutActiveTermId(dropped);
                        if (remaining) newActiveId = remaining;
                    }
                } else {
                    if (contained) {
                        const remaining = dropped ? layoutActiveTermId(dropped) : null;
                        if (remaining) newActiveId = remaining;
                    }
                    delete nextGroups[owner];
                }
            }
            const nextLayouts = { ...state.paneLayouts };
            if (Object.keys(nextGroups).length > 0) {
                nextLayouts[connectionId] = nextGroups;
            } else {
                delete nextLayouts[connectionId];
            }

            return {
                terminals: {
                    ...state.terminals,
                    [connectionId]: newTabs
                },
                activeTerminalIds: {
                    ...state.activeTerminalIds,
                    [connectionId]: newActiveId
                },
                syncedTerminalId: nextSyncedIds,
                paneLayouts: nextLayouts,
                aiConversations: nextConversations,
                aiDisplayHistory: nextDisplay,
            };
        });
        get().saveSession();
    },

    /** @inheritdoc */
    setActiveTerminal: (connectionId, termId) => {
        set(state => {
            const groups = state.paneLayouts[connectionId];
            const tab = (state.terminals[connectionId] || []).find(t => t.id === termId);
            let nextActive = termId;
            if (tab && isTabVisible(tab)) {
                const layout = groups?.[termId];
                if (layout && isSplitLayout(layout)) {
                    nextActive = layoutActiveTermId(layout) ?? termId;
                }
            }
            return {
                activeTerminalIds: {
                    ...state.activeTerminalIds,
                    [connectionId]: nextActive
                },
            };
        });
        scheduleSaveSession(() => get().saveSession());
    },

    /** @inheritdoc */
    clearTerminals: (connectionId, options = {}) => {
        set(state => {
            const tabs = state.terminals[connectionId] || [];

            if (!options.preservePendingRestore) {
                // Kill/destroy only when not preserving (for reconnect/restore flow).
                tabs.forEach(t => {
                    ipc.send('terminal:kill', { termId: t.id });
                    terminalService.destroy(t.id);
                });
            }

            if (options.preservePendingRestore) {
                // Preserve tab list with pendingRestore metadata for SSH reconnect/restore flow (roadmap 5.9)
                // Do not delete active/synced so reconnect can wake the tabs.
                return {
                    terminals: {
                        ...state.terminals,
                        [connectionId]: tabs.map(t => ({ ...t, pendingRestore: true }))
                    },
                };
            }

            const newTerminals = { ...state.terminals };
            delete newTerminals[connectionId];

            const newActiveIds = { ...state.activeTerminalIds };
            delete newActiveIds[connectionId];

            const newSyncedIds = { ...state.syncedTerminalId };
            delete newSyncedIds[connectionId];

            const nextLayouts = { ...state.paneLayouts };
            delete nextLayouts[connectionId];

            // 🗑️ Prune AI history for all cleared terminals
            const termIdsToRemove = new Set(tabs.map(t => t.id));
            const nextConversations = Object.fromEntries(
                Object.entries(state.aiConversations).filter(([id]) => !termIdsToRemove.has(id))
            );
            const nextDisplay = Object.fromEntries(
                Object.entries(state.aiDisplayHistory).filter(([id]) => !termIdsToRemove.has(id))
            );

            return {
                terminals: newTerminals,
                activeTerminalIds: newActiveIds,
                syncedTerminalId: newSyncedIds,
                paneLayouts: nextLayouts,
                aiConversations: nextConversations,
                aiDisplayHistory: nextDisplay
            };
        });
        scheduleSaveSession(() => get().saveSession());
    },

    /** @inheritdoc */
    setTerminalCwd: (connectionId, termId, path) => {
        set(state => {
            const currentTabs = state.terminals[connectionId] || [];
            const newTabs = currentTabs.map(t =>
                t.id === termId ? { ...t, lastKnownCwd: path } : t
            );
            return {
                terminals: {
                    ...state.terminals,
                    [connectionId]: newTabs
                }
            };
        });
        // CWD changes on every `cd` — debounce to avoid flooding disk.
        scheduleSaveSession(() => get().saveSession());
    },

    /** @inheritdoc */
    setTerminalInitialPath: (connectionId, termId, path) => {
        set(state => {
            const currentTabs = state.terminals[connectionId] || [];
            const newTabs = currentTabs.map(t =>
                t.id === termId ? { ...t, initialPath: path } : t
            );
            return {
                terminals: {
                    ...state.terminals,
                    [connectionId]: newTabs
                }
            };
        });
        scheduleSaveSession(() => get().saveSession());
    },

    /** @inheritdoc */
    setTerminalShellOverride: (connectionId, termId, shellOverride) => {
        set(state => {
            const currentTabs = state.terminals[connectionId] || [];
            const newTabs = currentTabs.map(t =>
                t.id === termId ? { ...t, shellOverride } : t
            );
            return {
                terminals: {
                    ...state.terminals,
                    [connectionId]: newTabs
                }
            };
        });
        scheduleSaveSession(() => get().saveSession());
    },

    /** @inheritdoc */
    restoreTerminalTabs: (connectionId, snapshots, activeTerminalId, paneLayout) => {
        const isSSH = connectionId !== 'local';
        const tabs: TerminalTab[] = snapshots.map(s => ({
            id: s.id,
            title: s.title,
            initialPath: s.initialPath,
            lastKnownCwd: s.cwd,
            isSynced: s.isSynced ?? false,
            shellOverride: s.shellOverride,
            tabVisible: s.tabVisible,
            pendingRestore: isSSH || undefined,
        }));

        const syncedTab = tabs.find(t => t.isSynced);
        const known = new Set(tabs.map(t => t.id));
        const restoredGroups = parsePaneLayoutGroups(paneLayout, known);
        const hidden = new Set<string>();
        for (const [owner, layout] of Object.entries(restoredGroups)) {
            for (const id of visibleTermIds(layout)) {
                if (id !== owner) hidden.add(id);
            }
        }
        const tabsWithVisibility = tabs.map(t => ({
            ...t,
            tabVisible: hidden.has(t.id) ? false : t.tabVisible !== false,
        }));
        set(state => {
            const nextLayouts = { ...state.paneLayouts };
            if (Object.keys(restoredGroups).length > 0) {
                nextLayouts[connectionId] = restoredGroups;
            } else {
                delete nextLayouts[connectionId];
            }
            return {
                terminals: {
                    ...state.terminals,
                    [connectionId]: tabsWithVisibility,
                },
                activeTerminalIds: {
                    ...state.activeTerminalIds,
                    [connectionId]: activeTerminalId ?? (tabs[0]?.id ?? null),
                },
                syncedTerminalId: {
                    ...state.syncedTerminalId,
                    [connectionId]: syncedTab?.id ?? null,
                },
                paneLayouts: nextLayouts,
            };
        });
    },

    /** @inheritdoc */
    clearPendingRestore: (connectionId) => {
        set(state => {
            const tabs = state.terminals[connectionId];
            if (!tabs?.some(t => t.pendingRestore)) return state;
            return {
                terminals: {
                    ...state.terminals,
                    [connectionId]: tabs.map(t =>
                        t.pendingRestore ? { ...t, pendingRestore: undefined } : t
                    ),
                },
            };
        });
    },

    splitPanes: (connectionId, direction = 'vertical') => {
        set(state => {
            const tabs = state.terminals[connectionId] || [];
            const activeId = state.activeTerminalIds[connectionId] ?? tabs.find(isTabVisible)?.id ?? null;
            if (!activeId) return state;

            const groups = state.paneLayouts[connectionId];
            const owner = findLayoutOwner(groups, activeId) ?? activeId;
            const layout = groups?.[owner] ?? singlePane(owner);
            if (!canSplit(layout)) return state;

            const otherId = `term-${crypto.randomUUID()}`;
            const nextTabs = [
                ...tabs,
                {
                    id: otherId,
                    title: `${tabs.find(t => t.id === owner)?.title ?? 'Shell'} · pane`,
                    tabVisible: false,
                    shellOverride: tabs.find(t => t.id === owner)?.shellOverride,
                },
            ];

            const target = findNode(layout.root, layout.activePaneId) ?? firstLeaf(layout.root);
            const result = splitPane(layout, target.id, direction, { kind: 'term', termId: otherId });
            if (!result.ok) return state;

            const nextLayouts = { ...state.paneLayouts };
            nextLayouts[connectionId] = { ...(groups ?? {}), [owner]: result.layout };

            return {
                terminals: { ...state.terminals, [connectionId]: nextTabs },
                paneLayouts: nextLayouts,
            };
        });
        scheduleSaveSession(() => get().saveSession());
    },

    unsplitPanes: (connectionId) => {
        set(state => {
            const activeId = state.activeTerminalIds[connectionId];
            if (!activeId) return state;
            const groups = state.paneLayouts[connectionId];
            const owner = findLayoutOwner(groups, activeId);
            const layout = owner ? groups?.[owner] : undefined;
            if (!owner || !layout || !isSplitLayout(layout)) return state;

            const next = unsplitPane(layout, layout.activePaneId);
            const stillSplit = isSplitLayout(next) ? new Set(visibleTermIds(next)) : new Set<string>();
            const leftoverSet = new Set(visibleTermIds(layout).filter(id => !stillSplit.has(id)));
            const nextTabs = (state.terminals[connectionId] || []).map(t =>
                leftoverSet.has(t.id) && t.tabVisible === false
                    ? { ...t, tabVisible: true }
                    : t
            );

            const nextLayouts = { ...state.paneLayouts };
            const nextGroups = setGroupLayout(groups, owner, isSplitLayout(next) ? next : null);
            if (nextGroups) {
                nextLayouts[connectionId] = nextGroups;
            } else {
                delete nextLayouts[connectionId];
            }
            const keepId = layoutActiveTermId(next) ?? owner;
            return {
                terminals: { ...state.terminals, [connectionId]: nextTabs },
                paneLayouts: nextLayouts,
                activeTerminalIds: { ...state.activeTerminalIds, [connectionId]: keepId },
            };
        });
        scheduleSaveSession(() => get().saveSession());
    },

    togglePanes: (connectionId) => {
        const activeId = get().activeTerminalIds[connectionId];
        const layout = activeId ? layoutForTerm(get().paneLayouts[connectionId], activeId) : undefined;
        if (canSplit(layout ?? null)) {
            get().splitPanes(connectionId);
        } else if (layout && isSplitLayout(layout)) {
            get().unsplitPanes(connectionId);
        }
    },

    resizePanes: (connectionId, splitId, sizes, persist = false) => {
        set(state => {
            const activeId = state.activeTerminalIds[connectionId];
            if (!activeId) return state;
            const groups = state.paneLayouts[connectionId];
            const owner = findLayoutOwner(groups, activeId);
            const layout = owner ? groups?.[owner] : undefined;
            if (!owner || !layout) return state;
            const nextGroups = { ...(groups ?? {}), [owner]: setSplitSizes(layout, splitId, sizes) };
            return {
                paneLayouts: { ...state.paneLayouts, [connectionId]: nextGroups },
            };
        });
        if (persist) {
            scheduleSaveSession(() => get().saveSession());
        }
    },

    focusPane: (connectionId, paneId) => {
        set(state => {
            const activeId = state.activeTerminalIds[connectionId];
            if (!activeId) return state;
            const groups = state.paneLayouts[connectionId];
            const owner = findLayoutOwner(groups, activeId);
            const layout = owner ? groups?.[owner] : undefined;
            if (!owner || !layout) return state;
            const next = focusPaneInLayout(layout, paneId);
            const termId = layoutActiveTermId(next);
            return {
                paneLayouts: {
                    ...state.paneLayouts,
                    [connectionId]: { ...(groups ?? {}), [owner]: next },
                },
                activeTerminalIds: termId
                    ? { ...state.activeTerminalIds, [connectionId]: termId }
                    : state.activeTerminalIds,
            };
        });
        scheduleSaveSession(() => get().saveSession());
    },
});
