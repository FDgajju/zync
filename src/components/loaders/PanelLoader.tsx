import { cn } from '../../lib/utils';
import { InlineSpinner } from './InlineSpinner';

export function PanelLoader({ className }: { className?: string }) {
  return (
    <div className={cn('absolute inset-0 flex items-center justify-center bg-app-bg', className)}>
      <InlineSpinner size={22} label="Loading panel" />
    </div>
  );
}
