const assert = require('node:assert/strict');
const test = require('node:test');

const {
  evaluateGatewayHealth,
  getOldestPendingAgeMs,
  nextBusinessBackoffMs,
} = require('../src/utils/gateway-health');

test('gateway health distinguishes stale heartbeat and stuck requests', () => {
  assert.deepEqual(evaluateGatewayHealth({ heartbeatAgeMs: 31000 }), { healthy: false, reason: 'heartbeat_stale' });
  assert.deepEqual(evaluateGatewayHealth({ heartbeatAgeMs: 1000, oldestPendingAgeMs: 6000 }), { healthy: false, reason: 'request_stuck' });
  assert.deepEqual(evaluateGatewayHealth({ heartbeatAgeMs: 1000, oldestPendingAgeMs: 1000 }), { healthy: true, reason: 'ok' });
});

test('gateway backoff starts at 30 seconds and caps at 60 seconds', () => {
  assert.equal(nextBusinessBackoffMs(0), 30000);
  assert.equal(nextBusinessBackoffMs(30000), 60000);
  assert.equal(nextBusinessBackoffMs(60000), 60000);
  assert.equal(getOldestPendingAgeMs([9000, 7000], 10000), 3000);
});
