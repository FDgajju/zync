export type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error';

export interface UpdateInfo {
    version: string;
    notes?: string;
    body?: string;
    date?: string;
}

export interface UpdateCheckResult {
    updateInfo?: UpdateInfo | null;
}

export interface UpdateProgressDetail {
    percent: number;
    status: 'started' | 'progress' | 'finished' | 'error';
    error?: string;
}
