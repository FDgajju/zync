export interface AuthMethodPassword {
    type: 'Password';
    password: string;
}

export interface AuthMethodPrivateKey {
    type: 'PrivateKey';
    key_path: string;
    passphrase: string | null;
}

export interface AuthMethodVaultRef {
    type: 'VaultRef';
    item_id: string;
    credential_id?: string;
}

export type AuthMethodPayload = AuthMethodPassword | AuthMethodPrivateKey | AuthMethodVaultRef;

export interface ConnectionConfigPayload {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    auth_method: AuthMethodPayload;
    jump_host: ConnectionConfigPayload | null;
}

export interface ConnectResponsePayload {
    success: boolean;
    message: string;
    term_id?: string | null;
    detected_os?: string | null;
}

export interface ImportedConnectionPayload {
    id: string;
    name: string;
    host: string;
    username: string;
    port: number;
    privateKeyPath?: string;
    jumpServerAlias?: string;
    jumpServerId?: string;
    aliases?: string[];
}
export type SshImportSourceType = 'default_ssh' | 'file' | 'text';
export type SshImportSourceRequest =
    | { sourceType: 'default_ssh' }
    | { sourceType: 'file'; path: string }
    | { sourceType: 'text'; content: string };

export const testConnectionIpc = async (config: ConnectionConfigPayload): Promise<string> =>
    window.ipcRenderer.invoke('ssh:test', config);

export const importSshConfigIpc = async (): Promise<ImportedConnectionPayload[]> =>
    window.ipcRenderer.invoke('ssh:importConfig');

export const importSshConfigFromFileIpc = async (path: string): Promise<ImportedConnectionPayload[]> =>
    importSshConfigBySourceIpc({ sourceType: 'file', path });

export const importSshConfigFromTextIpc = async (content: string): Promise<ImportedConnectionPayload[]> =>
    importSshConfigBySourceIpc({ sourceType: 'text', content });

export const importSshConfigBySourceIpc = async (
    request: SshImportSourceRequest,
): Promise<ImportedConnectionPayload[]> =>
    window.ipcRenderer.invoke('ssh:importConfigBySource', request);

export const internalizeImportedConnectionsIpc = async (connections: ImportedConnectionPayload[]): Promise<ImportedConnectionPayload[]> =>
    window.ipcRenderer.invoke('ssh:internalize-connections', connections);

export const connectIpc = async (config: ConnectionConfigPayload): Promise<ConnectResponsePayload> =>
    window.ipcRenderer.invoke('ssh:connect', config);

export const disconnectIpc = async (connectionId: string): Promise<void> =>
    window.ipcRenderer.invoke('ssh:disconnect', connectionId);

export const transportLostIpc = async (connectionId: string): Promise<void> =>
    window.ipcRenderer.invoke('ssh:transportLost', connectionId);

export const disconnectVaultBackedIpc = async (): Promise<string[]> =>
    window.ipcRenderer.invoke('ssh:disconnectVaultBacked');
export const getRemoteCwdIpc = async (connectionId: string): Promise<string> =>
    window.ipcRenderer.invoke('fs:cwd', connectionId);

export const writeManagedKeyIpc = async (args: {
    content: string;
    suggestedName?: string | null;
}): Promise<string> =>
    window.ipcRenderer.invoke('ssh:write-managed-key', {
        content: args.content,
        suggestedName: args.suggestedName ?? null,
    });

export const readLocalKeyFileIpc = async (path: string): Promise<string> =>
    window.ipcRenderer.invoke('ssh:read-local-key-file', path);

export const writeEphemeralKeyIpc = async (content: string): Promise<string> =>
    window.ipcRenderer.invoke('ssh:write-ephemeral-key', { content });

export const deleteEphemeralKeyIpc = async (path: string): Promise<void> =>
    window.ipcRenderer.invoke('ssh:delete-ephemeral-key', path);
