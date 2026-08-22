export const isVaultLockedError = (message: string): boolean => {
    const normalized = message.toLowerCase();
    return normalized.includes('vault is locked')
        || normalized.includes('[vault_locked]')
        || normalized.includes('needs an unlocked vault')
        || normalized.includes('unlock the vault')
        || normalized.includes('unlock vault');
};

export const isVaultUninitializedError = (message: string): boolean => {
    const normalized = message.toLowerCase();
    return normalized.includes('[vault_uninitialized]')
        || normalized.includes('vault is not initialized')
        || normalized.includes('initialize the local vault');
};

/** Locked or not created yet — open the existing Create / Unlock vault modal. */
export const isVaultAccessError = (message: string): boolean =>
    isVaultLockedError(message) || isVaultUninitializedError(message);

export const isMissingVaultCredentialError = (message: string): boolean => {
    const normalized = message.toLowerCase();
    return normalized.includes('[vault_credential_missing]')
        || normalized.includes('relink by credentialid')
        || (
            normalized.includes('record not found')
            && (normalized.includes('credential') || normalized.includes('vault'))
        );
};

export const vaultStatusNeedsUnlock = (
    status: { status: string } | null | undefined,
): boolean => status?.status === 'locked';