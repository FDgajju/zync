export const normalizeKeyPathForRuntime = (path: string): string => {
    const trimmed = path.trim();
    if (typeof navigator !== 'undefined' && /win/i.test(navigator.platform)) {
        return trimmed.toLowerCase();
    }
    return trimmed;
};
