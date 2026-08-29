import { useState } from 'react';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';
import { Section } from '../common/Section';
import {
  FEEDBACK_CATEGORY_OPTIONS,
  buildGitHubFeedbackIssueUrl,
  resolveAppVersion,
  resolveSurveyArch,
  resolveSurveyPlatform,
  submitFeedback,
  type FeedbackCategory,
} from '../../../features/survey';
import { useAppStore } from '../../../store/useAppStore';

export function FeedbackTab() {
  const showToast = useAppStore((state) => state.showToast);
  const [category, setCategory] = useState<FeedbackCategory>('improvement');
  const [message, setMessage] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [allowContact, setAllowContact] = useState(false);
  const [reproSteps, setReproSteps] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const openGitHubIssue = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      showToast('error', 'Please write at least a short message (10+ characters).');
      return;
    }
    try {
      const appVersion = await resolveAppVersion();
      const url = buildGitHubFeedbackIssueUrl({
        category,
        message: trimmed,
        reproSteps: category === 'bug' ? reproSteps : undefined,
        appVersion: appVersion || undefined,
        platform: resolveSurveyPlatform(),
      });
      await window.ipcRenderer.invoke('shell:open', url);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not open GitHub');
    }
  };

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      showToast('error', 'Please write at least a short message (10+ characters).');
      return;
    }

    setSubmitting(true);
    try {
      const appVersion = await resolveAppVersion();
      await submitFeedback({
        schemaVersion: 1,
        category,
        message: trimmed,
        appVersion: appVersion || 'unknown',
        platform: resolveSurveyPlatform(),
        arch: resolveSurveyArch(),
        contactEmail: allowContact && contactEmail.trim() ? contactEmail.trim() : undefined,
        allowContact: Boolean(allowContact && contactEmail.trim()),
        submittedAt: new Date().toISOString(),
        submittedFrom: 'app',
        bugContext:
          category === 'bug' && reproSteps.trim()
            ? { reproSteps: reproSteps.trim().slice(0, 2000) }
            : undefined,
      });
      setMessage('');
      setReproSteps('');
      setContactEmail('');
      setAllowContact(false);
      showToast('success', 'Thanks — feedback sent.');
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const friendly = raw.includes("Couldn't reach the server")
        ? "Couldn't reach the server. Check your connection and try again."
        : raw;
      showToast('error', friendly);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Section title="Send feedback">
        <div className="space-y-4 rounded-lg border border-app-border bg-app-surface/40 p-4">
          <p className="text-xs text-app-muted">
            Send bugs, ideas, or praise anytime.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-app-muted">Category</label>
            <Select
              value={category}
              onChange={(value) => setCategory(value as FeedbackCategory)}
              options={FEEDBACK_CATEGORY_OPTIONS}
              showSearch={false}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-app-muted">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder="What’s on your mind?"
              className="w-full resize-y rounded-md border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-app-accent/50"
            />
          </div>

          {category === 'bug' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-app-muted">Steps to reproduce (optional)</label>
              <textarea
                value={reproSteps}
                onChange={(e) => setReproSteps(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="1. …  2. …  3. …"
                className="w-full resize-y rounded-md border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-app-accent/50"
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-app-muted">Email</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => {
                  const next = e.target.value;
                  setContactEmail(next);
                  if (!next.trim()) setAllowContact(false);
                }}
                placeholder="you@example.com"
                className="h-9 w-full rounded-md border border-app-border bg-app-bg px-3 text-sm text-app-text outline-none focus:border-app-accent/50"
              />
            </div>
            <label
              className={`flex items-center gap-2 text-xs ${
                contactEmail.trim() ? 'text-app-muted' : 'text-app-muted/45'
              }`}
            >
              <input
                type="checkbox"
                checked={allowContact}
                disabled={!contactEmail.trim()}
                onChange={(e) => setAllowContact(e.target.checked)}
                className="rounded border-app-border disabled:opacity-40"
              />
              It’s OK to contact me about this feedback
            </label>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => { void openGitHubIssue(); }}
              className="text-left text-xs text-app-muted transition-colors hover:text-app-text"
            >
              Want it public? Open a GitHub issue
            </button>
            <Button size="sm" isLoading={submitting} onClick={() => { void handleSubmit(); }}>
              Send feedback
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}
