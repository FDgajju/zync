import type { ConnectConfig } from '../domain/connectionConfig.js';
import {
    inspectPrivateKeyIpc,
    privateKeyReadinessIpc,
} from '../infrastructure/connectionIpc.js';
import { requestKeyPassphrase } from './keyPassphrasePrompt.js';

const stagedPassphrases = new Map<string, string>();
const stagedPassphraseTimers = new Map<string, ReturnType<typeof setTimeout>>();
const STAGED_PASSPHRASE_TTL_MS = 30_000;

const normalizeKeyPathForRuntime = (path: string): string => {
    const trimmed = path.trim();
    if (typeof navigator !== 'undefined' && /win/i.test(navigator.platform)) {
        return trimmed.toLowerCase();
    }
    return trimmed;
};

const stagedPassphraseKey = (connectionId: string, path: string): string =>
    `${connectionId}\0${normalizeKeyPathForRuntime(path)}`;

export function clearStagedKeyPassphrase(connectionId: string, path: string) {
    const key = stagedPassphraseKey(connectionId, path);
    const timer = stagedPassphraseTimers.get(key);
    if (timer) clearTimeout(timer);
    stagedPassphraseTimers.delete(key);
    stagedPassphrases.delete(key);
}

export class KeyPassphrasePromptCancelledError extends Error {}
export class KeyPassphraseVaultRequestedError extends Error {
    constructor(
        public readonly connectionId: string,
        public readonly keyPath: string,
        public readonly passphrase: string,
    ) {
        super('Save this private key in Vault before connecting.');
    }
}

export function stageKeyPassphraseForNextConnect(
    connectionId: string,
    path: string,
    passphrase: string,
) {
    if (!connectionId || !path.trim() || !passphrase) return;
    clearStagedKeyPassphrase(connectionId, path);
    const key = stagedPassphraseKey(connectionId, path);
    stagedPassphrases.set(key, passphrase);
    stagedPassphraseTimers.set(
        key,
        setTimeout(() => {
            stagedPassphraseTimers.delete(key);
            stagedPassphrases.delete(key);
        }, STAGED_PASSPHRASE_TTL_MS),
    );
}

function consumeStagedPassphrase(connectionId: string, path: string): string | undefined {
    const key = stagedPassphraseKey(connectionId, path);
    const value = stagedPassphrases.get(key);
    if (!value) return undefined;
    const timer = stagedPassphraseTimers.get(key);
    if (timer) clearTimeout(timer);
    stagedPassphraseTimers.delete(key);
    stagedPassphrases.delete(key);
    return value;
}

const privateKeyUnavailableError = (connectionName: string): Error =>
    new Error(`Private key for "${connectionName}" is missing, unreadable, or unsupported.`);

async function prepareNode(
    config: ConnectConfig,
    attemptPassphrases: Map<string, string>,
): Promise<void> {
    if (config.jump_host) {
        await prepareNode(config.jump_host, attemptPassphrases);
    }

    if (config.auth_method.type !== 'PrivateKey') return;
    const auth = config.auth_method;
    if (!auth.key_path.trim()) {
        throw privateKeyUnavailableError(config.name);
    }
    const cacheKey = normalizeKeyPathForRuntime(auth.key_path);

    if (auth.passphrase) {
        const inspection = await inspectPrivateKeyIpc({
            path: auth.key_path,
            passphrase: auth.passphrase,
        });
        if (inspection.status === 'valid') {
            attemptPassphrases.set(cacheKey, auth.passphrase);
            return;
        }
        auth.passphrase = null;
    }

    const cached = attemptPassphrases.get(cacheKey);
    if (cached) {
        auth.passphrase = cached;
        return;
    }

    const staged = consumeStagedPassphrase(config.id, auth.key_path);
    if (staged) {
        auth.passphrase = staged;
        attemptPassphrases.set(cacheKey, staged);
        return;
    }

    const readiness = await privateKeyReadinessIpc(auth.key_path);
    if (readiness.status === 'valid') return;
    if (readiness.status === 'invalidKey' || readiness.status === 'unavailable') {
        throw privateKeyUnavailableError(config.name);
    }

    const result = await requestKeyPassphrase({
        connectionId: config.id,
        connectionName: config.name,
        keyPath: auth.key_path,
    });
    if (!result) throw new KeyPassphrasePromptCancelledError('Key passphrase entry was cancelled.');
    if (result.retention === 'vault') {
        throw new KeyPassphraseVaultRequestedError(
            config.id,
            auth.key_path,
            result.passphrase,
        );
    }
    auth.passphrase = result.passphrase;
    attemptPassphrases.set(cacheKey, result.passphrase);
}

export async function prepareConnectKeyPassphrases(config: ConnectConfig): Promise<void> {
    await prepareNode(config, new Map());
}

export const __keyPassphraseRuntimeTest = {
    normalizeKeyPathForRuntime,
    stagedPassphraseKey,
    consumeStagedPassphrase,
    stagedPassphrases,
    clearAll() {
        for (const timer of stagedPassphraseTimers.values()) {
            clearTimeout(timer);
        }
        stagedPassphraseTimers.clear();
        stagedPassphrases.clear();
    },
};
