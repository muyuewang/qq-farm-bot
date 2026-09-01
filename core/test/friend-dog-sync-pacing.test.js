const assert = require('node:assert/strict');
const test = require('node:test');

const { classifyGatewayDefer, planNextSyncPacing } = require('../src/services/friend-dog-sync-pacing');

test('dog sync pacing uses a long cooldown only for unhealthy gateway state', () => {
  assert.equal(classifyGatewayDefer({ healthy: false, reason: 'request_stuck' }), 'gateway_unhealthy');
  assert.equal(planNextSyncPacing({ deferredKind: 'gateway_unhealthy' }).retryMs, 30 * 60 * 1000);
  assert.equal(planNextSyncPacing({ deferredKind: 'gateway_contention' }).retryMs, 60 * 1000);
});

test('a clean dog sync round increases the next quota', () => {
  assert.deepEqual(planNextSyncPacing({ cleanRounds: 0 }), {
    quota: 25,
    retryMs: 3 * 60 * 1000,
    cleanRounds: 1,
  });
});
