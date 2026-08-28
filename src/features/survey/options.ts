import type { SelectOption } from '../../components/ui/Select';
import type { FeedbackCategory } from './types.js';

export const ROLE_OPTIONS: SelectOption[] = [
  { value: 'developer', label: 'Developer' },
  { value: 'sre', label: 'SRE / DevOps' },
  { value: 'sysadmin', label: 'Sysadmin' },
  { value: 'student', label: 'Student' },
  { value: 'hobby', label: 'Hobby / learning' },
  { value: 'other', label: 'Other' },
];

export const WORK_CONTEXT_OPTIONS: SelectOption[] = [
  { value: 'personal', label: 'Independent / personal' },
  { value: 'startup', label: 'Startup' },
  { value: 'company', label: 'Company' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'education', label: 'School / university' },
  { value: 'other', label: 'Other' },
];

export const DISCOVERY_OPTIONS: SelectOption[] = [
  { value: 'github', label: 'GitHub' },
  { value: 'website', label: 'Website' },
  { value: 'producthunt', label: 'Product Hunt' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'ai', label: 'AI suggested' },
  { value: 'search', label: 'Search (Google, etc.)' },
  { value: 'friend', label: 'Friend / coworker' },
  { value: 'reddit', label: 'Reddit' },
  { value: 'other', label: 'Other' },
];

export const RECOMMEND_OPTIONS: SelectOption[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'somewhat', label: 'Somewhat' },
  { value: 'no', label: 'Not yet' },
];

export const FEEDBACK_CATEGORY_OPTIONS: Array<SelectOption & { value: FeedbackCategory }> = [
  { value: 'bug', label: 'Bug report' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'feature', label: 'Feature idea' },
  { value: 'praise', label: 'Something I like' },
  { value: 'other', label: 'Other' },
];
