import { OSIcon } from '../icons/OSIcon';
import { Button } from '../ui/Button';
import { ConnectLoader } from './ConnectLoader';

export function ConnectStagePanel({
  status,
  name,
  host,
  icon,
  lastError,
  onCancel,
  onRetry,
}: {
  status: 'connecting' | 'error';
  name: string;
  host?: string;
  icon?: string;
  lastError?: string;
  onCancel?: () => void;
  onRetry?: () => void;
}) {
  const isError = status === 'error';
  const label = name.trim() || host || 'host';

  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-5 bg-app-bg px-6">
      <ConnectLoader
        status={status}
        icon={<OSIcon icon={icon || 'Server'} className="h-8 w-8" />}
      />
      <div className="flex max-w-md flex-col items-center gap-1 text-center">
        <h2 className="text-base font-medium tracking-tight text-app-text">{label}</h2>
        <p className="text-sm text-app-muted">
          {isError ? 'Connection failed' : 'Connecting…'}
        </p>
      </div>
      {isError && lastError && (
        <div className="max-w-lg rounded-lg border border-app-border/70 bg-app-surface/45 px-3 py-2 text-center text-xs leading-relaxed text-app-muted">
          {lastError}
        </div>
      )}
      {isError && onRetry ? (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : !isError && onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-app-muted transition-colors hover:text-app-text"
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
}
