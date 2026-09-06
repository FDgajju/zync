const PIXEL_PER_RATIO = 2400;
const LINE_PX = 16;
const PAGE_PX = 480;
const MAX_STEP = 0.08;

/** Convert a wheel/trackpad delta into a pane-size step. Capped so one flick cannot collapse a pane. */
export function wheelDeltaToRatio(delta: number, deltaMode = 0): number {
    if (!Number.isFinite(delta) || delta === 0) return 0;
    const px = deltaMode === 1 ? delta * LINE_PX : deltaMode === 2 ? delta * PAGE_PX : delta;
    const ratio = px / PIXEL_PER_RATIO;
    if (!Number.isFinite(ratio)) return 0;
    return Math.max(-MAX_STEP, Math.min(MAX_STEP, ratio));
}

/** Side-by-side splits follow the dominant axis (shift+wheel is often deltaX). Stacked splits use deltaY. */
export function wheelAxisDelta(deltaX: number, deltaY: number, stacked: boolean): number {
    if (stacked) return Number.isFinite(deltaY) ? deltaY : 0;
    const x = Number.isFinite(deltaX) ? deltaX : 0;
    const y = Number.isFinite(deltaY) ? deltaY : 0;
    return Math.abs(x) > Math.abs(y) ? x : y;
}
