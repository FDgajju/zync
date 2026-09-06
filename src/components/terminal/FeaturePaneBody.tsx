import { lazy, Suspense } from 'react';
import type { SplitFeatureId } from '../../lib/paneLayout';

const FileManager = lazy(() => import('../FileManager').then((module) => ({ default: module.FileManager })));
const Dashboard = lazy(() => import('../dashboard/Dashboard').then((module) => ({ default: module.Dashboard })));
const TunnelManager = lazy(() => import('../tunnel/TunnelManager').then((module) => ({ default: module.TunnelManager })));
const SnippetsManager = lazy(() => import('../snippets/SnippetsManager').then((module) => ({ default: module.SnippetsManager })));

function FeaturePaneFallback() {
    return <div className="h-full w-full bg-app-bg" />;
}

export function FeaturePaneBody({
    connectionId,
    featureId,
    visible,
}: {
    connectionId: string;
    featureId: SplitFeatureId;
    visible: boolean;
}) {
    return (
        <Suspense fallback={<FeaturePaneFallback />}>
            {featureId === 'files' && (
                <FileManager connectionId={connectionId} surface="pane" />
            )}
            {featureId === 'dashboard' && (
                <Dashboard connectionId={connectionId} isVisible={visible} />
            )}
            {featureId === 'port-forwarding' && (
                <TunnelManager connectionId={connectionId} />
            )}
            {featureId === 'snippets' && (
                <SnippetsManager connectionId={connectionId} />
            )}
        </Suspense>
    );
}
