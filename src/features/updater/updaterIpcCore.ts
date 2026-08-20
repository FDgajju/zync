export interface UpdaterIpcDependencies {
  check: () => Promise<any>;
  invoke: (cmd: string, args?: any) => Promise<any>;
  dispatchEvent: (name: string, detail: any) => void;
}

export function createUpdaterIpcHandler(deps: UpdaterIpcDependencies) {
  let currentUpdate: any = null;
  let isUpdateDownloaded = false;
  let activeOperation: 'check' | 'download' | 'install' | null = null;

  const closeCurrentUpdate = async () => {
    if (currentUpdate && typeof currentUpdate.close === 'function') {
      try {
        await currentUpdate.close();
      } catch {
        // ignore close errors
      }
    }
    currentUpdate = null;
  };

  return {
    async handleCheck() {
      if (activeOperation) {
        throw new Error(`Updater operation '${activeOperation}' is already in progress`);
      }
      activeOperation = 'check';
      try {
        const update = await deps.check();
        isUpdateDownloaded = false;
        if (update?.available) {
          await closeCurrentUpdate();
          currentUpdate = update;
          return {
            updateInfo: {
              version: update.version,
              body: update.body,
              date: update.date,
            },
          };
        }
        await closeCurrentUpdate();
        return null;
      } catch (e) {
        await closeCurrentUpdate();
        isUpdateDownloaded = false;
        console.error('Update check error:', e);
        throw e;
      } finally {
        activeOperation = null;
      }
    },

    async handleDownload() {
      if (activeOperation) {
        throw new Error(`Updater operation '${activeOperation}' is already in progress`);
      }
      activeOperation = 'download';
      isUpdateDownloaded = false;

      try {
        if (!currentUpdate) {
          const update = await deps.check();
          if (update?.available) {
            currentUpdate = update;
          }
        }

        const targetUpdate = currentUpdate;
        if (!targetUpdate) {
          throw new Error('No update available to download');
        }

        const downloadState = { downloaded: 0, total: 0 };

        await targetUpdate.download((event: any) => {
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

        if (currentUpdate === targetUpdate) {
          isUpdateDownloaded = true;
        }
        return { success: true };
      } catch (error) {
        isUpdateDownloaded = false;
        console.error('Update download error:', error);
        deps.dispatchEvent('zync:update-progress', { percent: 0, status: 'error' });
        throw error;
      } finally {
        activeOperation = null;
      }
    },

    async handleInstall() {
      if (activeOperation) {
        throw new Error(`Updater operation '${activeOperation}' is already in progress`);
      }
      activeOperation = 'install';
      try {
        const targetUpdate = currentUpdate;
        if (!targetUpdate || !isUpdateDownloaded || typeof targetUpdate.install !== 'function') {
          throw new Error('No downloaded update is ready to install.');
        }
        await targetUpdate.install();
        await deps.invoke('app_relaunch');
        return { success: true };
      } catch (error) {
        console.error('Failed to install and relaunch update:', error);
        throw error;
      } finally {
        activeOperation = null;
      }
    },

    getState() {
      return {
        hasCurrentUpdate: Boolean(currentUpdate),
        isUpdateDownloaded,
        activeOperation,
      };
    },
  };
}

export interface AutoDownloadDecisionInput {
  autoDownload: boolean;
  hasAutoDownloaded: boolean;
}

export function evaluateAutoDownloadDecision(input: AutoDownloadDecisionInput): {
  shouldTriggerDownload: boolean;
  nextHasAutoDownloaded: boolean;
} {
  if (input.autoDownload && !input.hasAutoDownloaded) {
    return { shouldTriggerDownload: true, nextHasAutoDownloaded: true };
  }
  return { shouldTriggerDownload: false, nextHasAutoDownloaded: input.hasAutoDownloaded };
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
