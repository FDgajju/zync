import { useState } from 'react';
import { DEFAULT_STATUS_BAR_SETTINGS } from '../../../features/statusBar/settings';
import type { AppSettings } from '../../../store/settingsSlice';
import { useAppStore } from '../../../store/useAppStore';
import { Section } from '../common/Section';
import { Toggle } from '../common/Toggle';

interface StatusBarTabProps {
    settings: AppSettings;
    updateStatusBarSettings: (updates: Partial<AppSettings['statusBar']>) => Promise<void>;
}

export function StatusBarTab({ settings, updateStatusBarSettings }: StatusBarTabProps) {
    const [isUpdating, setIsUpdating] = useState(false);
    const showToast = useAppStore((state) => state.showToast);
    const showConnectionLatency =
        settings.statusBar?.showConnectionLatency ?? DEFAULT_STATUS_BAR_SETTINGS.showConnectionLatency;

    const runUpdate = async (work: () => Promise<void>) => {
        setIsUpdating(true);
        try {
            await work();
        } catch (error) {
            console.error('Failed to update status bar settings', error);
            const message = error instanceof Error ? error.message : String(error);
            showToast('error', `Failed to save status bar setting: ${message}`);
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <Section title="Connection">
                <Toggle
                    label="Show connection latency"
                    description="Display live SSH round-trip time next to the connected host. Hidden for local terminals and while disconnected."
                    checked={showConnectionLatency}
                    disabled={isUpdating}
                    onChange={(value) => {
                        void runUpdate(() => updateStatusBarSettings({ showConnectionLatency: value }));
                    }}
                />
            </Section>
        </div>
    );
}
