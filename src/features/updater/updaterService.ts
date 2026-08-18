import type { UpdateCheckResult, UpdateInfo } from './types';

export const GITHUB_RELEASES_URL = 'https://github.com/zync-sh/zync/releases/latest';

/**
 * Check if a new version is available via Tauri IPC.
 */
export async function checkForUpdates(): Promise<UpdateInfo | null> {
    const result = await window.ipcRenderer.invoke('update:check') as UpdateCheckResult | null;
    return result?.updateInfo ?? null;
}

/**
 * Trigger download of the available update.
 */
export async function startDownload(): Promise<void> {
    await window.ipcRenderer.invoke('update:download');
}

/**
 * Apply the update and restart the application cleanly.
 */
export async function installAndRestart(): Promise<void> {
    try {
        localStorage.setItem('zync-just-updated', 'true');
        await window.ipcRenderer.invoke('update:install');
    } catch (error) {
        localStorage.removeItem('zync-just-updated');
        console.error('Failed to install and restart:', error);
        throw error;
    }
}

/**
 * Open the GitHub releases page in the user's default browser.
 */
export async function openReleasePage(url: string = GITHUB_RELEASES_URL): Promise<void> {
    try {
        await window.ipcRenderer.invoke('shell:open', url);
    } catch (error) {
        console.error('Failed to open release page:', error);
        throw error;
    }
}
