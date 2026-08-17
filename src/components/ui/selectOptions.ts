import type { SelectOption } from './Select';

/**
 * When the current value is not in the option list (uninstalled distro/plugin, etc.),
 * inject a leading option so the Select does not show a blank "Select..." label.
 */
export function withOrphanSelectOption(
    options: SelectOption[],
    value: string | undefined | null,
    orphan: { label: string; description?: string; icon?: SelectOption['icon'] },
): SelectOption[] {
    if (value == null || value === '') {
        return options;
    }
    if (options.some((option) => option.value === value)) {
        return options;
    }
    return [
        {
            value,
            label: orphan.label,
            description: orphan.description ?? value,
            icon: orphan.icon,
        },
        ...options,
    ];
}
