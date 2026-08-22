import { RefreshCw } from 'lucide-react';
import { Button } from '../../../../ui/Button';

interface GoogleEncryptionScanPanelProps {
  isLoading: boolean;
  error?: string;
  onRetry: () => void;
}

export function GoogleEncryptionScanPanel({
  isLoading,
  error,
  onRetry,
}: GoogleEncryptionScanPanelProps) {
  if (isLoading) {
    return (
      <p className="flex items-center justify-center gap-2 text-xs text-[var(--color-app-muted)]">
        <RefreshCw size={13} className="animate-spin" aria-hidden />
        Checking Google Drive for an existing backup…
      </p>
    );
  }

  if (!error) return null;

  return (
    <div className="space-y-3">
      <p
        className="rounded-lg border border-[var(--color-app-warning)]/30 bg-[var(--color-app-warning)]/12 px-3 py-2 text-xs leading-relaxed text-[var(--color-app-text)]"
        role="alert"
      >
        {error}
      </p>
      <Button type="button" variant="secondary" className="w-full" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
