import { create } from 'zustand';
import {
  formatConnectionsRestoreSuccessMessage,
  formatDeferredVaultKeysMessage,
  isConnectionsRestoreJobRunning,
  normalizeConnectionsRestoreArgs,
  reportConnectionsRestoreWarnings,
  type ConnectionsRestoreJobPhase,
} from './connectionsRestore';
import { parseSyncInvokeError } from './syncError';
import {
  syncIpc,
  type SyncConnectionsRestoreArgs,
  type SyncConnectionsRestorePreviewResult,
} from './syncIpc';
import { useSyncReadinessStore } from './useSyncReadinessStore';

export type { ConnectionsRestoreJobPhase };

interface StartConnectionsRestoreJobOptions {
  deferredKeyCount?: number;
}

interface ConnectionsRestoreJobState {
  phase: ConnectionsRestoreJobPhase;
  startedAt?: number;
  lastError?: string;
  preview: SyncConnectionsRestorePreviewResult | null;
  pendingArgs: SyncConnectionsRestoreArgs | null;
  beginPreview: () => boolean;
  showPreview: (
    preview: SyncConnectionsRestorePreviewResult,
    args: SyncConnectionsRestoreArgs,
  ) => void;
  failPreview: () => void;
  closePreview: () => void;
  start: (
    args: SyncConnectionsRestoreArgs,
    options?: StartConnectionsRestoreJobOptions,
  ) => Promise<boolean>;
}

export const useConnectionsRestoreJobStore = create<ConnectionsRestoreJobState>((set, get) => ({
  phase: 'idle',
  startedAt: undefined,
  lastError: undefined,
  preview: null,
  pendingArgs: null,

  beginPreview: () => {
    if (isConnectionsRestoreJobRunning(get().phase) || get().phase === 'previewing') {
      return false;
    }
    set({ phase: 'previewing', lastError: undefined });
    return true;
  },

  showPreview: (preview, args) => {
    const phase = get().phase;
    if (phase !== 'previewing' && phase !== 'preview') {
      return;
    }
    set({
      phase: 'preview',
      preview,
      pendingArgs: normalizeConnectionsRestoreArgs(args),
      lastError: undefined,
    });
  },

  failPreview: () => {
    if (get().phase !== 'previewing') return;
    set({ phase: 'idle', preview: null, pendingArgs: null });
  },

  closePreview: () => {
    if (isConnectionsRestoreJobRunning(get().phase)) return;
    set({ phase: 'idle', preview: null, pendingArgs: null, lastError: undefined });
  },

  start: async (args, options) => {
    if (isConnectionsRestoreJobRunning(get().phase)) return false;

    set({
      phase: 'running',
      startedAt: Date.now(),
      lastError: undefined,
      preview: null,
      pendingArgs: null,
    });

    let result;
    try {
      const { useAppStore } = await import('../store/useAppStore');
      const app = useAppStore.getState();
      app.showToast('info', 'Restoring from Google… You can leave this page.');
      result = await syncIpc.connectionsRestore(
        'google',
        normalizeConnectionsRestoreArgs(args),
      );

      useSyncReadinessStore.getState().patchOauth({
        lastSync: result.syncedAt,
        lastError: undefined,
        lastErrorCode: undefined,
      });
    } catch (error) {
      const msg = parseSyncInvokeError(error).message;
      set({ lastError: msg, phase: 'idle', startedAt: undefined, preview: null, pendingArgs: null });
      const { useAppStore } = await import('../store/useAppStore');
      useAppStore.getState().showToast('error', `Connection restore failed: ${msg}`);
      return false;
    }

    // Restore IPC succeeded — reloads are best-effort and must not flip to failure.
    try {
      const { useAppStore } = await import('../store/useAppStore');
      const app = useAppStore.getState();
      try {
        await app.loadConnections();
      } catch (error) {
        console.warn('[Sync] loadConnections after restore failed:', error);
      }
      try {
        await useSyncReadinessStore.getState().refresh('google');
      } catch (error) {
        console.warn('[Sync] readiness refresh after restore failed:', error);
      }
      try {
        await app.loadAllTunnels();
      } catch (error) {
        console.warn('[Sync] loadAllTunnels after restore failed:', error);
      }
      try {
        await app.loadSnippets();
      } catch (error) {
        console.warn('[Sync] loadSnippets after restore failed:', error);
      }

      const hostChanged = result.hosts.restored + result.hosts.updated;
      const tunnelChanged = (result.tunnels?.restored ?? 0) + (result.tunnels?.updated ?? 0);
      const snippetChanged =
        (result.hostSnippets?.restored ?? 0) + (result.hostSnippets?.updated ?? 0);

      app.showToast(
        hostChanged + tunnelChanged + snippetChanged > 0 ? 'success' : 'info',
        formatConnectionsRestoreSuccessMessage(result),
      );
      const deferredFromArgs = (options?.deferredKeyCount ?? 0) > 0;
      reportConnectionsRestoreWarnings(result, app.showToast, {
        suppressDeferredKeyToast: deferredFromArgs,
      });
      if (deferredFromArgs) {
        const { useVaultStore } = await import('./useVaultStore');
        const { localVaultRestoreState } = await import('./connectionsRestore');
        app.showToast(
          'info',
          formatDeferredVaultKeysMessage(
            options?.deferredKeyCount ?? 0,
            localVaultRestoreState(useVaultStore.getState().status),
          ),
        );
      }
    } finally {
      set({ phase: 'idle', startedAt: undefined, preview: null, pendingArgs: null });
    }
    return true;
  },
}));
