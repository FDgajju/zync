import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '../../lib/utils';
import type { SplitDirection } from '../../lib/paneLayout';
import { beginPaneDividerDrag, endPaneDividerDrag } from '../../lib/terminal';

export function PaneDivider({
    direction,
    onDrag,
    onDragEnd,
    onEqualize,
}: {
    direction: SplitDirection;
    onDrag: (firstRatio: number) => void;
    onDragEnd: () => void;
    onEqualize: () => void;
}) {
    const dragging = useRef(false);
    const [held, setHeld] = useState(false);

    const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (event.detail >= 2) {
            onEqualize();
            return;
        }
        const parent = event.currentTarget.parentElement;
        if (!parent) return;
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
            dragging.current = false;
            setHeld(false);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            endPaneDividerDrag();
            onDragEnd();
            window.dispatchEvent(new Event('zync:pane-resize-end'));
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }, [direction, onDrag, onDragEnd, onEqualize]);

    const stacked = direction === 'vertical';
    return (
        <div
            role="separator"
            aria-orientation={stacked ? 'horizontal' : 'vertical'}
            title="Drag to resize · double-click to even panes"
            onPointerDown={onPointerDown}
            className={cn(
                'relative z-20 shrink-0 touch-none select-none transition-colors duration-150',
                stacked ? 'h-px w-full cursor-row-resize' : 'w-px h-full cursor-col-resize',
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
