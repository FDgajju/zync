import { VaultModeSwitch } from '../../../../vault/VaultModeSwitch';
import { SecretField } from '../../../../vault/SecretField';
import { formatSyncCollectionIdLabel } from '../../../../../vault/syncPassphrase';
import type { SyncRemoteCollectionSummary } from '../../../../../vault/syncIpc';
import { SYNC_PASSPHRASE_MIN_LENGTH } from '../../../../../vault/syncPassphrase';

export type LinkSecretMode = 'passphrase' | 'recovery-key';

interface LinkGoogleBackupFormProps {
  collections: SyncRemoteCollectionSummary[];
  selectedCollectionId: string;
  onSelectCollection: (id: string) => void;
  secretMode: LinkSecretMode;
  onSecretModeChange: (mode: LinkSecretMode) => void;
  secret: string;
  onSecretChange: (value: string) => void;
  showSecret: boolean;
  onToggleShowSecret: () => void;
}

export function LinkGoogleBackupForm({
  collections,
  selectedCollectionId,
  onSelectCollection,
  secretMode,
  onSecretModeChange,
  secret,
  onSecretChange,
  showSecret,
  onToggleShowSecret,
}: LinkGoogleBackupFormProps) {
  const single = collections.length === 1 ? collections[0] : null;

  return (
    <div className="space-y-4">
      {single && (
        <p className="text-xs text-[var(--color-app-muted)]">
          Found your Google backup
          {single.fileCount > 0
            ? ` (${single.fileCount} encrypted file${single.fileCount === 1 ? '' : 's'})`
            : ''}
          . This device will unlock it — keys in Drive are not replaced.
        </p>
      )}

      {collections.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--color-app-muted)]">
            Multiple backups were found. Choose which one to unlock on this device.
          </p>
          {collections.map((collection) => {
            const inputId = `sync-collection-${collection.syncCollectionId}`;
            const isSelected = selectedCollectionId === collection.syncCollectionId;
            return (
              <label
                key={collection.syncCollectionId}
                htmlFor={inputId}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  isSelected
                    ? 'border-[var(--color-app-accent)]/60 bg-[var(--color-app-accent)]/5'
                    : 'border-[var(--color-app-border)]/50 bg-[var(--color-app-surface)]/20 hover:border-[var(--color-app-border)]'
                }`}
              >
                <input
                  id={inputId}
                  type="radio"
                  name="sync-collection"
                  checked={isSelected}
                  onChange={() => onSelectCollection(collection.syncCollectionId)}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-[var(--color-app-text)] font-medium">
                    Google backup · {collection.fileCount} file{collection.fileCount === 1 ? '' : 's'}
                  </span>
                  <span className="block text-[11px] text-[var(--color-app-muted)]">
                    {formatSyncCollectionIdLabel(collection.syncCollectionId)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      <VaultModeSwitch
        value={secretMode}
        onChange={onSecretModeChange}
        options={[
          { value: 'passphrase', label: 'Passphrase' },
          { value: 'recovery-key', label: 'Recovery Key' },
        ]}
      />

      <SecretField
        label={secretMode === 'recovery-key' ? 'Google encryption recovery key' : 'Backup passphrase'}
        value={secret}
        onChange={onSecretChange}
        showSecret={showSecret}
        onToggleShow={onToggleShowSecret}
        autoFocus={collections.length <= 1}
        autoComplete={secretMode === 'recovery-key' ? 'off' : 'current-password'}
        placeholder={
          secretMode === 'recovery-key'
            ? 'Enter recovery key'
            : 'Enter the passphrase for this backup'
        }
      />

      {secretMode === 'passphrase' && (
        <p className="text-[11px] text-[var(--color-app-muted)]">
          Minimum {SYNC_PASSPHRASE_MIN_LENGTH} characters. After this, restore hosts and keys from Sync.
        </p>
      )}
      {secretMode === 'recovery-key' && (
        <p className="text-[11px] text-[var(--color-app-muted)]">
          Use the Google encryption recovery key saved when this backup was created — not the local vault recovery key.
        </p>
      )}
    </div>
  );
}
