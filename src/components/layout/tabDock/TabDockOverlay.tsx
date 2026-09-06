import { useEffect, useState } from 'react';
import { cn } from '../../../lib/utils';
import { getTabDockLive, subscribeTabDock } from './session';

const PREVIEW_FADE_MS = 160;

export function TabDockOverlay() {
    const [live, setLive] = useState(getTabDockLive);
    const [held, setHeld] = useState(live?.target?.preview ?? null);
    const [visible, setVisible] = useState(Boolean(live?.target));

    useEffect(() => subscribeTabDock(() => setLive(getTabDockLive())), []);

    const preview = live?.target?.preview ?? null;

    useEffect(() => {
        if (preview) {
            setHeld(preview);
            const frame = requestAnimationFrame(() => setVisible(true));
            return () => cancelAnimationFrame(frame);
        }
        setVisible(false);
        const hide = window.setTimeout(() => setHeld(null), PREVIEW_FADE_MS);
        return () => window.clearTimeout(hide);
    }, [preview]);

    if (!held) return null;

    return (
        <div className="absolute inset-0 z-40 pointer-events-none" aria-hidden>
            <div
                className={cn(
                    'tab-dock-preview absolute rounded-lg bg-app-accent/25 border-2 border-app-accent/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]',
                    visible ? 'opacity-100' : 'opacity-0',
                )}
                style={{
                    left: held.left,
                    top: held.top,
                    width: held.width,
                    height: held.height,
                }}
            />
        </div>
    );
}
