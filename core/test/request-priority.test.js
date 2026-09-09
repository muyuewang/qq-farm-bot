const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createRequestGate,
  getRequestPriority,
  runWithRequestPriority,
} = require('../src/utils/request-priority');

test('request gate dispatches queued work by priority then FIFO', async () => {
  const gate = createRequestGate({ maxActive: 1 });
  const firstRelease = await gate.acquire('background');
  const order = [];
  const queued = [
    gate.acquire('friend').then(release => { order.push('friend'); release(); }),
    gate.acquire('critical').then(release => { order.push('critical'); release(); }),
    gate.acquire('farm').then(release => { order.push('farm'); release(); }),
  ];
  firstRelease();
  await Promise.all(queued);
  assert.deepEqual(order, ['critical', 'farm', 'friend']);
});

test('request priority context is inherited across async work', async () => {
  const observed = await runWithRequestPriority('background', async () => {
    await Promise.resolve();
    return getRequestPriority();
  });
  assert.equal(observed, 'background');
  assert.equal(getRequestPriority(), 'foreground');
});
