import { CircleAlert, Monitor, PanelLeft, Sparkles, Wifi, WifiOff } from 'lucide-react';
import { LOCAL_TERMINAL_CONNECTION_ID } from '../../features/connections/application/tabService';
import { formatShortcutLabel } from '../../lib/shortcuts';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../lib/utils';
import { Tooltip } from '../ui/Tooltip';
import { StatusBarTransferIndicator } from '../file-manager/StatusBarTransferIndicator';
import { StatusBarUpdateIndicator } from '../../features/updater/StatusBarUpdateIndicator';
import { NotificationBell, useNotificationBellPlacement } from '../notifications/NotificationBell';
import {
  DEFAULT_STATUS_BAR_SETTINGS,
  StatusBarLatency,
  useConnectionLatency,
} from '../../features/statusBar';

const statusToggleBtnClass =
  'h-6 w-6 shrink-0 rounded-md text-app-muted hover:text-app-text hover:bg-app-surface border border-transparent hover:border-app-border/40 transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 focus-visible:ring-offset-0';

export function StatusBar() {
  const activeConnectionId = useAppStore(state => state.activeConnectionId);
  const connections = useAppStore(state => state.connections);
  const activeConnection = connections.find((c) => c.id === activeConnectionId);
  const isLocalWorkspace = activeConnectionId === LOCAL_TERMINAL_CONNECTION_ID;
  const sidebarCollapsed = useAppStore(state => state.settings.sidebarCollapsed);
  const keybindings = useAppStore(state => state.settings.keybindings);
  const updateSettings = useAppStore(state => state.updateSettings);
  const toggleAiSidebar = useAppStore(state => state.toggleAiSidebar);
  const isAiSidebarOpen = useAppStore(state => state.isAiSidebarOpen);
  const editorDiagnosticsCount = useAppStore(state => state.editorDiagnosticsCount);
  const editorDiagnosticsSeverity = useAppStore(state => state.editorDiagnosticsSeverity);
  const editorDiagnosticsVisible = useAppStore(state => state.editorDiagnosticsVisible);
  const setEditorDiagnosticsVisible = useAppStore(state => state.setEditorDiagnosticsVisible);
  const isMac = (window.electronUtils?.platform || 'linux') === 'darwin';
  const sidebarShortcut = formatShortcutLabel(keybindings?.toggleSidebar || 'Mod+B', isMac);
  const aiShortcut = formatShortcutLabel(keybindings?.aiCommandBar || 'Mod+I', isMac);

  const toggleSidebar = () => {
    window.dispatchEvent(new CustomEvent('zync:layout-transition-start'));
    void updateSettings({ sidebarCollapsed: !sidebarCollapsed });
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('zync:layout-transition-end'));
    }, 320);
  };

  const isLiveConnected = activeConnection?.status === 'connected';
  const isConnecting = activeConnection?.status === 'connecting';
  const { showInStatusLeft, showInStatusRight } = useNotificationBellPlacement();
  const showConnectionLatency =
    useAppStore((state) => state.settings.statusBar?.showConnectionLatency)
    ?? DEFAULT_STATUS_BAR_SETTINGS.showConnectionLatency;
  const latencyMs = useConnectionLatency({
    connectionId: activeConnectionId,
    enabled: showConnectionLatency,
    isLive: Boolean(isLiveConnected && activeConnection),
  });

  return (
    <div className="h-9 bg-app-panel border-t border-app-border flex items-center px-2.5 text-[11px] select-none text-app-text/80 justify-between shrink-0 gap-2">
      {/* Bottom-left: sidebar toggle + connection status */}
      <div className="flex items-center gap-2 min-w-0">
        <Tooltip
          content={`${sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'} (${sidebarShortcut})`}
          position="top"
        >
          <button
            type="button"
            onClick={toggleSidebar}
            className={cn(
              statusToggleBtnClass,
              !sidebarCollapsed && 'text-app-accent bg-app-accent/10 border-app-accent/20',
            )}
            aria-label={`${sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'} (${sidebarShortcut})`}
          >
            <PanelLeft size={14} />
          </button>
        </Tooltip>

        <div className="h-4 w-px shrink-0 bg-app-border/50" aria-hidden />

        {showInStatusLeft && (
          <>
            <NotificationBell tooltipPosition="top" size="status" />
            <div className="h-4 w-px shrink-0 bg-app-border/50" aria-hidden />
          </>
        )}

        <div className="flex items-center gap-1.5 min-w-0 max-w-[min(18rem,42%)]">
          {isLiveConnected && activeConnection ? (
            <div className="flex min-w-0 max-w-full items-center gap-1.5 text-app-text/80">
              {showConnectionLatency && latencyMs !== null ? (
                <StatusBarLatency ms={latencyMs} />
              ) : (
                <Wifi size={12} className="text-app-success shrink-0" />
              )}
              <Tooltip content={`Connected to ${activeConnection.name}`} position="top" className="min-w-0 max-w-full justify-start">
                <span className="min-w-0 truncate font-medium hover:text-white transition-colors">
                  {activeConnection.name}
                </span>
              </Tooltip>
            </div>
          ) : isConnecting && activeConnection ? (
            <Tooltip content={`Connecting to ${activeConnection.name}`} position="top" className="min-w-0 max-w-full justify-start">
              <div className="flex min-w-0 max-w-full items-center gap-1.5">
                <Wifi size={12} className="text-app-warning shrink-0 animate-pulse" />
                <span className="text-app-muted truncate">{activeConnection.name}</span>
              </div>
            </Tooltip>
          ) : activeConnection ? (
            <Tooltip content={`${activeConnection.name} is offline`} position="top" className="min-w-0 max-w-full justify-start">
              <div className="flex min-w-0 max-w-full items-center gap-1.5">
                <WifiOff size={12} className="text-app-muted shrink-0" />
                <span className="text-app-muted truncate">{activeConnection.name}</span>
              </div>
            </Tooltip>
          ) : isLocalWorkspace ? (
            <>
              <Monitor size={12} className="text-app-muted shrink-0" />
              <span className="text-app-muted">Local</span>
            </>
          ) : (
            <>
              <WifiOff size={12} className="text-app-muted shrink-0" />
              <span className="text-app-muted">No Connection</span>
            </>
          )}
        </div>

        {/* Plugin Status Bar Slots (Temporarily disabled per UX request) */}
      </div>

      {/* Bottom-right: status bits + AI toggle */}
      <div className="flex items-center gap-3 shrink-0">
        {/* High-performance container for Editor cursor status (no React re-renders) */}
        <span id="global-editor-status" className="text-app-muted font-mono text-[11px] tracking-wide" />
        {editorDiagnosticsCount > 0 && (
          <button
            type="button"
            onClick={() => setEditorDiagnosticsVisible(!editorDiagnosticsVisible)}
            className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-app-surface/60"
            title={`${editorDiagnosticsVisible ? 'Hide' : 'Show'} diagnostics (${editorDiagnosticsCount})`}
          >
            <CircleAlert
              size={13}
              className={cn(
                editorDiagnosticsSeverity === 'error' ? 'text-app-danger' : 'text-app-warning',
                editorDiagnosticsVisible && 'opacity-100',
                !editorDiagnosticsVisible && 'opacity-85',
              )}
            />
            <span className="font-mono text-[11px] text-app-muted">{editorDiagnosticsCount}</span>
          </button>
        )}

        <StatusBarTransferIndicator />
        <StatusBarUpdateIndicator />
        <StatusMessage />
        {showInStatusRight && <NotificationBell tooltipPosition="top" size="status" />}

        <div className="h-4 w-px shrink-0 bg-app-border/50" aria-hidden />

        <Tooltip content={`AI Assistant (${aiShortcut})`} position="top">
          <button
            type="button"
            onClick={toggleAiSidebar}
            className={cn(
              statusToggleBtnClass,
              isAiSidebarOpen && 'text-app-accent bg-app-accent/10 border-app-accent/20',
            )}
            aria-label={`Toggle AI Sidebar (${aiShortcut})`}
          >
            <Sparkles size={14} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function StatusMessage() {
  const lastAction = useAppStore(state => state.lastAction);

  if (!lastAction) return null;

  return (
    <span className={cn(
      "font-medium transition-all animate-in fade-in slide-in-from-bottom-1 duration-300",
      lastAction.type === 'success' ? "text-app-success" :
        lastAction.type === 'error' ? "text-app-danger" : "text-app-text"
    )}>
      {lastAction.message}
    </span>
  );
}
