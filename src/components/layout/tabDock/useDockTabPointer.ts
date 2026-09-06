import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { DockEdge, DockPayload } from '../../../lib/paneLayout';
import { dockTargetFromPointer } from './hit';
import { patchTabDockTarget, startTabDock, stopTabDock } from './session';

const DRAG_THRESHOLD_PX = 8;

export type DockTabPointerHandlers = {
    getSurface: () => HTMLElement | null;
    onDragStart: (payload: DockPayload) => void;
    onDragEnd: (payload: DockPayload, edge: DockEdge | null, paneId: string | null) => void;
    onDragCancel: () => void;
};

export function useDockTabPointer(handlers: DockTabPointerHandlers | undefined) {
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;
    const skipClickRef = useRef(false);
    const dragCleanupRef = useRef<(() => void) | null>(null);
    const skipClickClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearSkipClickSoon = useCallback(() => {
        if (skipClickClearRef.current != null) {
            window.clearTimeout(skipClickClearRef.current);
        }
        skipClickClearRef.current = window.setTimeout(() => {
            skipClickClearRef.current = null;
            skipClickRef.current = false;
        }, 0);
    }, []);

    const consumeClickIfDragged = useCallback(() => {
        if (!skipClickRef.current) return false;
        skipClickRef.current = false;
        if (skipClickClearRef.current != null) {
            window.clearTimeout(skipClickClearRef.current);
            skipClickClearRef.current = null;
        }
        return true;
    }, []);

    useEffect(() => () => {
        dragCleanupRef.current?.();
        dragCleanupRef.current = null;
        if (skipClickClearRef.current != null) {
            window.clearTimeout(skipClickClearRef.current);
            skipClickClearRef.current = null;
        }
        skipClickRef.current = false;
        stopTabDock();
    }, []);

    const begin = useCallback((event: ReactPointerEvent, payload: DockPayload) => {
        if (!handlersRef.current) return;
        if (event.button !== 0) return;
        if (event.target instanceof Element && event.target.closest('button')) return;

        const startX = event.clientX;
        const startY = event.clientY;
        const pointerId = event.pointerId;
        const target = event.currentTarget;
        let started = false;

        const targetAt = (clientX: number, clientY: number) => {
            const surface = handlersRef.current?.getSurface() ?? null;
            return surface ? dockTargetFromPointer(clientX, clientY, surface) : null;
        };

        const onMove = (moveEvent: PointerEvent) => {
            const live = handlersRef.current;
            if (!live) return;
            if (!started) {
                if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < DRAG_THRESHOLD_PX) {
                    return;
                }
                started = true;
                skipClickRef.current = true;
                if (target instanceof HTMLElement) {
                    try {
                        target.setPointerCapture(pointerId);
                    } catch {
                        // Capture is best-effort (some hosts reject it).
                    }
                }
                startTabDock(payload);
                live.onDragStart(payload);
            }
            if (moveEvent.cancelable) moveEvent.preventDefault();
            patchTabDockTarget(targetAt(moveEvent.clientX, moveEvent.clientY));
        };

        const cleanup = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', stop);
            window.removeEventListener('pointercancel', stop);
            window.removeEventListener('keydown', onKey);
            if (target instanceof HTMLElement && target.hasPointerCapture(pointerId)) {
                try {
                    target.releasePointerCapture(pointerId);
                } catch {
                    // ignore
                }
            }
            if (dragCleanupRef.current === cleanup) {
                dragCleanupRef.current = null;
            }
        };

        const stop = (endEvent: PointerEvent) => {
            cleanup();
            const live = handlersRef.current;
            if (!live || !started) {
                skipClickRef.current = false;
                return;
            }
            const hit = targetAt(endEvent.clientX, endEvent.clientY);
            stopTabDock();
            if (endEvent.type === 'pointercancel') {
                skipClickRef.current = false;
                live.onDragCancel();
                return;
            }
            clearSkipClickSoon();
            live.onDragEnd(payload, hit?.edge ?? null, hit?.paneId ?? null);
        };

        const onKey = (keyEvent: KeyboardEvent) => {
            if (keyEvent.key !== 'Escape') return;
            keyEvent.preventDefault();
            started = false;
            skipClickRef.current = false;
            cleanup();
            stopTabDock();
            handlersRef.current?.onDragCancel();
        };

        if (dragCleanupRef.current) {
            dragCleanupRef.current();
            stopTabDock();
        }
        dragCleanupRef.current = cleanup;
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', stop);
        window.addEventListener('pointercancel', stop);
        window.addEventListener('keydown', onKey);
    }, [clearSkipClickSoon]);

    return { begin, consumeClickIfDragged };
}
