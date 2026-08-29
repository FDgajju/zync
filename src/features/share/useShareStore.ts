import { create } from 'zustand';
import {
    SHARE_QUOTA_FULL_MESSAGE,
    normalizeQuotaMax,
    ownedShareCount,
    quotaIsFull,
    type AgentConnState,
    type AgentSnapshot,
    type ShareAuthStatus,
    type ShareProvider,
    type ShareRecord,
    type ShareStatusPayload,
} from './types';
import { listenShareAgents, listenShareAuth, parseShareError, shareIpc } from './ipc';

export interface ShareStore {
    hydrated: boolean;
    loading: boolean;
    busy: boolean;
    signingIn: ShareProvider | null;
    error: string | null;
    auth: ShareAuthStatus;
    shares: ShareRecord[];
    agents: Record<string, AgentSnapshot>;
    quotaUsed: number;
    quotaMax: number;
    hydrate: () => Promise<void>;
    login: (provider: ShareProvider) => Promise<void>;
    cancelLogin: () => Promise<void>;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
    create: (port: number, name?: string, password?: string) => Promise<ShareRecord>;
    stop: (id: string) => Promise<void>;
    start: (id: string) => Promise<void>;
    remove: (id: string) => Promise<void>;
    startSharing: () => Promise<void>;
}

const signedOutAuth: ShareAuthStatus = {
    signed_in: false,
    email: null,
    user_id: null,
    avatar_url: null,
    quota_max: 3,
};

function applyPayload(
    set: (partial: Partial<ShareStore>) => void,
    payload: ShareStatusPayload,
) {
    const raw = payload as ShareStatusPayload & {
        quotaUsed?: number;
        quotaMax?: number;
        agents?: AgentSnapshot[];
    };
    const shares = payload.shares || [];
    const agentList = raw.agents || [];
    const agents: Record<string, AgentSnapshot> = {};
    for (const agent of agentList) {
        agents[agent.share_id] = agent;
    }
    const quotaMax = normalizeQuotaMax(
        raw.quota_max ?? raw.quotaMax ?? payload.auth?.quota_max,
    );
    const quotaUsed = ownedShareCount(shares);
    set({
        hydrated: true,
        loading: false,
        auth: payload.auth,
        shares,
        agents,
        quotaUsed,
        quotaMax,
        error: null,
    });
}

let listenersStarted = false;

export const useShareStore = create<ShareStore>((set, get) => ({
    hydrated: false,
    loading: false,
    busy: false,
    signingIn: null,
    error: null,
    auth: signedOutAuth,
    shares: [],
    agents: {},
    quotaUsed: 0,
    quotaMax: 3,

    hydrate: async () => {
        if (!listenersStarted) {
            listenersStarted = true;
            void listenShareAuth((auth) => {
                set({ auth });
            });
            void listenShareAgents((incoming) => {
                set((state) => {
                    const agents = { ...state.agents };
                    for (const agent of incoming) {
                        agents[agent.share_id] = agent;
                    }
                    return { agents };
                });
            });
        }
        if (get().loading) return;
        set({ loading: true, error: null });
        try {
            // Instant local session hint so the panel does not flash the signed-out screen.
            try {
                const peek = await shareIpc.authPeek();
                if (peek?.signed_in) {
                    set({ auth: peek });
                }
            } catch {
                // Peek is best-effort; full status still runs.
            }
            const payload = await shareIpc.status();
            applyPayload(set, payload);
        } catch (error) {
            set({
                loading: false,
                hydrated: true,
                error: parseShareError(error).message,
            });
        }
    },

    login: async (provider) => {
        set({ busy: true, signingIn: provider, error: null });
        try {
            const payload = await shareIpc.login(provider);
            applyPayload(set, payload);
            set({ busy: false, signingIn: null });
        } catch (error) {
            const parsed = parseShareError(error);
            const canceled = parsed.code === 'oauth_canceled';
            set({
                busy: false,
                signingIn: null,
                error: canceled ? null : parsed.message,
            });
            throw error;
        }
    },

    cancelLogin: async () => {
        try {
            await shareIpc.cancelLogin();
        } catch {
            // Local cancel should always unlock the UI.
        } finally {
            set({ busy: false, signingIn: null, error: null });
        }
    },

    logout: async () => {
        set({ busy: true, error: null });
        try {
            const payload = await shareIpc.logout();
            applyPayload(set, payload);
            set({ busy: false });
        } catch (error) {
            set({ busy: false, error: parseShareError(error).message });
            throw error;
        }
    },

    refresh: async () => {
        try {
            const payload = await shareIpc.status();
            applyPayload(set, payload);
        } catch (error) {
            set({ error: parseShareError(error).message });
        }
    },

    create: async (port, name, password) => {
        set({ busy: true, error: null });
        try {
            const share = await shareIpc.create(port, name, password);
            await get().refresh();
            set({ busy: false });
            return share;
        } catch (error) {
            const parsed = parseShareError(error);
            set({ busy: false, error: parsed.message });
            throw error;
        }
    },

    stop: async (id) => {
        set({ busy: true, error: null });
        try {
            await shareIpc.stop(id);
            await get().refresh();
            set({ busy: false });
        } catch (error) {
            set({ busy: false, error: parseShareError(error).message });
            throw error;
        }
    },

    start: async (id) => {
        set({ busy: true, error: null });
        try {
            await shareIpc.start(id);
            await get().refresh();
            set({ busy: false });
        } catch (error) {
            set({ busy: false, error: parseShareError(error).message });
            throw error;
        }
    },

    remove: async (id) => {
        set({ busy: true, error: null });
        try {
            await shareIpc.delete(id);
            set((state) => {
                const agents = { ...state.agents };
                delete agents[id];
                return { agents };
            });
            await get().refresh();
            set({ busy: false });
        } catch (error) {
            set({ busy: false, error: parseShareError(error).message });
            throw error;
        }
    },

    startSharing: async () => {
        set({ busy: true, error: null });
        try {
            await shareIpc.agentStart();
            await get().refresh();
            set({ busy: false });
        } catch (error) {
            set({ busy: false, error: parseShareError(error).message });
            throw error;
        }
    },
}));

export function quotaFull(
    store: Pick<ShareStore, 'quotaUsed' | 'quotaMax' | 'shares'>,
): boolean {
    const used = store.shares ? ownedShareCount(store.shares) : store.quotaUsed;
    return quotaIsFull(used, store.quotaMax);
}

export function agentLine(
    agents: Record<string, AgentSnapshot>,
    shares: ShareRecord[],
): { state: AgentConnState | 'idle'; label: string } {
    const live = Object.values(agents);
    if (live.some((a) => a.status === 'online')) {
        return { state: 'online', label: 'Sharing from this device' };
    }
    if (live.some((a) => a.status === 'reconnecting' || a.status === 'connecting')) {
        return { state: 'reconnecting', label: 'Reconnecting…' };
    }
    if (live.some((a) => a.status === 'auth_failed')) {
        return { state: 'auth_failed', label: 'Sign in again or retry' };
    }
    const shareable = shares.some((s) => s.status === 'reserved' || s.status === 'active');
    if (shareable) {
        return { state: 'offline', label: 'Not sharing - Start sharing' };
    }
    return { state: 'idle', label: '' };
}

export { SHARE_QUOTA_FULL_MESSAGE };
