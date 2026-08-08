import type { Connection } from '../../../store/useAppStore';

/** Prefer live sessions at the top of host lists (connected → connecting → error → rest). */
export function sortConnectionsByLiveFirst(list: Connection[]): Connection[] {
    const rank = (c: Connection) => {
        if (c.status === 'connected') return 0;
        if (c.status === 'connecting') return 1;
        if (c.status === 'error') return 2;
        return 3;
    };
    return [...list].sort((a, b) => {
        const diff = rank(a) - rank(b);
        if (diff !== 0) return diff;
        const an = (a.name || a.host || '').toLocaleLowerCase();
        const bn = (b.name || b.host || '').toLocaleLowerCase();
        return an.localeCompare(bn);
    });
}
