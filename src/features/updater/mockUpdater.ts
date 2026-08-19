import { useAppStore } from '../../store/useAppStore';
import { notify } from '../notifications/notify';
import { installAndRestart, openReleasePage } from './updaterService';
import { executeDownloadSimulation, type SimulationTarget } from './updaterIpcCore';

export { executeDownloadSimulation, type SimulationTarget };

/**
 * Development and testing utility for simulating updater events,
 * testing notifications, download progress, status bar pill, and restart.
 */
export const mockUpdater = {
    /**
     * Simulate Scenario 2: finding an available update (Manual download mode).
     * Shows single notification with "Download" action and status bar Download button.
     */
    mockUpdateAvailable(version: string = '2.25.0', notes: string = 'Bug fixes and performance improvements.') {
        const store = useAppStore.getState();
        store.setUpdateInfo({ version, body: notes });
        store.setUpdateStatus('available');
        store.setDownloadProgress(0);

        notify.info(`Update v${version} is available.`, {
            id: 'zync-updater',
            persist: true,
            history: true,
            source: 'updater',
            actions: [
                {
                    id: 'start-dl',
                    label: 'Download',
                    onClick: () => { void mockUpdater.startSimulatedDownload(version); },
                },
            ],
        });
    },

    /**
     * Run simulated download animation from 0% to 100%, then transition to ready state.
     */
    async startSimulatedDownload(version: string = '2.25.0', durationMs: number = 2000) {
        const store = useAppStore.getState();
        await executeDownloadSimulation(version, durationMs, {
            hasVersion: () => Boolean(store.updateInfo?.version),
            setUpdateInfo: (info) => store.setUpdateInfo(info),
            setUpdateStatus: (status) => store.setUpdateStatus(status as any),
            setDownloadProgress: (p) => store.setDownloadProgress(p),
            dispatchEvent: (name, detail) => {
                window.dispatchEvent(new CustomEvent(name, { detail }));
            },
        });
        mockUpdater.mockUpdateReady(version);
    },

    /**
     * Simulate progress update (0-100).
     */
    mockDownloadProgress(percent: number = 50) {
        const clamped = Math.min(100, Math.max(0, percent));
        const store = useAppStore.getState();
        store.setUpdateStatus('downloading');
        store.setDownloadProgress(clamped);

        window.dispatchEvent(new CustomEvent('zync:update-progress', {
            detail: { percent: clamped, status: clamped >= 100 ? 'finished' : 'progress' }
        }));
    },

    /**
     * Simulate update ready to install (triggers single ready toast and status bar button).
     */
    mockUpdateReady(version: string = '2.25.0') {
        const store = useAppStore.getState();
        store.setUpdateInfo({ version });
        store.setDownloadProgress(100);
        store.setUpdateStatus('ready');

        window.dispatchEvent(new CustomEvent('zync:update-progress', {
            detail: { percent: 100, status: 'finished' }
        }));
    },

    /**
     * Simulate update download or check error.
     */
    mockUpdateError(errorMessage: string = 'Network timeout while downloading update.') {
        const store = useAppStore.getState();
        store.setUpdateStatus('error');

        window.dispatchEvent(new CustomEvent('zync:update-progress', {
            detail: { percent: 0, status: 'error', error: errorMessage }
        }));

        notify.error(`Update failed: ${errorMessage}`, {
            id: 'zync-updater',
            persist: true,
            history: true,
            source: 'updater',
            actions: [
                {
                    id: 'manual-dl',
                    label: 'Download Manually',
                    onClick: () => { void openReleasePage(); },
                },
            ],
        });
    },

    /**
     * Scenario 1 (Auto-Update Enabled - Production default):
     * Quietly checks and downloads in background with status bar progress.
     * Zero intermediate notification noise. ONLY shows single ready notification at the end.
     */
    async simulateAutoUpdateFlow(version: string = '2.25.0', totalDurationMs: number = 2500) {
        const store = useAppStore.getState();
        store.setUpdateStatus('checking');
        store.setUpdateInfo(null);
        store.setDownloadProgress(0);

        await new Promise(r => setTimeout(r, 400));
        store.setUpdateInfo({ version, body: 'Zync major release with new features.' });
        store.setUpdateStatus('downloading');

        const steps = 10;
        const stepDelay = Math.max(100, totalDurationMs / steps);
        for (let i = 1; i <= steps; i++) {
            const percent = Math.min(100, Math.round((i / steps) * 100));
            store.setDownloadProgress(percent);
            window.dispatchEvent(new CustomEvent('zync:update-progress', {
                detail: { percent, status: i === steps ? 'finished' : 'progress' }
            }));
            await new Promise(r => setTimeout(r, stepDelay));
        }
    },

    /**
     * Scenario 2 (Auto-Update Disabled - Manual mode):
     * Shows update available notification with Download button and status bar Download button.
     * Clicking Download on either button starts the download and finishes in ready state.
     */
    simulateManualUpdateFlow(version: string = '2.25.0') {
        mockUpdater.mockUpdateAvailable(version);
    },

    /**
     * Trigger real app restart via Tauri backend.
     */
    async testAppRelaunch() {
        return await installAndRestart();
    },

    /**
     * Simulate post-update celebration notification with "What's New" release notes button.
     */
    mockPostUpdateCelebration(version: string = '2.25.0') {
        notify.success(`Updated to Zync v${version} successfully!`, {
            id: 'zync-updated-welcome',
            duration: 6000,
            history: true,
            source: 'updater',
            actions: [
                {
                    id: 'whats-new',
                    label: "What's New",
                    onClick: () => {
                        useAppStore.getState().openReleaseNotesTab();
                    },
                },
            ],
        });
    },

    /**
     * Reset updater state to idle.
     */
    reset() {
        const store = useAppStore.getState();
        store.setUpdateStatus('idle');
        store.setUpdateInfo(null);
        store.setDownloadProgress(0);
    },
};

// Expose on global window object for easy console testing
declare global {
    interface Window {
        zyncUpdater?: typeof mockUpdater;
        __zyncUpdaterTest?: typeof mockUpdater;
    }
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
    window.zyncUpdater = mockUpdater;
    window.__zyncUpdaterTest = mockUpdater;
}

export async function runDevSimulatedDownloadFallback(version: string = '2.25.0', durationMs: number = 2000): Promise<boolean> {
    if (!import.meta.env.DEV) return false;
    try {
        await mockUpdater.startSimulatedDownload(version, durationMs);
        return true;
    } catch (simErr) {
        console.error('Simulated download failed:', simErr);
        return false;
    }
}
