import { cn } from '../../lib/utils';

export function InlineSpinner({
  size = 16,
  className,
  label = 'Loading',
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={cn('zync-inline-spinner shrink-0 text-app-accent', className)}
      aria-label={label}
      role="status"
    >
      <circle
        cx="10"
        cy="10"
        r="7"
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeWidth="2.25"
      />
      <path
        d="M17 10a7 7 0 0 0-7-7"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
