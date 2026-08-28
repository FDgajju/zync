import test from 'node:test';
import assert from 'node:assert/strict';

// Keep in sync with src/features/survey/eligibility.ts (plain node:test; no TS runner).
function resolveSurveyPromptKind(survey, currentVersion, previousSeenVersion) {
  if (!currentVersion) return null;
  if (survey.installCompleted) return null;
  if (previousSeenVersion && previousSeenVersion !== currentVersion) {
    return 'release';
  }
  return 'install';
}

const fresh = {
  installCompleted: false,
  releaseSeenVersion: '',
  lastRole: '',
  lastWorkContext: '',
  lastDiscoverySource: '',
};

test('brand-new install shows welcome survey', () => {
  assert.equal(resolveSurveyPromptKind(fresh, '2.26.1', ''), 'install');
});

test('existing user upgrading shows Help Zync improve', () => {
  assert.equal(resolveSurveyPromptKind(fresh, '2.26.1', '2.26.0'), 'release');
  assert.equal(resolveSurveyPromptKind(fresh, '2.26.0', '2.25.8'), 'release');
});

test('after skip/submit never shows again', () => {
  const done = { ...fresh, installCompleted: true, releaseSeenVersion: '2.26.1' };
  assert.equal(resolveSurveyPromptKind(done, '2.26.1', '2.26.0'), null);
  assert.equal(resolveSurveyPromptKind(done, '2.27.0', '2.26.1'), null);
});
