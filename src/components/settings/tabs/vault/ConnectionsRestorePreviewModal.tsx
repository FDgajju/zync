import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type {
  SyncConnectionsRestoreArgs,
  SyncConnectionsRestorePreviewResult,
} from '../../../../vault/syncIpc';
import type { RestoreVaultAction } from '../../../../vault/connectionsRestore';
import { Button } from '../../../ui/Button';
import { Modal } from '../../../ui/Modal';
import { cn } from '../../../../lib/utils';

interface ConnectionsRestorePreviewModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  isPreparingVault?: boolean;
  preview: SyncConnectionsRestorePreviewResult | null;
  args: SyncConnectionsRestoreArgs | null;
  vaultAction?: RestoreVaultAction | null;
  onClose: () => void;
  onConfirmRestore: () => void;
  onConfirmHostsOnly?: () => void;
}

function formatPreviewSummary(
  preview: SyncConnectionsRestorePreviewResult,
  args: SyncConnectionsRestoreArgs,
): string {
  const includeTunnels = args.includeTunnels ?? true;
  const includeHostSnippets = args.includeHostSnippets ?? true;
  const includeReferencedCredentials = args.includeReferencedCredentials ?? true;
  const parts: string[] = [];

  const hostPart = `${preview.hostsSelected} host${preview.hostsSelected === 1 ? '' : 's'}`;
  if (preview.hostsNew > 0) {
    parts.push(`${hostPart} (${preview.hostsNew} new)`);
  } else {
    parts.push(hostPart);
  }
  if (includeTunnels && (preview.tunnelsRestorable ?? 0) > 0) {
    const count = preview.tunnelsRestorable ?? 0;
    parts.push(`${count} tunnel${count === 1 ? '' : 's'}`);
  }
  if (includeHostSnippets && (preview.hostSnippetsRestorable ?? 0) > 0) {
    const count = preview.hostSnippetsRestorable ?? 0;
    parts.push(`${count} host snippet${count === 1 ? '' : 's'}`);
  }
  if (includeReferencedCredentials && preview.referencedCredentials > 0) {
    const count = preview.referencedCredentials;
    parts.push(`${count} referenced cred${count === 1 ? '' : 's'}`);
  }

  return parts.join(', ');
}

function bundleChip(label: string, included: boolean) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium',
        included
          ? 'border-[var(--color-app-accent)]/35 bg-[var(--color-app-accent)]/10 text-[var(--color-app-text)]'
          : 'border-[var(--color-app-border)]/50 bg-[var(--color-app-surface)]/20 text-[var(--color-app-muted)] line-through',
      )}
    >
      {label}
    </span>
  );
}

function previewMetricRow(label: string, value: number | undefined) {
  if (value == null) return null;
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-[var(--color-app-muted)]">{label}</span>
      <span className="text-sm font-medium text-[var(--color-app-text)]">{value}</span>
    </div>
  );
}

export function ConnectionsRestorePreviewModal({
  isOpen,
  isSubmitting,
  isPreparingVault = false,
  preview,
  args,
  vaultAction = null,
  onClose,
  onConfirmRestore,
  onConfirmHostsOnly,
}: ConnectionsRestorePreviewModalProps) {
  const includeTunnels = args?.includeTunnels ?? true;
  const includeHostSnippets = args?.includeHostSnippets ?? true;
  const includeReferencedCredentials = args?.includeReferencedCredentials ?? true;
  const hasFailures = (preview?.hostsFailed ?? 0) > 0;
  const skippedTunnels = preview?.tunnelsOrphaned ?? 0;
  const skippedSnippets = preview?.hostSnippetsOrphaned ?? 0;
  const hasSkipped =
    (includeTunnels && skippedTunnels > 0) || (includeHostSnippets && skippedSnippets > 0);
  const hasNothingToRestore =
    preview != null
    && preview.hostsSelected === 0
    && (includeTunnels ? (preview.tunnelsRestorable ?? 0) === 0 : true)
    && (includeHostSnippets ? (preview.hostSnippetsRestorable ?? 0) === 0 : true)
    && (includeReferencedCredentials ? preview.referencedCredentials === 0 : true);
  const summary =
    preview && args ? formatPreviewSummary(preview, args) : null;
  const referencedCount = preview?.referencedCredentials ?? 0;
  const needsVault = vaultAction != null && referencedCount > 0 && !hasNothingToRestore;
  const busy = isSubmitting || isPreparingVault;
  const primaryLabel = isSubmitting
    ? 'Restoring...'
    : needsVault
      ? vaultAction === 'create'
        ? 'Create Vault'
        : 'Unlock Vault'
      : 'Restore';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Review restore"
      subtitle="Confirm what will be pulled onto this device before anything is applied."
      width="max-w-3xl"
    >
      <div className="space-y-4">
        {args && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-app-muted">
              Restore bundle
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {bundleChip('Host definitions', true)}
              {bundleChip('Tunnels', includeTunnels)}
              {bundleChip('Host snippets', includeHostSnippets)}
              {bundleChip('Referenced creds', includeReferencedCredentials)}
            </div>
          </div>
        )}

        {preview && summary && (
          <p className="text-sm font-medium text-app-text">{summary}</p>
        )}

        {preview && (
          <div className="rounded-xl border border-app-border/60 bg-app-surface/25 divide-y divide-app-border/30">
            {previewMetricRow('Hosts', preview.hostsSelected)}
            {previewMetricRow('New hosts', preview.hostsNew)}
            {previewMetricRow('Existing hosts', preview.hostsExisting)}
            {includeReferencedCredentials
              ? previewMetricRow('Referenced creds', preview.referencedCredentials)
              : null}
            {includeTunnels && previewMetricRow('Tunnels', preview.tunnelsRestorable)}
            {includeTunnels && previewMetricRow('Skipped tunnels', skippedTunnels)}
            {includeHostSnippets && previewMetricRow('Host snippets', preview.hostSnippetsRestorable)}
            {includeHostSnippets && previewMetricRow('Skipped snippets', skippedSnippets)}
          </div>
        )}

        <p className="text-xs leading-relaxed text-app-muted">
          {`Host definitions for ${preview?.hostsSelected ?? 0} remote host${(preview?.hostsSelected ?? 0) === 1 ? '' : 's'} will always be restored.`}
          {includeTunnels && ' Tunnels and snippets only apply to restored hosts.'}
          {includeReferencedCredentials && ' Referenced creds are hosts-only — not your full vault library.'}
        </p>

        <div
          className={
            hasNothingToRestore || hasFailures || needsVault || hasSkipped
              ? 'rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2.5'
              : 'rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2.5'
          }
        >
          <div className="flex items-start gap-2">
            {hasNothingToRestore || hasFailures || hasSkipped || needsVault ? (
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
            ) : (
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-300" />
            )}
            <p className="text-xs leading-relaxed text-app-muted">
              {hasNothingToRestore
                ? 'Nothing in Drive matches this restore bundle for this device.'
                : hasFailures
                  ? `${preview?.hostsFailed ?? 0} host record(s) could not be decrypted and will be skipped.`
                  : needsVault
                    ? vaultAction === 'create'
                      ? `${referencedCount} vault key${referencedCount === 1 ? '' : 's'} are on Google. Create a Local Vault to restore them, or restore hosts only and Zync will ask when you connect.`
                      : `${referencedCount} vault key${referencedCount === 1 ? '' : 's'} need an unlocked Local Vault. Unlock to restore them, or restore hosts only for now.`
                  : hasSkipped
                    ? 'Some tunnel or snippet records have no matching host on this device and will be skipped.'
                    : 'Hosts restore first, then tunnels, snippets, and any referenced credentials you selected.'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {needsVault && onConfirmHostsOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onConfirmHostsOnly}
              disabled={busy}
            >
              {isSubmitting ? 'Restoring...' : 'Restore hosts only'}
            </Button>
          )}
          <Button
            size="sm"
            onClick={onConfirmRestore}
            disabled={busy || hasNothingToRestore}
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}