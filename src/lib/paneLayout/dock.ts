import type { DockEdge, SplitDirection, SplitInsert } from './types';

export function oppositeDockEdge(edge: DockEdge): DockEdge {
    switch (edge) {
        case 'left':
            return 'right';
        case 'right':
            return 'left';
        case 'top':
            return 'bottom';
        case 'bottom':
            return 'top';
    }
}

export function splitFromDockEdge(edge: DockEdge): { direction: SplitDirection; insert: SplitInsert } {
    switch (edge) {
        case 'left':
            return { direction: 'horizontal', insert: 'before' };
        case 'right':
            return { direction: 'horizontal', insert: 'after' };
        case 'top':
            return { direction: 'vertical', insert: 'before' };
        case 'bottom':
            return { direction: 'vertical', insert: 'after' };
    }
}

/**
 * Nearest edge while the pointer is inside the drop surface.
 * Outside the surface returns null (drop cancels).
 */
export function dockEdgeFromPoint(
    x: number,
    y: number,
    width: number,
    height: number,
): DockEdge | null {
    if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0 || height <= 0) return null;
    if (x < 0 || y < 0 || x > width || y > height) return null;

    const left = x;
    const right = width - x;
    const top = y;
    const bottom = height - y;
    const sides: Array<{ edge: DockEdge; dist: number }> = [
        { edge: 'left', dist: left },
        { edge: 'right', dist: right },
        { edge: 'top', dist: top },
        { edge: 'bottom', dist: bottom },
    ];
    let best = sides[0];
    for (let i = 1; i < sides.length; i += 1) {
        if (sides[i].dist < best.dist) best = sides[i];
    }
    return best.edge;
}

export function dockEdgeFromClientRect(
    clientX: number,
    clientY: number,
    rect: { left: number; top: number; width: number; height: number },
): DockEdge | null {
    return dockEdgeFromPoint(clientX - rect.left, clientY - rect.top, rect.width, rect.height);
}

export type DockPaneBox = {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
};

/** Smallest pane box that contains the point (leaf over parent). */
export function paneBoxAtPoint(x: number, y: number, boxes: readonly DockPaneBox[]): DockPaneBox | null {
    let hit: DockPaneBox | null = null;
    for (const box of boxes) {
        if (x < box.x || y < box.y || x > box.x + box.w || y > box.y + box.h) continue;
        if (!hit || box.w * box.h <= hit.w * hit.h) hit = box;
    }
    return hit;
}

/** Half of `box` on `edge`, inset so the preview sits inside that pane only. */
export function dockPreviewRect(
    box: DockPaneBox,
    edge: DockEdge,
    pad = 8,
): { x: number; y: number; w: number; h: number } {
    const px = Math.min(pad, Math.max(0, box.w / 4));
    const py = Math.min(pad, Math.max(0, box.h / 4));
    switch (edge) {
        case 'left':
            return { x: box.x + px, y: box.y + py, w: Math.max(0, box.w / 2 - px * 1.5), h: Math.max(0, box.h - py * 2) };
        case 'right':
            return { x: box.x + box.w / 2 + px * 0.5, y: box.y + py, w: Math.max(0, box.w / 2 - px * 1.5), h: Math.max(0, box.h - py * 2) };
        case 'top':
            return { x: box.x + px, y: box.y + py, w: Math.max(0, box.w - px * 2), h: Math.max(0, box.h / 2 - py * 1.5) };
        case 'bottom':
            return { x: box.x + px, y: box.y + box.h / 2 + py * 0.5, w: Math.max(0, box.w - px * 2), h: Math.max(0, box.h / 2 - py * 1.5) };
    }
}
