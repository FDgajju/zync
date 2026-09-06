import assert from 'node:assert/strict';
import { directoryFromFileLocation, parentDirectory, pickFilesOpenPath } from '../.tmp-agent-tests/src/components/layout/tabDock/openHerePaths.js';

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ok ${name}`);
  } catch (error) {
    console.error(`  fail ${name}`);
    throw error;
  }
}

runTest('pickFilesOpenPath prefers shell cwd and ignores placeholder home /', () => {
  assert.equal(pickFilesOpenPath({ lastKnownCwd: '/home/appserver' }), '/home/appserver');
  assert.equal(pickFilesOpenPath({ lastKnownCwd: '/' }), '/');
  assert.equal(pickFilesOpenPath({ initialPath: '/opt/app' }), '/opt/app');
  assert.equal(pickFilesOpenPath({ homePath: '/home/appserver' }), '/home/appserver');
  assert.equal(pickFilesOpenPath({ homePath: '/' }), '');
  assert.equal(pickFilesOpenPath({ lastKnownCwd: '', initialPath: '', homePath: '/' }), '');
  assert.equal(pickFilesOpenPath({}), '');
});

runTest('directory uses the listed Files path for empty space', () => {
  assert.equal(directoryFromFileLocation('/home/appserver'), '/home/appserver');
  assert.equal(directoryFromFileLocation(''), '');
});

runTest('directory on a folder uses the folder path, not /', () => {
  assert.equal(
    directoryFromFileLocation('/home/appserver', {
      type: 'd',
      name: 'data',
      path: '/home/appserver/data',
    }),
    '/home/appserver/data',
  );
  assert.equal(
    directoryFromFileLocation('/home/appserver', { type: 'd', name: 'data' }),
    '/home/appserver/data',
  );
});

runTest('directory on a file uses the parent folder', () => {
  assert.equal(
    directoryFromFileLocation('/home/appserver', {
      type: '-',
      name: '.bashrc',
      path: '/home/appserver/.bashrc',
    }),
    '/home/appserver',
  );
});

runTest('parentDirectory keeps posix and windows roots', () => {
  assert.equal(parentDirectory('/home/appserver/.bashrc'), '/home/appserver');
  assert.equal(parentDirectory('/home'), '/');
  assert.equal(parentDirectory('/'), '/');
  assert.equal(parentDirectory('C:\\Users\\gajen\\file.txt'), 'C:\\Users\\gajen');
});

console.log('Open-here path tests passed.');
