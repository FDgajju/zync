import { useCallback, useMemo, useState } from 'react';
import {
  syncIpc,
  type SyncCollectionStatus,
  type SyncConnectionsRestoreArgs,
  type SyncProviderStatus,
} from '../../../../../vault/syncIpc';
import {
  hostsOnlyConnectionsRestoreArgs,
  isConnectionsRestoreJobRunning,
  isConnectionsRestorePreviewOpen,
  localVaultRestoreState,
  normalizeConnectionsRestoreArgs,
  restoreVaultAction,
} from '../../../../../vault/connectionsRestore';
import {
  getProviderActionBlockedMessage,
  getProviderReadiness,
} from '../../../../../vault/syncProviderGate';
import { parseSyncInvokeError } from '../../../../../vault/syncError';
import { useVaultStore } from '../../../../../vault/useVaultStore';
import { useConnectionsRestoreJobStore } from '../../../../../vault/useConnectionsRestoreJobStore';
import type { ToastType } from '../../../../../store/toastSlice';

interface UseConnectionsRestoreOptions {
  hostsSyncEnabled: boolean;
  googleSync: SyncProviderStatus | null;
  googleCollection: SyncCollectionStatus | null;
  showToast: (type: ToastType, message: string) => void;
  /** Shared readiness store patch (lastSync / clear lastError). */
  patchGoogleSync: (patch: Partial<SyncProviderStatus>) => void;
  onLoadConnections: () => Promise<void>;
  loadGoogleSync: () => Promise<void>;
  onReloadTunnels?: () => Promise<void>;
  onReloadSnippets?: () => Promise<void>;
}

export function useConnectionsRestore({
  hostsSyncEnabled,
  googleSync,
  googleCollection,
  showToast,
}: UseConnectionsRestoreOptions) {
  const [isPreparingVault, setIsPreparingVault] = useState(false);
  const phase = useConnectionsRestoreJobStore(state => state.phase);
  const connectionsRestorePreview = useConnectionsRestoreJobStore(state => state.preview);
  const pendingConnectionsRestoreArgs = useConnectionsRestoreJobStore(state => state.pendingArgs);
  const beginPreview = useConnectionsRestoreJobStore(state => state.beginPreview);
  const showPreview = useConnectionsRestoreJobStore(state => state.showPreview);
  const failPreview = useConnectionsRestoreJobStore(state => state.failPreview);
  const closePreview = useConnectionsRestoreJobStore(state => state.closePreview);
  const startRestoreJob = useConnectionsRestoreJobStore(state => state.start);
  const isPreviewingConnections = phase === 'previewing';
  const isRestoringConnections = isConnectionsRestoreJobRunning(phase);
  const previewModalOpen = isConnectionsRestorePreviewOpen(phase);
  const vaultStatus = useVaultStore(state => state.status);
  const requestUnlock = useVaultStore(state => state.requestUnlock);
  const previewVaultAction = useMemo(
    () => restoreVaultAction({
      referencedCredentials: connectionsRestorePreview?.referencedCredentials ?? 0,
      includeReferencedCredentials:
        pendingConnectionsRestoreArgs?.includeReferencedCredentials ?? true,
      vaultState: localVaultRestoreState(vaultStatus),
    }),
    [
      connectionsRestorePreview?.referencedCredentials,
      pendingConnectionsRestoreArgs?.includeReferencedCredentials,
      vaultStatus,
    ],
  );

  const ensureConnectionsRestoreReady = useCallback((): boolean => {
    if (isRestoringConnections) {
      showToast('info', 'A connection restore is already running.');
      return false;
    }
    if (!hostsSyncEnabled) {
      showToast('error', 'Hosts sync is disabled. Enable hosts domain sync first.');
      return false;
    }
    const blockedMessage = getProviderActionBlockedMessage(
      getProviderReadiness(googleSync, googleCollection),
      'restore',
      'connections',
    );
    if (blockedMessage) {
      showToast('error', blockedMessage);
      return false;
    }
    return true;
  }, [googleCollection, googleSync, hostsSyncEnabled, isRestoringConnections, showToast]);

  const runConnectionsRestore = useCallback(async (
    args: SyncConnectionsRestoreArgs,
    deferredKeyCount = 0,
  ) => {
    if (isRestoringConnections) {
      showToast('info', 'A connection restore is already running.');
      return false;
    }
    return startRestoreJob(args, { deferredKeyCount });
  }, [isRestoringConnections, showToast, startRestoreJob]);

  const closeConnectionsRestorePreviewModal = useCallback(() => {
    if (isPreviewingConnections || isPreparingVault) return;
    closePreview();
  }, [closePreview, isPreparingVault, isPreviewingConnections]);

  const confirmConnectionsRestore = useCallback(async () => {
    if (!pendingConnectionsRestoreArgs) return;
    if (previewVaultAction) {
      setIsPreparingVault(true);
      try {
        const unlocked = await requestUnlock();
        if (!unlocked) return;
      } finally {
        setIsPreparingVault(false);
      }
    }
    await runConnectionsRestore(pendingConnectionsRestoreArgs);
  }, [
    pendingConnectionsRestoreArgs,
    previewVaultAction,
    requestUnlock,
    runConnectionsRestore,
  ]);

  const confirmConnectionsRestoreHostsOnly = useCallback(async () => {
    if (!pendingConnectionsRestoreArgs) return;
    const referenced = connectionsRestorePreview?.referencedCredentials ?? 0;
    await runConnectionsRestore(
      hostsOnlyConnectionsRestoreArgs(pendingConnectionsRestoreArgs),
      referenced,
    );
  }, [
    connectionsRestorePreview?.referencedCredentials,
    pendingConnectionsRestoreArgs,
    runConnectionsRestore,
  ]);

  const handleRestoreConnections = useCallback(async (args: SyncConnectionsRestoreArgs = {}) => {
    if (!ensureConnectionsRestoreReady()) return;
    if (previewModalOpen) return;
    if (!beginPreview()) {
      showToast('info', 'A connection restore is already running.');
      return;
    }

    const normalizedArgs = normalizeConnectionsRestoreArgs(args);
    try {
      const preview = await syncIpc.connectionsRestorePreview('google', normalizedArgs);
      showPreview(preview, normalizedArgs);
    } catch (error) {
      failPreview();
      const msg = parseSyncInvokeError(error).message;
      showToast('error', `Connection restore preview failed: ${msg}`);
    }
  }, [
    beginPreview,
    ensureConnectionsRestoreReady,
    failPreview,
    previewModalOpen,
    showPreview,
    showToast,
  ]);

  return {
    isPreviewingConnections,
    /** True only while the restore IPC job is running (modal submitting). */
    isRestoringConnections,
    /** Row/button busy: preview scan, vault create/unlock, or restore job. */
    isConnectionsRestoreBusy:
      isRestoringConnections || isPreparingVault || isPreviewingConnections,
    isPreparingVault,
    isConnectionsRestorePreviewOpen: previewModalOpen,
    connectionsRestorePreview,
    pendingConnectionsRestoreArgs,
    previewVaultAction,
    handleRestoreConnections,
    closeConnectionsRestorePreviewModal,
    confirmConnectionsRestore,
    confirmConnectionsRestoreHostsOnly,
  };
}
