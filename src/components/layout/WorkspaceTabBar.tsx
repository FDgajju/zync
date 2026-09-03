import { memo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useAvailableShells } from '../../hooks/useAvailableShells';
import { LOCAL_TERMINAL_CONNECTION_ID } from '../../features/connections/application/tabService';
import { CombinedTabBar } from './CombinedTabBar';
import type { ShellEntry } from '../../lib/shells/types';
import { canSplit, isSplitLayout, layoutForTerm } from '../../lib/paneLayout';

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
        />
    );
});
