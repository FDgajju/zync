import { useEffect, useState } from 'react';
import { useAppStore, Connection } from '../../store/useAppStore';
import { useVaultStore } from '../../vault/useVaultStore';
import { vaultIpc } from '../../vault/ipc';
import { buildConnectionSavePayload, buildDefaultKeyVaultLabel } from '../../features/connections/domain';
import {
    readLocalKeyFileIpc,
    writeManagedKeyIpc,
} from '../../features/connections/infrastructure/connectionIpc';
import { ToastType } from '../../store/toastSlice';

interface UseAutoVaultOptions {
    isOpen: boolean;
    formData: Partial<Connection>;
    authMethod: 'password' | 'key' | 'vault';
    keyInputMode: 'file' | 'paste';
    vaultInputMode: 'existing' | 'paste' | 'import';
    activeEditingConnectionId: string | null;
    validationOk: boolean;
    showToast: (type: ToastType, message: string) => void;
}

export interface VaultKeyConnectionResult {
    connection: Connection;
    /** Newly created vault item — delete if host persist fails. */
    createdItemId: string;
}

const PRIVATE_KEY_BEGIN_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const PRIVATE_KEY_END_PATTERN = /-----END [A-Z ]*PRIVATE KEY-----/;
const isValidPrivateKeyFormat = (keyContent: string): boolean =>
    PRIVATE_KEY_BEGIN_PATTERN.test(keyContent) && PRIVATE_KEY_END_PATTERN.test(keyContent);

export function useAutoVault({
    isOpen,
    formData,
    authMethod,
    keyInputMode,
    vaultInputMode,
    activeEditingConnectionId,
    validationOk,
    showToast,
}: UseAutoVaultOptions) {
    const { status: vaultStatus, items: vaultItems, refreshItems } = useVaultStore();

    const [pastedKeyText, setPastedKeyText] = useState('');
    const [pastedPassphrase, setPastedPassphrase] = useState('');
    const [pastedKeyError, setPastedKeyError] = useState('');
    const [keyVaultLabel, setKeyVaultLabel] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setPastedKeyText('');
        setPastedPassphrase('');
        setPastedKeyError('');
        setKeyVaultLabel('');
    }, [isOpen]);

    const defaultKeyVaultLabel = buildDefaultKeyVaultLabel({
        name: formData.name,
        host: formData.host,
        username: formData.username,
    });
    const effectiveKeyVaultLabel = keyVaultLabel.trim() || defaultKeyVaultLabel;
    const keyVaultLabelConflict = vaultStatus?.status === 'unlocked'
        && authMethod === 'vault'
        && (vaultInputMode === 'paste' || vaultInputMode === 'import')
        && !!pastedKeyText.trim()
        && vaultItems.some(i => i.label === effectiveKeyVaultLabel);

    const replacedAuthItemId = activeEditingConnectionId
        ? useAppStore.getState().connections.find(c => c.id === activeEditingConnectionId)?.authRef?.itemId
        : undefined;

    const resolveVaultId = async (): Promise<string> => {
        // Always re-read store + IPC so we don't use a stale render closure after unlock.
        const fromStore = useVaultStore.getState().status;
        if (fromStore?.status === 'unlocked' && fromStore.vaultId) {
            return fromStore.vaultId;
        }
        const status = await vaultIpc.status();
        if (status.status === 'unlocked' && status.vaultId) {
            useVaultStore.setState({ status });
            return status.vaultId;
        }
        throw new Error(
            status.status === 'unlocked'
                ? 'Vault is unlocked but vault id is missing. Try locking and unlocking the vault, then save again.'
                : 'Vault must be unlocked to store credentials.',
        );
    };

    const finalizeVaultReplacement = async () => {
        setPastedKeyText('');
        setPastedPassphrase('');
        if (!replacedAuthItemId) return;

        const { connections } = useAppStore.getState();
        const sharedReferenceCount = connections.filter(connection =>
            connection.id !== activeEditingConnectionId
            && connection.authRef?.itemId === replacedAuthItemId,
        ).length;
        if (sharedReferenceCount > 0) {
            showToast(
                'info',
                'Previous vault credential was left in place because other hosts still use it.',
            );
            return;
        }

        try {
            await vaultIpc.itemDelete(replacedAuthItemId);
        } catch {
            showToast('error', 'Old vault credential could not be deleted — remove it manually in Vault tab.');
        }
    };

    const validatePastedKeyText = (): string | null => {
        const keyText = pastedKeyText;
        if (!keyText.trim()) {
            const message = 'Please paste a private key.';
            setPastedKeyError(message);
            showToast('error', message);
            return null;
        }
        if (!isValidPrivateKeyFormat(keyText)) {
            const message = 'Pasted key must include valid BEGIN/END private key markers.';
            setPastedKeyError(message);
            showToast('error', message);
            return null;
        }
        setPastedKeyError('');
        return keyText;
    };

    const deleteCreatedVaultItemBestEffort = async (itemId: string, _originalError?: unknown) => {
        try {
            await vaultIpc.itemDelete(itemId);
        } catch (cleanupError: unknown) {
            console.warn('[Vault] Failed to delete orphaned vault item after save failure:', cleanupError);
            showToast(
                'error',
                'Host save failed and the new vault credential could not be removed automatically — delete it in the Vault tab.',
            );
        }
    };

    const savePastedKeyToVault = async (): Promise<{ formPatch: Partial<Connection>; createdItemId: string } | null> => {
        const keyText = validatePastedKeyText();
        if (!keyText) return null;

        const liveStatus = useVaultStore.getState().status;
        if (liveStatus?.status !== 'unlocked') {
            showToast('error', 'Vault must be unlocked to store a pasted key.');
            return null;
        }
        const vaultId = await resolveVaultId();
        const item = await vaultIpc.itemCreate(effectiveKeyVaultLabel, 'ssh-private-key', {
            privateKey: keyText,
            ...(pastedPassphrase.length > 0 ? { passphrase: pastedPassphrase } : {}),
        });
        return {
            createdItemId: item.id,
            formPatch: {
                ...formData,
                password: undefined,
                privateKeyPath: undefined,
                authRef: {
                    vaultId,
                    credentialId: item.logicalId,
                    itemId: item.id,
                    itemKind: 'ssh-private-key',
                    purpose: 'ssh-auth',
                },
            },
        };
    };

    const buildVaultKeyConnection = async (): Promise<VaultKeyConnectionResult | null> => {
        if (!validationOk) return null;
        let createdItemId: string | null = null;
        try {
            const saved = await savePastedKeyToVault();
            if (!saved) return null;
            createdItemId = saved.createdItemId;
            const { connections } = useAppStore.getState();
            const connection = buildConnectionSavePayload({
                formData: saved.formPatch,
                authMethod: 'vault',
                editingConnectionId: activeEditingConnectionId,
                connections,
            });
            return { connection, createdItemId: saved.createdItemId };
        } catch (e: unknown) {
            if (createdItemId) {
                await deleteCreatedVaultItemBestEffort(createdItemId, e);
            }
            showToast('error', `Failed to store key: ${e instanceof Error ? e.message : String(e)}`);
            return null;
        }
    };

    /** Non-vault paste: write PEM to managed keys dir and return path. */
    const writePastedKeyAsManagedFile = async (): Promise<string | null> => {
        const keyText = validatePastedKeyText();
        if (!keyText) return null;
        try {
            const suggestedName = (formData.name || formData.host || 'pasted_key').trim();
            return await writeManagedKeyIpc({
                content: keyText,
                suggestedName,
            });
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            setPastedKeyError(message);
            showToast('error', `Failed to save key file: ${message}`);
            return null;
        }
    };

    const loadKeyFileForVaultImport = async (path: string): Promise<boolean> => {
        try {
            const content = await readLocalKeyFileIpc(path);
            setPastedKeyText(content);
            setPastedKeyError('');
            if (!keyVaultLabel.trim()) {
                const base = path.split(/[/\\]/).pop() || 'imported-key';
                // Strip a single trailing extension (id_ed25519 stays as-is; key.pem → key).
                const withoutExt = base.replace(/\.[^.]+$/, '');
                setKeyVaultLabel((withoutExt.trim() || base).trim());
            }
            return true;
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            setPastedKeyError(message);
            showToast('error', `Failed to read key file: ${message}`);
            return false;
        }
    };

    return {
        vaultStatus, vaultItems, refreshItems,
        pastedKeyText, setPastedKeyText,
        pastedPassphrase, setPastedPassphrase,
        pastedKeyError, setPastedKeyError,
        keyVaultLabel, setKeyVaultLabel,
        defaultKeyVaultLabel, keyVaultLabelConflict,
        buildVaultKeyConnection,
        deleteCreatedVaultItemBestEffort,
        writePastedKeyAsManagedFile,
        loadKeyFileForVaultImport,
        finalizeVaultReplacement,
        keyInputMode,
        vaultInputMode,
    };
}
