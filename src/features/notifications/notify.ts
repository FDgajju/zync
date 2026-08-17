import type { NotifyOptions, ToastType } from './types.js';

/**
 * Host-bound emitter. The app store registers a dispatcher once at startup
 * so features/plugins can call `notify.*` without importing the whole store.
 */
type NotifyDispatcher = (
    type: ToastType,
    message: string,
    durationOrOptions?: number | NotifyOptions,
) => void;

let dispatcher: NotifyDispatcher | null = null;

/** Called once from the app store bootstrap. */
export function bindNotifyDispatcher(next: NotifyDispatcher): void {
    dispatcher = next;
}

export function unbindNotifyDispatcher(): void {
    dispatcher = null;
}

function emit(
    type: ToastType,
    message: string,
    durationOrOptions?: number | NotifyOptions,
): void {
    if (!dispatcher) {
        console.warn('[notifications] notify() called before store bind:', type, message);
        return;
    }
    dispatcher(type, message, durationOrOptions);
}

/**
 * External / modular notification API.
 *
 * @example
 * import { notify } from '../features/notifications';
 * notify.success('Copied');
 * notify.error('Failed', { persist: true, actions: [...] });
 * notify.info('Done', { history: true, source: 'sync' });
 * notify.emit('warning', 'Careful', { channel: 'both' });
 */
export const notify = {
    emit,
    success: (message: string, options?: number | NotifyOptions) => emit('success', message, options),
    info: (message: string, options?: number | NotifyOptions) => emit('info', message, options),
    warning: (message: string, options?: number | NotifyOptions) => emit('warning', message, options),
    error: (message: string, options?: number | NotifyOptions) => emit('error', message, options),
};
