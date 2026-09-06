import { memo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useAvailableShells } from '../../hooks/useAvailableShells';
import { LOCAL_TERMINAL_CONNECTION_ID } from '../../features/connections/application/tabService';
import { CombinedTabBar } from './CombinedTabBar';
import type { DockTabPointerHandlers } from './tabDock';
import type { ShellEntry } from '../../lib/shells/types';
import { canSplit, isSplitLayout, layoutForTerm, type DockEdge, type SplitFeatureId } from '../../lib/paneLayout';

export interface WorkspaceTabBarProps {
    connectionId: string;
    tabId: string;
    activeView: string;
    openFeatures: string[];
    pinnedFeatures: string[];
    pluginPanels: { id: string; title: string }[];
    onTabSelect: (view: string, termId?: string) => void;
    onFeatureClose: (feature: string) => void;
    onTerminalClose: (termId: string) => void;
    onNewTerminal: (shell?: ShellEntry) => void;
    onOpenFeature?: (feature: string) => void;
    onTogglePin: (feature: string) => void;
    sessionToolsOpen?: boolean;
    onToggleSessionTools?: () => void;
    dockPointer?: DockTabPointerHandlers;
}

/**
 * Isolates shell-tab and shell-picker store subscriptions so TabContent
 * does not re-render on every activeTerminalId or shellsLoading change.
 */
export const WorkspaceTabBar = memo(function WorkspaceTabBar({
    connectionId,
    tabId,
    activeView,
    openFeatures,
    pinnedFeatures,
    pluginPanels,
    onTabSelect,
    onFeatureClose,
    onTerminalClose,
    onNewTerminal,
    onOpenFeature,
    onTogglePin,
    sessionToolsOpen,
    onToggleSessionTools,
    dockPointer,
}: WorkspaceTabBarProps) {
    const activeTerminalId = useAppStore(
        state => state.activeTerminalIds[connectionId] ?? null,
    );
    const isSplit = useAppStore((state) => {
        const activeId = state.activeTerminalIds[connectionId];
        if (!activeId) return false;
        return isSplitLayout(layoutForTerm(state.paneLayouts[connectionId], activeId));
    });
    const canSplitPanes = useAppStore((state) => {
        const activeId = state.activeTerminalIds[connectionId];
        if (!activeId) return true;
        return canSplit(layoutForTerm(state.paneLayouts[connectionId], activeId) ?? null);
    });
    const splitPanes = useAppStore(state => state.splitPanes);
    const unsplitPanes = useAppStore(state => state.unsplitPanes);
    const openFeatureInSplit = useAppStore(state => state.openFeatureInSplit);
    const dockInSplit = useAppStore(state => state.dockInSplit);
    const createTerminal = useAppStore(state => state.createTerminal);
    const setTabView = useAppStore(state => state.setTabView);
    const showToast = useAppStore(state => state.showToast);

    const reportDockResult = (result: string) => {
        if (result === 'refused-cap') {
            showToast('info', 'This tab already has 4 panes.');
        }
    };

    const handleOpenSplitFeature = (featureId: SplitFeatureId, edge: DockEdge = 'right') => {
        if (activeView !== 'terminal') {
            setTabView(tabId, 'terminal');
        }
        reportDockResult(openFeatureInSplit(connectionId, featureId, edge));
    };

    const handleDockTerm = (termId: string, edge: DockEdge) => {
        if (activeView !== 'terminal') {
            setTabView(tabId, 'terminal');
        }
        reportDockResult(dockInSplit(connectionId, { kind: 'term', termId }, edge));
    };

    const handleSplitNewShell = (edge: DockEdge, shell?: ShellEntry) => {
        if (activeView !== 'terminal') {
            setTabView(tabId, 'terminal');
        }
        if (!canSplitPanes) {
            reportDockResult('refused-cap');
            return;
        }
        if (!shell) {
            splitPanes(connectionId, edge === 'bottom' ? 'vertical' : 'horizontal');
            return;
        }
        const canvasTermId = activeTerminalId;
        const termId = createTerminal(connectionId, { shellOverride: shell.id, title: shell.label });
        reportDockResult(dockInSplit(connectionId, { kind: 'term', termId }, edge, null, canvasTermId));
    };
    const hostIsWindows = connectionId === LOCAL_TERMINAL_CONNECTION_ID
        && window.electronUtils?.platform === 'win32';
    const {
        shells: availableShells,
        isLoading: shellsLoading,
        error: shellsError,
        refetch: refetchShells,
    } = useAvailableShells({ isWindows: hostIsWindows, connectionId });

    return (
        <CombinedTabBar
            connectionId={connectionId}
            tabId={tabId}
            activeView={activeView}
            activeTerminalId={activeTerminalId}
            openFeatures={openFeatures}
            pinnedFeatures={pinnedFeatures}
            pluginPanels={pluginPanels}
            availableShells={availableShells}
            shellsLoading={shellsLoading}
            shellsError={shellsError}
            onRefetchShells={refetchShells}
            onTabSelect={onTabSelect}
            onFeatureClose={onFeatureClose}
            onTerminalClose={onTerminalClose}
            onNewTerminal={onNewTerminal}
            onOpenFeature={onOpenFeature}
            onTogglePin={onTogglePin}
            sessionToolsOpen={sessionToolsOpen}
            onToggleSessionTools={onToggleSessionTools}
            isSplit={isSplit}
            canSplit={canSplitPanes}
            onSplit={(direction) => splitPanes(connectionId, direction)}
            onUnsplit={() => unsplitPanes(connectionId)}
            onOpenSplitFeature={handleOpenSplitFeature}
            onDockTerm={handleDockTerm}
            onSplitNewShell={handleSplitNewShell}
            dockPointer={dockPointer}
        />
    );
});
