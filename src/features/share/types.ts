export type ShareProvider = 'github' | 'google';

export type ShareStatus = 'reserved' | 'active' | 'stopped' | 'disabled' | 'deleted';

export type AgentConnState = 'offline' | 'connecting' | 'online' | 'reconnecting' | 'auth_failed';

export interface ShareAuthStatus {
    signed_in: boolean;
    email?: string | null;
    user_id?: string | null;
    avatar_url?: string | null;
    quota_max: number;
}

export interface ShareRecord {
    id: string;
    slug: string;
    status: ShareStatus | string;
    target_kind: string;
    target_host: string;
    target_port: number;
    public_url?: string | null;
    public_host?: string | null;
    has_password?: boolean;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface AgentSnapshot {
    share_id: string;
    slug: string;
    status: AgentConnState;
    target_port: number;
    error?: string | null;
}

export interface ShareStatusPayload {
    auth: ShareAuthStatus;
    shares: ShareRecord[];
    agents: AgentSnapshot[];
    quota_used: number;
    quota_max: number;
}

export const SHARE_BETA_QUOTA_MAX = 3;

export const SHARE_QUOTA_FULL_MESSAGE =
    '3 of 3 Public URLs in use. Delete one to add another.';

const OWNED_STATUSES = new Set(['reserved', 'active', 'stopped']);

/** Owned URLs count toward the beta cap. Disabled/deleted do not. */
export function ownedShareCount(shares: ShareRecord[] | undefined | null): number {
    if (!shares?.length) return 0;
    return shares.filter((share) => OWNED_STATUSES.has(String(share.status))).length;
}

/**
 * Beta default is 3. Legacy DB default of 1 is remapped to 3.
 * 0 is preserved so a revoked/disabled entitlement keeps sharing off.
 */
export function normalizeQuotaMax(max: unknown): number {
    const n = typeof max === 'number' ? max : Number(max);
    if (!Number.isFinite(n) || n < 0) return SHARE_BETA_QUOTA_MAX;
    if (n === 1) return SHARE_BETA_QUOTA_MAX;
    return n;
}

export function quotaIsFull(used: number, max: number): boolean {
    const cap = normalizeQuotaMax(max);
    // Cap 0 = sharing disabled / revoked.
    if (cap === 0) return true;
    const owned = Number.isFinite(used) ? used : 0;
    return owned >= cap;
}

export function quotaFullMessage(used: number, max: number): string {
    const cap = normalizeQuotaMax(max);
    if (cap === 0) {
        return 'Public URLs are disabled for this account.';
    }
    if (cap === SHARE_BETA_QUOTA_MAX) return SHARE_QUOTA_FULL_MESSAGE;
    return `${used} of ${cap} Public URLs in use. Delete one to add another.`;
}

export const SHARE_AUTH_EVENT = 'share://auth';
export const SHARE_AGENT_STATUS_EVENT = 'share://agent-status';

export function shareDisplayUrl(share: ShareRecord): string {
    return share.public_url || (share.public_host ? `https://${share.public_host}` : '');
}

export type ShareChip = 'online' | 'offline' | 'stopped';

export function shareChip(share: ShareRecord, agent?: AgentSnapshot | null): ShareChip {
    if (share.status === 'stopped') return 'stopped';
    if (agent?.status === 'online') return 'online';
    return 'offline';
}
