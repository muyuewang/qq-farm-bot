const test = require('node:test');
const assert = require('node:assert/strict');

const { createScheduler, getSchedulerRegistrySnapshot } = require('../src/services/scheduler');

test('scheduler dispose clears timers and removes its namespace', () => {
  const namespace = `lifecycle-${Date.now()}`;
  const scheduler = createScheduler(namespace);
  scheduler.setTimeoutTask('pending', 60000, () => {});

  assert.equal(scheduler.getSnapshot().taskCount, 1);
  scheduler.dispose();

  assert.equal(
    getSchedulerRegistrySnapshot(namespace).schedulers.length,
    0,
  );
});
