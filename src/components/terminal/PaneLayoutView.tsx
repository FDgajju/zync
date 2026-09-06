import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { FolderOpen, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
    findLayoutOwner,
    findNode,
    introStartSizes,
    isFeatureContent,
    isPaneLeaf,
    isPaneSplit,
    isTermContent,
    markSplitIntro,
    takeSplitIntro,
    SPLIT_INTRO_MS,
    type PaneLayout,
    type PaneNode,
    type SplitDirection,
    type SplitFeatureId,
    type SplitIntro,
} from '../../lib/paneLayout';
import { beginPaneSplitIntro, endPaneSplitIntro } from '../../lib/terminal';
import { FEATURE_META } from '../layout/featureMeta';
import { useAppStore } from '../../store/useAppStore';
import { TerminalComponent } from './Terminal';
import { PaneDivider } from './PaneDivider';
import { FeaturePaneBody } from './FeaturePaneBody';

type InternalEdges = {
    top?: boolean;
    right?: boolean;
    bottom?: boolean;
    left?: boolean;
};

function SplitBranch({
    grow,
    intro,
    incoming,
    children,
}: {
    grow: number;
    intro: boolean;
    incoming: boolean;
    children: ReactNode;
}) {
    return (
        <div
            className={cn('pane-split-branch relative', intro && 'is-intro')}
            style={{ flexGrow: grow, flexShrink: 1, flexBasis: 0 }}
        >
            {children}
            {intro && incoming && <div aria-hidden className="pane-split-intro-veil" />}
        </div>
    );
}

function layoutHasSplitNode(connectionId: string, splitId: string): boolean {
    const groups = useAppStore.getState().paneLayouts[connectionId];
    if (!groups) return false;
    for (const layout of Object.values(groups)) {
        if (findNode(layout.root, splitId)) return true;
    }
    return false;
}

function SplitFrame({
    connectionId,
    splitId,
    direction,
    sizes,
    first,
    second,
    onDrag,
    onDragEnd,
    onEqualize,
}: {
    connectionId: string;
    splitId: string;
    direction: SplitDirection;
    sizes: [number, number];
    first: ReactNode;
    second: ReactNode;
    onDrag: (ratio: number) => void;
    onDragEnd: () => void;
    onEqualize: () => void;
}) {
    const [intro, setIntro] = useState<SplitIntro | null>(null);
    const [grow, setGrow] = useState<[number, number]>(sizes);
    const sizesRef = useRef(sizes);
    sizesRef.current = sizes;
    const cancelIntroRef = useRef<(() => void) | null>(null);

    useLayoutEffect(() => {
        const taken = takeSplitIntro(splitId);
        if (!taken) return undefined;

        let finished = false;
        setIntro(taken);
        setGrow(introStartSizes(taken.incomingIndex));
        beginPaneSplitIntro();

        const finish = (announce: boolean) => {
            if (finished) return;
            finished = true;
            cancelIntroRef.current = null;
            setIntro(null);
            const settled = endPaneSplitIntro();
            if (announce && settled) {
                window.dispatchEvent(new Event('zync:pane-resize-end'));
            }
        };

        const target: [number, number] = [sizesRef.current[0], sizesRef.current[1]];
        let innerRaf = 0;
        const outerRaf = requestAnimationFrame(() => {
            innerRaf = requestAnimationFrame(() => setGrow(target));
        });
        const done = window.setTimeout(() => finish(true), SPLIT_INTRO_MS);
        cancelIntroRef.current = () => {
            cancelAnimationFrame(outerRaf);
            cancelAnimationFrame(innerRaf);
            window.clearTimeout(done);
            finish(false);
        };

        return () => {
            cancelAnimationFrame(outerRaf);
            cancelAnimationFrame(innerRaf);
            window.clearTimeout(done);
            cancelIntroRef.current = null;
            if (!finished) {
                endPaneSplitIntro();
                if (layoutHasSplitNode(connectionId, splitId)) {
                    markSplitIntro(splitId, taken.incomingIndex);
                }
            }
        };
    }, [connectionId, splitId]);

    const stopIntro = useCallback(() => {
        cancelIntroRef.current?.();
    }, []);

    const liveGrow = intro ? grow : sizes;
    const stacked = direction === 'vertical';

    return (
        <div className={cn('relative flex h-full w-full min-h-0 min-w-0', stacked ? 'flex-col' : 'flex-row')}>
            <SplitBranch grow={liveGrow[0]} intro={Boolean(intro)} incoming={intro?.incomingIndex === 0}>
                {first}
            </SplitBranch>
            <PaneDivider
                direction={direction}
                firstRatio={liveGrow[0]}
                onDrag={(ratio) => {
                    stopIntro();
                    onDrag(ratio);
                }}
                onDragEnd={onDragEnd}
                onEqualize={() => {
                    stopIntro();
                    onEqualize();
                }}
            />
            <SplitBranch grow={liveGrow[1]} intro={Boolean(intro)} incoming={intro?.incomingIndex === 1}>
                {second}
            </SplitBranch>
        </div>
    );
}

function FocusEdges({ edges }: { edges: InternalEdges }) {
    const line = 'pointer-events-none absolute z-10 bg-app-accent/60';
    return (
        <>
            {edges.top && <div aria-hidden className={cn(line, 'inset-x-0 top-0 h-px')} />}
            {edges.right && <div aria-hidden className={cn(line, 'inset-y-0 right-0 w-px')} />}
            {edges.bottom && <div aria-hidden className={cn(line, 'inset-x-0 bottom-0 h-px')} />}
            {edges.left && <div aria-hidden className={cn(line, 'inset-y-0 left-0 w-px')} />}
        </>
    );
}

function FeaturePaneLeaf({
    connectionId,
    paneId,
    featureId,
    focused,
    showFocus,
    panelVisible,
    edges,
    onFocus,
    onClose,
}: {
    connectionId: string;
    paneId: string;
    featureId: SplitFeatureId;
    focused: boolean;
    showFocus: boolean;
    panelVisible: boolean;
    edges: InternalEdges;
    onFocus: () => void;
    onClose: () => void;
}) {
    const meta = FEATURE_META[featureId];
    const Icon = meta?.icon ?? FolderOpen;
    const label = meta?.label ?? featureId;

    return (
        <div
            data-pane-id={paneId}
            className="relative h-full w-full min-h-0 min-w-0 overflow-hidden flex flex-col bg-app-bg"
            onMouseDown={onFocus}
        >
            <div className="h-7 shrink-0 flex items-center gap-1.5 px-2 border-b border-app-border/60 bg-app-panel">
                <Icon size={12} className={cn(focused ? 'text-app-accent' : 'text-app-muted')} />
                <span className="flex-1 truncate text-[11px] font-medium text-app-text">{label}</span>
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onClose();
                    }}
                    className="h-5 w-5 inline-flex items-center justify-center rounded text-app-muted hover:bg-app-bg hover:text-red-400"
                    aria-label={`Close ${label} pane`}
                    title={`Close ${label}`}
                >
                    <X size={12} />
                </button>
            </div>
            <div className="flex-1 min-h-0 min-w-0" inert={!focused ? true : undefined}>
                <FeaturePaneBody
                    connectionId={connectionId}
                    featureId={featureId}
                    visible={focused && panelVisible}
                />
            </div>
            {showFocus && <FocusEdges edges={edges} />}
        </div>
    );
}

export function PaneLayoutView({
    connectionId,
    layout,
    workspaceActive,
    panelVisible,
}: {
    connectionId: string;
    layout: PaneLayout;
    workspaceActive: boolean;
    panelVisible: boolean;
}) {
    const focusPane = useAppStore(state => state.focusPane);
    const resizePanes = useAppStore(state => state.resizePanes);
    const closeFeatureInSplit = useAppStore(state => state.closeFeatureInSplit);

    const onDrag = useCallback((splitId: string, firstRatio: number) => {
        resizePanes(connectionId, splitId, [firstRatio, 1 - firstRatio], false);
    }, [connectionId, resizePanes]);

    const onDragEnd = useCallback((splitId: string) => {
        const store = useAppStore.getState();
        const activeId = store.activeTerminalIds[connectionId];
        if (!activeId) return;
        const owner = findLayoutOwner(store.paneLayouts[connectionId], activeId);
        const current = owner ? store.paneLayouts[connectionId]?.[owner] : undefined;
        if (!current) return;
        const node = findNode(current.root, splitId);
        if (node && isPaneSplit(node)) {
            resizePanes(connectionId, splitId, node.sizes, true);
        }
    }, [connectionId, resizePanes]);

    const onEqualize = useCallback((splitId: string) => {
        resizePanes(connectionId, splitId, [0.5, 0.5], true);
        window.dispatchEvent(new Event('zync:pane-resize-end'));
    }, [connectionId, resizePanes]);

    const renderNode = (node: PaneNode, edges: InternalEdges = {}): ReactNode => {
        if (isPaneLeaf(node)) {
            const focused = layout.activePaneId === node.id;
            const showFocus = focused && workspaceActive && panelVisible;
            if (isFeatureContent(node.content)) {
                const featureId = node.content.featureId;
                return (
                    <FeaturePaneLeaf
                        key={node.id}
                        connectionId={connectionId}
                        paneId={node.id}
                        featureId={featureId}
                        focused={focused}
                        showFocus={showFocus}
                        panelVisible={panelVisible}
                        edges={edges}
                        onFocus={() => focusPane(connectionId, node.id)}
                        onClose={() => closeFeatureInSplit(connectionId, featureId)}
                    />
                );
            }
            if (!isTermContent(node.content)) return null;
            return (
                <div
                    key={node.id}
                    data-pane-id={node.id}
                    className="relative h-full w-full min-h-0 min-w-0 overflow-hidden"
                    onMouseDown={(event) => {
                        focusPane(connectionId, node.id);
                        if (!(event.target instanceof Element) || !event.target.closest('.xterm')) {
                            const helper = event.currentTarget.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea');
                            helper?.focus();
                        }
                    }}
                >
                    <TerminalComponent
                        connectionId={connectionId}
                        termId={node.content.termId}
                        isWorkspaceActive={workspaceActive}
                        isTerminalView
                        isActiveTab
                        isFocused={focused}
                        isVisible={panelVisible}
                    />
                    {showFocus && <FocusEdges edges={edges} />}
                </div>
            );
        }

        const stacked = node.direction === 'vertical';
        return (
            <SplitFrame
                key={node.id}
                connectionId={connectionId}
                splitId={node.id}
                direction={node.direction}
                sizes={node.sizes}
                first={renderNode(
                    node.children[0],
                    stacked ? { ...edges, bottom: true } : { ...edges, right: true },
                )}
                second={renderNode(
                    node.children[1],
                    stacked ? { ...edges, top: true } : { ...edges, left: true },
                )}
                onDrag={(ratio) => onDrag(node.id, ratio)}
                onDragEnd={() => onDragEnd(node.id)}
                onEqualize={() => onEqualize(node.id)}
            />
        );
    };

    return <div className="absolute inset-0">{renderNode(layout.root)}</div>;
}
