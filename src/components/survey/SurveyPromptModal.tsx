import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import {
  DISCOVERY_OPTIONS,
  RECOMMEND_OPTIONS,
  ROLE_OPTIONS,
  WORK_CONTEXT_OPTIONS,
  resolveSurveyArch,
  resolveSurveyPlatform,
  splitPrefillValue,
  submitSurvey,
  type SurveyPrefill,
  type SurveyPromptKind,
} from '../../features/survey';

export function SurveyPromptModal({
  open,
  kind,
  appVersion,
  prefill,
  onCompleted,
}: {
  open: boolean;
  kind: SurveyPromptKind;
  appVersion: string;
  prefill?: SurveyPrefill;
  onCompleted: (result: 'submitted' | 'skipped', prefs?: SurveyPrefill) => void;
}) {
  const [role, setRole] = useState('');
  const [roleOther, setRoleOther] = useState('');
  const [workContext, setWorkContext] = useState('');
  const [workContextOther, setWorkContextOther] = useState('');
  const [discoverySource, setDiscoverySource] = useState('');
  const [discoveryOther, setDiscoveryOther] = useState('');
  const [wouldRecommend, setWouldRecommend] = useState('');
  const [email, setEmail] = useState('');
  const [wantUpdates, setWantUpdates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);
  const firstFieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const rolePrefill = splitPrefillValue(prefill?.lastRole, ROLE_OPTIONS);
    const workPrefill = splitPrefillValue(prefill?.lastWorkContext, WORK_CONTEXT_OPTIONS);
    const discoveryPrefill = splitPrefillValue(prefill?.lastDiscoverySource, DISCOVERY_OPTIONS);
    setRole(rolePrefill.value);
    setRoleOther(rolePrefill.other);
    setWorkContext(workPrefill.value);
    setWorkContextOther(workPrefill.other);
    setDiscoverySource(discoveryPrefill.value);
    setDiscoveryOther(discoveryPrefill.other);
    setWouldRecommend('');
    setEmail('');
    setWantUpdates(false);
    setSubmitting(false);
    setError(null);
    setThanks(false);

    const timer = window.setTimeout(() => {
      const trigger = firstFieldRef.current?.querySelector('button');
      trigger?.focus();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [open, kind, appVersion, prefill?.lastRole, prefill?.lastWorkContext, prefill?.lastDiscoverySource]);

  const title = kind === 'install' ? 'Welcome to Zync' : 'Help Zync improve';
  const subtitle =
    kind === 'install'
      ? 'Quick optional intro so we can learn who uses Zync. All fields are optional. You can skip anytime.'
      : `Thanks for updating to v${appVersion}. All fields are optional. You can skip anytime.`;

  const buildPrefs = (resolvedRole?: string, resolvedWork?: string): SurveyPrefill => ({
    lastRole: resolvedRole || role || undefined,
    lastWorkContext: resolvedWork || workContext || undefined,
    lastDiscoverySource: discoverySource || undefined,
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const resolvedRole =
        role === 'other'
          ? (roleOther.trim().slice(0, 64) || 'other')
          : (role || undefined);
      const resolvedWorkContext =
        workContext === 'other'
          ? (workContextOther.trim().slice(0, 64) || 'other')
          : (workContext || undefined);

      await submitSurvey({
        schemaVersion: 1,
        surveyId: kind === 'install' ? 'install' : `release:${appVersion}`,
        appVersion,
        platform: resolveSurveyPlatform(),
        arch: resolveSurveyArch(),
        role: resolvedRole,
        workContext: resolvedWorkContext,
        discoverySource: discoverySource || undefined,
        discoveryOther:
          discoverySource === 'other' && discoveryOther.trim()
            ? discoveryOther.trim().slice(0, 120)
            : undefined,
        wouldRecommend:
          kind === 'release'
          && (wouldRecommend === 'yes' || wouldRecommend === 'somewhat' || wouldRecommend === 'no')
            ? wouldRecommend
            : undefined,
        email: wantUpdates && email.trim() ? email.trim() : undefined,
        wantUpdates: Boolean(wantUpdates && email.trim()),
        locale: navigator.language || undefined,
        submittedAt: new Date().toISOString(),
        submittedFrom: 'app',
      });
      setThanks(true);
      window.setTimeout(() => {
        onCompleted('submitted', buildPrefs(resolvedRole, resolvedWorkContext));
      }, 1100);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => {
        if (thanks || submitting) return;
        onCompleted('skipped');
      }}
      title={thanks ? 'Thank you' : title}
      subtitle={thanks ? undefined : subtitle}
      width="max-w-lg"
      showCloseButton={!thanks}
      explicitDismissOnly={thanks}
    >
      {thanks ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="text-app-success" size={36} />
          <p className="text-sm text-app-text">
            {kind === 'install' ? 'Welcome aboard.' : 'Thanks for helping Zync improve.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
            <div className="space-y-1.5" ref={firstFieldRef} data-survey-first-field>
              <label className="text-xs font-medium text-app-muted">What best describes you?</label>
              <Select value={role} onChange={setRole} options={ROLE_OPTIONS} placeholder="Select…" showSearch={false} portal />
              {role === 'other' && (
                <input
                  value={roleOther}
                  onChange={(e) => setRoleOther(e.target.value)}
                  maxLength={64}
                  placeholder="Your role…"
                  className="h-9 w-full rounded-md border border-app-border bg-app-bg px-3 text-sm text-app-text outline-none focus:border-app-accent/50"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-app-muted">Company / organization</label>
              <Select
                value={workContext}
                onChange={setWorkContext}
                options={WORK_CONTEXT_OPTIONS}
                placeholder="Select…"
                showSearch={false}
                portal
              />
              {workContext === 'other' && (
                <input
                  value={workContextOther}
                  onChange={(e) => setWorkContextOther(e.target.value)}
                  maxLength={64}
                  placeholder="Tell us briefly…"
                  className="h-9 w-full rounded-md border border-app-border bg-app-bg px-3 text-sm text-app-text outline-none focus:border-app-accent/50"
                />
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-app-muted">How did you find Zync?</label>
            <Select
              value={discoverySource}
              onChange={setDiscoverySource}
              options={DISCOVERY_OPTIONS}
              placeholder="Select…"
              showSearch={false}
              portal
            />
            {discoverySource === 'other' && (
              <input
                value={discoveryOther}
                onChange={(e) => setDiscoveryOther(e.target.value)}
                maxLength={120}
                placeholder="Tell us briefly…"
                className="h-9 w-full rounded-md border border-app-border bg-app-bg px-3 text-sm text-app-text outline-none focus:border-app-accent/50"
              />
            )}
          </div>

          {kind === 'release' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-app-muted">Would you recommend Zync?</label>
              <Select
                value={wouldRecommend}
                onChange={setWouldRecommend}
                options={RECOMMEND_OPTIONS}
                placeholder="Optional…"
                showSearch={false}
                portal
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-app-muted">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  const next = e.target.value;
                  setEmail(next);
                  if (!next.trim()) setWantUpdates(false);
                }}
                placeholder="you@example.com"
                className="h-9 w-full rounded-md border border-app-border bg-app-bg px-3 text-sm text-app-text outline-none focus:border-app-accent/50"
              />
            </div>
            <label
              className={`flex items-center gap-2 text-xs ${
                email.trim() ? 'text-app-muted' : 'text-app-muted/45'
              }`}
            >
              <input
                type="checkbox"
                checked={wantUpdates}
                disabled={!email.trim()}
                onChange={(e) => setWantUpdates(e.target.checked)}
                className="rounded border-app-border disabled:opacity-40"
              />
              Get updates from Zync
            </label>
          </div>

          {error && (
            <p className="text-xs text-app-danger">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={submitting}
              onClick={() => onCompleted('skipped')}
            >
              Skip
            </Button>
            <Button size="sm" isLoading={submitting} onClick={() => { void handleSubmit(); }}>
              Submit
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
