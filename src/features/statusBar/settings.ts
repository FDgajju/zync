import type { StatusBarSettings } from './types.js';

export const DEFAULT_STATUS_BAR_SETTINGS: StatusBarSettings = {
  showConnectionLatency: true,
};

export function normalizeStatusBarSettings(
  raw?: Partial<StatusBarSettings> | null,
): StatusBarSettings {
  return {
    showConnectionLatency: raw?.showConnectionLatency !== false,
  };
}
