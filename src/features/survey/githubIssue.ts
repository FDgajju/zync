import type { FeedbackCategory } from './types.js';

const GITHUB_NEW_ISSUE = 'https://github.com/zync-sh/zync/issues/new';

const CATEGORY_TITLE: Record<FeedbackCategory, string> = {
  bug: 'Bug',
  improvement: 'Improvement',
  feature: 'Feature',
  praise: 'Feedback',
  other: 'Feedback',
};

const CATEGORY_LABEL: Partial<Record<FeedbackCategory, string>> = {
  bug: 'bug',
  improvement: 'enhancement',
  feature: 'enhancement',
};

function firstLineTitle(message: string, category: FeedbackCategory): string {
  const cleaned = message.trim().replace(/\s+/g, ' ');
  const snippet = cleaned.slice(0, 72);
  const prefix = CATEGORY_TITLE[category];
  if (!snippet) return `[${prefix}]`;
  return `[${prefix}] ${snippet}${cleaned.length > 72 ? '…' : ''}`;
}

/** Prefills GitHub’s “new issue” form so the report can be public. */
export function buildGitHubFeedbackIssueUrl(input: {
  category: FeedbackCategory;
  message: string;
  reproSteps?: string;
  appVersion?: string;
  platform?: string;
}): string {
  const title = firstLineTitle(input.message, input.category);
  const lines = [
    input.message.trim(),
    '',
    '### Details',
    '',
    `- Category: \`${input.category}\``,
  ];
  if (input.appVersion) lines.push(`- App version: \`${input.appVersion}\``);
  if (input.platform) lines.push(`- Platform: \`${input.platform}\``);
  if (input.category === 'bug' && input.reproSteps?.trim()) {
    lines.push('', '### Steps to reproduce', '', input.reproSteps.trim());
  }
  lines.push('', '---', '_Sent from Zync Feedback_');

  const params = new URLSearchParams({
    title,
    body: lines.join('\n'),
  });
  const label = CATEGORY_LABEL[input.category];
  if (label) params.set('labels', label);

  return `${GITHUB_NEW_ISSUE}?${params.toString()}`;
}
