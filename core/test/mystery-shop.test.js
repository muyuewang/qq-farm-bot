const assert = require('node:assert/strict');
const test = require('node:test');

const { AUTO_BUY_CHECK_INTERVAL_MS } = require('../src/services/mystery-shop');

test('mystery shop auto-buy polls often enough to catch offers appearing after login', () => {
  assert.equal(AUTO_BUY_CHECK_INTERVAL_MS, 10 * 60 * 1000);
  assert.ok(AUTO_BUY_CHECK_INTERVAL_MS < 3 * 60 * 60 * 1000);
});
