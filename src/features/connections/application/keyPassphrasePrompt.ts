import { create } from 'zustand';

export type KeyPassphraseRetention = 'once' | 'device' | 'vault';

export interface KeyPassphrasePromptRequest {
    connectionId: string;
    connectionName: string;
    keyPath: string;
}

interface ActiveKeyPassphrasePrompt extends KeyPassphrasePromptRequest {
    promptId: number;
}

export type KeyPassphrasePromptResult =
    | { action: 'submit'; passphrase: string; retention: KeyPassphraseRetention }
    | null;

interface PendingPrompt {
    request: ActiveKeyPassphrasePrompt;
    resolvers: Array<(result: KeyPassphrasePromptResult) => void>;
}

interface KeyPassphrasePromptState {
    prompt: ActiveKeyPassphrasePrompt | null;
}

export const useKeyPassphrasePromptStore = create<KeyPassphrasePromptState>(() => ({
    prompt: null,
}));

let activePrompt: PendingPrompt | null = null;
const queuedPrompts: PendingPrompt[] = [];
let nextPromptId = 1;

const promptKey = (keyPath: string): string => keyPath.trim();

function showNextPrompt() {
    if (activePrompt || queuedPrompts.length === 0) return;
    activePrompt = queuedPrompts.shift() || null;
    useKeyPassphrasePromptStore.setState({ prompt: activePrompt?.request || null });
}

export function requestKeyPassphrase(
    request: KeyPassphrasePromptRequest,
): Promise<KeyPassphrasePromptResult> {
    return new Promise(resolve => {
        const key = promptKey(request.keyPath);
        if (activePrompt && promptKey(activePrompt.request.keyPath) === key) {
            activePrompt.resolvers.push(resolve);
            return;
        }
        const queued = queuedPrompts.find(item => promptKey(item.request.keyPath) === key);
        if (queued) {
            queued.resolvers.push(resolve);
            return;
        }
        queuedPrompts.push({
            request: { ...request, promptId: nextPromptId++ },
            resolvers: [resolve],
        });
        showNextPrompt();
    });
}

export function finishKeyPassphrasePrompt(
    result: KeyPassphrasePromptResult,
    expectedPromptId?: number,
) {
    if (expectedPromptId !== undefined && activePrompt?.request.promptId !== expectedPromptId) {
        return;
    }
    const completed = activePrompt;
    activePrompt = null;
    useKeyPassphrasePromptStore.setState({ prompt: null });
    completed?.resolvers.forEach(resolve => resolve(result));
    queueMicrotask(showNextPrompt);
}
