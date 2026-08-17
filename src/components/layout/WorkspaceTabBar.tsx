import { memo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useAvailableShells } from '../../hooks/useAvailableShells';
import { LOCAL_TERMINAL_CONNECTION_ID } from '../../features/connections/application/tabService';
import { CombinedTabBar } from './CombinedTabBar';
import type { ShellEntry } from '../../lib/shells/types';

export interface WorkspaceTabBarProps {
    connectionId: string;
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
}

/**
 * Isolates shell-tab and shell-picker store subscriptions so TabContent
 * does not re-render on every activeTerminalId or shellsLoading change.
 */
export const WorkspaceTabBar = memo(function WorkspaceTabBar({
    connectionId,
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
}: WorkspaceTabBarProps) {
    const activeTerminalId = useAppStore(
        state => state.activeTerminalIds[connectionId] ?? null,
    );
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
        />
    );
});