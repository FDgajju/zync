import { useCallback, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import {
    findLayoutOwner,
    findNode,
    isPaneLeaf,
    isPaneSplit,
    type PaneLayout,
    type PaneNode,
} from '../../lib/paneLayout';
import { useAppStore } from '../../store/useAppStore';
import { TerminalComponent } from './Terminal';
import { PaneDivider } from './PaneDivider';

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

    const renderNode = (node: PaneNode): ReactNode => {
        if (isPaneLeaf(node)) {
            if (node.content.kind !== 'term') return null;
            const focused = layout.activePaneId === node.id;
            return (
                <div
                    key={node.id}
                    data-pane-id={node.id}
                    className={cn(
                        'h-full w-full min-h-0 min-w-0 overflow-hidden',
                        focused ? 'ring-1 ring-inset ring-app-accent/35' : 'ring-0',
                    )}
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
                </div>
            );
        }

        const stacked = node.direction === 'vertical';
        return (
            <div
                key={node.id}
                className={cn('flex h-full w-full min-h-0 min-w-0', stacked ? 'flex-col' : 'flex-row')}
            >
                <div
                    className="min-h-0 min-w-0 overflow-hidden"
                    style={{ flexGrow: node.sizes[0], flexShrink: 1, flexBasis: 0 }}
                >
                    {renderNode(node.children[0])}
                </div>
                <PaneDivider
                    direction={node.direction}
                    onDrag={(ratio) => onDrag(node.id, ratio)}
                    onDragEnd={() => onDragEnd(node.id)}
                />
                <div
                    className="min-h-0 min-w-0 overflow-hidden"
                    style={{ flexGrow: node.sizes[1], flexShrink: 1, flexBasis: 0 }}
                >
                    {renderNode(node.children[1])}
                </div>
            </div>
        );
    };

    return <div className="absolute inset-0">{renderNode(layout.root)}</div>;
}
