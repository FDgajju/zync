import { useCallback } from 'react';
import {
  syncIpc,
  type SyncCollectionStatus,
  type SyncConnectionsRestoreArgs,
  type SyncProviderStatus,
} from '../../../../../vault/syncIpc';
import {
  isConnectionsRestoreJobRunning,
  isConnectionsRestorePreviewOpen,
  normalizeConnectionsRestoreArgs,
} from '../../../../../vault/connectionsRestore';
import {
  getProviderActionBlockedMessage,
  getProviderReadiness,
} from '../../../../../vault/syncProviderGate';
import { parseSyncInvokeError } from '../../../../../vault/syncError';
import { useConnectionsRestoreJobStore } from '../../../../../vault/useConnectionsRestoreJobStore';
import type { ToastType } from '../../../../../store/toastSlice';

interface UseConnectionsRestoreOptions {
  hostsSyncEnabled: boolean;
  googleSync: SyncProviderStatus | null;
  googleCollection: SyncCollectionStatus | null;
  showToast: (type: ToastType, message: string) => void;
}

export function useConnectionsRestore({
  hostsSyncEnabled,
  googleSync,
  googleCollection,
  showToast,
}: UseConnectionsRestoreOptions) {
  const phase = useConnectionsRestoreJobStore(state => state.phase);
  const beginPreview = useConnectionsRestoreJobStore(state => state.beginPreview);
  const showPreview = useConnectionsRestoreJobStore(state => state.showPreview);
  const failPreview = useConnectionsRestoreJobStore(state => state.failPreview);
  const isPreviewingConnections = phase === 'previewing';
  const isRestoringConnections = isConnectionsRestoreJobRunning(phase);
  const previewModalOpen = isConnectionsRestorePreviewOpen(phase);

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
    /** True only while the restore IPC job is running. */
    isRestoringConnections,
    /** Row/button busy: preview scan or restore job. */
    isConnectionsRestoreBusy: isRestoringConnections || isPreviewingConnections,
    handleRestoreConnections,
  };
}
