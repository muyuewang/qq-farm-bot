const assert = require('node:assert/strict');
const test = require('node:test');

const { extractServerClientVersion } = require('../src/utils/network');

test('server version sync prefers forced version over recommended version', () => {
  assert.equal(extractServerClientVersion({
    version_force: '1.14.0.2_20260819',
    version_recommend: '1.14.0.1_20260818',
  }), '1.14.0.2_20260819');
});

test('server version sync accepts recommended version and rejects malformed values', () => {
  assert.equal(extractServerClientVersion({
    version_recommend: '1.14.0.1_20260819',
  }), '1.14.0.1_20260819');
  assert.equal(extractServerClientVersion({ version_force: 'latest' }), '');
  assert.equal(extractServerClientVersion({ version_force: '1.14.0.1_../../secret' }), '');
});
