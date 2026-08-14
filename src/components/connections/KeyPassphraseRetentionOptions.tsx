import { KeyRound, Laptop, Shield, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { KeyPassphraseRetention } from '../../features/connections/application/keyPassphrasePrompt';

interface KeyPassphraseRetentionOptionsProps {
    value: KeyPassphraseRetention;
    onChange: (value: KeyPassphraseRetention) => void;
    vaultAvailable: boolean;
    rememberedOnDevice?: boolean;
    isForgetting?: boolean;
    onForgetFromDevice?: () => void;
}

const options = [
    {
        value: 'once' as const,
        label: 'Ask every time',
        description: 'Prompt when a new connection starts. Nothing is stored.',
        icon: KeyRound,
    },
    {
        value: 'device' as const,
        label: 'Remember this key on this device',
        description: "Store the key's passphrase in the OS credential store.",
        icon: Laptop,
    },
    {
        value: 'vault' as const,
        label: 'Save to Vault',
        description: 'Store the key and passphrase encrypted in Zync Vault.',
        icon: Shield,
    },
];

export function KeyPassphraseRetentionOptions({
    value,
    onChange,
    vaultAvailable,
    rememberedOnDevice = false,
    isForgetting = false,
    onForgetFromDevice,
}: KeyPassphraseRetentionOptionsProps) {
    return (
        <div className="space-y-2">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-app-muted">
                Keep passphrase
            </span>
            <div className="overflow-hidden rounded-md border border-app-border bg-app-bg" role="radiogroup" aria-label="Keep key passphrase">
                {options.filter(option => option.value !== 'vault' || vaultAvailable).map((option, index) => {
                    const Icon = option.icon;
                    const selected = value === option.value;
                    const disabled = rememberedOnDevice && option.value === 'once';
                    const description = disabled
                        ? 'Forget this key from the device first to require prompts.'
                        : option.description;
                    return (
                        <label
                            key={option.value}
                            className={cn(
                                'flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors',
                                index > 0 && 'border-t border-app-border',
                                selected ? 'bg-app-accent/10' : 'hover:bg-app-surface/60',
                                disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                            )}
                        >
                            <input
                                type="radio"
                                name="key-passphrase-retention"
                                checked={selected}
                                disabled={disabled}
                                onChange={() => onChange(option.value)}
                                className="mt-0.5 h-3.5 w-3.5 accent-app-accent"
                            />
                            <Icon size={14} className="mt-0.5 shrink-0 text-app-muted" />
                            <span className="min-w-0">
                                <span className="block text-xs font-medium text-app-text">{option.label}</span>
                                <span className="block text-[10px] leading-4 text-app-muted">{description}</span>
                            </span>
                        </label>
                    );
                })}
            </div>
            {rememberedOnDevice && onForgetFromDevice && (
                <button
                    type="button"
                    disabled={isForgetting}
                    onClick={onForgetFromDevice}
                    className="inline-flex items-center gap-1.5 text-[10px] text-app-muted hover:text-red-400 disabled:opacity-50"
                >
                    <Trash2 size={11} />
                    {isForgetting ? 'Forgetting...' : 'Forget this key from this device'}
                </button>
            )}
        </div>
    );
}
