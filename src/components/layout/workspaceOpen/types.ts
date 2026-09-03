import type { ShellEntry } from '../../../lib/shells/types';
import type { FeatureId } from '../featureMeta';

export type WorkspaceOpenGroup = 'create' | 'shells' | 'open';

export type WorkspaceOpenKind = 'new-shell' | 'other-shells' | 'shell' | 'feature';

export type WorkspaceOpenView = 'root' | 'shells';

/** Present when the menu was dismissed with Escape (focus should return to the opener). */
export type WorkspaceOpenCloseSource = 'keyboard';

export type WorkspaceOpenItem = {
    id: string;
    group: WorkspaceOpenGroup;
    kind: WorkspaceOpenKind;
    label: string;
    keywords: string[];
    disabled?: boolean;
    hint?: string;
    shell?: ShellEntry;
    featureId?: FeatureId;
};

export type WorkspaceOpenFeatureState = {
    id: FeatureId;
    isOpen: boolean;
    isActive: boolean;
};
