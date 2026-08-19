import { StateCreator } from 'zustand';

export interface ConfirmDialogOpts {
    id: number;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'primary' | 'danger';
    onConfirm: () => void;
    onCancel: () => void;
}

export interface UiSlice {
    confirmDialog: ConfirmDialogOpts | null;
    confirmDialogQueue: ConfirmDialogOpts[];
    showConfirmDialog: (opts: Omit<ConfirmDialogOpts, 'id' | 'onConfirm' | 'onCancel'>) => Promise<boolean>;
    closeConfirmDialog: () => void;
    editorDiagnosticsVisible: boolean;
    editorDiagnosticsCount: number;
    editorDiagnosticsSeverity: 'warning' | 'error' | null;
    setEditorDiagnosticsVisible: (visible: boolean) => void;
    setEditorDiagnosticsSummary: (count: number, severity: 'warning' | 'error' | null) => void;
    clearEditorDiagnosticsSummary: () => void;
}

let nextConfirmDialogId = 0;

export const createUiSlice: StateCreator<UiSlice, [], [], UiSlice> = (set, get) => ({
    confirmDialog: null,
    confirmDialogQueue: [],
    editorDiagnosticsVisible: false,
    editorDiagnosticsCount: 0,
    editorDiagnosticsSeverity: null,
    showConfirmDialog: (opts) => {
        return new Promise((resolve) => {
            const id = ++nextConfirmDialogId;
            const settle = (value: boolean) => {
                if (get().confirmDialog?.id !== id) return;
                const [nextDialog, ...remaining] = get().confirmDialogQueue;
                set({
                    confirmDialog: nextDialog ?? null,
                    confirmDialogQueue: remaining,
                });
                resolve(value);
            };
            const dialog: ConfirmDialogOpts = {
                ...opts,
                id,
                onConfirm: () => settle(true),
                onCancel: () => settle(false),
            };

            set(state => state.confirmDialog ? {
                confirmDialogQueue: [...state.confirmDialogQueue, dialog],
            } : {
                confirmDialog: dialog,
            });
        });
    },
    closeConfirmDialog: () => {
        get().confirmDialog?.onCancel();
    },
    setEditorDiagnosticsVisible: (visible) => {
        set({ editorDiagnosticsVisible: visible });
    },
    setEditorDiagnosticsSummary: (count, severity) => {
        set({
            editorDiagnosticsCount: count,
            editorDiagnosticsSeverity: severity,
            editorDiagnosticsVisible: count > 0 ? get().editorDiagnosticsVisible : false,
        });
    },
    clearEditorDiagnosticsSummary: () => {
        set({
            editorDiagnosticsCount: 0,
            editorDiagnosticsSeverity: null,
            editorDiagnosticsVisible: false,
        });
    },
});
