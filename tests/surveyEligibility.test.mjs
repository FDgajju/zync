import assert from 'node:assert/strict';
import { resolveSurveyPromptKind } from '../.tmp-agent-tests/src/features/survey/eligibility.js';

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ok ${name}`);
  } catch (error) {
    console.error(`  fail ${name}`);
    throw error;
  }
}

runTest('shows install survey until completed', () => {
  assert.equal(
    resolveSurveyPromptKind({ installCompleted: false, releaseSeenVersion: '' }, '2.26.0', ''),
    'install',
  );
});

runTest('shows release survey after updating from a prior version', () => {
  assert.equal(
    resolveSurveyPromptKind(
      { installCompleted: true, releaseSeenVersion: '2.25.8' },
      '2.26.0',
      '2.25.8',
    ),
    'release',
  );
});

runTest('skips when install done and release already seen', () => {
  assert.equal(
    resolveSurveyPromptKind(
      { installCompleted: true, releaseSeenVersion: '2.26.0' },
      '2.26.0',
      '2.26.0',
    ),
    null,
  );
});

runTest('skips release survey on fresh install with empty previous version', () => {
  assert.equal(
    resolveSurveyPromptKind(
      { installCompleted: true, releaseSeenVersion: '' },
      '2.26.0',
      '',
    ),
    null,
  );
});

console.log('Survey eligibility tests passed.');
