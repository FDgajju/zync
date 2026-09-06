export type OpenHereFile = {
    type: string;
    name: string;
    path?: string;
};

function trimmed(value: string | null | undefined): string {
    return (value || '').trim();
}

/**
 * Prefer a live shell cwd. Skip connection.homePath `/` — connect() stores that
 * before SFTP cwd returns, so it is not a real home.
 */
export function pickFilesOpenPath(input: {
    lastKnownCwd?: string | null;
    initialPath?: string | null;
    homePath?: string | null;
}): string {
    const cwd = trimmed(input.lastKnownCwd);
    if (cwd) return cwd;
    const initial = trimmed(input.initialPath);
    if (initial) return initial;
    const home = trimmed(input.homePath);
    if (home && home !== '/') return home;
    return '';
}

/** Directory to spawn in: folder itself, or the parent of a file. */
export function directoryFromFileLocation(
    currentPath: string,
    file?: OpenHereFile | null,
): string {
    const listed = (currentPath || '').trim();
    if (file?.type === 'd') {
        const full = file.path?.trim();
        if (full) return full;
        return joinDir(listed, file.name);
    }
    const filePath = file?.path?.trim();
    if (filePath) return parentDirectory(filePath);
    return listed;
}

export function parentDirectory(path: string): string {
    const raw = path.trim();
    if (!raw) return '';
    const win = raw.includes('\\') && !raw.startsWith('/');
    const sep = win ? '\\' : '/';
    const trimmed = raw.replace(/[\\/]+$/, '');
    if (!trimmed) return win ? raw : '/';
    const idx = trimmed.lastIndexOf(sep);
    if (idx < 0) return '';
    if (!win && idx === 0) return '/';
    if (win && idx === 2 && trimmed[1] === ':') return trimmed.slice(0, 3);
    return trimmed.slice(0, idx);
}

function joinDir(base: string, name: string): string {
    const leaf = name.trim();
    if (!leaf) return base;
    const root = base.trim();
    if (!root || root === '/') return `/${leaf}`.replace(/\/{2,}/g, '/');
    const sep = root.includes('\\') && !root.startsWith('/') ? '\\' : '/';
    return `${root.replace(/[\\/]+$/, '')}${sep}${leaf}`;
}
