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
        label: 'On this device',
        description: "Remember this key's passphrase in the OS credential store.",
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
    const visibleOptions = options.filter(option => option.value !== 'vault' || vaultAvailable);
    // When the parent still holds a hidden value (e.g. 'vault' after vault disappears),
    // fall back so checked state, description, and focus stay aligned.
    const selected = visibleOptions.find(option => option.value === value) ?? visibleOptions[0];
    const effectiveValue = selected?.value ?? 'once';
    const selectedDescription = rememberedOnDevice && effectiveValue === 'once'
        ? 'Forget this key from the device first to require prompts.'
        : selected?.description;

    return (
        <div className="space-y-2">
            <div
                className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-app-border bg-app-surface/50 p-0.5"
                role="radiogroup"
                aria-label="Key passphrase retention"
            >
                {visibleOptions.map((option) => {
                    const Icon = option.icon;
                    const isSelected = effectiveValue === option.value;
                    const disabled = rememberedOnDevice && option.value === 'once';
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            disabled={disabled}
                            title={disabled
                                ? 'Forget this key from the device first to require prompts.'
                                : option.description}
                            onClick={() => {
                                if (!disabled) onChange(option.value);
                            }}
                            className={cn(
                                'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all',
                                isSelected
                                    ? 'bg-app-accent text-white shadow-sm'
                                    : 'text-app-muted hover:text-app-text',
                                disabled && 'cursor-not-allowed opacity-50 hover:text-app-muted',
                            )}
                        >
                            <Icon size={11} />
                            {option.label}
                        </button>
                    );
                })}
            </div>
            {selectedDescription && (
                <p className="text-[10px] leading-4 text-app-muted/70">
                    {selectedDescription}
                </p>
            )}
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
