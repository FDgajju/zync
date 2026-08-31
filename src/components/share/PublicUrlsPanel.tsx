import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Copy,
    ExternalLink,
    Github,
    Globe,
    Link2,
    Play,
    Plus,
    RefreshCw,
    Square,
    Trash2,
} from 'lucide-react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { cn } from '../../lib/utils';
import { GoogleMarkIcon } from '../icons/providerIcons';
import { useAppStore } from '../../store/useAppStore';
import {
    agentLine,
    quotaFull,
    useShareStore,
} from '../../features/share/useShareStore';
import {
    quotaFullMessage,
    shareChip,
    shareDisplayUrl,
    type ShareChip,
    type ShareProvider,
    type ShareRecord,
} from '../../features/share/types';
import { parseShareError } from '../../features/share/ipc';
import { PublicUrlsLabel } from './PublicUrlsLabel';

const CHIP_STYLE: Record<ShareChip, string> = {
    online: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
    offline: 'border-app-border/50 bg-app-surface text-app-muted',
    stopped: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
};

const CHIP_LABEL: Record<ShareChip, string> = {
    online: 'Online',
    offline: 'Offline',
    stopped: 'Stopped',
};

export function PublicUrlsPanel() {
    const showToast = useAppStore((s) => s.showToast);
    const hydrate = useShareStore((s) => s.hydrate);
    const login = useShareStore((s) => s.login);
    const cancelLogin = useShareStore((s) => s.cancelLogin);
    const signingIn = useShareStore((s) => s.signingIn);
    const logout = useShareStore((s) => s.logout);
    const create = useShareStore((s) => s.create);
    const stop = useShareStore((s) => s.stop);
    const start = useShareStore((s) => s.start);
    const remove = useShareStore((s) => s.remove);
    const startSharing = useShareStore((s) => s.startSharing);
    const auth = useShareStore((s) => s.auth);
    const shares = useShareStore((s) => s.shares);
    const agents = useShareStore((s) => s.agents);
    const hydrated = useShareStore((s) => s.hydrated);
    const loading = useShareStore((s) => s.loading);
    const busy = useShareStore((s) => s.busy);
    const error = useShareStore((s) => s.error);
    const quotaUsed = useShareStore((s) => s.quotaUsed);
    const quotaMax = useShareStore((s) => s.quotaMax);

    const [createOpen, setCreateOpen] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [port, setPort] = useState('3000');
    const [name, setName] = useState('');
    const [requirePassword, setRequirePassword] = useState(false);
    const [password, setPassword] = useState('');
    const [createdId, setCreatedId] = useState<string | null>(null);
    const [lastSignInAttempt, setLastSignInAttempt] = useState<ShareProvider | null>(null);

    useEffect(() => {
        void hydrate();
    }, [hydrate]);

    const full = quotaFull({ quotaUsed, quotaMax, shares });
    const line = useMemo(() => agentLine(agents, shares), [agents, shares]);
    const deleting = shares.find((s) => s.id === deleteId) || null;
    const retryProvider = signingIn ?? lastSignInAttempt;

    const handleLogin = async (provider: ShareProvider) => {
        setLastSignInAttempt(provider);
        try {
            await login(provider);
            setLastSignInAttempt(null);
            showToast('success', 'Signed in to Zync');
        } catch (err) {
            const parsed = parseShareError(err);
            if (parsed.code === 'oauth_canceled') {
                setLastSignInAttempt(null);
                showToast('info', 'Sign-in canceled');
                return;
            }
            // Keep lastSignInAttempt so Retry stays available after a real failure.
            showToast('error', parsed.message);
        }
    };

    const handleCancelLogin = async () => {
        await cancelLogin();
        setLastSignInAttempt(null);
        showToast('info', 'Sign-in canceled');
    };

    const handleRetryLogin = async () => {
        const provider = retryProvider;
        if (!provider) return;
        if (signingIn) {
            await cancelLogin();
        }
        await handleLogin(provider);
    };

    const handleLogout = async () => {
        try {
            await logout();
            showToast('success', 'Signed out of Zync');
        } catch (err) {
            showToast('error', parseShareError(err).message);
        }
    };

    const handleCreate = async () => {
        const parsed = Number(port);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
            showToast('error', 'Local port must be between 1 and 65535');
            return;
        }
        if (requirePassword && !password.trim()) {
            showToast('error', 'Enter a visitor password, or turn off Require a password');
            return;
        }
        try {
            const share = await create(
                parsed,
                name.trim() || undefined,
                requirePassword ? password.trim() : undefined,
            );
            setCreateOpen(false);
            setName('');
            setPassword('');
            setRequirePassword(false);
            setCreatedId(share.id);
            showToast('success', 'Public URL ready');
        } catch (err) {
            showToast('error', parseShareError(err).message);
        }
    };

    const handleCopy = async (url: string) => {
        try {
            await writeText(url);
            showToast('success', 'Copied Public URL');
        } catch {
            showToast('error', 'Could not copy URL');
        }
    };

    const handleOpen = async (url: string) => {
        try {
            await openUrl(url);
        } catch {
            showToast('error', 'Could not open URL');
        }
    };

    if (!hydrated) {
        if (auth.signed_in) {
            return (
                <div className="h-full flex flex-col min-h-0">
                    <div className="shrink-0 border-b border-app-border/30 px-6 py-4">
                        <div className="flex items-center gap-2.5">
                            {auth.avatar_url ? (
                                <img
                                    src={auth.avatar_url}
                                    alt=""
                                    className="h-8 w-8 rounded-full object-cover border border-app-border/40 shrink-0"
                                    referrerPolicy="no-referrer"
                                />
                            ) : null}
                            <div className="min-w-0">
                                <Header />
                                <p className="mt-1 text-xs text-app-muted">
                                    Zync · {auth.email || 'Signed in'}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 px-6 py-4">
                        <p className="text-sm text-app-muted">Loading Public URLs…</p>
                    </div>
                </div>
            );
        }
        return (
            <div className="h-full overflow-y-auto">
                <div className="mx-auto max-w-lg px-6 py-10">
                    <Header />
                    <p className="mt-6 text-sm text-app-muted">Loading…</p>
                </div>
            </div>
        );
    }

    if (!auth.signed_in) {
        return (
            <div className="h-full overflow-y-auto">
                <div className="mx-auto max-w-lg px-6 py-10">
                    <Header />
                    <p className="mt-3 text-sm text-app-muted leading-relaxed">
                        Put a local port on the internet with an HTTPS link. Distinct from SSH port forwarding.
                    </p>
                    <div className="mt-4 rounded-lg border border-app-border/40 bg-app-surface/40 px-3 py-2.5 text-xs text-app-muted leading-relaxed">
                        <p className="font-medium text-app-text">Sign in to Zync</p>
                        <p className="mt-1">
                            Public URLs uses your Zync account (GitHub or Google). This is separate from Google Drive Sync and will not merge with Connect Google Sync.
                        </p>
                    </div>
                    <div className="mt-6 flex flex-col gap-2">
                        {signingIn ? (
                            <>
                                <p className="text-xs text-app-muted px-1">
                                    Waiting for {signingIn === 'github' ? 'GitHub' : 'Google'} in your browser…
                                    Close the tab or finish there, then Cancel or Retry here.
                                </p>
                                <Button
                                    variant="primary"
                                    onClick={() => void handleRetryLogin()}
                                    className="justify-start gap-2"
                                >
                                    <RefreshCw size={14} />
                                    Retry {signingIn === 'github' ? 'GitHub' : 'Google'}
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => void handleCancelLogin()}
                                    className="justify-start gap-2"
                                >
                                    Cancel sign-in
                                </Button>
                            </>
                        ) : lastSignInAttempt ? (
                            <>
                                <p className="text-xs text-app-muted px-1">
                                    Sign-in did not finish. Retry or pick another provider.
                                </p>
                                <Button
                                    variant="primary"
                                    onClick={() => void handleRetryLogin()}
                                    disabled={busy}
                                    className="justify-start gap-2"
                                >
                                    <RefreshCw size={14} />
                                    Retry {lastSignInAttempt === 'github' ? 'GitHub' : 'Google'}
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setLastSignInAttempt(null);
                                        void handleLogin(lastSignInAttempt === 'github' ? 'google' : 'github');
                                    }}
                                    disabled={busy}
                                    className="justify-start gap-2"
                                >
                                    {lastSignInAttempt === 'github' ? (
                                        <>
                                            <GoogleMarkIcon size={14} variant="color" />
                                            Continue with Google
                                        </>
                                    ) : (
                                        <>
                                            <Github size={14} />
                                            Continue with GitHub
                                        </>
                                    )}
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => setLastSignInAttempt(null)}
                                    className="justify-start gap-2"
                                >
                                    Dismiss
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="secondary"
                                    onClick={() => void handleLogin('github')}
                                    disabled={busy}
                                    className="justify-start gap-2"
                                >
                                    <Github size={14} />
                                    Continue with GitHub
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => void handleLogin('google')}
                                    disabled={busy}
                                    className="justify-start gap-2"
                                >
                                    <GoogleMarkIcon size={14} variant="color" />
                                    Continue with Google
                                </Button>
                            </>
                        )}
                    </div>
                    {error && <p className="mt-4 text-xs text-red-400">{error}</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col min-h-0">
            <div className="shrink-0 border-b border-app-border/30 px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2.5">
                            {auth.avatar_url ? (
                                <img
                                    src={auth.avatar_url}
                                    alt=""
                                    className="h-8 w-8 rounded-full object-cover border border-app-border/40 shrink-0"
                                    referrerPolicy="no-referrer"
                                />
                            ) : null}
                            <div className="min-w-0">
                                <Header />
                                <p className="mt-1 text-xs text-app-muted">
                                    Zync · {auth.email || 'Signed in'} · Anyone with the link can reach that port while this device is sharing.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => void handleLogout()} disabled={busy}>
                            Sign out of Zync
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => setCreateOpen(true)}
                            disabled={full || busy}
                            className="gap-1.5"
                        >
                            <Plus size={14} />
                            Share a port
                        </Button>
                    </div>
                </div>
                <div className="mt-3 rounded-lg border border-app-border/40 bg-app-surface/40 px-3 py-2.5 text-xs text-app-muted leading-relaxed">
                    <p>
                        Beta - if you hit a bug, please{' '}
                        <button
                            type="button"
                            className="text-app-accent hover:underline font-medium"
                            onClick={() => {
                                void openUrl(
                                    'https://github.com/zync-sh/zync/issues/new?title=' +
                                        encodeURIComponent('[Public URLs Beta] ') +
                                        '&body=' +
                                        encodeURIComponent(
                                            '## What happened\n\n## Steps to reproduce\n\n',
                                        ),
                                ).catch(() => showToast('error', 'Could not open report link'));
                            }}
                        >
                            report it
                        </button>
                        .
                    </p>
                </div>
                {full && (
                    <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                        {quotaFullMessage(quotaUsed, quotaMax)}
                    </div>
                )}
                {error && !full && (
                    <p className="mt-3 text-xs text-red-400">{error}</p>
                )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">
                {loading && shares.length === 0 && (
                    <p className="text-sm text-app-muted">Loading Public URLs…</p>
                )}
                {!loading && shares.length === 0 && (
                    <div className="rounded-xl border border-dashed border-app-border/40 bg-app-surface/20 px-6 py-10 text-center">
                        <Globe size={22} className="mx-auto text-app-muted mb-3" />
                        <p className="text-sm font-medium text-app-text">No Public URLs yet.</p>
                        <p className="mt-1 text-xs text-app-muted">
                            Anyone with the link can reach that port while this device is sharing.
                        </p>
                        <Button
                            className="mt-4 gap-1.5"
                            onClick={() => setCreateOpen(true)}
                            disabled={full || busy}
                        >
                            <Plus size={14} />
                            Share a port
                        </Button>
                    </div>
                )}
                {shares.map((share) => (
                    <ShareRow
                        key={share.id}
                        share={share}
                        chip={shareChip(share, agents[share.id])}
                        highlight={createdId === share.id}
                        busy={busy}
                        onCopy={(url) => void handleCopy(url)}
                        onOpen={(url) => void handleOpen(url)}
                        onStop={() => void stop(share.id).catch((e) => showToast('error', parseShareError(e).message))}
                        onStart={() => void start(share.id).catch((e) => showToast('error', parseShareError(e).message))}
                        onDelete={() => setDeleteId(share.id)}
                    />
                ))}
            </div>

            {line.label && (
                <div className="shrink-0 border-t border-app-border/30 px-6 py-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-app-muted">{line.label}</p>
                    {(line.state === 'offline' || line.state === 'auth_failed') && (
                        <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => {
                                void startSharing().catch((e) =>
                                    showToast('error', parseShareError(e).message),
                                );
                            }}
                        >
                            Start sharing
                        </Button>
                    )}
                </div>
            )}

            <Modal
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Share a port"
                subtitle="This local port is now a hostname."
                width="max-w-md"
            >
                <div className="space-y-4 px-1 pb-2">
                    {full && (
                        <p className="text-xs text-amber-200">{quotaFullMessage(quotaUsed, quotaMax)}</p>
                    )}
                    <Input
                        label="Local port"
                        type="number"
                        min={1}
                        max={65535}
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        placeholder="3000"
                        autoFocus
                    />
                    <Input
                        label="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Optional"
                    />
                    <label className="flex items-center gap-2 text-xs text-app-text px-1">
                        <input
                            type="checkbox"
                            checked={requirePassword}
                            onChange={(e) => setRequirePassword(e.target.checked)}
                        />
                        Require a password
                    </label>
                    {requirePassword && (
                        <Input
                            label="Visitor password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    )}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={() => void handleCreate()} disabled={full || busy} isLoading={busy}>
                            Share
                        </Button>
                    </div>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={Boolean(deleting)}
                onClose={() => setDeleteId(null)}
                onConfirm={() => {
                    if (!deleting) return;
                    const id = deleting.id;
                    setDeleteId(null);
                    void remove(id).catch((e) => showToast('error', parseShareError(e).message));
                }}
                title="Delete Public URL"
                message="This URL will stop working. You can create a new one after."
                confirmLabel="Delete"
                variant="danger"
            />
        </div>
    );
}

function Header() {
    return (
        <div className="flex items-center gap-2">
            <Link2 size={16} className="text-app-accent" />
            <h1 className="text-base font-semibold text-app-text">
                <PublicUrlsLabel />
            </h1>
        </div>
    );
}

function ShareRow({
    share,
    chip,
    highlight,
    busy,
    onCopy,
    onOpen,
    onStop,
    onStart,
    onDelete,
}: {
    share: ShareRecord;
    chip: ShareChip;
    highlight: boolean;
    busy: boolean;
    onCopy: (url: string) => void;
    onOpen: (url: string) => void;
    onStop: () => void;
    onStart: () => void;
    onDelete: () => void;
}) {
    const url = shareDisplayUrl(share);
    const copyRef = useCallback((node: HTMLButtonElement | null) => {
        if (highlight && node) node.focus();
    }, [highlight]);

    return (
        <div
            className={cn(
                'rounded-xl border bg-app-surface/30 px-4 py-3 space-y-2',
                highlight ? 'border-app-accent/40' : 'border-app-border/35',
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-app-text truncate">{url || share.slug}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-app-muted">
                        localhost:{share.target_port}
                    </p>
                </div>
                <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold', CHIP_STYLE[chip])}>
                    {CHIP_LABEL[chip]}
                </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <Button ref={copyRef} size="sm" variant="secondary" className="gap-1.5 h-7" onClick={() => url && onCopy(url)} disabled={!url}>
                    <Copy size={12} />
                    Copy
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5 h-7" onClick={() => url && onOpen(url)} disabled={!url}>
                    <ExternalLink size={12} />
                    Open
                </Button>
                {share.status === 'stopped' ? (
                    <Button size="sm" variant="ghost" className="gap-1.5 h-7" disabled={busy} onClick={onStart}>
                        <Play size={12} />
                        Start
                    </Button>
                ) : (
                    <Button size="sm" variant="ghost" className="gap-1.5 h-7" disabled={busy} onClick={onStop}>
                        <Square size={12} />
                        Stop
                    </Button>
                )}
                <Button size="sm" variant="ghost" className="gap-1.5 h-7 text-red-300" disabled={busy} onClick={onDelete}>
                    <Trash2 size={12} />
                    Delete
                </Button>
            </div>
            {chip === 'offline' && share.status !== 'stopped' && (
                <p className="text-[11px] text-app-muted">
                    This device isn't sharing. Start sharing to bring the URL back.
                </p>
            )}
        </div>
    );
}
