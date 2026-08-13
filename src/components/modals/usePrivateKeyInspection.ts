import { useEffect, useRef, useState } from 'react';
import {
    inspectPrivateKeyIpc,
    privateKeyReadinessIpc,
    type PrivateKeyInspectionRequest,
    type PrivateKeyInspectionStatus,
} from '../../features/connections/infrastructure/connectionIpc';

export type PrivateKeyInspectionState = {
    status: 'idle' | 'checking' | PrivateKeyInspectionStatus;
    encrypted: boolean;
    remembered?: boolean;
    message?: string;
};

const IDLE_STATE: PrivateKeyInspectionState = { status: 'idle', encrypted: false };

export function usePrivateKeyInspection(
    source: Omit<PrivateKeyInspectionRequest, 'passphrase'> | null,
    passphrase: string,
    useRemembered = false,
    refreshToken = 0,
): PrivateKeyInspectionState {
    const [state, setState] = useState<PrivateKeyInspectionState>(IDLE_STATE);
    const requestIdRef = useRef(0);
    const path = source && 'path' in source ? source.path : undefined;
    const content = source && 'content' in source ? source.content : undefined;

    useEffect(() => {
        const requestId = ++requestIdRef.current;
        if (!path && !content) {
            setState(IDLE_STATE);
            return;
        }

        setState(previous => ({ status: 'checking', encrypted: previous.encrypted }));
        const timeoutId = window.setTimeout(() => {
            const inspectionPromise = path && !passphrase && useRemembered
                ? privateKeyReadinessIpc(path)
                : inspectPrivateKeyIpc({
                    ...(path ? { path } : { content: content as string }),
                    passphrase: passphrase || null,
                } as PrivateKeyInspectionRequest);
            void inspectionPromise
                .then(result => {
                    if (requestId !== requestIdRef.current) return;
                    setState(result);
                })
                .catch((error: unknown) => {
                    if (requestId !== requestIdRef.current) return;
                    const message = error instanceof Error ? error.message : String(error);
                    setState({ status: 'invalidKey', encrypted: false, message });
                });
        }, 300);

        return () => window.clearTimeout(timeoutId);
    }, [content, passphrase, path, refreshToken, useRemembered]);

    return state;
}
