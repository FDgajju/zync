import { Input } from '../../../../ui/Input';
import { VaultModeSwitch } from '../../../../vault/VaultModeSwitch';
import { SecretField } from '../../../../vault/SecretField';
import type { SyncKeyPolicyMode } from '../../../../../vault/syncIpc';
import {
  SYNC_PASSPHRASE_MIN_LENGTH,
  getSyncPassphraseLabel,
  isLocalPassphrasePolicy,
} from '../../../../../vault/syncPassphrase';

interface CreateGoogleCollectionFormProps {
  mode: SyncKeyPolicyMode;
  onModeChange: (mode: SyncKeyPolicyMode) => void;
  hasLocalVaultConfigured: boolean;
  passphrase: string;
  onPassphraseChange: (value: string) => void;
  confirmPassphrase: string;
  onConfirmPassphraseChange: (value: string) => void;
  showPassphrase: boolean;
  onToggleShowPassphrase: () => void;
  hasRecoveryKey: boolean;
  onHasRecoveryKeyChange: (value: boolean) => void;
}

export function CreateGoogleCollectionForm({
  mode,
  onModeChange,
  hasLocalVaultConfigured,
  passphrase,
  onPassphraseChange,
  confirmPassphrase,
  onConfirmPassphraseChange,
  showPassphrase,
  onToggleShowPassphrase,
  hasRecoveryKey,
  onHasRecoveryKeyChange,
}: CreateGoogleCollectionFormProps) {
  const requiresConfirmPassphrase = !isLocalPassphrasePolicy(mode);

  return (
    <div className="space-y-4">
      <p
        className="rounded-lg border border-[var(--color-app-warning)]/30 bg-[var(--color-app-warning)]/12 px-3 py-2 text-xs leading-relaxed text-[var(--color-app-text)]"
        role="status"
      >
        No encrypted backup was found on this Google account. Continuing will create a new empty collection.
      </p>

      <VaultModeSwitch
        value={mode}
        onChange={onModeChange}
        options={[
          { value: 'local-passphrase', label: 'Use Local Passphrase', disabled: !hasLocalVaultConfigured },
          { value: 'custom-passphrase', label: 'Use Custom Passphrase' },
        ]}
      />

      {isLocalPassphrasePolicy(mode) && (
        <p className="text-xs text-[var(--color-app-muted)]">
          Enter your Local Vault passphrase once. Zync verifies it against your vault before enabling Google encryption.
        </p>
      )}
      {!hasLocalVaultConfigured && (
        <p className="rounded-lg border border-[var(--color-app-warning)]/30 bg-[var(--color-app-warning)]/12 px-3 py-2 text-xs leading-relaxed text-[var(--color-app-text)]">
          Local Vault is not set up yet, so Google app-data sync will use a separate encryption passphrase.
          You can still sync hosts, tunnels, snippets, and settings. Vault credentials remain disabled until the local vault exists.
        </p>
      )}

      <SecretField
        label={getSyncPassphraseLabel(mode)}
        value={passphrase}
        onChange={onPassphraseChange}
        showSecret={showPassphrase}
        onToggleShow={onToggleShowPassphrase}
        autoFocus
        autoComplete={isLocalPassphrasePolicy(mode) ? 'current-password' : 'new-password'}
        placeholder={
          isLocalPassphrasePolicy(mode)
            ? 'Enter your local vault passphrase'
            : 'Create Google encryption passphrase'
        }
      />

      {requiresConfirmPassphrase && (
        <Input
          label="Confirm Google encryption passphrase"
          type={showPassphrase ? 'text' : 'password'}
          value={confirmPassphrase}
          onChange={(event) => onConfirmPassphraseChange(event.target.value)}
          autoComplete="new-password"
          placeholder="Repeat Google encryption passphrase"
        />
      )}

      <p className="text-[11px] text-[var(--color-app-muted)]">
        Minimum {SYNC_PASSPHRASE_MIN_LENGTH} characters.
      </p>

      <label className="flex items-start gap-2 text-sm text-[var(--color-app-muted)] cursor-pointer">
        <input
          type="checkbox"
          checked={hasRecoveryKey}
          onChange={(event) => onHasRecoveryKeyChange(event.target.checked)}
          className="mt-0.5"
        />
        <span>Generate a Google encryption recovery key (recommended).</span>
      </label>
    </div>
  );
}
