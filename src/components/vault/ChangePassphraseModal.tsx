import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SecretField } from './SecretField';
import { useVaultStore } from '../../vault/useVaultStore';
import { useAppStore } from '../../store/useAppStore';

/** Keep in sync with vault unlock create flow / Rust PASSPHRASE_MIN_LENGTH. */
const PASSPHRASE_MIN_LENGTH = 12;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** When false, current passphrase is not required (recovery-key unlock path). */
  requireCurrent?: boolean;
  title?: string;
  subtitle?: string;
}

export function ChangePassphraseModal({
  isOpen,
  onClose,
  requireCurrent = true,
  title,
  subtitle,
}: Props) {
  const changePassphrase = useVaultStore((state) => state.changePassphrase);
  const isLoading = useVaultStore((state) => state.isLoading);
  const clearError = useVaultStore((state) => state.clearError);
  const showToast = useAppStore((state) => state.showToast);

  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setCurrentPassphrase('');
    setNewPassphrase('');
    setConfirm('');
    setShowPass(false);
    setLocalError('');
    clearError();
  }, [isOpen, clearError]);

  const handleClose = () => {
    if (isLoading) return;
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError('');
    clearError();

    if (requireCurrent && !currentPassphrase) {
      setLocalError('Current passphrase is required.');
      return;
    }
    if (newPassphrase.length < PASSPHRASE_MIN_LENGTH) {
      setLocalError(`New passphrase must be at least ${PASSPHRASE_MIN_LENGTH} characters.`);
      return;
    }
    if (newPassphrase !== confirm) {
      setLocalError('New passphrases do not match.');
      return;
    }

    try {
      await changePassphrase(newPassphrase, {
        currentPassphrase: requireCurrent ? currentPassphrase : undefined,
      });
      showToast(
        'success',
        requireCurrent
          ? 'Vault passphrase updated. Your credentials were kept.'
          : 'New vault passphrase set. You can unlock with it next time.',
      );
      onClose();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      const normalized = message.toLowerCase();
      if (normalized.includes('wrong_passphrase') || normalized.includes('incorrect')) {
        setLocalError('Current passphrase is incorrect.');
        return;
      }
      setLocalError(message || 'Failed to update passphrase.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title ?? (requireCurrent ? 'Change Passphrase' : 'Set New Passphrase')}
      subtitle={
        subtitle
        ?? (requireCurrent
          ? 'Update your vault password without deleting credentials.'
          : 'Choose a new passphrase so you can unlock without the recovery key.')
      }
      width="max-w-sm"
      zIndexClassName="z-[15000]"
    >
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-app-accent)]/10 text-[var(--color-app-accent)]">
            <KeyRound size={22} />
          </div>
        </div>

        {requireCurrent && (
          <SecretField
            label="Current passphrase"
            value={currentPassphrase}
            onChange={setCurrentPassphrase}
            showSecret={showPass}
            onToggleShow={() => setShowPass((value) => !value)}
            autoFocus
            autoComplete="current-password"
            placeholder="Enter current passphrase"
          />
        )}

        <SecretField
          label="New passphrase"
          value={newPassphrase}
          onChange={setNewPassphrase}
          showSecret={showPass}
          onToggleShow={() => setShowPass((value) => !value)}
          autoFocus={!requireCurrent}
          autoComplete="new-password"
          placeholder="Create a strong passphrase"
        />

        <Input
          label="Confirm new passphrase"
          type={showPass ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          placeholder="Repeat your new passphrase"
        />

        {localError && (
          <p className="text-xs text-red-400" role="alert">
            {localError}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="ghost" className="flex-1" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={
              isLoading
              || !newPassphrase
              || !confirm
              || (requireCurrent && !currentPassphrase)
            }
            isLoading={isLoading}
          >
            {requireCurrent ? 'Update Passphrase' : 'Set Passphrase'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
