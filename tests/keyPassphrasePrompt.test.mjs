import assert from 'node:assert/strict';
import {
  finishKeyPassphrasePrompt,
  requestKeyPassphrase,
  useKeyPassphrasePromptStore,
} from '../.tmp-agent-tests/src/features/connections/application/keyPassphrasePrompt.js';

const firstPromise = requestKeyPassphrase({
  connectionId: 'first',
  connectionName: 'First host',
  keyPath: '/keys/first',
});
const secondPromise = requestKeyPassphrase({
  connectionId: 'second',
  connectionName: 'Second host',
  keyPath: '/keys/second',
});

const firstPrompt = useKeyPassphrasePromptStore.getState().prompt;
assert.equal(firstPrompt?.connectionId, 'first');

finishKeyPassphrasePrompt(null, (firstPrompt?.promptId || 0) + 100);
assert.equal(useKeyPassphrasePromptStore.getState().prompt?.connectionId, 'first');

finishKeyPassphrasePrompt(
  { action: 'submit', passphrase: 'secret', retention: 'once' },
  firstPrompt?.promptId,
);
assert.deepEqual(await firstPromise, {
  action: 'submit',
  passphrase: 'secret',
  retention: 'once',
});

await new Promise(resolve => queueMicrotask(resolve));
const secondPrompt = useKeyPassphrasePromptStore.getState().prompt;
assert.equal(secondPrompt?.connectionId, 'second');
finishKeyPassphrasePrompt(null, secondPrompt?.promptId);
assert.equal(await secondPromise, null);

const vaultPromise = requestKeyPassphrase({
  connectionId: 'vault-host',
  connectionName: 'Vault host',
  keyPath: '/keys/vault',
});
const vaultPrompt = useKeyPassphrasePromptStore.getState().prompt;
finishKeyPassphrasePrompt(
  { action: 'submit', passphrase: 'vault-secret', retention: 'vault' },
  vaultPrompt?.promptId,
);
assert.deepEqual(await vaultPromise, {
  action: 'submit',
  passphrase: 'vault-secret',
  retention: 'vault',
});

const groupedFirstPromise = requestKeyPassphrase({
  connectionId: 'grouped-first',
  connectionName: 'Grouped first',
  keyPath: '/keys/grouped',
});
const groupedSecondPromise = requestKeyPassphrase({
  connectionId: 'grouped-second',
  connectionName: 'Grouped second',
  keyPath: ' /keys/grouped ',
});
const groupedPrompt = useKeyPassphrasePromptStore.getState().prompt;
assert.equal(groupedPrompt?.connectionId, 'grouped-first');
finishKeyPassphrasePrompt(
  { action: 'submit', passphrase: 'grouped-secret', retention: 'device' },
  groupedPrompt?.promptId,
);
const groupedExpected = {
  action: 'submit',
  passphrase: 'grouped-secret',
  retention: 'device',
};
assert.deepEqual(await groupedFirstPromise, groupedExpected);
assert.deepEqual(await groupedSecondPromise, groupedExpected);

console.log('Key passphrase prompt queue tests passed.');
