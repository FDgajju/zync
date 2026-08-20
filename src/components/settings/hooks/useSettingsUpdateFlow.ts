import { useEffect, useRef, useState } from 'react';
import type { UpdateInfo, UpdateStatus } from '../../../store/updateSlice';
import { useAppStore } from '../../../store/useAppStore';
import {
    checkForUpdates as serviceCheckForUpdates,
    startDownload as serviceStartDownload,
    installAndRestart as serviceInstallAndRestart,
    openReleasePage,
} from '../../../features/updater/updaterService';

interface UseSettingsUpdateFlowOptions {
    isOpen: boolean;
    isWindows: boolean;
    updateStatus: UpdateStatus;
    updateInfo: UpdateInfo | null;
    setUpdateStatus: (status: UpdateStatus) => void;
    setUpdateInfo: (info: UpdateInfo | null) => void;
    showToast: (type: 'info' | 'success' | 'warning' | 'error', message: string) => void;
}

export function useSettingsUpdateFlow({
    isOpen,
    isWindows,
    updateStatus,
    updateInfo,
    setUpdateStatus,
    setUpdateInfo,
    showToast,
}: UseSettingsUpdateFlowOptions) {
    const isCheckingRef = useRef(false);
    const isUpdateActionInFlightRef = useRef(false);
    const isInstallingRef = useRef(false);
    const isMountedRef = useRef(false);
    const isOpenRef = useRef(isOpen);
    const [appVersion, setAppVersion] = useState('');
    const [isAppImage, setIsAppImage] = useState(false);
    const [showRestartConfirm, setShowRestartConfirm] = useState(false);
    const downloadProgress = useAppStore(state => state.downloadProgress);
    const setDownloadProgress = useAppStore(state => state.setDownloadProgress);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        isOpenRef.current = isOpen;
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        window.ipcRenderer.invoke('app:getVersion')
            .then((ver: string) => {
                if (isMountedRef.current) setAppVersion(ver);
            })
            .catch((error: unknown) => {
                console.error('Failed to resolve app version', error);
            });

        window.ipcRenderer.invoke('app:isAppImage')
            .then((is: boolean) => {
                if (isMountedRef.current) setIsAppImage(is);
            })
            .catch((error: unknown) => {
                console.error('Failed to resolve app image mode', error);
            });
    }, [isOpen]);

    const checkForUpdates = async () => {
        if (isCheckingRef.current || updateStatus === 'checking') return;
        isCheckingRef.current = true;
        setUpdateStatus('checking');
        let nextInfo: UpdateInfo | null = null;
        let nextStatus: UpdateStatus = 'not-available';
        try {
            nextInfo = await serviceCheckForUpdates();
            if (nextInfo && nextInfo.version) {
                nextStatus = 'available';
                if (isMountedRef.current && isOpenRef.current) {
                    showToast('info', `Update v${nextInfo.version} available!`);
                }
            } else {
                nextStatus = 'not-available';
            }
        } catch (error) {
            nextStatus = 'error';
            console.error('Update check failed', error);
            const message = error instanceof Error ? error.message : String(error);
            if (isMountedRef.current && isOpenRef.current) {
                showToast('error', `Failed to check for updates: ${message}`);
            }
        } finally {
            setUpdateStatus(nextStatus);
            setUpdateInfo(nextInfo);
            isCheckingRef.current = false;
        }
    };

    const platform = window.electronUtils?.platform;
    const userAgent = window.navigator.userAgent.toLowerCase();
    const userAgentIndicatesMac = userAgent.includes('mac');
    const resolvedPlatform = platform || (isWindows ? 'win32' : (userAgentIndicatesMac ? 'darwin' : 'linux'));
    const platformLabel = isAppImage
        ? 'AppImage'
        : resolvedPlatform === 'darwin'
            ? 'macOS'
            : resolvedPlatform === 'win32'
                ? 'Windows'
                : 'Linux';

    // In-app updates supported across Windows, macOS, and Linux
    const canAutoUpdate = true;

    const handleUpdateAction = async () => {
        if (isUpdateActionInFlightRef.current) return;
        if (updateStatus === 'checking' || updateStatus === 'downloading') return;
        isUpdateActionInFlightRef.current = true;
        try {
            if (updateStatus === 'available') {
                setUpdateStatus('downloading');
                setDownloadProgress(0);
                try {
                    await serviceStartDownload();
                } catch (error: unknown) {
                    if (import.meta.env.DEV) {
                        console.warn('Real package download not available (running simulated download in dev mode)', error);
                        try {
                            const { runDevSimulatedDownloadFallback } = await import('../../../features/updater/mockUpdater');
                            const handled = await runDevSimulatedDownloadFallback(updateInfo?.version || '2.25.0', 2000);
                            if (handled) return;
                        } catch (simErr) {
                            console.error('Simulated download fallback failed:', simErr);
                        }
                    }
                    console.error('Update download failed', error);
                    setUpdateStatus('error');
                    if (isMountedRef.current && isOpenRef.current) {
                        const message = error instanceof Error ? error.message : 'Update download failed. Please try again or download manually.';
                        showToast('error', message);
                    }
                }
            } else if (updateStatus === 'ready') {
                setShowRestartConfirm(true);
            } else {
                await checkForUpdates();
            }
        } finally {
            isUpdateActionInFlightRef.current = false;
        }
    };

    const handleConfirmRestart = async () => {
        if (isInstallingRef.current) return;
        isInstallingRef.current = true;
        try {
            await serviceInstallAndRestart();
            if (!isMountedRef.current) return;
            setShowRestartConfirm(false);
            if (isOpenRef.current) {
                showToast('success', 'Restarting Zync to apply update...');
            }
        } catch (error) {
            if (!isMountedRef.current) return;
            const message = error instanceof Error ? error.message : String(error);
            console.error('Failed to install update', error);
            if (isOpenRef.current) {
                showToast('error', `Failed to install update: ${message}`);
            }
        } finally {
            isInstallingRef.current = false;
        }
    };

    return {
        appVersion,
        isAppImage,
        showRestartConfirm,
        setShowRestartConfirm,
        platformLabel,
        canAutoUpdate,
        downloadProgress,
        handleUpdateAction,
        handleConfirmRestart,
        checkForUpdates,
        updateInfo,
        openReleasePage,
    };
}
