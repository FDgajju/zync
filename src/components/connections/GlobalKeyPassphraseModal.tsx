import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
    finishKeyPassphrasePrompt,
    type KeyPassphraseRetention,
    useKeyPassphrasePromptStore,
} from '../../features/connections/application/keyPassphrasePrompt';
import {
    inspectPrivateKeyIpc,
    rememberKeyPassphraseIpc,
} from '../../features/connections/infrastructure/connectionIpc';
import { useVaultStore } from '../../vault/useVaultStore';
import { KeyPassphraseInput } from './KeyPassphraseInput';
import { KeyPassphraseRetentionOptions } from './KeyPassphraseRetentionOptions';

type PromptProgress = 'idle' | 'verifying' | 'saving-device';

export function GlobalKeyPassphraseModal() {
    const prompt = useKeyPassphrasePromptStore(state => state.prompt);
    const [passphrase, setPassphrase] = useState('');
    const [retention, setRetention] = useState<KeyPassphraseRetention>('once');
    const [error, setError] = useState('');
    const [progress, setProgress] = useState<PromptProgress>('idle');
    const vaultStatus = useVaultStore(state => state.status);
    const refreshVault = useVaultStore(state => state.refresh);
    const vaultAvailable = vaultStatus?.status === 'locked' || vaultStatus?.status === 'unlocked';
    const canDismiss = progress === 'idle';

    useEffect(() => {
        setPassphrase('');
        setRetention('once');
        setError('');
        setProgress('idle');
    }, [prompt?.promptId]);

    useEffect(() => {
        if (prompt && vaultStatus === null) void refreshVault().catch(() => {});
    }, [prompt, refreshVault, vaultStatus]);

    useEffect(() => {
        if (!vaultAvailable && retention === 'vault') {
            setRetention('once');
        }
    }, [retention, vaultAvailable]);

    const submit = async () => {
        if (!prompt || !passphrase || progress !== 'idle') return;
        const promptId = prompt.promptId;
        const keyPath = prompt.keyPath;
        const submittedPassphrase = passphrase;
        const submittedRetention = retention === 'vault' && !vaultAvailable ? 'once' : retention;
        const isStillCurrentPrompt = () =>
            useKeyPassphrasePromptStore.getState().prompt?.promptId === promptId;
        setProgress('verifying');
        setError('');
        try {
            const inspection = await inspectPrivateKeyIpc({
                path: keyPath,
                passphrase: submittedPassphrase,
            });
            if (!isStillCurrentPrompt()) return;
            if (inspection.status !== 'valid' || !inspection.encrypted) {
                setError('The passphrase could not unlock this private key.');
                return;
            }
            if (submittedRetention === 'device') {
                setProgress('saving-device');
                await rememberKeyPassphraseIpc(keyPath, submittedPassphrase);
            }
            if (!isStillCurrentPrompt()) return;
            finishKeyPassphrasePrompt(
                { action: 'submit', passphrase: submittedPassphrase, retention: submittedRetention },
                promptId,
            );
        } catch (submitError: unknown) {
            if (!isStillCurrentPrompt()) return;
            setError(submitError instanceof Error ? submitError.message : String(submitError));
        } finally {
            if (isStillCurrentPrompt()) setProgress('idle');
        }
    };

    const closePrompt = () => {
        if (!prompt || !canDismiss) return;
        finishKeyPassphrasePrompt(null, prompt.promptId);
    };

    const actionLabel = progress === 'verifying'
        ? 'Verifying...'
        : progress === 'saving-device'
            ? 'Saving securely...'
            : retention === 'vault'
                ? 'Save & Connect'
                : 'Unlock & Connect';

    return (
        <Modal
            isOpen={Boolean(prompt)}
            onClose={closePrompt}
            title="Unlock private key"
            subtitle={prompt ? `Enter the passphrase for ${prompt.connectionName}.` : undefined}
            width="max-w-sm"
            explicitDismissOnly={!canDismiss}
            zIndexClassName="z-[15000]"
        >
            <form
                className="space-y-4"
                onSubmit={event => {
                    event.preventDefault();
                    void submit();
                }}
            >
                <KeyPassphraseInput
                    autoFocus
                    value={passphrase}
                    error={error}
                    onChange={setPassphrase}
                />

                <KeyPassphraseRetentionOptions
                    value={retention}
                    onChange={setRetention}
                    vaultAvailable={vaultAvailable}
                />

                <div className="flex justify-end gap-2 border-t border-app-border pt-4">
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={!canDismiss}
                            onClick={closePrompt}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            disabled={!passphrase}
                            isLoading={progress !== 'idle'}
                            className="min-w-36 shrink-0 whitespace-nowrap"
                        >
                            {actionLabel}
                        </Button>
                </div>
            </form>
        </Modal>
    );
}
