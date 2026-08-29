import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function ConnectLoader({
  status,
  icon,
  size = 88,
}: {
  status: 'connecting' | 'error';
  icon: ReactNode;
  size?: number;
}) {
  const paused = status === 'error';

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg className="absolute inset-0" viewBox="0 0 96 96" fill="none">
        <rect
          x="10"
          y="10"
          width="76"
          height="76"
          rx="20"
          className={cn(
            'transition-colors duration-300',
            paused ? 'fill-app-danger/10' : 'fill-app-surface/80',
          )}
        />
        <rect
          x="10"
          y="10"
          width="76"
          height="76"
          rx="20"
          className={paused ? 'stroke-app-danger/25' : 'stroke-app-accent/20'}
          strokeWidth="2.25"
        />
        <rect
          x="10"
          y="10"
          width="76"
          height="76"
          rx="20"
          className={cn(
            paused ? 'zync-connect-orbit-dash is-paused stroke-app-danger' : 'zync-connect-orbit-dash stroke-app-accent',
          )}
          strokeWidth="2.25"
          strokeLinecap="round"
        />
      </svg>
      <div
        className={cn(
          'relative z-[1] transition-colors duration-300',
          paused ? 'text-app-danger' : 'text-app-text',
        )}
      >
        {icon}
      </div>
    </div>
  );
}
