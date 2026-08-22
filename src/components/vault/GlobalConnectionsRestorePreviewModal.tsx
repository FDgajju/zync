import { useCallback, useMemo, useState } from 'react';
import { useConnectionsRestoreJobStore } from '../../vault/useConnectionsRestoreJobStore';
import { useVaultStore } from '../../vault/useVaultStore';
import { useAppStore } from '../../store/useAppStore';
import {
  hostsOnlyConnectionsRestoreArgs,
  isConnectionsRestorePreviewOpen,
  localVaultRestoreState,
  restoreVaultAction,
} from '../../vault/connectionsRestore';
import { parseSyncInvokeError } from '../../vault/syncError';
import { ConnectionsRestorePreviewModal } from '../settings/tabs/vault/ConnectionsRestorePreviewModal';

/**
 * Globally mounted connections-restore preview modal.
 *
 * Renders independently of the Sync & Backup tab so the modal stays visible
 * even after the user switches away from or closes that tab while a restore
 * preview is pending.
 *
 * Reads state from the global Zustand stores (useConnectionsRestoreJobStore,
 * useVaultStore, useAppStore) and drives the ConnectionsRestorePreviewModal.
 */
export function GlobalConnectionsRestorePreviewModal() {
  const phase = useConnectionsRestoreJobStore(state => state.phase);
  const preview = useConnectionsRestoreJobStore(state => state.preview);
  const pendingArgs = useConnectionsRestoreJobStore(state => state.pendingArgs);
  const closePreview = useConnectionsRestoreJobStore(state => state.closePreview);
  const startRestoreJob = useConnectionsRestoreJobStore(state => state.start);

  const vaultStatus = useVaultStore(state => state.status);
  const requestUnlock = useVaultStore(state => state.requestUnlock);

  const showToast = useAppStore(state => state.showToast);

  const [isPreparingVault, setIsPreparingVault] = useState(false);

  const isPreviewOpen = isConnectionsRestorePreviewOpen(phase);
  const isSubmitting = phase === 'running';

  const previewVaultAction = useMemo(
    () =>
      restoreVaultAction({
        referencedCredentials: preview?.referencedCredentials ?? 0,
        includeReferencedCredentials: pendingArgs?.includeReferencedCredentials ?? true,
        vaultState: localVaultRestoreState(vaultStatus),
      }),
    [preview?.referencedCredentials, pendingArgs?.includeReferencedCredentials, vaultStatus],
  );

  const handleClose = useCallback(() => {
    if (phase === 'previewing' || isPreparingVault) return;
    closePreview();
  }, [closePreview, isPreparingVault, phase]);

  const handleConfirmRestore = useCallback(async () => {
    if (!pendingArgs) return;
    if (previewVaultAction) {
      setIsPreparingVault(true);
      try {
        const unlocked = await requestUnlock();
        if (!unlocked) return;
      } finally {
        setIsPreparingVault(false);
      }
    }
    try {
      await startRestoreJob(pendingArgs);
    } catch (error) {
      const msg = parseSyncInvokeError(error).message;
      showToast('error', `Connection restore failed: ${msg}`);
    }
  }, [pendingArgs, previewVaultAction, requestUnlock, showToast, startRestoreJob]);

  const handleConfirmHostsOnly = useCallback(async () => {
    if (!pendingArgs) return;
    const referenced = preview?.referencedCredentials ?? 0;
    try {
      await startRestoreJob(hostsOnlyConnectionsRestoreArgs(pendingArgs), {
        deferredKeyCount: referenced,
      });
    } catch (error) {
      const msg = parseSyncInvokeError(error).message;
      showToast('error', `Connection restore failed: ${msg}`);
    }
  }, [pendingArgs, preview?.referencedCredentials, showToast, startRestoreJob]);

  return (
    <ConnectionsRestorePreviewModal
      isOpen={isPreviewOpen}
      isSubmitting={isSubmitting}
      isPreparingVault={isPreparingVault}
      preview={preview}
      args={pendingArgs}
      vaultAction={previewVaultAction}
      onClose={handleClose}
      onConfirmRestore={() => void handleConfirmRestore()}
      onConfirmHostsOnly={() => void handleConfirmHostsOnly()}
    />
  );
}
