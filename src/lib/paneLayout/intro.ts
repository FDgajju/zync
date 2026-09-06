import type { SplitInsert } from './types';

/** One-shot grow-in for a newly created split. Divider drag must not use this. */
export const SPLIT_INTRO_MS = 280;

export type SplitIntro = {
    incomingIndex: 0 | 1;
};

const pending = new Map<string, SplitIntro>();

export function incomingIndexForInsert(insert: SplitInsert): 0 | 1 {
    return insert === 'before' ? 0 : 1;
}

/** New leaf starts at flex-grow 0 so it grows into `sizes` instead of popping in. */
export function introStartSizes(incomingIndex: 0 | 1): [number, number] {
    return incomingIndex === 0 ? [0, 1] : [1, 0];
}

export function prefersSplitIntroMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return true;
    }
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function markSplitIntro(splitId: string, incomingIndex: 0 | 1): void {
    pending.set(splitId, { incomingIndex });
}

/** Consume the intro for this split. Null when none, or when the user prefers reduced motion. */
export function takeSplitIntro(splitId: string): SplitIntro | null {
    const intro = pending.get(splitId);
    if (!intro) return null;
    pending.delete(splitId);
    return prefersSplitIntroMotion() ? intro : null;
}

export function dropSplitIntro(splitId: string): void {
    pending.delete(splitId);
}
