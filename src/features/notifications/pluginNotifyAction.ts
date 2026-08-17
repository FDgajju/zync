/** Host ↔ plugin notification action RPC. */

export const PLUGIN_NOTIFY_ACTION_TIMEOUT_MS = 15_000;

export interface PluginNotifyActionRequest {
    requestId: string;
    pluginId: string;
    actionId: string;
    notificationId?: string;
    message: string;
    type: string;
}

export interface PluginNotifyActionResult {
    ok: boolean;
    error?: string;
    /** Optional free-form result for the plugin/host. */
    data?: unknown;
}

type Pending = {
    resolve: (result: PluginNotifyActionResult) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
    pluginId: string;
};

const pending = new Map<string, Pending>();

export function createPluginNotifyActionRequestId(): string {
    return `pna_${Math.random().toString(36).slice(2, 11)}_${Date.now().toString(36)}`;
}

export function waitForPluginNotifyActionResult(
    requestId: string,
    pluginId: string,
    timeoutMs = PLUGIN_NOTIFY_ACTION_TIMEOUT_MS,
): Promise<PluginNotifyActionResult> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(requestId);
            reject(new Error('Plugin notification action timed out'));
        }, timeoutMs);

        pending.set(requestId, {
            resolve: (result) => {
                clearTimeout(timer);
                pending.delete(requestId);
                resolve(result);
            },
            reject: (error) => {
                clearTimeout(timer);
                pending.delete(requestId);
                reject(error);
            },
            timer,
            pluginId,
        });
    });
}

export function resolvePluginNotifyActionResponse(
    payload: {
        requestId?: string;
        result?: unknown;
        error?: unknown;
        ok?: unknown;
    } | null | undefined,
): boolean {
    const requestId = typeof payload?.requestId === 'string' ? payload.requestId : '';
    if (!requestId) return false;
    const entry = pending.get(requestId);
    if (!entry) return false;

    if (payload?.error != null && payload.error !== '') {
        const message = typeof payload.error === 'string'
            ? payload.error
            : payload.error instanceof Error
                ? payload.error.message
                : String(payload.error);
        entry.resolve({ ok: false, error: message });
        return true;
    }

    const raw = payload?.result;
    if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        const ok = obj.ok === false ? false : true;
        const error = typeof obj.error === 'string' ? obj.error : undefined;
        entry.resolve({
            ok: ok && !error,
            ...(error ? { error } : {}),
            ...(obj.data !== undefined ? { data: obj.data } : {}),
        });
        return true;
    }

    if (payload?.ok === false) {
        entry.resolve({ ok: false, error: 'Action failed' });
        return true;
    }

    entry.resolve({ ok: true, data: raw });
    return true;
}

/** Cancel pending RPCs for a plugin worker that is going away. */
export function rejectPendingPluginNotifyActionsForPlugin(pluginId: string, reason = 'Plugin unloaded'): void {
    for (const entry of pending.values()) {
        if (entry.pluginId !== pluginId) continue;
        entry.reject(new Error(reason));
    }
}

export function rejectAllPendingPluginNotifyActions(reason = 'App shutting down'): void {
    for (const entry of [...pending.values()]) {
        entry.reject(new Error(reason));
    }
}
