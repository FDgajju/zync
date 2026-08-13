import type { Connection } from './types.js';

/** Default for new installs: label-first lists (Termius-style), not endpoint-first. */
export const DEFAULT_SHOW_HOST_ADDRESSES_IN_LISTS = false;

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/** Strip URI-style brackets used for IPv6 hosts (`[fe80::1]` → `fe80::1`). */
function unwrapBracketedHost(host: string): string {
    const trimmed = host.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed.length > 2) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

export function isLikelyIpAddress(host: string): boolean {
    const trimmed = unwrapBracketedHost(host);
    if (!trimmed) return false;
    if (IPV4_RE.test(trimmed)) return true;
    // Basic IPv6 heuristic (contains multiple colons).
    return trimmed.includes(':') && /^[0-9a-f:.]+$/i.test(trimmed);
}

function formatUserHostPair(username: string, host: string): string {
    if (username && host) return `${username}@${host}`;
    return username || host;
}

export function formatConnectionEndpoint(conn: Pick<Connection, 'username' | 'host' | 'port'>): string {
    const host = conn.host?.trim() ?? '';
    const username = conn.username?.trim() ?? '';
    const portSuffix = conn.port !== 22 ? `:${conn.port}` : '';
    return `${formatUserHostPair(username, host)}${portSuffix}`;
}

/** Endpoint string for browse lists (no port suffix). */
export function formatConnectionListEndpoint(conn: Pick<Connection, 'username' | 'host'>): string {
    const host = conn.host?.trim() ?? '';
    const username = conn.username?.trim() ?? '';
    return formatUserHostPair(username, host);
}

/**
 * Primary line for browse surfaces (sidebar, welcome, palette, tabs).
 * Prefers custom name; endpoint is optional via settings.
 */
export function getConnectionPrimaryLabel(
    conn: Connection,
    showHostAddressesInLists: boolean = DEFAULT_SHOW_HOST_ADDRESSES_IN_LISTS,
): string {
    const name = conn.name?.trim();
    if (name) return name;

    const host = conn.host?.trim() ?? '';
    const username = conn.username?.trim() ?? '';

    if (showHostAddressesInLists) {
        if (host) return host;
        if (username) return username;
        return 'Untitled connection';
    }

    // Unnamed: keep hostnames that are not literal IPs (often already aliases).
    if (host && !isLikelyIpAddress(host)) {
        return host;
    }

    if (username) return username;

    return 'SSH connection';
}

/**
 * Secondary line for browse surfaces.
 * Privacy mode: compact `SSH, username`. Full mode: `user@host` (no port in lists).
 */
export function getConnectionSecondaryLabel(
    conn: Connection,
    showHostAddressesInLists: boolean = DEFAULT_SHOW_HOST_ADDRESSES_IN_LISTS,
): string {
    if (showHostAddressesInLists) {
        return formatConnectionListEndpoint(conn);
    }

    const username = conn.username?.trim();
    if (!username) return 'SSH';

    const primary = getConnectionPrimaryLabel(conn, false);
    if (primary === username) return 'SSH';

    return `SSH, ${username}`;
}

/** Search text for command palette / quick connect (always includes endpoint fields). */
export function getConnectionSearchText(conn: Connection): string {
    return [
        conn.name,
        conn.username,
        conn.host,
        conn.folder,
        ...(conn.tags ?? []),
        conn.port !== 22 ? String(conn.port) : '',
    ]
        .filter((value) => typeof value === 'string' && value.trim().length > 0)
        .join(' ');
}

export function getConnectionBrowseAriaLabel(
    conn: Connection,
    showHostAddressesInLists: boolean = DEFAULT_SHOW_HOST_ADDRESSES_IN_LISTS,
): string {
    const primary = getConnectionPrimaryLabel(conn, showHostAddressesInLists);
    const secondary = getConnectionSecondaryLabel(conn, showHostAddressesInLists);
    return `Connection ${primary}, ${secondary}`;
}

export interface ConnectionDisplayLabels {
    primary: string;
    secondary: string;
    searchText: string;
    ariaLabel: string;
    endpoint: string;
}

export function getConnectionDisplayLabels(
    conn: Connection,
    showHostAddressesInLists: boolean = DEFAULT_SHOW_HOST_ADDRESSES_IN_LISTS,
): ConnectionDisplayLabels {
    return {
        primary: getConnectionPrimaryLabel(conn, showHostAddressesInLists),
        secondary: getConnectionSecondaryLabel(conn, showHostAddressesInLists),
        searchText: getConnectionSearchText(conn),
        ariaLabel: getConnectionBrowseAriaLabel(conn, showHostAddressesInLists),
        endpoint: formatConnectionEndpoint(conn),
    };
}

const IPV4_IN_TEXT_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
// Bracketed IPv6 host forms: require ≥2 colons so tags like `[1]` / `[db]` are kept.
const IPV6_BRACKETED_IN_TEXT_RE = /\[[0-9a-fA-F.]*:[0-9a-fA-F.]*:[0-9a-fA-F.:]*\]/g;
// Bare IPv6 with ≥2 colons (avoids single-colon tokens like `time:out`).
const IPV6_BARE_IN_TEXT_RE = /(?<![:\w.])(?:[0-9a-fA-F]{0,4}:){2,}[0-9a-fA-F]{0,4}(?![:\w.])/g;
// Bare `user@host` / `user@[ipv6]` / optional `:port`.
const BARE_USER_HOST_RE =
    /([^\s@()[\]]+)@(?:\[[^\]]+\]|[^\s@()[\],;]+)(?::\d+)?/g;

/**
 * Privacy-safe display for free-text labels that may embed endpoints
 * (e.g. vault items like `ci-staging key (jenkins@140.238.226.234)`).
 * Does not rewrite stored data — display only.
 *
 * Contract when `showHostAddressesInLists` is false:
 * - Strip embedded `user@host` endpoints (parenthetical or bare), any host form.
 * - Redact leftover literal IPv4 / IPv6.
 * - Standalone non-IP hostnames used as display names (not `user@host`) stay visible —
 *   same intent as {@link getConnectionPrimaryLabel}.
 */
export function formatPrivacyAwareLabel(
    label: string,
    showHostAddressesInLists: boolean = DEFAULT_SHOW_HOST_ADDRESSES_IN_LISTS,
): string {
    if (showHostAddressesInLists || !label) return label;

    // `(user@host[:port])` → `(user)` (common auto-vault naming; includes `[ipv6]`)
    let result = label.replace(/\(([^@()\s]+)@[^)\s]+\)/g, '($1)');

    // Bare `user@host[:port]` / `user@[ipv6]` → `user`
    result = result.replace(BARE_USER_HOST_RE, '$1');

    // Any remaining literal addresses
    result = result.replace(IPV6_BRACKETED_IN_TEXT_RE, '•••');
    result = result.replace(IPV6_BARE_IN_TEXT_RE, '•••');
    result = result.replace(IPV4_IN_TEXT_RE, '•••');

    return result.replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Default vault credential label for a secured key.
 *
 * Never embeds `user@host` endpoints (so privacy redaction is not required for
 * new labels). Prefers custom name; falls back to a non-IP hostname as a
 * display name (aligned with {@link getConnectionPrimaryLabel}); never uses a
 * raw IP as the label stem.
 */
export function buildDefaultKeyVaultLabel(
    formData: Partial<Pick<Connection, 'name' | 'host' | 'username'>>,
): string {
    const name = formData.name?.trim();
    const username = formData.username?.trim() || 'user';
    const host = formData.host?.trim() || '';

    if (name) {
        return `${name} key (${username})`;
    }

    if (host && !isLikelyIpAddress(host)) {
        return `${host} key (${username})`;
    }

    return `${username} key`;
}

export function buildUniqueVaultLabel(baseLabel: string, existingLabels: Iterable<string>): string {
    const labels = new Set(existingLabels);
    if (!labels.has(baseLabel)) return baseLabel;
    let suffix = 2;
    while (labels.has(`${baseLabel} ${suffix}`)) suffix += 1;
    return `${baseLabel} ${suffix}`;
}
