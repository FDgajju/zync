import assert from 'node:assert/strict';
import {
  DEFAULT_SHOW_HOST_ADDRESSES_IN_LISTS,
  buildDefaultKeyVaultLabel,
  buildDefaultPasswordVaultLabel,
  buildUniqueVaultLabel,
  formatConnectionEndpoint,
  formatConnectionListEndpoint,
  formatPrivacyAwareLabel,
  getConnectionBrowseAriaLabel,
  getConnectionDisplayLabels,
  getConnectionPrimaryLabel,
  getConnectionSecondaryLabel,
  getConnectionSearchText,
  isLikelyIpAddress,
} from '../.tmp-agent-tests/src/features/connections/domain/connectionDisplay.js';
import {
  createConnectionTabState,
  refreshConnectionTabTitles,
} from '../.tmp-agent-tests/src/features/connections/application/tabService.js';

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${name}: ${message}`);
    process.exitCode = 1;
  }
}

const namedConn = {
  id: 'c1',
  name: 'Web Server US',
  host: '10.0.4.22',
  username: 'deploy',
  port: 22,
  status: 'connected',
  tags: ['production', 'web'],
  folder: 'prod/eu',
};

const unnamedIpConn = {
  id: 'c2',
  name: '',
  host: '192.168.1.10',
  username: 'admin',
  port: 2222,
  status: 'disconnected',
};

runTest('default privacy mode is label-first', () => {
  assert.equal(DEFAULT_SHOW_HOST_ADDRESSES_IN_LISTS, false);
});

runTest('named connection keeps custom title when addresses hidden', () => {
  assert.equal(getConnectionPrimaryLabel(namedConn, false), 'Web Server US');
  assert.equal(getConnectionSecondaryLabel(namedConn, false), 'SSH, deploy');
  assert.doesNotMatch(getConnectionSecondaryLabel(namedConn, false), /10\.0\.4\.22/);
  assert.doesNotMatch(getConnectionSecondaryLabel(namedConn, false), /2222|port/);
});

runTest('unnamed IP connection hides endpoint in browse labels', () => {
  assert.equal(getConnectionPrimaryLabel(unnamedIpConn, false), 'admin');
  assert.equal(getConnectionSecondaryLabel(unnamedIpConn, false), 'SSH');
});

runTest('show addresses mode exposes endpoint without port in lists', () => {
  assert.equal(getConnectionPrimaryLabel(unnamedIpConn, true), '192.168.1.10');
  assert.equal(getConnectionSecondaryLabel(unnamedIpConn, true), 'admin@192.168.1.10');
  assert.equal(formatConnectionEndpoint(unnamedIpConn), 'admin@192.168.1.10:2222');
});

runTest('endpoint formatters omit @ when username or host is missing', () => {
  assert.equal(formatConnectionListEndpoint({ username: '', host: '10.0.0.1' }), '10.0.0.1');
  assert.equal(formatConnectionListEndpoint({ username: 'admin', host: '' }), 'admin');
  assert.equal(formatConnectionListEndpoint({ username: '', host: '' }), '');
  assert.equal(formatConnectionEndpoint({ username: '', host: '10.0.0.1', port: 22 }), '10.0.0.1');
  assert.equal(formatConnectionEndpoint({ username: 'admin', host: '', port: 2222 }), 'admin:2222');
});

runTest('show addresses mode falls back to username when host is empty', () => {
  const hostless = { ...unnamedIpConn, host: '', username: 'admin' };
  assert.equal(getConnectionPrimaryLabel(hostless, true), 'admin');
  assert.equal(getConnectionSecondaryLabel(hostless, true), 'admin');
});

runTest('search text always includes host for palette matching', () => {
  const search = getConnectionSearchText(unnamedIpConn);
  assert.match(search, /192\.168\.1\.10/);
  assert.match(search, /admin/);
});

runTest('hostname without custom name can remain primary when not an IP', () => {
  const hostAlias = { ...unnamedIpConn, host: 'prod-web.internal', username: 'ops' };
  assert.equal(getConnectionPrimaryLabel(hostAlias, false), 'prod-web.internal');
});

runTest('isLikelyIpAddress detects IPv4', () => {
  assert.equal(isLikelyIpAddress('10.0.0.1'), true);
  assert.equal(isLikelyIpAddress('prod.local'), false);
});

runTest('isLikelyIpAddress treats scoped IPv6 as IP', () => {
  assert.equal(isLikelyIpAddress('fe80::1'), true);
  assert.equal(isLikelyIpAddress('fe80::1%en0'), true);
  assert.equal(isLikelyIpAddress('[fe80::1]'), true);
  assert.equal(isLikelyIpAddress('[fe80::1%en0]'), true);
  assert.equal(isLikelyIpAddress('[fe80::1%25en0]'), true);
});

runTest('buildDefaultPasswordVaultLabel uses IP-safe path for scoped IPv6 hosts', () => {
  assert.equal(
    buildDefaultPasswordVaultLabel({ name: '', host: 'fe80::1%en0', username: 'root' }),
    'SSH password (root)',
  );
  assert.equal(
    buildDefaultPasswordVaultLabel({ name: '', host: '[fe80::1%25en0]', username: 'ops' }),
    'SSH password (ops)',
  );
});

runTest('createConnectionTabState uses privacy-aware title', () => {
  const state = createConnectionTabState([], unnamedIpConn, 'terminal', { showHostAddressesInLists: false });
  assert.equal(state.tabs[0].title, 'admin');
  const exposed = createConnectionTabState([], unnamedIpConn, 'terminal', { showHostAddressesInLists: true });
  assert.equal(exposed.tabs[0].title, '192.168.1.10');
});

runTest('refreshConnectionTabTitles updates open tab labels when addresses hidden', () => {
  const tabs = [{ id: 't1', type: 'connection', title: 'old', connectionId: 'c2', view: 'terminal' }];
  const connections = [unnamedIpConn];
  const refreshed = refreshConnectionTabTitles(tabs, connections, false);
  assert.equal(refreshed[0].title, 'admin');
});

runTest('refreshConnectionTabTitles updates open tab labels when addresses shown', () => {
  const tabs = [{ id: 't1', type: 'connection', title: 'old', connectionId: 'c2', view: 'terminal' }];
  const connections = [unnamedIpConn];
  const refreshed = refreshConnectionTabTitles(tabs, connections, true);
  assert.equal(refreshed[0].title, '192.168.1.10');
});

runTest('getConnectionDisplayLabels bundles browse fields', () => {
  const labels = getConnectionDisplayLabels(namedConn, false);
  assert.equal(labels.primary, 'Web Server US');
  assert.ok(labels.searchText.includes('10.0.4.22'));
  assert.equal(labels.endpoint, 'deploy@10.0.4.22');
});

runTest('getConnectionBrowseAriaLabel reflects privacy mode', () => {
  assert.equal(
    getConnectionBrowseAriaLabel(namedConn, false),
    'Connection Web Server US, SSH, deploy',
  );
  assert.equal(
    getConnectionBrowseAriaLabel(unnamedIpConn, true),
    'Connection 192.168.1.10, admin@192.168.1.10',
  );
});

runTest('formatPrivacyAwareLabel strips parenthesized user@host endpoints', () => {
  assert.equal(
    formatPrivacyAwareLabel('ci-staging key (jenkins@140.238.226.234)', false),
    'ci-staging key (jenkins)',
  );
  assert.equal(
    formatPrivacyAwareLabel('api key (deploy@prod.example.com:2222)', false),
    'api key (deploy)',
  );
});

runTest('formatPrivacyAwareLabel strips bare user@host and leftover IPv4', () => {
  assert.equal(formatPrivacyAwareLabel('jenkins@140.238.226.234', false), 'jenkins');
  assert.equal(formatPrivacyAwareLabel('ops@prod-web.internal', false), 'ops');
  assert.equal(formatPrivacyAwareLabel('backup 10.0.0.5 key', false), 'backup ••• key');
});

runTest('formatPrivacyAwareLabel redacts IPv6 and bracketed endpoints', () => {
  assert.equal(formatPrivacyAwareLabel('backup fe80::1 key', false), 'backup ••• key');
  assert.equal(formatPrivacyAwareLabel('ops@[fe80::1]', false), 'ops');
  assert.equal(formatPrivacyAwareLabel('key (ops@[fe80::1])', false), 'key (ops)');
  assert.equal(formatPrivacyAwareLabel('node [2001:db8::1] ready', false), 'node ••• ready');
  // Ordinary short labels must not be treated as bracketed IPv6.
  assert.equal(formatPrivacyAwareLabel('task [1] done', false), 'task [1] done');
  assert.equal(formatPrivacyAwareLabel('tag [db] only', false), 'tag [db] only');
});

runTest('formatPrivacyAwareLabel cleans empty parens / whitespace and respects show mode', () => {
  assert.equal(formatPrivacyAwareLabel('key ()', false), 'key');
  assert.equal(formatPrivacyAwareLabel('backup  10.0.0.5  key', false), 'backup ••• key');
  assert.equal(
    formatPrivacyAwareLabel('ci-staging key (jenkins@140.238.226.234)', true),
    'ci-staging key (jenkins@140.238.226.234)',
  );
  assert.equal(formatPrivacyAwareLabel('', false), '');
});

runTest('buildDefaultKeyVaultLabel prefers name and never embeds endpoints', () => {
  assert.equal(
    buildDefaultKeyVaultLabel({ name: 'ci-staging', host: '140.238.226.234', username: 'jenkins' }),
    'ci-staging key (jenkins)',
  );
  assert.equal(
    buildDefaultKeyVaultLabel({ name: '', host: 'prod-web.internal', username: 'ops' }),
    'prod-web.internal key (ops)',
  );
  assert.equal(
    buildDefaultKeyVaultLabel({ name: '', host: '10.0.0.1', username: 'root' }),
    'root key',
  );
  assert.equal(
    buildDefaultKeyVaultLabel({ name: '', host: '[fe80::1]', username: 'ops' }),
    'ops key',
  );
  assert.equal(buildDefaultKeyVaultLabel({}), 'user key');
});

runTest('buildDefaultPasswordVaultLabel is a display name, not a secret placeholder', () => {
  assert.equal(
    buildDefaultPasswordVaultLabel({ name: 'ci-staging', host: '140.238.226.234', username: 'jenkins' }),
    'ci-staging · SSH password (jenkins)',
  );
  assert.equal(
    buildDefaultPasswordVaultLabel({ name: '', host: 'prod-web.internal', username: 'ops' }),
    'prod-web.internal · SSH password (ops)',
  );
  assert.equal(
    buildDefaultPasswordVaultLabel({ name: '', host: '10.0.0.1', username: 'root' }),
    'SSH password (root)',
  );
  assert.equal(buildDefaultPasswordVaultLabel({}), 'SSH password');
});

runTest('isLikelyIpAddress treats bracketed IPv6 as IP', () => {
  assert.equal(isLikelyIpAddress('[fe80::1]'), true);
  assert.equal(isLikelyIpAddress('fe80::1'), true);
  assert.equal(isLikelyIpAddress('prod.local'), false);
});

runTest('buildUniqueVaultLabel adds the first available numeric suffix', () => {
  assert.equal(buildUniqueVaultLabel('production key', []), 'production key');
  assert.equal(
    buildUniqueVaultLabel('production key', ['production key', 'production key 2', 'other']),
    'production key 3',
  );
});
