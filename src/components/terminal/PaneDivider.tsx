import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '../../lib/utils';
import { MIN_PANE_RATIO, type SplitDirection } from '../../lib/paneLayout';
import { beginPaneDividerDrag, endPaneDividerDrag } from '../../lib/terminal';

const KEY_STEP = 0.05;

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

    useEffect(() => () => {
        stopDrag(false);
    }, [stopDrag]);

    const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (event.detail >= 2) {
            onEqualize();
            return;
        }
        const parent = event.currentTarget.parentElement;
        if (!parent) return;
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
    }, [direction, onDrag, onEqualize, stopDrag]);

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
            role="separator"
            tabIndex={0}
            aria-orientation={stacked ? 'horizontal' : 'vertical'}
            aria-valuemin={valueMin}
            aria-valuemax={100 - valueMin}
            aria-valuenow={valueNow}
            aria-label="Resize panes"
            title="Drag or arrow keys to resize · double-click or Enter to even panes"
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
            className={cn(
                'relative z-20 shrink-0 touch-none select-none transition-colors duration-150',
                stacked ? 'h-px w-full cursor-row-resize' : 'w-px h-full cursor-col-resize',
                'outline-none focus-visible:bg-app-accent',
                held ? 'bg-app-accent' : 'bg-app-border/40 hover:bg-app-accent/55',
            )}
        >
            <div
                className={cn(
                    'absolute',
                    stacked
                        ? '-top-1.5 left-0 right-0 h-3.5'
                        : 'top-0 -left-1.5 bottom-0 w-3.5',
                )}
            />
        </div>
    );
}
