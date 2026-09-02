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
    parsePaneLayout,
    selectTerm,
    setSplitSizes,
    singlePane,
    splitPane,
    visibleTermIds,
    type PaneLayout,
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
}

export interface TerminalSlice {
    /** Keyed by connectionId, stores the list of terminal tabs for each connection */
    terminals: Record<string, TerminalTab[]>;
    /** Keyed by connectionId, stores the ID of the currently active terminal tab */
    activeTerminalIds: Record<string, string | null>;
    /** Keyed by connectionId, stores the ID of the terminal that is currently synced with the File Manager */
    syncedTerminalId: Record<string, string | null>;
    /** Split tree per connection. Missing/null = one pane (the active terminal). */
    paneLayouts: Record<string, PaneLayout | undefined>;

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
            const defaultTitle = `Shell ${currentTabs.length + 1}`;
            const newTab: TerminalTab = {
                id: newId,
                title: opts?.title ?? (isSynced ? `Synced Terminal` : defaultTitle),
                initialPath,
                isSynced,
                shellOverride: opts?.shellOverride,
            };

            const nextSyncedIds = { ...state.syncedTerminalId };
            if (isSynced) {
                // If we are creating a new synced terminal, it becomes the primary synced one for this connection
                nextSyncedIds[connectionId] = newId;
            }

            const storedLayout = state.paneLayouts[connectionId];
            const nextLayouts = { ...state.paneLayouts };
            if (storedLayout && isSplitLayout(storedLayout)) {
                nextLayouts[connectionId] = selectTerm(storedLayout, newId);
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
                paneLayouts: nextLayouts,
            };
        });
        scheduleSaveSession(() => get().saveSession());
        return newId;
    },

    /** @inheritdoc */
    ensureTerminal: (connectionId, initialPath) => {
        const state = get();
        const currentTabs = state.terminals[connectionId] || [];
        if (currentTabs.length === 0) {
            return get().createTerminal(connectionId, { initialPath });
        }
        const activeId = state.activeTerminalIds[connectionId];
        if (activeId && currentTabs.some((tab) => tab.id === activeId)) {
            return activeId;
        }
        const fallbackId = currentTabs[0].id;
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
        // Kill backend process first
        ipc.send('terminal:kill', { termId });

        // Destroy the xterm instance from cache (frees memory, clears history)
        terminalService.destroy(termId);

        set(state => {
            const currentTabs = state.terminals[connectionId] || [];
            const newTabs = currentTabs.filter(t => t.id !== termId);

            // Determine new active tab if we closed the active one
            let newActiveId = state.activeTerminalIds[connectionId];
            if (newActiveId === termId) {
                newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
            }

            // Cleanup synced terminal reference if closed
            const nextSyncedIds = { ...state.syncedTerminalId };
            if (nextSyncedIds[connectionId] === termId) {
                nextSyncedIds[connectionId] = null;
            }

            // 🗑️ Free AI conversation history for the closed tab (memory-safe)
            const { [termId]: _, ...nextConversations } = state.aiConversations;

            // 🗑️ Free AI display history for the closed tab
            const { [termId]: __, ...nextDisplay } = state.aiDisplayHistory;

            const nextLayouts = { ...state.paneLayouts };
            const storedLayout = state.paneLayouts[connectionId];
            if (storedLayout) {
                const dropped = dropTerm(storedLayout, termId);
                if (dropped && isSplitLayout(dropped)) {
                    nextLayouts[connectionId] = dropped;
                    const remaining = layoutActiveTermId(dropped);
                    if (remaining) newActiveId = remaining;
                } else {
                    const remaining = dropped ? layoutActiveTermId(dropped) : null;
                    if (remaining) newActiveId = remaining;
                    delete nextLayouts[connectionId];
                }
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
            const storedLayout = state.paneLayouts[connectionId];
            const nextLayouts = { ...state.paneLayouts };
            if (storedLayout && isSplitLayout(storedLayout)) {
                nextLayouts[connectionId] = selectTerm(storedLayout, termId);
            }
            return {
                activeTerminalIds: {
                    ...state.activeTerminalIds,
                    [connectionId]: termId
                },
                paneLayouts: nextLayouts,
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
            pendingRestore: isSSH || undefined,
        }));

        const syncedTab = tabs.find(t => t.isSynced);
        const known = new Set(tabs.map(t => t.id));
        const restoredLayout = parsePaneLayout(paneLayout, known);
        set(state => {
            const nextLayouts = { ...state.paneLayouts };
            if (restoredLayout && isSplitLayout(restoredLayout)) {
                nextLayouts[connectionId] = restoredLayout;
            } else {
                delete nextLayouts[connectionId];
            }
            return {
                terminals: {
                    ...state.terminals,
                    [connectionId]: tabs,
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
            const activeId = state.activeTerminalIds[connectionId] ?? tabs[0]?.id ?? null;
            if (!activeId) return state;

            let nextTabs = tabs;
            let layout = state.paneLayouts[connectionId] ?? singlePane(activeId);
            if (!canSplit(layout)) return state;

            const visible = new Set(visibleTermIds(layout));
            let otherId = nextTabs.find(t => t.id !== activeId && !visible.has(t.id))?.id;
            if (!otherId) {
                otherId = nextTabs.find(t => t.id !== activeId)?.id;
            }
            if (!otherId) {
                otherId = `term-${crypto.randomUUID()}`;
                nextTabs = [
                    ...nextTabs,
                    {
                        id: otherId,
                        title: `Shell ${nextTabs.length + 1}`,
                    },
                ];
            }

            const target = findNode(layout.root, layout.activePaneId) ?? firstLeaf(layout.root);
            const result = splitPane(layout, target.id, direction, { kind: 'term', termId: otherId });
            if (!result.ok) return state;

            return {
                terminals: { ...state.terminals, [connectionId]: nextTabs },
                paneLayouts: { ...state.paneLayouts, [connectionId]: result.layout },
            };
        });
        scheduleSaveSession(() => get().saveSession());
    },

    unsplitPanes: (connectionId) => {
        set(state => {
            const layout = state.paneLayouts[connectionId];
            if (!layout || !isSplitLayout(layout)) return state;
            const nextLayouts = { ...state.paneLayouts };
            delete nextLayouts[connectionId];
            const keepId = layoutActiveTermId(layout);
            return {
                paneLayouts: nextLayouts,
                activeTerminalIds: keepId
                    ? { ...state.activeTerminalIds, [connectionId]: keepId }
                    : state.activeTerminalIds,
            };
        });
        scheduleSaveSession(() => get().saveSession());
    },

    togglePanes: (connectionId) => {
        const layout = get().paneLayouts[connectionId];
        if (layout && isSplitLayout(layout)) {
            get().unsplitPanes(connectionId);
        } else {
            get().splitPanes(connectionId);
        }
    },

    resizePanes: (connectionId, splitId, sizes, persist = false) => {
        set(state => {
            const layout = state.paneLayouts[connectionId];
            if (!layout) return state;
            return {
                paneLayouts: {
                    ...state.paneLayouts,
                    [connectionId]: setSplitSizes(layout, splitId, sizes),
                },
            };
        });
        if (persist) {
            scheduleSaveSession(() => get().saveSession());
        }
    },

    focusPane: (connectionId, paneId) => {
        set(state => {
            const layout = state.paneLayouts[connectionId];
            if (!layout) return state;
            const next = focusPaneInLayout(layout, paneId);
            const termId = layoutActiveTermId(next);
            return {
                paneLayouts: { ...state.paneLayouts, [connectionId]: next },
                activeTerminalIds: termId
                    ? { ...state.activeTerminalIds, [connectionId]: termId }
                    : state.activeTerminalIds,
            };
        });
        scheduleSaveSession(() => get().saveSession());
    },
});
