import type { SelectOption } from '../../components/ui/Select';

/** Map a stored value onto a select option, falling back to Other + free text. */
export function splitPrefillValue(
  stored: string | undefined,
  options: SelectOption[],
): { value: string; other: string } {
  const trimmed = (stored ?? '').trim();
  if (!trimmed) return { value: '', other: '' };
  if (options.some((option) => option.value === trimmed)) {
    return { value: trimmed, other: '' };
  }
  return { value: 'other', other: trimmed.slice(0, 64) };
}
