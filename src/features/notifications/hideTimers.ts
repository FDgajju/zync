type HideTimer = {
    handle: ReturnType<typeof setTimeout>;
    remaining: number;
    startedAt: number;
    paused: boolean;
};

const hideTimers = new Map<string, HideTimer>();

export function clearHideTimer(id: string): void {
    const timer = hideTimers.get(id);
    if (timer) {
        clearTimeout(timer.handle);
        hideTimers.delete(id);
    }
}

export function clearAllHideTimers(): void {
    for (const id of hideTimers.keys()) clearHideTimer(id);
}

export function scheduleHideTimer(
    id: string,
    remaining: number,
    onExpire: (id: string) => void,
): void {
    clearHideTimer(id);
    if (remaining <= 0) {
        onExpire(id);
        return;
    }
    const startedAt = Date.now();
    const handle = setTimeout(() => {
        hideTimers.delete(id);
        onExpire(id);
    }, remaining);
    hideTimers.set(id, { handle, remaining, startedAt, paused: false });
}

export function pauseHideTimer(id: string): void {
    const timer = hideTimers.get(id);
    if (!timer || timer.paused) return;
    clearTimeout(timer.handle);
    const remaining = Math.max(400, timer.remaining - (Date.now() - timer.startedAt));
    hideTimers.set(id, { ...timer, remaining, paused: true });
}

export function resumeHideTimer(id: string, onExpire: (id: string) => void): void {
    const timer = hideTimers.get(id);
    if (!timer || !timer.paused) return;
    scheduleHideTimer(id, timer.remaining, onExpire);
}

export function listHideTimerIds(): string[] {
    return [...hideTimers.keys()];
}
