import * as Dialog from '@radix-ui/react-dialog';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
    respondAgentSignatureIpc,
    type AgentSignatureDecision,
    type AgentSignatureRequestPayload,
} from '../../features/connections/infrastructure/connectionIpc';

export function GlobalAgentSignatureDialog() {
    const [request, setRequest] = useState<AgentSignatureRequestPayload | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => window.ipcRenderer.on(
        'ssh:agent-signature-request',
        (_event, payload: AgentSignatureRequestPayload) => {
            setBusy(false);
            setRequest(payload);
        },
    ), []);

    useEffect(() => window.ipcRenderer.on(
        'ssh:agent-signature-expired',
        (_event, requestId: string) => {
            setRequest(current => current?.requestId === requestId ? null : current);
            setBusy(false);
        },
    ), []);

    const respond = async (decision: AgentSignatureDecision) => {
        if (!request || busy) return;
        const requestId = request.requestId;
        setBusy(true);
        try {
            await respondAgentSignatureIpc(requestId, decision);
        } finally {
            setRequest(current => current?.requestId === requestId ? null : current);
            setBusy(false);
        }
    };

    return (
        <Dialog.Root
            open={Boolean(request)}
            onOpenChange={open => {
                if (!open && !busy) void respond('deny');
            }}
        >
            <Dialog.Portal container={document.getElementById('modal-portal-root') ?? undefined}>
                <Dialog.Overlay className="absolute inset-0 z-[21000] bg-black/65 backdrop-blur-sm animate-in fade-in pointer-events-auto" />
                <Dialog.Content
                    className="absolute z-[21000] left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-app-border bg-app-bg shadow-2xl pointer-events-auto animate-in fade-in zoom-in-95 duration-200"
                >
                    <div className="flex gap-4 p-6">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
                            <ShieldAlert className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <Dialog.Title className="text-lg font-semibold text-app-text">
                                Allow SSH key signature?
                            </Dialog.Title>
                            <Dialog.Description className="mt-1.5 text-sm leading-relaxed text-app-muted">
                                <span className="font-medium text-app-text">{request?.host}</span> is asking your forwarded key to authenticate as <span className="font-medium text-app-text">{request?.requestedUsername}</span>. Zync cannot verify the final destination beyond this SSH connection.
                            </Dialog.Description>
                            <div className="mt-4 flex items-start gap-2 rounded-lg border border-app-border bg-app-surface/40 px-3 py-2.5">
                                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-app-muted" />
                                <div className="min-w-0">
                                    <div className="text-xs font-medium text-app-text">Selected key</div>
                                    <div className="mt-0.5 break-all font-mono text-[11px] leading-relaxed text-app-muted">
                                        {request?.keyFingerprint}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2 border-t border-app-border bg-app-bg-secondary p-4">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void respond('deny')}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-app-text transition-colors hover:bg-app-bg-hover focus:outline-none focus:ring-2 focus:ring-app-accent disabled:opacity-50"
                        >
                            Deny
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void respond('allowSession')}
                            className="rounded-lg border border-app-border px-4 py-2 text-sm font-medium text-app-text transition-colors hover:bg-app-bg-hover focus:outline-none focus:ring-2 focus:ring-app-accent disabled:opacity-50"
                        >
                            Allow for connection
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void respond('allowOnce')}
                            className="rounded-lg bg-app-accent px-4 py-2 text-sm font-medium text-white transition-[filter] hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-app-accent focus:ring-offset-2 focus:ring-offset-app-bg disabled:opacity-50"
                        >
                            Allow once
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
