import { useEffect, useMemo, useState } from 'react';
import { Shield } from 'lucide-react';
import { Modal } from '../../../ui/Modal';
import { Button } from '../../../ui/Button';
import type { SyncCollectionSetupArgs, SyncKeyPolicyMode } from '../../../../vault/syncIpc';
import {
  SYNC_PASSPHRASE_MIN_LENGTH,
  canSubmitSyncSetup,
  formatSyncCollectionSetupError,
  isLocalPassphrasePolicy,
  validateSyncSetupPassphrase,
} from '../../../../vault/syncPassphrase';
import { useRemoteCollectionDiscovery } from './googleEncryption/useRemoteCollectionDiscovery';
import { GoogleEncryptionScanPanel } from './googleEncryption/GoogleEncryptionScanPanel';
import {
  LinkGoogleBackupForm,
  type LinkSecretMode,
} from './googleEncryption/LinkGoogleBackupForm';
import { CreateGoogleCollectionForm } from './googleEncryption/CreateGoogleCollectionForm';

interface SyncCollectionSetupModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  hasLocalVaultConfigured: boolean;
  onClose: () => void;
  onSubmit: (args: SyncCollectionSetupArgs) => Promise<void>;
}

export function SyncCollectionSetupModal({
  isOpen,
  isSubmitting,
  hasLocalVaultConfigured,
  onClose,
  onSubmit,
}: SyncCollectionSetupModalProps) {
  const [mode, setMode] = useState<SyncKeyPolicyMode>('local-passphrase');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [hasRecoveryKey, setHasRecoveryKey] = useState(true);
  const [linkSecretMode, setLinkSecretMode] = useState<LinkSecretMode>('passphrase');
  const [error, setError] = useState('');

  const discovery = useRemoteCollectionDiscovery(isOpen);
  const {
    remoteDiscovery,
    remoteCollections,
    selectedCollectionId,
    setSelectedCollectionId,
    isDiscoveryPending,
    isDiscoveryReady,
    isLinkingExisting,
    retry,
  } = discovery;

  useEffect(() => {
    if (!isOpen) {
      setPassphrase('');
      setConfirmPassphrase('');
      setShowPassphrase(false);
      setHasRecoveryKey(true);
      setLinkSecretMode('passphrase');
      setError('');
      return;
    }
    setMode(hasLocalVaultConfigured ? 'local-passphrase' : 'custom-passphrase');
    setPassphrase('');
    setConfirmPassphrase('');
    setShowPassphrase(false);
    setHasRecoveryKey(true);
    setLinkSecretMode('passphrase');
    setError('');
  }, [isOpen, hasLocalVaultConfigured]);

  useEffect(() => {
    if (!isOpen) return;
    if (!hasLocalVaultConfigured && isLocalPassphrasePolicy(mode)) {
      setMode('custom-passphrase');
      setPassphrase('');
      setConfirmPassphrase('');
      setError('');
    }
  }, [hasLocalVaultConfigured, isOpen, mode]);

  useEffect(() => {
    if (isDiscoveryReady) {
      setHasRecoveryKey(!isLinkingExisting);
    }
  }, [isDiscoveryReady, isLinkingExisting]);

  const collectionSelectionReady = remoteCollections.length <= 1 || selectedCollectionId.trim().length > 0;

  const canSubmit = useMemo(() => {
    if (isSubmitting || !isDiscoveryReady || !collectionSelectionReady) return false;
    if (isLinkingExisting) {
      const trimmed = passphrase.trim();
      return linkSecretMode === 'recovery-key'
        ? trimmed.length > 0
        : trimmed.length >= SYNC_PASSPHRASE_MIN_LENGTH;
    }
    return canSubmitSyncSetup({
      mode,
      passphrase,
      confirmPassphrase,
      hasLocalVaultConfigured,
      isSubmitting,
    });
  }, [
    collectionSelectionReady,
    confirmPassphrase,
    hasLocalVaultConfigured,
    isDiscoveryReady,
    isLinkingExisting,
    isSubmitting,
    linkSecretMode,
    mode,
    passphrase,
  ]);

  const handleClose = () => {
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (isLinkingExisting && remoteCollections.length > 1 && !selectedCollectionId.trim()) {
      setError('Choose which Google Drive backup to link on this device.');
      return;
    }

    const trimmed = passphrase.trim();
    if (isLinkingExisting) {
      if (linkSecretMode === 'passphrase' && trimmed.length < SYNC_PASSPHRASE_MIN_LENGTH) {
        setError(`Backup passphrase must be at least ${SYNC_PASSPHRASE_MIN_LENGTH} characters.`);
        return;
      }
      if (linkSecretMode === 'recovery-key' && !trimmed) {
        setError('Enter the Google encryption recovery key.');
        return;
      }
    } else {
      const validationError = validateSyncSetupPassphrase({
        mode,
        passphrase,
        confirmPassphrase,
        hasLocalVaultConfigured,
      });
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    try {
      await onSubmit(
        isLinkingExisting
          ? {
              keyPolicyMode: 'custom-passphrase',
              passphrase: linkSecretMode === 'passphrase' ? trimmed : null,
              recoveryKey: linkSecretMode === 'recovery-key' ? trimmed : null,
              hasRecoveryKey: false,
              syncCollectionId: selectedCollectionId.trim() || null,
            }
          : {
              keyPolicyMode: mode,
              passphrase: trimmed,
              hasRecoveryKey,
              syncCollectionId: null,
            },
      );
      handleClose();
    } catch (submissionError) {
      setError(formatSyncCollectionSetupError(submissionError));
    }
  };

  const title = isDiscoveryPending
    ? 'Google Encryption'
    : remoteDiscovery.status === 'error'
      ? 'Google Encryption'
      : isLinkingExisting
        ? 'Link Google Backup'
        : 'Set up Google Encryption';

  const subtitle = isDiscoveryPending
    ? 'Checking Google Drive for an existing backup…'
    : remoteDiscovery.status === 'error'
      ? 'Could not check Drive. Retry before creating a new collection.'
      : isLinkingExisting
        ? 'Unlock the existing Drive backup. This does not create a new vault or encryption key.'
        : (isLocalPassphrasePolicy(mode)
          ? 'Verify your Local Vault passphrase to create this device\'s Google encryption key.'
          : 'Create the local encryption key used for Google Drive sync records.');

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      subtitle={subtitle}
      width="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex justify-center mb-2">
          <div className="w-12 h-12 rounded-full bg-[var(--color-app-accent)]/10 text-[var(--color-app-accent)] flex items-center justify-center">
            <Shield size={22} />
          </div>
        </div>

        {(isDiscoveryPending || remoteDiscovery.status === 'error') && (
          <GoogleEncryptionScanPanel
            isLoading={isDiscoveryPending}
            error={remoteDiscovery.status === 'error' ? remoteDiscovery.message : undefined}
            onRetry={retry}
          />
        )}

        {isDiscoveryReady && isLinkingExisting && (
          <LinkGoogleBackupForm
            collections={remoteCollections}
            selectedCollectionId={selectedCollectionId}
            onSelectCollection={(id) => {
              setSelectedCollectionId(id);
              setError('');
            }}
            secretMode={linkSecretMode}
            onSecretModeChange={(next) => {
              setLinkSecretMode(next);
              setPassphrase('');
              setError('');
            }}
            secret={passphrase}
            onSecretChange={setPassphrase}
            showSecret={showPassphrase}
            onToggleShowSecret={() => setShowPassphrase(value => !value)}
          />
        )}

        {isDiscoveryReady && !isLinkingExisting && (
          <CreateGoogleCollectionForm
            mode={mode}
            onModeChange={(next) => {
              setMode(next);
              setPassphrase('');
              setConfirmPassphrase('');
              setError('');
            }}
            hasLocalVaultConfigured={hasLocalVaultConfigured}
            passphrase={passphrase}
            onPassphraseChange={setPassphrase}
            confirmPassphrase={confirmPassphrase}
            onConfirmPassphraseChange={setConfirmPassphrase}
            showPassphrase={showPassphrase}
            onToggleShowPassphrase={() => setShowPassphrase(value => !value)}
            hasRecoveryKey={hasRecoveryKey}
            onHasRecoveryKeyChange={setHasRecoveryKey}
          />
        )}

        {isDiscoveryReady && (
          <div className="rounded-lg border border-[var(--color-app-border)]/50 bg-[var(--color-app-surface)]/20 p-3 text-[11px] text-[var(--color-app-muted)] leading-relaxed">
            <div className="flex items-center gap-2 text-[var(--color-app-text)] mb-1">
              <Shield size={12} />
              Security note
            </div>
            Google Drive only stores encrypted domain records and sync metadata. Passphrases and recovery keys are not uploaded.
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={handleClose} className="flex-1" disabled={isSubmitting}>
            Cancel
          </Button>
          {isDiscoveryReady && (
            <Button type="submit" className="flex-1" disabled={!canSubmit}>
              {isSubmitting
                ? (isLinkingExisting ? 'Linking…' : 'Setting up…')
                : (isLinkingExisting ? 'Link Backup' : 'Set up Encryption')}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
