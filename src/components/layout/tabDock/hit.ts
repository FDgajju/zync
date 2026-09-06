import {
    dockEdgeFromPoint,
    dockPreviewRect,
    paneBoxAtPoint,
    type DockEdge,
} from '../../../lib/paneLayout';

export type DockTarget = {
    paneId: string | null;
    edge: DockEdge;
    preview: { left: number; top: number; width: number; height: number };
};

function collectPaneBoxes(surface: HTMLElement, originLeft: number, originTop: number) {
    const boxes: Array<{ id: string; x: number; y: number; w: number; h: number }> = [];
    for (const node of surface.querySelectorAll('[data-pane-id]')) {
        if (!(node instanceof HTMLElement)) continue;
        const id = node.dataset.paneId;
        if (!id) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        boxes.push({
            id,
            x: rect.left - originLeft,
            y: rect.top - originTop,
            w: rect.width,
            h: rect.height,
        });
    }
    return boxes;
}

/** Hit-test the pane under the pointer and the half-pane preview inside it. */
export function dockTargetFromPointer(
    clientX: number,
    clientY: number,
    surface: HTMLElement,
): DockTarget | null {
    const surfaceRect = surface.getBoundingClientRect();
    const localX = clientX - surfaceRect.left;
    const localY = clientY - surfaceRect.top;
    if (localX < 0 || localY < 0 || localX > surfaceRect.width || localY > surfaceRect.height) {
        return null;
    }

    const panes = collectPaneBoxes(surface, surfaceRect.left, surfaceRect.top);
    const pane = paneBoxAtPoint(localX, localY, panes) ?? {
        id: '',
        x: 0,
        y: 0,
        w: surfaceRect.width,
        h: surfaceRect.height,
    };
    const edge = dockEdgeFromPoint(localX - pane.x, localY - pane.y, pane.w, pane.h);
    if (!edge) return null;
    const preview = dockPreviewRect(pane, edge);
    return {
        paneId: pane.id || null,
        edge,
        preview: { left: preview.x, top: preview.y, width: preview.w, height: preview.h },
    };
}
