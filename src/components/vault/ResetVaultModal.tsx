import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useVaultStore } from '../../vault/useVaultStore';
import { useAppStore } from '../../store/useAppStore';
import { isVaultInUseError, VAULT_IN_USE_USER_MESSAGE } from '../../vault/vaultLoading';

const CONFIRM_WORD = 'RESET';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful reset (vault is uninitialized). */
  onReset?: () => void;
}

export function ResetVaultModal({ isOpen, onClose, onReset }: Props) {
  const resetLocal = useVaultStore((state) => state.resetLocal);
  const isLoading = useVaultStore((state) => state.isLoading);
  const error = useVaultStore((state) => state.error);
  const clearError = useVaultStore((state) => state.clearError);
  const loadConnections = useAppStore((state) => state.loadConnections);
  const showToast = useAppStore((state) => state.showToast);

  const [confirmText, setConfirmText] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setConfirmText('');
    setLocalError('');
    clearError();
  }, [isOpen, clearError]);

  const canConfirm = confirmText === CONFIRM_WORD;

  const handleClose = () => {
    if (isLoading) return;
    setConfirmText('');
    setLocalError('');
    clearError();
    onClose();
  };

  const handleReset = async () => {
    if (!canConfirm || isLoading) return;
    setLocalError('');
    clearError();
    try {
      const result = await resetLocal();
      try {
        await loadConnections();
      } catch (loadError: unknown) {
        console.error('[Vault] Failed to reload connections after reset:', loadError);
      }
      if (result.status.status !== 'uninitialized') {
        setLocalError('Vault reset did not finish. The local vault may still be present. Try again.');
        showToast('error', 'Vault reset did not fully complete.');
        return;
      }
      const cleared = result.clearedAuthRefs;
      showToast(
        'success',
        cleared > 0
          ? `Vault reset. Cleared vault auth on ${cleared} host${cleared === 1 ? '' : 's'}. Create a new vault to continue.`
          : 'Vault reset. Create a new vault to store credentials again.',
      );
      setConfirmText('');
      onClose();
      onReset?.();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (isVaultInUseError(message) || isVaultInUseError(error)) {
        setLocalError(VAULT_IN_USE_USER_MESSAGE);
        return;
      }
      setLocalError(message || 'Failed to reset vault.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Reset Vault?"
      subtitle="This permanently deletes local vault data on this device."
      width="max-w-md"
      zIndexClassName="z-[15000]"
    >
      <div className="space-y-4">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <AlertTriangle size={22} />
          </div>
        </div>

        <ul className="space-y-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-[11px] leading-relaxed text-[var(--color-app-muted)]">
          <li>All vault credentials on this device will be deleted.</li>
          <li>Vault-linked hosts lose their vault auth and need re-linking or new secrets.</li>
          <li>AI provider keys stored in Vault must be entered again after you create a new vault.</li>
          <li>The old recovery key will no longer work on this device.</li>
          <li>Local sync collection cache is cleared. Cloud sync data (if any) is not deleted.</li>
          <li>Local key-file hosts and on-host passwords are kept.</li>
        </ul>

        <Input
          label={`Type ${CONFIRM_WORD} to confirm`}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
          autoFocus
          placeholder={CONFIRM_WORD}
        />

        {(localError || error) && (
          <p className="text-xs text-red-400" role="alert">
            {localError || error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="ghost" className="flex-1" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            className="flex-1 bg-red-500 hover:bg-red-600 border-0 text-white"
            disabled={!canConfirm || isLoading}
            isLoading={isLoading}
            onClick={() => void handleReset()}
          >
            Reset Vault
          </Button>
        </div>
      </div>
    </Modal>
  );
}
