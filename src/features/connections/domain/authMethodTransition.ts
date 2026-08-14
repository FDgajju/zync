import type { Connection } from './types.js';
import type { ConnectionAuthMode } from './formTransforms.js';

/** Clear overloaded secrets when switching auth modes so login password ≠ key passphrase. */
export function applyAuthMethodTransition(
    formData: Partial<Connection>,
    from: ConnectionAuthMode,
    to: ConnectionAuthMode,
): Partial<Connection> {
    if (from === to) return formData;
    if (from === 'password' && to === 'key') {
        return { ...formData, password: '', authRef: undefined };
    }
    if (from === 'password' && to === 'vault') {
        return { ...formData, password: '', privateKeyPath: undefined };
    }
    if (from === 'key' && to === 'password') {
        return { ...formData, password: '', privateKeyPath: undefined, authRef: undefined };
    }
    if (from === 'key' && to === 'vault') {
        return { ...formData, password: '', privateKeyPath: undefined };
    }
    if (from === 'vault' && to === 'password') {
        return { ...formData, password: '', authRef: undefined, privateKeyPath: undefined };
    }
    if (from === 'vault' && to === 'key') {
        return { ...formData, password: '', authRef: undefined };
    }
    return formData;
}
