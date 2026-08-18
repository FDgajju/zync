import { useState } from 'react';
import { Download, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Tooltip } from '../../components/ui/Tooltip';
import { installAndRestart, openReleasePage, startDownload } from './updaterService';
import { notify } from '../notifications/notify';

export function StatusBarUpdateIndicator() {
    const updateStatus = useAppStore(state => state.updateStatus);
    const updateInfo = useAppStore(state => state.updateInfo);
    const downloadProgress = useAppStore(state => state.downloadProgress);
    const [isRestarting, setIsRestarting] = useState(false);

    if (updateStatus === 'idle' || updateStatus === 'checking' || updateStatus === 'not-available') {
        return null;
    }

    const handleRestart = async () => {
        if (isRestarting) return;
        setIsRestarting(true);
        try {
            await installAndRestart();
        } catch (error) {
            setIsRestarting(false);
            const message = error instanceof Error ? error.message : String(error);
            notify.error(`Failed to restart: ${message}`, {
                id: 'zync-updater',
                actions: [
                    {
                        id: 'retry',
                        label: 'Retry',
                        onClick: () => { void handleRestart(); },
                    },
                    {
                        id: 'manual',
                        label: 'Manual Download',
                        onClick: () => { void openReleasePage(); },
                    },
                ],
            });
        }
    };

    if (updateStatus === 'available') {
        const versionLabel = updateInfo?.version ? `v${updateInfo.version}` : 'Update';
        return (
            <Tooltip
                content={`New update ${versionLabel} is available. Click to download in background.`}
                position="top"
            >
                <button
                    type="button"
                    onClick={async () => {
                        useAppStore.getState().setUpdateStatus('downloading');
                        useAppStore.getState().setDownloadProgress(0);
                        try {
                            await startDownload();
                        } catch (error) {
                            if (import.meta.env.DEV) {
                                try {
                                    const { mockUpdater } = await import('./mockUpdater');
                                    await mockUpdater.startSimulatedDownload(updateInfo?.version || '2.25.0');
                                    return;
                                } catch (simErr) {
                                    console.error('Simulated download failed:', simErr);
                                }
                            }
                            console.error('Download start failed:', error);
                            useAppStore.getState().setUpdateStatus('error');
                            notify.error('Update download failed. Please try again or download manually.', {
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
                        }
                    }}
                    className="group h-6 inline-flex items-center gap-1.5 px-2.5 rounded-md bg-app-accent/10 hover:bg-app-accent/20 border border-app-accent/25 hover:border-app-accent/40 text-app-accent text-[11px] font-medium transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 cursor-pointer select-none"
                    aria-label={`Download update ${versionLabel}`}
                >
                    <Download size={12} className="opacity-80 group-hover:opacity-100 transition-opacity" />
                    <span>Download {versionLabel}</span>
                </button>
            </Tooltip>
        );
    }

    if (updateStatus === 'downloading') {
        const percent = Math.round(downloadProgress);
        return (
            <Tooltip
                content={`Downloading update ${updateInfo?.version ? `(v${updateInfo.version})` : ''} - ${percent}% complete. You can keep working.`}
                position="top"
            >
                <div className="h-6 flex items-center gap-1.5 px-2.5 rounded-md bg-app-accent/[0.08] border border-app-accent/25 text-app-accent text-[11px] font-medium animate-pulse">
                    <Download size={12} className="animate-bounce" />
                    <span>Updating {percent}%</span>
                </div>
            </Tooltip>
        );
    }

    if (updateStatus === 'ready') {
        const versionLabel = updateInfo?.version ? `v${updateInfo.version}` : 'New Version';
        return (
            <Tooltip
                content={`Zync ${versionLabel} is downloaded and ready to apply. Click to restart immediately.`}
                position="top"
            >
                <button
                    type="button"
                    onClick={() => { void handleRestart(); }}
                    disabled={isRestarting}
                    className="group h-6 inline-flex items-center gap-1.5 px-2.5 rounded-md bg-app-accent/15 hover:bg-app-accent/25 border border-app-accent/35 hover:border-app-accent/50 text-app-accent text-[11px] font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 cursor-pointer select-none"
                    aria-label={`Restart to install update ${versionLabel}`}
                >
                    <Sparkles size={12} className="text-amber-400 dark:text-amber-300 shrink-0" />
                    <span>{isRestarting ? 'Restarting...' : `Restart to update (${versionLabel})`}</span>
                    <RefreshCw size={11} className={isRestarting ? 'animate-spin' : 'opacity-70 group-hover:opacity-100 transition-opacity'} />
                </button>
            </Tooltip>
        );
    }

    if (updateStatus === 'error') {
        return (
            <Tooltip content="Update check/download failed. Click to open download page." position="top">
                <button
                    type="button"
                    onClick={() => { void openReleasePage(); }}
                    className="h-6 inline-flex items-center gap-1 px-2 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 hover:text-red-300 text-[11px] transition-colors cursor-pointer"
                    aria-label="Update failed. Click for manual download."
                >
                    <AlertCircle size={12} />
                    <span>Update failed</span>
                </button>
            </Tooltip>
        );
    }

    return null;
}
