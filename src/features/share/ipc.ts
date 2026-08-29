import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
    AgentSnapshot,
    ShareAuthStatus,
    ShareProvider,
    ShareRecord,
    ShareStatusPayload,
} from './types';
import { SHARE_QUOTA_FULL_MESSAGE } from './types';

export interface ParsedShareError {
    code?: string;
    message: string;
}

const ERROR_PATTERN = /^\[(?<code>[^\]]+)\]\s*(?<body>[\s\S]*)$/;

export function parseShareError(error: unknown): ParsedShareError {
    let raw = '';
    if (typeof error === 'string') raw = error;
    else if (error && typeof error === 'object' && 'message' in error) {
        raw = String((error as { message: unknown }).message);
    } else if (error != null) raw = String(error);

    const trimmed = raw.trim();
    const parsed = trimmed.match(ERROR_PATTERN);
    const code = parsed?.groups?.code;
    let message = parsed?.groups?.body ?? trimmed;
    if (code === 'share_quota_exceeded') {
        message = SHARE_QUOTA_FULL_MESSAGE;
    }
    return { code, message };
}

export const shareIpc = {
    status: () => invoke<ShareStatusPayload>('share_status'),
    authPeek: () => invoke<ShareAuthStatus>('share_auth_peek'),
    login: (provider: ShareProvider) =>
        invoke<ShareStatusPayload>('share_login', { provider }),
    cancelLogin: () => invoke<boolean>('share_login_cancel'),
    logout: () => invoke<ShareStatusPayload>('share_logout'),
    list: () => invoke<ShareRecord[]>('share_list'),
    create: (port: number, name?: string, password?: string) =>
        invoke<ShareRecord>('share_create', {
            port,
            name: name || null,
            password: password || null,
        }),
    stop: (id: string) => invoke<ShareRecord>('share_stop', { id }),
    start: (id: string) => invoke<ShareRecord>('share_start', { id }),
    delete: (id: string) => invoke<ShareRecord>('share_delete', { id }),
    agentStart: (id?: string) =>
        invoke<void>('share_agent_start', { id: id ?? null }),
    agentStop: (id?: string) =>
        invoke<void>('share_agent_stop', { id: id ?? null }),
};

export function listenShareAuth(
    handler: (auth: ShareAuthStatus) => void,
): Promise<UnlistenFn> {
    return listen<ShareAuthStatus>('share://auth', (event) => handler(event.payload));
}

export function listenShareAgents(
    handler: (agents: AgentSnapshot[]) => void,
): Promise<UnlistenFn> {
    return listen<AgentSnapshot[]>('share://agent-status', (event) => {
        handler(Array.isArray(event.payload) ? event.payload : []);
    });
}
