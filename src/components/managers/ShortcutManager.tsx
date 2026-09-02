import { useEffect } from 'react';
import { dispatchAppShortcut } from '../../features/shortcuts';

export function ShortcutManager() {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (dispatchAppShortcut(event)) {
                event.preventDefault();
            }
        };
        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => {
            window.removeEventListener('keydown', handleKeyDown, { capture: true });
        };
    }, []);

    return null;
}
