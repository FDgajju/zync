import { useAppStore } from '../../store/useAppStore';

export function confirmPluginTerminalAction(
    pluginId: string,
    action: string,
    command: string,
): Promise<boolean> {
    return useAppStore.getState().showConfirmDialog({
        title: 'Allow plugin terminal action?',
        message: `Plugin "${pluginId}" wants to ${action}: ${command}`,
        confirmText: 'Allow',
        cancelText: 'Cancel',
        variant: 'danger',
    });
}
