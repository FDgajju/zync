import assert from 'node:assert/strict';
import {
  extractActiveSegment,
  lineForSuggestionParsing,
} from '../.tmp-agent-tests/src/lib/ghostSuggestions/activeSegment.js';
import {
  shouldPreferPathSuggestion,
} from '../.tmp-agent-tests/src/lib/ghostSuggestions/client.js';
import {
  normalizeSuggestionSuffix,
} from '../.tmp-agent-tests/src/lib/ghostSuggestions/suggestionSuffix.js';
import {
  mergeTerminalCellDimensions,
  resolveGhostCellPosition,
  wrapCellPosition,
} from '../.tmp-agent-tests/src/lib/ghostSuggestions/cursorPosition.js';
import {
  codePointDisplayWidth,
  graphemeDisplayWidth,
  segmentTerminalCells,
  stringDisplayWidth,
} from '../.tmp-agent-tests/src/lib/ghostSuggestions/displayWidth.js';
import {
  handleGhostInputEvent,
} from '../.tmp-agent-tests/src/lib/ghostSuggestions/runtime.js';
import {
  expandTildePathForRemote,
  hasUnmatchedQuoteOnActiveToken,
  isBareDirectoryListingLine,
} from '../.tmp-agent-tests/src/lib/ghostSuggestions/commandTokens.js';
import {
  InputTracker,
} from '../.tmp-agent-tests/src/lib/ghostSuggestions/inputTracker.js';
import {
  extractCwdFromPromptOutput,
  extractPowerShellCwd,
} from '../.tmp-agent-tests/src/lib/ghostSuggestions/promptCwdSniffer.js';
import {
  resolveCdTargetPath,
} from '../.tmp-agent-tests/src/lib/ghostSuggestions/cwdTracking.js';
import {
  classifyInputEscape,
} from '../.tmp-agent-tests/src/lib/ghostSuggestions/escapeInput.js';
import {
  shouldSuppressGhostForNativeShell,
} from '../.tmp-agent-tests/src/lib/ghostSuggestions/shellSuppression.js';
import {
  shouldProbeZshAutosuggest,
  zshInitEnablesAutosuggestions,
} from '../.tmp-agent-tests/src/lib/ghostSuggestions/zshAutosuggestDetect.js';
import {
  cwdForWslPathCompletion,
  linuxPathLooksLikeWsl,
  resolveWslShellIdForPathCompletion,
  shellIdIndicatesWsl,
} from '../.tmp-agent-tests/src/lib/ghostSuggestions/wslShell.js';
import {
  extractRecentCommands,
} from '../.tmp-agent-tests/src/lib/ghostSuggestions/recentCommands.js';
import {
  clearSecretInputSniffer,
  detectSecretPromptInOutput,
  feedSecretInputSniffer,
} from '../.tmp-agent-tests/src/lib/ghostSuggestions/secretInputDetect.js';
async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${name}: ${message}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    } else {
      console.error(error);
    }
    throw error;
  }
}

async function withMockWindow(mockWindow, fn) {
  const originalWindow = globalThis.window;
  globalThis.window = mockWindow;
  try {
    await fn();
  } finally {
    globalThis.window = originalWindow;
  }
}

await runTest('extractPowerShellCwd reads PS path prompts with angle bracket', () => {
  const cwd = extractPowerShellCwd('Directory: E:\\work\r\nPS E:\\work\u203A cd ');
  assert.equal(cwd, 'E:\\work');
});

await runTest('extractPowerShellCwd reads classic PS greater-than prompt', () => {
  const cwd = extractPowerShellCwd('PS C:\\Users\\me\\projects> ');
  assert.equal(cwd, 'C:\\Users\\me\\projects');
});

await runTest('extractCwdFromPromptOutput prefers PowerShell match in mixed output', () => {
  const cwd = extractCwdFromPromptOutput('\x1b[32mPS E:\\work\u203A\x1b[0m ');
  assert.equal(cwd, 'E:\\work');
});

await runTest('handleGhostInputEvent accepts inline ghost with right arrow', () => {
  let accepted = '';
  const tracker = new InputTracker({
    onLineChange: () => {},
    onAccept: (suffix) => { accepted = suffix; },
    onDismiss: () => {},
    onHistoryCommit: () => {},
  });

  tracker.feed('git ');
  tracker.setSuggestion('status');

  const handled = handleGhostInputEvent('\x1b[C', tracker);
  assert.equal(handled, true);
  assert.equal(accepted, 'status');
  assert.equal(tracker.getLineBuffer(), 'git status');
});

await runTest('handleGhostInputEvent passes Tab to shell when no active suggestion', () => {
  const tracker = new InputTracker({
    onLineChange: () => {},
    onAccept: () => {},
    onDismiss: () => {},
    onHistoryCommit: () => {},
  });

  tracker.feed('git ');
  const handled = handleGhostInputEvent('\t', tracker);
  assert.equal(handled, false);
  assert.equal(tracker.isDesynced(), true);
});

await runTest('handleGhostInputEvent passes Tab to shell and dismisses ghost when suffix is active', () => {
  let accepted = '';
  let dismissed = 0;
  const tracker = new InputTracker({
    onLineChange: () => {},
    onAccept: (suffix) => { accepted = suffix; },
    onDismiss: () => { dismissed += 1; },
    onHistoryCommit: () => {},
  });

  for (const ch of 'git ') tracker.feed(ch);
  tracker.setSuggestion('status');

  const handled = handleGhostInputEvent('\t', tracker);
  assert.equal(handled, false);
  assert.equal(accepted, '');
  assert.equal(dismissed, 1);
  assert.equal(tracker.isDesynced(), true);
  assert.equal(tracker.getLineBuffer(), 'git ');
});

await runTest('InputTracker suppresses ghost fetches while desynced after Tab', () => {
  const changed = [];
  const tracker = new InputTracker({
    onLineChange: (line) => changed.push(line),
    onAccept: () => {},
    onDismiss: () => {},
    onHistoryCommit: () => {},
  });

  for (const ch of 'git ') tracker.feed(ch);
  tracker.feed('\t');
  tracker.feed('s');

  assert.equal(tracker.isDesynced(), true);
  assert.deepEqual(changed, ['g', 'gi', 'git', 'git ']);
});

await runTest('InputTracker skips history commit while desynced then resets on Enter', () => {
  let committed = null;
  const tracker = new InputTracker({
    onLineChange: () => {},
    onAccept: () => {},
    onDismiss: () => {},
    onHistoryCommit: (cmd) => { committed = cmd; },
  });

  for (const ch of 'git ') tracker.feed(ch);
  tracker.feed('\t');
  assert.equal(tracker.isDesynced(), true);

  tracker.feed('\r');
  assert.equal(committed, null);
  assert.equal(tracker.isDesynced(), false);
  assert.equal(tracker.getLineBuffer(), '');
});

await runTest('InputTracker resumes ghost tracking after Ctrl+C clears desync', () => {
  const changed = [];
  const tracker = new InputTracker({
    onLineChange: (line) => changed.push(line),
    onAccept: () => {},
    onDismiss: () => {},
    onHistoryCommit: () => {},
  });

  for (const ch of 'git ') tracker.feed(ch);
  tracker.feed('\t');
  tracker.feed('\x03');
  tracker.feed('l');

  assert.equal(tracker.isDesynced(), false);
  assert.deepEqual(changed, ['g', 'gi', 'git', 'git ', 'l']);
});

await runTest('resolveCdTargetPath resolves relative multi-segment cd targets', () => {
  assert.equal(resolveCdTargetPath('cd foo/bar', 'E:\\work'), 'E:\\work\\foo\\bar');
  assert.equal(resolveCdTargetPath('cd ./src/lib', '/home/me'), '/home/me/src/lib');
});

await runTest('resolveCdTargetPath parentDirectory handles tilde cwd', () => {
  assert.equal(resolveCdTargetPath('cd ..', '~/foo/bar'), '~/foo');
  assert.equal(resolveCdTargetPath('cd ..', '~/only'), '~');
  assert.equal(resolveCdTargetPath('cd ..', '~'), null);
});

await runTest('resolveCdTargetPath parentDirectory preserves Windows drive root', () => {
  assert.equal(resolveCdTargetPath('cd ..', 'C:\\'), 'C:\\');
  assert.equal(resolveCdTargetPath('cd ..', 'C:'), 'C:\\');
  assert.equal(resolveCdTargetPath('cd ..', 'E:\\work'), 'E:\\');
});

await runTest('isBareDirectoryListingLine matches bare cd token', () => {
  assert.equal(isBareDirectoryListingLine('cd'), true);
  assert.equal(isBareDirectoryListingLine('cd '), true);
  assert.equal(isBareDirectoryListingLine('cd data'), false);
});

await runTest('stringDisplayWidth matches terminal cell counts', () => {
  assert.equal(stringDisplayWidth('lsblk'), 5);
  assert.equal(stringDisplayWidth(''), 0);
  assert.equal(codePointDisplayWidth(0x0301), 0); // combining acute
  assert.equal(stringDisplayWidth('e\u0301'), 1); // e + combining mark
  // Fullwidth / CJK wide
  assert.equal(codePointDisplayWidth(0x4e2d), 2); // 中
  assert.equal(stringDisplayWidth('中'), 2);
});

await runTest('segmentTerminalCells sizes wide glyphs', () => {
  const ascii = segmentTerminalCells('blk');
  assert.equal(ascii.length, 3);
  assert.ok(ascii.every((s) => s.cells === 1));
  const wide = segmentTerminalCells('中');
  assert.equal(wide.length, 1);
  assert.equal(wide[0].cells, 2);
});

await runTest('segmentTerminalCells merges combining marks in code-point fallback', () => {
  const segs = segmentTerminalCells('e\u0301', { forceCodePointSplit: true });
  assert.equal(segs.length, 1);
  assert.equal(segs[0].text, 'e\u0301');
  assert.equal(segs[0].cells, 1);
  // No standalone zero-width span
  assert.ok(segs.every((s) => s.cells > 0));
});

await runTest('graphemeDisplayWidth does not over-sum ZWJ emoji parts', () => {
  // Base emoji + ZWJ + second emoji — terminal width is 2, not 4.
  const family = '\u{1F468}\u200D\u{1F469}';
  assert.equal(graphemeDisplayWidth(family), 2);
  assert.equal(stringDisplayWidth('e\u0301'), 1);
});

await runTest('normalizeSuggestionSuffix never invents leading space', () => {
  // History includes leading space for new words; keep it.
  assert.equal(normalizeSuggestionSuffix('echo hi && git', ' checkout staging'), ' checkout staging');
  assert.equal(normalizeSuggestionSuffix('echo hi && git ', 'checkout staging'), 'checkout staging');
  assert.equal(normalizeSuggestionSuffix('echo hi && git ', ' checkout staging'), 'checkout staging');
  // Mid-token: pass through (never invent a space — that caused `ls blk`).
  assert.equal(normalizeSuggestionSuffix('echo hi && git', 'checkout staging'), 'checkout staging');
  assert.equal(normalizeSuggestionSuffix('cd Doc', 'uments/'), 'uments/');
  assert.equal(normalizeSuggestionSuffix('c', 'lear'), 'lear');
  assert.equal(normalizeSuggestionSuffix('c', ' lear'), ' lear');
  // Path provider must emit the leading space for bare `cd` new args.
  assert.equal(normalizeSuggestionSuffix('cd', ' .acme.sh/'), ' .acme.sh/');
  assert.equal(normalizeSuggestionSuffix('cd', ' /usr'), ' /usr');
  assert.equal(normalizeSuggestionSuffix('cd .acme.sh/', 'dnsapi/'), 'dnsapi/');
  assert.equal(normalizeSuggestionSuffix('git status', ' modified'), ' modified');
  assert.equal(normalizeSuggestionSuffix('s', 'sh 172.16.9.9'), 'sh 172.16.9.9');
  assert.equal(normalizeSuggestionSuffix('ss', 'h 172.16.9.9'), 'h 172.16.9.9');
  assert.equal(normalizeSuggestionSuffix('ssh', ' 172.16.9.9'), ' 172.16.9.9');
  // History `lsblk` after typing `ls` — the critical regression.
  assert.equal(normalizeSuggestionSuffix('ls', 'blk'), 'blk');
  assert.equal(normalizeSuggestionSuffix('lsb', 'lk'), 'lk');
  assert.equal(normalizeSuggestionSuffix('cd', ' Documents/'), ' Documents/');
});

await runTest('resolveGhostCellPosition predicts ahead of lagging SSH caret', () => {
  // Typed "clear" (5) at prompt col 20; echo has not advanced caret yet.
  const origin = { col: 20, row: 5 };
  assert.deepEqual(
    resolveGhostCellPosition(20, 5, origin, 5, 80, 24),
    { col: 25, row: 5 },
  );
  // Echo caught up to end of typed line — stick to live caret.
  assert.deepEqual(
    resolveGhostCellPosition(25, 5, origin, 5, 80, 24),
    { col: 25, row: 5 },
  );
  // Partial echo (3 of 5) — still predict full typed end for ghost placement.
  assert.deepEqual(
    resolveGhostCellPosition(23, 5, origin, 5, 80, 24),
    { col: 25, row: 5 },
  );
  assert.deepEqual(wrapCellPosition(78, 2, 5, 80), { col: 3, row: 3 });
  // Past viewport bottom: clamp row to last visible line (rows=10 → max row 9).
  assert.deepEqual(wrapCellPosition(0, 8, 200, 80, 10), { col: 40, row: 9 });
});

await runTest('mergeTerminalCellDimensions prefers char width + viewport row height', () => {
  // Char-measure underestimates height when lineHeight > 1 (line-height: normal).
  // Viewport height/rows is the true row pitch used by xterm layout.
  assert.deepEqual(
    mergeTerminalCellDimensions(
      { width: 8.4, height: 14 },
      { width: 8.5, height: 16.8 },
    ),
    { width: 8.4, height: 16.8 },
  );
  assert.deepEqual(
    mergeTerminalCellDimensions({ width: 8, height: 14 }, null),
    { width: 8, height: 14 },
  );
  assert.deepEqual(
    mergeTerminalCellDimensions(null, { width: 9, height: 17 }),
    { width: 9, height: 17 },
  );
  assert.equal(mergeTerminalCellDimensions(null, null), null);
});

await runTest('extractActiveSegment parses pipeline and separator tails', () => {
  assert.equal(extractActiveSegment('echo hi && git che'), 'git che');
  assert.equal(extractActiveSegment('ls -la | grep x; cd /va'), 'cd /va');
  assert.equal(extractActiveSegment('sudo env FOO=1 git sta'), 'git sta');
  assert.equal(lineForSuggestionParsing('echo hi | cat '), 'cat ');
});

await runTest('shouldPreferPathSuggestion uses active segment command', () => {
  assert.equal(shouldPreferPathSuggestion('echo hi && cd Doc'), true);
  assert.equal(shouldPreferPathSuggestion('echo hi && git status'), false);
});

await runTest('resolveCdTargetPath uses active segment for pipelines', () => {
  assert.equal(resolveCdTargetPath('echo hi && cd foo/bar', '/home/me'), '/home/me/foo/bar');
  assert.equal(resolveCdTargetPath('ls | cd ..', '/home/me/projects'), '/home/me');
});

await runTest('handleGhostInputEvent feeds tracker for printable input', () => {
  let feedCalls = 0;
  const tracker = {
    feed: () => {
      feedCalls += 1;
      return { consumed: false };
    },
  };

  const handled = handleGhostInputEvent('a', tracker);
  assert.equal(handled, false);
  assert.equal(feedCalls, 1);
});

await runTest('InputTracker desyncs on left arrow without clearing line buffer', () => {
  const changed = [];
  const tracker = new InputTracker({
    onLineChange: (line) => changed.push(line),
    onAccept: () => {},
    onDismiss: () => {},
    onHistoryCommit: () => {},
  });

  tracker.feed('g');
  tracker.feed('i');
  tracker.feed('\x1b[D');
  tracker.feed('t');

  assert.deepEqual(changed, ['g', 'gi']);
  assert.equal(tracker.isDesynced(), true);
  assert.equal(tracker.getLineBuffer(), 'gi');

  tracker.feed('\r');
  assert.equal(tracker.isDesynced(), false);
  assert.equal(tracker.getLineBuffer(), '');
});

await runTest('InputTracker desyncs on history keys without clearing line buffer', () => {
  const tracker = new InputTracker({
    onLineChange: () => {},
    onAccept: () => {},
    onDismiss: () => {},
    onHistoryCommit: () => {},
  });

  tracker.feed('git status');
  tracker.feed('\x12');
  assert.equal(tracker.isDesynced(), true);
  assert.equal(tracker.getLineBuffer(), 'git status');

  tracker.feed('\x03');
  assert.equal(tracker.isDesynced(), false);
  assert.equal(tracker.getLineBuffer(), '');
});

await runTest('classifyInputEscape categorizes cursor and history edits', () => {
  assert.equal(classifyInputEscape('\x1b[D'), 'cursor_edit');
  assert.equal(classifyInputEscape('\x1b[A'), 'history_edit');
  assert.equal(classifyInputEscape('\x12'), 'history_edit');
  assert.equal(classifyInputEscape('\x1b[200~'), 'unknown');
  assert.equal(classifyInputEscape('a'), null);
});

await runTest('shouldSuppressGhostForNativeShell respects policy', () => {
  assert.equal(shouldSuppressGhostForNativeShell('auto', '/usr/bin/fish'), true);
  assert.equal(shouldSuppressGhostForNativeShell('auto', '/bin/zsh'), false);
  assert.equal(shouldSuppressGhostForNativeShell('auto', '/bin/zsh', false), false);
  assert.equal(shouldSuppressGhostForNativeShell('auto', '/bin/zsh', true), true);
  assert.equal(shouldSuppressGhostForNativeShell('auto', 'powershell'), false);
  assert.equal(shouldSuppressGhostForNativeShell('always', '/usr/bin/fish'), false);
  assert.equal(shouldSuppressGhostForNativeShell('off', '/bin/zsh'), true);
  assert.equal(shouldSuppressGhostForNativeShell('off', '/bin/bash'), true);
});

await runTest('cwdForWslPathCompletion ignores Windows drive paths', () => {
  assert.equal(cwdForWslPathCompletion('E:\\\\work'), undefined);
  assert.equal(cwdForWslPathCompletion('/home/gajendra'), '/home/gajendra');
});

await runTest('shouldProbeZshAutosuggest includes zsh and WSL shell ids', () => {
  assert.equal(shouldProbeZshAutosuggest('/bin/zsh'), true);
  assert.equal(shouldProbeZshAutosuggest('wsl'), true);
  assert.equal(shouldProbeZshAutosuggest('wsl:Ubuntu'), true);
  assert.equal(shouldProbeZshAutosuggest('powershell'), false);
  assert.equal(shellIdIndicatesWsl('wsl:Ubuntu-22.04'), true);
});

await runTest('zshInitEnablesAutosuggestions detects common plugin hooks', () => {
  assert.equal(
    zshInitEnablesAutosuggestions('plugins=(git autosuggestions)\n'),
    true,
  );
  assert.equal(
    zshInitEnablesAutosuggestions('source /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh\n'),
    true,
  );
  assert.equal(
    zshInitEnablesAutosuggestions('# zsh-autosuggestions disabled\nplugins=(git)\n'),
    false,
  );
});

await runTest('hasUnmatchedQuoteOnActiveToken blocks open quotes on active token', () => {
  assert.equal(hasUnmatchedQuoteOnActiveToken('cat "My '), true);
  assert.equal(hasUnmatchedQuoteOnActiveToken('cat "My file"'), false);
});

await runTest('extractCwdFromPromptOutput reads host:tilde prompts without @', () => {
  const cwd = extractCwdFromPromptOutput('data\r\nkgajendra:~ $ ');
  assert.equal(cwd, '~');
});

await runTest('expandTildePathForRemote maps tilde paths for SFTP', () => {
  assert.equal(expandTildePathForRemote('~', '/home/gajen'), '/home/gajen');
  assert.equal(expandTildePathForRemote('~/data', '/home/gajen'), '/home/gajen/data');
  assert.equal(expandTildePathForRemote('/var/log', '/home/gajen'), '/var/log');
});

await runTest('resolveWslShellIdForPathCompletion infers WSL from Linux cwd', () => {
  assert.equal(resolveWslShellIdForPathCompletion('default', '~'), 'wsl');
  assert.equal(resolveWslShellIdForPathCompletion('powershell', '/home/gajendra'), 'wsl');
  assert.equal(resolveWslShellIdForPathCompletion('wsl:Ubuntu', '~'), 'wsl:Ubuntu');
  assert.equal(resolveWslShellIdForPathCompletion('powershell', 'E:\\\\work'), undefined);
  assert.equal(linuxPathLooksLikeWsl('~/data'), true);
});

await runTest('extractRecentCommands keeps command lines and strips prompts', () => {
  const scrollback = [
    'user@host:~/projects$ git status',
    'On branch main',
    'nothing to commit',
    'user@host:~/projects$ cd Documents',
  ].join('\n');
  const commands = extractRecentCommands(scrollback, 8);
  assert.deepEqual(commands, ['git status', 'cd Documents']);
});

await runTest('extractRecentCommands preserves embedded shell variables', () => {
  const scrollback = 'user@host:~$ echo $HOME/docs\n';
  const commands = extractRecentCommands(scrollback, 4);
  assert.deepEqual(commands, ['echo $HOME/docs']);
});

await runTest('extractRecentCommands ignores redirection markers inside commands', () => {
  const scrollback = 'user@host:~/proj$ git log >> out.txt\n';
  const commands = extractRecentCommands(scrollback, 4);
  assert.deepEqual(commands, ['git log >> out.txt']);
});

await runTest('lineForSuggestionParsing uses tail after background ampersand', () => {
  assert.equal(lineForSuggestionParsing('sleep 1 & git che'), 'git che');
  assert.equal(extractActiveSegment('sleep 1 & git che'), 'git che');
});

await runTest('feedSecretInputSniffer fires once per prompt until new output', () => {
  let calls = 0;
  const termId = 'secret-sniffer-once';
  const encode = (value) => new TextEncoder().encode(value);
  try {
    feedSecretInputSniffer(termId, encode('Password: '), () => { calls += 1; });
    assert.equal(calls, 1);
    feedSecretInputSniffer(termId, encode('\x1b[?25h'), () => { calls += 1; });
    assert.equal(calls, 1);
  } finally {
    clearSecretInputSniffer(termId);
  }
});

await runTest('detectSecretPromptInOutput recognizes sudo and SSH password prompts', () => {
  assert.equal(detectSecretPromptInOutput('[sudo] password for gajen: '), true);
  assert.equal(detectSecretPromptInOutput("user@host's password: "), true);
  assert.equal(detectSecretPromptInOutput('appserver@et-appserver:~$ su admin\nPassword: '), true);
  assert.equal(detectSecretPromptInOutput('user@host:~/proj$ git status'), false);
});

await runTest('InputTracker suppresses ghost and history commit during secret input', () => {
  let commits = 0;
  let lineChanges = 0;
  const tracker = new InputTracker({
    onLineChange: () => { lineChanges += 1; },
    onAccept: () => {},
    onDismiss: () => {},
    onHistoryCommit: () => { commits += 1; },
  });

  tracker.enterSecretInputMode();
  tracker.feed('s');
  tracker.feed('e');
  tracker.feed('c');
  tracker.feed('r');
  tracker.feed('e');
  tracker.feed('t');
  assert.equal(lineChanges, 0);
  tracker.feed('\r');
  assert.equal(commits, 0);
  assert.equal(tracker.isSecretInputMode(), false);
});