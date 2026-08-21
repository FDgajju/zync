import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '../ui/Input';

interface SecretFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  showSecret: boolean;
  onToggleShow: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  autoComplete?: InputHTMLAttributes<HTMLInputElement>['autoComplete'];
  /** Optional control opposite the label (e.g. Forgot passphrase?). */
  labelAction?: ReactNode;
}

export function SecretField({
  label,
  value,
  onChange,
  showSecret,
  onToggleShow,
  placeholder,
  autoFocus,
  autoComplete,
  labelAction,
}: SecretFieldProps) {
  const inputId = useId();
  const eyeToggle = (
    <button
      type="button"
      onClick={onToggleShow}
      aria-pressed={showSecret}
      aria-label={showSecret ? `Hide ${label}` : `Show ${label}`}
      className="p-1.5 -m-1.5 rounded text-app-muted hover:text-app-text transition-colors"
    >
      {showSecret ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );

  if (!labelAction) {
    return (
      <Input
        id={inputId}
        label={label}
        type={showSecret ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        placeholder={placeholder}
        rightElement={eyeToggle}
      />
    );
  }

  return (
    <div className="space-y-1 w-full">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <label
          htmlFor={inputId}
          className="text-[10px] font-bold text-app-muted uppercase tracking-[0.15em] opacity-40"
        >
          {label}
        </label>
        {labelAction}
      </div>
      <Input
        id={inputId}
        type={showSecret ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        placeholder={placeholder}
        rightElement={eyeToggle}
      />
    </div>
  );
}
