import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '../ui/Input';

interface KeyPassphraseInputProps {
    value: string;
    onChange: (value: string) => void;
    label?: string;
    placeholder?: string;
    error?: string;
    autoFocus?: boolean;
}

export function KeyPassphraseInput({
    value,
    onChange,
    label = 'Key passphrase',
    placeholder,
    error,
    autoFocus,
}: KeyPassphraseInputProps) {
    const [visible, setVisible] = useState(false);
    const [capsLock, setCapsLock] = useState(false);

    return (
        <div className="space-y-1">
            <Input
                autoFocus={autoFocus}
                label={label}
                type={visible ? 'text' : 'password'}
                autoComplete="off"
                value={value}
                placeholder={placeholder}
                error={error}
                onChange={event => onChange(event.target.value)}
                onKeyDown={event => setCapsLock(event.getModifierState('CapsLock'))}
                onKeyUp={event => setCapsLock(event.getModifierState('CapsLock'))}
                onBlur={() => setCapsLock(false)}
                rightElement={(
                    <button
                        type="button"
                        className="text-app-muted hover:text-app-text"
                        aria-label={visible ? 'Hide key passphrase' : 'Show key passphrase'}
                        title={visible ? 'Hide key passphrase' : 'Show key passphrase'}
                        onClick={() => setVisible(current => !current)}
                    >
                        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                )}
            />
            {capsLock && <p className="px-1 text-[10px] text-amber-400">Caps Lock is on</p>}
        </div>
    );
}
