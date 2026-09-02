import { isXtermKeyboardTarget } from '../../lib/shortcuts';
import type { KeyboardFocus } from './types';

export function keyboardFocus(target: EventTarget | null | undefined): KeyboardFocus {
    if (isXtermKeyboardTarget(target)) {
        return 'xterm';
    }
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return 'field';
    }
    if (target instanceof HTMLElement && target.isContentEditable) {
        return 'field';
    }
    return 'app';
}
