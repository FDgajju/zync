import { useState } from 'react';
import { Input } from '../ui/Input';
import { KeyRound, RefreshCw, Shield } from 'lucide-react';
import { useVaultStore } from '../../vault/useVaultStore';
import { isVaultInUseError, VAULT_IN_USE_USER_MESSAGE } from '../../vault/vaultLoading';
import { UnlockModalShell } from './UnlockModalShell';
import { SecretField } from './SecretField';
import { ResetVaultModal } from './ResetVaultModal';
import { ChangePassphraseModal } from './ChangePassphraseModal';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

/** Minimum passphrase length enforced at vault creation time. */
export const PASSPHRASE_MIN_LENGTH = 12;

const REMEMBER_ON_DEVICE_PREF_KEY = 'zync:vault:rememberOnDevice';

const readRememberOnDevicePreference = (): boolean => {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(REMEMBER_ON_DEVICE_PREF_KEY) === 'true';
};

const persistRememberOnDevicePreference = (enabled: boolean) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(REMEMBER_ON_DEVICE_PREF_KEY, enabled ? 'true' : 'false');
};

interface Props {
  isOpen: boolean;
  /** Called when the modal closes; `unlocked` is true after a successful unlock/create. */
  onClose: (unlocked: boolean) => void;
}

export function VaultUnlockModal({ isOpen, onClose }: Props) {
  const {
    status,
    error,
    refresh,
    initialize,
    unlock,
    unlockWithRecoveryKey,
    isLoading,
    clearError,
  } = useVaultStore();
  const vaultInUse = isVaultInUseError(error);
  const isUninitialized = !vaultInUse && (!status || status.status === 'uninitialized');
  const canUseRecoveryKey = !isUninitialized && !vaultInUse;

  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [localError, setLocalError] = useState('');
  const [unlockMode, setUnlockMode] = useState<'passphrase' | 'recovery'>('passphrase');
  const [rememberOnDevice, setRememberOnDevice] = useState(readRememberOnDevicePreference);
  const [showResetVault, setShowResetVault] = useState(false);
  const [showSetPassphraseAfterRecovery, setShowSetPassphraseAfterRecovery] = useState(false);
  // After reset, unlockMode can still be 'recovery' even though create-vault has no recovery UI.
  const effectiveUnlockMode = canUseRecoveryKey ? unlockMode : 'passphrase';

  const extractError = (error: unknown): { code?: string; message: string } => {
    if (error && typeof error === 'object') {
      const code = 'code' in error ? String((error as { code: unknown }).code) : undefined;
      const message = 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);
      return { code, message };
    }
    return { message: String(error) };
  };

  const resetForm = () => {
    setPassphrase('');
    setConfirm('');
    setRecoveryKey('');
    setShowPass(false);
    setUnlockMode('passphrase');
    setShowResetVault(false);
    setShowSetPassphraseAfterRecovery(false);
    setLocalError('');
    clearError();
  };

  const handleClose = () => {
    resetForm();
    onClose(false);
  };

  const handleUnlocked = () => {
    resetForm();
    onClose(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearError();

    if (isUninitialized) {
      if (passphrase.length < PASSPHRASE_MIN_LENGTH) {
        setLocalError(`Passphrase must be at least ${PASSPHRASE_MIN_LENGTH} characters.`);
        return;
      }
      if (passphrase !== confirm) {
        setLocalError('Passphrases do not match.');
        return;
      }
      try {
        await initialize(passphrase, rememberOnDevice);
        persistRememberOnDevicePreference(rememberOnDevice);
        handleUnlocked();
      } catch (e: unknown) {
        const { message } = extractError(e);
        setLocalError(message || 'Failed to create vault.');
      }
    } else if (effectiveUnlockMode === 'recovery') {
      if (!recoveryKey.trim()) {
        setLocalError('Recovery key is required.');
        return;
      }
      try {
        await unlockWithRecoveryKey(recoveryKey.trim(), rememberOnDevice);
        persistRememberOnDevicePreference(rememberOnDevice);
        // Offer setting a new passphrase so password unlock works again without wiping data.
        setShowSetPassphraseAfterRecovery(true);
      } catch (e: unknown) {
        const { code, message } = extractError(e);
        const parts = [code, message].filter(Boolean);
        setLocalError(parts.join(': ') || 'Failed to unlock with recovery key.');
      }
    } else {
      try {
        await unlock(passphrase, rememberOnDevice);
        persistRememberOnDevicePreference(rememberOnDevice);
        handleUnlocked();
      } catch (e: unknown) {
        const { code, message } = extractError(e);
        const parts = [code, message].filter(Boolean);
        const raw = parts.join(': ');
        setLocalError(
          code === 'wrong_passphrase' ? 'Incorrect passphrase.' : raw || 'Failed to unlock vault.'
        );
      }
    }
  };

  const handleRefreshAfterInUse = async () => {
    setLocalError('');
    clearError();
    try {
      await refresh();
      if (useVaultStore.getState().status?.status === 'unlocked') {
        handleUnlocked();
      }
    } catch (e: unknown) {
      const { message } = extractError(e);
      setLocalError(message || 'Still unable to access the vault.');
    }
  };

  if (vaultInUse) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="Vault In Use"
        subtitle="Another Zync window already has your vault open."
        width="max-w-sm"
        contentClassName="min-h-[280px]"
        zIndexClassName="z-[15000]"
      >
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10 text-orange-400">
              <Shield size={22} />
            </div>
          </div>
          <p className="text-sm leading-relaxed text-[var(--color-app-muted)] text-center">
            {VAULT_IN_USE_USER_MESSAGE}
          </p>
          {localError && (
            <p className="text-xs text-red-400 text-center" role="alert">{localError}</p>
          )}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={handleClose} className="flex-1" disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleRefreshAfterInUse()}
              className="flex-1 gap-1.5"
              disabled={isLoading}
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : undefined} />
              {isLoading ? 'Checking…' : 'Refresh'}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  const title = isUninitialized ? 'Create Vault' : 'Unlock Vault';
  const subtitle = isUninitialized
    ? 'Set a strong passphrase to protect your credentials.'
    : effectiveUnlockMode === 'recovery'
      ? 'Enter your recovery key to unlock the vault.'
      : 'Enter your vault passphrase to access credentials.';

  return (
    <>
      <UnlockModalShell
        isOpen={isOpen}
        onClose={handleClose}
        title={title}
        subtitle={subtitle}
        mode={canUseRecoveryKey ? effectiveUnlockMode : undefined}
        modeOptions={canUseRecoveryKey ? [
          { value: 'passphrase', label: 'Passphrase' },
          { value: 'recovery', label: 'Recovery Key' },
        ] : undefined}
        onModeChange={canUseRecoveryKey ? setUnlockMode : undefined}
        error={localError}
        isSubmitting={isLoading}
        submitDisabled={
          isLoading ||
          (effectiveUnlockMode === 'recovery'
            ? !recoveryKey.trim()
            : !passphrase || (isUninitialized && !confirm))
        }
        submitLabel={
          isLoading
            ? 'Please wait…'
            : isUninitialized
              ? 'Create Vault'
              : effectiveUnlockMode === 'recovery'
                ? 'Unlock with Key'
                : 'Unlock'
        }
        onSubmit={handleSubmit}
        details={!isUninitialized ? (
          <div className="rounded-lg border border-[var(--color-app-border)]/50 bg-[var(--color-app-surface)]/20 p-3 text-[11px] text-[var(--color-app-muted)] leading-relaxed">
            <div className="flex items-center gap-2 text-[var(--color-app-text)] mb-1">
              <KeyRound size={12} />
              Security note
            </div>
            This unlocks your local vault on this device. Your passphrase or recovery key is never uploaded.
          </div>
        ) : undefined}
        footer={
          !isUninitialized && canUseRecoveryKey ? (
            <div className="pt-1 text-center">
              <button
                type="button"
                className="text-[11px] text-[var(--color-app-muted)] hover:text-red-400 underline-offset-2 hover:underline transition-colors"
                onClick={() => setShowResetVault(true)}
              >
                Don&apos;t have your recovery key? Reset Vault…
              </button>
            </div>
          ) : undefined
        }
      >
        {effectiveUnlockMode === 'recovery' ? (
          <SecretField
            label="Recovery Key"
            value={recoveryKey}
            onChange={setRecoveryKey}
            showSecret={showPass}
            onToggleShow={() => setShowPass((v) => !v)}
            autoFocus
            autoComplete="off"
            placeholder="Enter recovery key"
          />
        ) : (
          <div className="space-y-1.5">
            <SecretField
              label="Passphrase"
              value={passphrase}
              onChange={setPassphrase}
              showSecret={showPass}
              onToggleShow={() => setShowPass((v) => !v)}
              autoFocus
              autoComplete={isUninitialized ? 'new-password' : 'current-password'}
              placeholder={isUninitialized ? 'Create a strong passphrase' : 'Enter passphrase'}
            />
            {!isUninitialized && canUseRecoveryKey ? (
              <div className="flex justify-end px-1">
                <button
                  type="button"
                  onClick={() => {
                    setPassphrase('');
                    setLocalError('');
                    setUnlockMode('recovery');
                  }}
                  className="text-[11px] font-medium text-app-accent underline-offset-2 hover:underline"
                >
                  Forgot passphrase?
                </button>
              </div>
            ) : null}
          </div>
        )}

        {isUninitialized && (
          <Input
            label="Confirm Passphrase"
            type={showPass ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            placeholder="Repeat your passphrase"
          />
        )}

        <label className="flex items-start gap-2 text-[11px] text-[var(--color-app-muted)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={rememberOnDevice}
            onChange={(e) => setRememberOnDevice(e.target.checked)}
            className="mt-0.5 accent-[var(--color-app-accent)]"
          />
          <span>
            Remember unlock on this device
            <span className="block text-[10px] opacity-80 mt-0.5">
              Stores a device-bound session key in the OS credential store. Lock now still works; use Forget this device to require a passphrase again after restart.
            </span>
          </span>
        </label>
      </UnlockModalShell>

      <ResetVaultModal
        isOpen={showResetVault}
        onClose={() => setShowResetVault(false)}
        onReset={() => {
          setShowResetVault(false);
          setPassphrase('');
          setConfirm('');
          setRecoveryKey('');
          setUnlockMode('passphrase');
          setLocalError('');
        }}
      />

      <ChangePassphraseModal
        isOpen={showSetPassphraseAfterRecovery}
        requireCurrent={false}
        title="Set New Passphrase"
        subtitle="Vault unlocked with your recovery key. Set a new passphrase to keep your credentials and unlock with a password again."
        onClose={() => {
          setShowSetPassphraseAfterRecovery(false);
          handleUnlocked();
        }}
      />
    </>
  );
}
