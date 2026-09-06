import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '../../lib/utils';
import { MIN_PANE_RATIO, type SplitDirection, wheelAxisDelta, wheelDeltaToRatio } from '../../lib/paneLayout';
import { beginPaneDividerDrag, endPaneDividerDrag } from '../../lib/terminal';

const KEY_STEP = 0.05;
const WHEEL_SETTLE_MS = 140;

export function PaneDivider({
    direction,
    firstRatio,
    onDrag,
    onDragEnd,
    onEqualize,
}: {
    direction: SplitDirection;
    firstRatio: number;
    onDrag: (firstRatio: number) => void;
    onDragEnd: () => void;
    onEqualize: () => void;
}) {
    const dragging = useRef(false);
    const wheelHeld = useRef(false);
    const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const firstRatioRef = useRef(firstRatio);
    const onDragRef = useRef(onDrag);
    const onDragEndRef = useRef(onDragEnd);

    useLayoutEffect(() => {
        firstRatioRef.current = firstRatio;
        onDragRef.current = onDrag;
        onDragEndRef.current = onDragEnd;
    });
    const nodeRef = useRef<HTMLDivElement>(null);
    const [held, setHeld] = useState(false);
    const listeners = useRef<{
        move: (event: globalThis.PointerEvent) => void;
        up: () => void;
    } | null>(null);

    const stopDrag = useCallback((commit: boolean) => {
        if (!dragging.current) return;
        dragging.current = false;
        setHeld(false);
        if (listeners.current) {
            window.removeEventListener('pointermove', listeners.current.move);
            window.removeEventListener('pointerup', listeners.current.up);
            window.removeEventListener('pointercancel', listeners.current.up);
            listeners.current = null;
        }
        endPaneDividerDrag();
        if (commit) {
            onDragEnd();
        }
        window.dispatchEvent(new Event('zync:pane-resize-end'));
    }, [onDragEnd]);

    const finishWheel = useCallback((commit: boolean) => {
        if (wheelTimer.current != null) {
            window.clearTimeout(wheelTimer.current);
            wheelTimer.current = null;
        }
        if (!wheelHeld.current) return;
        wheelHeld.current = false;
        setHeld(false);
        endPaneDividerDrag();
        if (commit) {
            onDragEndRef.current();
            window.dispatchEvent(new Event('zync:pane-resize-end'));
        }
    }, []);

    useEffect(() => () => {
        stopDrag(false);
        finishWheel(false);
    }, [stopDrag, finishWheel]);

    useEffect(() => {
        const node = nodeRef.current;
        if (!node) return undefined;

        const onWheel = (event: WheelEvent) => {
            if (event.ctrlKey || event.metaKey) return;
            if (dragging.current) return;
            const stacked = direction === 'vertical';
            const axis = wheelAxisDelta(event.deltaX, event.deltaY, stacked);
            const step = wheelDeltaToRatio(axis, event.deltaMode);
            if (step === 0) return;
            event.preventDefault();
            event.stopPropagation();
            if (!wheelHeld.current) {
                wheelHeld.current = true;
                setHeld(true);
                beginPaneDividerDrag();
            }
            onDragRef.current(firstRatioRef.current + step);
            if (wheelTimer.current != null) window.clearTimeout(wheelTimer.current);
            wheelTimer.current = window.setTimeout(() => finishWheel(true), WHEEL_SETTLE_MS);
        };

        node.addEventListener('wheel', onWheel, { passive: false });
        return () => node.removeEventListener('wheel', onWheel);
    }, [direction, finishWheel]);

    const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (event.detail >= 2) {
            finishWheel(false);
            onEqualize();
            return;
        }
        const parent = event.currentTarget.parentElement;
        if (!parent) return;
        finishWheel(false);
        stopDrag(false);
        dragging.current = true;
        setHeld(true);
        beginPaneDividerDrag();
        event.currentTarget.setPointerCapture(event.pointerId);
        const vertical = direction === 'vertical';
        const startSize = vertical ? parent.clientHeight : parent.clientWidth;
        const startRect = parent.getBoundingClientRect();

        const onMove = (move: globalThis.PointerEvent) => {
            if (!dragging.current || startSize <= 0) return;
            const pos = vertical ? move.clientY : move.clientX;
            const origin = vertical ? startRect.top : startRect.left;
            const ratio = (pos - origin) / startSize;
            onDrag(ratio);
        };
        const onUp = () => {
            stopDrag(true);
        };
        listeners.current = { move: onMove, up: onUp };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }, [direction, finishWheel, onDrag, onEqualize, stopDrag]);

    const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === 'Home') {
            event.preventDefault();
            onEqualize();
            return;
        }
        const stacked = direction === 'vertical';
        const delta =
            stacked
                ? event.key === 'ArrowDown' ? KEY_STEP : event.key === 'ArrowUp' ? -KEY_STEP : 0
                : event.key === 'ArrowRight' ? KEY_STEP : event.key === 'ArrowLeft' ? -KEY_STEP : 0;
        if (delta === 0) return;
        event.preventDefault();
        onDrag(firstRatio + delta);
        onDragEnd();
    }, [direction, firstRatio, onDrag, onDragEnd, onEqualize]);

    const stacked = direction === 'vertical';
    const valueNow = Math.round(firstRatio * 100);
    const valueMin = Math.round(MIN_PANE_RATIO * 100);
    return (
        <div
            ref={nodeRef}
            role="separator"
            tabIndex={0}
            aria-orientation={stacked ? 'horizontal' : 'vertical'}
            aria-valuemin={valueMin}
            aria-valuemax={100 - valueMin}
            aria-valuenow={valueNow}
            aria-label="Resize panes"
            title="Drag, scroll, or arrow keys to resize · double-click or Enter to even panes"
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
            className={cn(
                'relative z-20 shrink-0 touch-none select-none overscroll-none transition-colors duration-150',
                stacked ? 'h-px w-full cursor-row-resize' : 'w-px h-full cursor-col-resize',
                'outline-none focus-visible:bg-app-accent',
                held ? 'bg-app-accent' : 'bg-app-border/40 hover:bg-app-accent/55',
            )}
        >
            <div
                className={cn(
                    'absolute',
                    stacked
                        ? '-top-2 left-0 right-0 h-4'
                        : 'top-0 -left-2 bottom-0 w-4',
                )}
            />
        </div>
    );
}
