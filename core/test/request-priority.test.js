const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createRequestGate,
  getRequestPriority,
  runWithRequestPriority,
  resolveRequestClass,
  selectDispatchIndex,
  isClassQueueFull,
  maxQueuedForClass,
  describeRequestClassMarker,
  classOf,
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

test('resolveRequestClass prefers explicit class then criticalLane then priority', () => {
  assert.equal(resolveRequestClass({ requestClass: 'friend' }, 'foreground'), 'friend');
  assert.equal(resolveRequestClass({ criticalLane: 'heartbeat' }, 'background'), 'critical');
  assert.equal(resolveRequestClass({ priority: 'farm' }, 'foreground'), 'farm');
  assert.equal(resolveRequestClass({}, 'background'), 'background');
  assert.equal(resolveRequestClass({ priority: 'unknown' }, 'unknown'), 'foreground');
});

test('selectDispatchIndex skips saturated classes and prefers higher priority', () => {
  const now = Date.now();
  const queue = [
    { requestClass: 'background', enqueuedAt: now - 10 },
    { requestClass: 'friend', enqueuedAt: now - 5 },
    { requestClass: 'critical', enqueuedAt: now - 1 },
  ];
  const pending = Array.from({ length: 8 }, () => ({ requestClass: 'critical' }));
  assert.equal(selectDispatchIndex(queue, pending, now), 1);

  const emptyPending = [];
  assert.equal(selectDispatchIndex(queue, emptyPending, now), 2);
});

test('class queue limits and markers stay stable', () => {
  const queue = Array.from({ length: maxQueuedForClass('friend') }, () => ({ requestClass: 'friend' }));
  assert.equal(isClassQueueFull(queue, 'friend'), true);
  assert.equal(isClassQueueFull([], 'friend'), false);
  assert.equal(classOf({ priority: 'farm' }), 'farm');
  assert.equal(describeRequestClassMarker({ requestClass: 'critical' }), '[C]');
});
