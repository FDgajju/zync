export interface UpdaterIpcDependencies {
  check: () => Promise<any>;
  invoke: (cmd: string, args?: any) => Promise<any>;
  dispatchEvent: (name: string, detail: any) => void;
}

export function createUpdaterIpcHandler(deps: UpdaterIpcDependencies) {
  let currentUpdate: any = null;
  let isUpdateDownloaded = false;

  return {
    async handleCheck() {
      try {
        const update = await deps.check();
        isUpdateDownloaded = false;
        if (update?.available) {
          currentUpdate = update;
          return {
            updateInfo: {
              version: update.version,
              body: update.body,
              date: update.date,
            },
          };
        }
        currentUpdate = null;
        return null;
      } catch (e) {
        isUpdateDownloaded = false;
        console.error('Update check error:', e);
        throw e;
      }
    },

    async handleDownload() {
      isUpdateDownloaded = false;
      if (!currentUpdate) {
        const update = await deps.check();
        if (update?.available) {
          currentUpdate = update;
        }
      }

      if (!currentUpdate) {
        throw new Error('No update available to download');
      }

      const downloadState = { downloaded: 0, total: 0 };

      try {
        await currentUpdate.download((event: any) => {
          try {
            if (event.event === 'Started') {
              downloadState.total = event.data?.contentLength || 0;
              downloadState.downloaded = 0;
              deps.dispatchEvent('zync:update-progress', { percent: 0, status: 'started' });
            } else if (event.event === 'Progress') {
              downloadState.downloaded += event.data?.chunkLength || 0;
              let percent = 0;
              if (downloadState.total > 0) {
                percent = (downloadState.downloaded / downloadState.total) * 100;
              }
              percent = Math.min(100, Math.max(0, percent));
              deps.dispatchEvent('zync:update-progress', { percent, status: 'progress' });
            } else if (event.event === 'Finished') {
              deps.dispatchEvent('zync:update-progress', { percent: 100, status: 'finished' });
            }
          } catch (err) {
            console.error('Error in download callback:', err);
            deps.dispatchEvent('zync:update-progress', { percent: 0, status: 'error' });
          }
        });
        isUpdateDownloaded = true;
        return { success: true };
      } catch (error) {
        isUpdateDownloaded = false;
        console.error('Update download error:', error);
        deps.dispatchEvent('zync:update-progress', { percent: 0, status: 'error' });
        throw error;
      }
    },

    async handleInstall() {
      try {
        if (!currentUpdate || !isUpdateDownloaded || typeof currentUpdate.install !== 'function') {
          throw new Error('No downloaded update is ready to install.');
        }
        await currentUpdate.install();
        await deps.invoke('app_relaunch');
        return { success: true };
      } catch (error) {
        console.error('Failed to install and relaunch update:', error);
        throw error;
      }
    },

    getState() {
      return {
        hasCurrentUpdate: Boolean(currentUpdate),
        isUpdateDownloaded,
      };
    },
  };
}

export interface SimulationTarget {
  setUpdateInfo: (info: { version: string }) => void;
  setUpdateStatus: (status: string) => void;
  setDownloadProgress: (percent: number) => void;
  hasVersion: () => boolean;
  dispatchEvent: (name: string, detail: any) => void;
  delay?: (ms: number) => Promise<void>;
}

export async function executeDownloadSimulation(
  version: string = '2.25.0',
  durationMs: number = 2000,
  target: SimulationTarget,
) {
  if (!target.hasVersion()) {
    target.setUpdateInfo({ version });
  }
  target.setUpdateStatus('downloading');
  target.setDownloadProgress(0);

  const steps = 10;
  const stepDelay = durationMs > 0 ? Math.max(80, durationMs / steps) : 0;
  const sleep = target.delay ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  for (let i = 1; i <= steps; i++) {
    const percent = Math.min(100, Math.round((i / steps) * 100));
    target.setDownloadProgress(percent);
    target.dispatchEvent('zync:update-progress', {
      percent,
      status: i === steps ? 'finished' : 'progress',
    });
    if (stepDelay > 0) {
      await sleep(stepDelay);
    }
  }

  target.setUpdateStatus('ready');
  target.setDownloadProgress(100);
}
