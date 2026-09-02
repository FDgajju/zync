import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '../../lib/utils';
import type { SplitDirection } from '../../lib/paneLayout';

export function PaneDivider({
    direction,
    onDrag,
    onDragEnd,
}: {
    direction: SplitDirection;
    onDrag: (firstRatio: number) => void;
    onDragEnd: () => void;
}) {
    const dragging = useRef(false);

    const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        const parent = event.currentTarget.parentElement;
        if (!parent) return;
        dragging.current = true;
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
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            onDragEnd();
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }, [direction, onDrag, onDragEnd]);

    const vertical = direction === 'vertical';
    return (
        <div
            role="separator"
            aria-orientation={vertical ? 'horizontal' : 'vertical'}
            onPointerDown={onPointerDown}
            className={cn(
                'shrink-0 bg-app-border/60 hover:bg-app-accent/50 active:bg-app-accent z-10',
                vertical ? 'h-1 w-full cursor-row-resize' : 'w-1 h-full cursor-col-resize',
            )}
        />
    );
}
