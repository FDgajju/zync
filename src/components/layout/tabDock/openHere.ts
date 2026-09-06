import {
    canSplit,
    findLeafByFeature,
    findLeafByTerm,
    layoutForTerm,
    layoutHasFeature,
    type DockEdge,
} from '../../../lib/paneLayout';
import { useAppStore } from '../../../store/useAppStore';
import { directoryFromFileLocation, pickFilesOpenPath, type OpenHereFile } from './openHerePaths';

export {
    directoryFromFileLocation,
    parentDirectory,
    pickFilesOpenPath,
    type OpenHereFile,
} from './openHerePaths';

function toastPaneCap(): void {
    useAppStore.getState().showToast('info', 'This tab already has 4 panes.');
}

function layoutForConnection(connectionId: string) {
    const store = useAppStore.getState();
    const activeId = store.activeTerminalIds[connectionId];
    if (!activeId) return undefined;
    return layoutForTerm(store.paneLayouts[connectionId], activeId);
}

function paneIdForTerm(connectionId: string, termId: string): string | null {
    const layout = layoutForConnection(connectionId);
    if (!layout) return null;
    return findLeafByTerm(layout.root, termId)?.id ?? null;
}

function paneIdForFiles(connectionId: string): string | null {
    const layout = layoutForConnection(connectionId);
    if (!layout) return null;
    return findLeafByFeature(layout.root, 'files')?.id ?? null;
}

function filesSplitSnapshot(connectionId: string, syncedTermId?: string) {
    const layout = layoutForConnection(connectionId);
    return {
        filesPaneId: layout ? findLeafByFeature(layout.root, 'files')?.id ?? null : null,
        alreadyInSplit: Boolean(
            syncedTermId && layout && findLeafByTerm(layout.root, syncedTermId),
        ),
    };
}

function tabStillOpen(tabId: string | null): boolean {
    if (!tabId) return false;
    return useAppStore.getState().tabs.some((tab) => tab.id === tabId);
}

function showTerminalView(tabId: string | null): void {
    if (!tabId) return;
    useAppStore.getState().setTabView(tabId, 'terminal');
}

function reportDock(result: string): void {
    if (result === 'refused-cap') toastPaneCap();
}

async function resolveFsHome(connectionId: string): Promise<string> {
    try {
        const home = await window.ipcRenderer.invoke('fs_cwd', { connectionId });
        if (typeof home === 'string' && home.trim()) return home.trim();
    } catch {
        // Fall through.
    }
    return '';
}

function filesOpenCandidates(connectionId: string, sourceTermId?: string) {
    const store = useAppStore.getState();
    const tabs = store.terminals[connectionId] || [];
    const term = sourceTermId
        ? tabs.find((tab) => tab.id === sourceTermId)
        : tabs.find((tab) => tab.id === store.activeTerminalIds[connectionId])
            ?? tabs.find((tab) => tab.tabVisible !== false);
    const connection = store.connections.find((item) => item.id === connectionId);
    return {
        lastKnownCwd: term?.lastKnownCwd,
        initialPath: term?.initialPath,
        homePath: connection?.homePath,
    };
}

async function resolveFilesDirectory(
    connectionId: string,
    path: string,
    sourceTermId?: string,
): Promise<string> {
    const given = path.trim();
    const candidates = filesOpenCandidates(connectionId, sourceTermId);
    const picked = pickFilesOpenPath({
        lastKnownCwd: given && given !== '/' ? given : candidates.lastKnownCwd,
        initialPath: candidates.initialPath,
        homePath: candidates.homePath,
    });
    if (picked) return picked;
    const home = await resolveFsHome(connectionId);
    if (home) return home;
    return given;
}

/** Full-view Files tab, or Files docked beside the current pane. */
export async function openFilesHere(
    connectionId: string,
    path: string,
    edge?: DockEdge,
    sourceTermId?: string,
): Promise<void> {
    const store = useAppStore.getState();
    const tabId = store.activeTabId;
    const targetPaneId = sourceTermId
        ? paneIdForTerm(connectionId, sourceTermId)
        : paneIdForFiles(connectionId);
    const layout = layoutForConnection(connectionId);
    const filesAlreadySplit = layoutHasFeature(layout, 'files');
    const canOpenSplit = filesAlreadySplit || canSplit(layout ?? null);
    const resolved = await resolveFilesDirectory(connectionId, path, sourceTermId);

    await store.loadFiles(connectionId, resolved);
    if (!tabId || !tabStillOpen(tabId)) return;

    if (!edge) {
        useAppStore.getState().setTabView(tabId, 'files');
        return;
    }

    if (!canOpenSplit) {
        toastPaneCap();
        return;
    }

    showTerminalView(tabId);
    reportDock(useAppStore.getState().dockInSplit(
        connectionId,
        { kind: 'feature', featureId: 'files' },
        edge,
        targetPaneId,
    ));
}

async function resolveSpawnDirectory(
    connectionId: string,
    path: string,
    file?: OpenHereFile | null,
): Promise<string> {
    const listed = (useAppStore.getState().currentPath[connectionId] || '').trim();
    const fromFiles = directoryFromFileLocation(path.trim() || listed, file);
    if (fromFiles) return fromFiles;
    const home = await resolveFsHome(connectionId);
    if (home) return home;
    return '';
}

function refuseSplitIfCapped(connectionId: string, alreadyInSplit: boolean, wantsSplit: boolean): boolean {
    if (wantsSplit && !alreadyInSplit && !canSplitBesideFiles(connectionId)) {
        toastPaneCap();
        return true;
    }
    return false;
}

/** Open a shell at the Files location. `edge` docks it beside Files (or the focused pane). */
export async function openTerminalHere(
    connectionId: string,
    path: string,
    options?: { synced?: boolean; edge?: DockEdge; file?: OpenHereFile | null },
): Promise<void> {
    const tabId = useAppStore.getState().activeTabId;
    const targetPath = await resolveSpawnDirectory(connectionId, path, options?.file);
    if (!tabStillOpen(tabId)) return;

    const store = useAppStore.getState();
    const tabs = store.terminals[connectionId] || [];
    const synced = options?.synced === true;
    const spawnPath = targetPath || undefined;
    const wantsSplit = Boolean(options?.edge);

    const existingSyncedId = synced ? tabs.find((tab) => tab.isSynced)?.id : undefined;
    let snapshot = filesSplitSnapshot(connectionId, existingSyncedId);
    if (refuseSplitIfCapped(connectionId, snapshot.alreadyInSplit, wantsSplit)) return;

    let termId: string;
    if (synced && existingSyncedId) {
        termId = existingSyncedId;
        if (spawnPath) {
            try {
                await window.ipcRenderer.invoke('terminal:navigate', { termId, path: spawnPath });
                store.setTerminalCwd(connectionId, termId, spawnPath);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                store.showToast('error', `Failed to navigate synced terminal: ${message}`);
                return;
            }
            if (!tabStillOpen(tabId)) return;
            snapshot = filesSplitSnapshot(connectionId, existingSyncedId);
            if (refuseSplitIfCapped(connectionId, snapshot.alreadyInSplit, wantsSplit)) return;
        }
    } else {
        termId = store.createTerminal(connectionId, {
            initialPath: spawnPath,
            isSynced: synced || undefined,
        });
        if (spawnPath) store.setTerminalCwd(connectionId, termId, spawnPath);
    }

    if (!options?.edge) {
        store.setActiveTerminal(connectionId, termId);
        showTerminalView(tabId);
        return;
    }

    showTerminalView(tabId);
    reportDock(store.splitTermBesideFiles(connectionId, termId, options.edge, snapshot.filesPaneId));
}

export function canDockHere(connectionId: string, alreadyPresent = false): boolean {
    if (alreadyPresent) return true;
    return canSplit(layoutForConnection(connectionId) ?? null);
}

/** Split from the Files surface: overlay always can; an existing Files pane uses the group cap. */
export function canSplitBesideFiles(connectionId: string): boolean {
    const layout = layoutForConnection(connectionId);
    if (layoutHasFeature(layout, 'files')) return canSplit(layout ?? null);
    return true;
}

export function filesAlreadyInSplit(connectionId: string): boolean {
    return layoutHasFeature(layoutForConnection(connectionId), 'files');
}
