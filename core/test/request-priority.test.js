const assert = require('node:assert/strict');
const test = require('node:test');

const {
  classOf,
  getRequestPriority,
  runWithRequestPriority,
  selectDispatchIndex,
} = require('../src/utils/request-priority');

function queueEntry(requestClass, enqueuedAt, extra = {}) {
  return { requestClass, enqueuedAt, ...extra };
}

test('dispatch order picks critical first, then business classes, background last', () => {
  const now = 10000;
  const queue = [
    queueEntry('friend', now - 40),
    queueEntry('critical', now - 30),
    queueEntry('farm', now - 20),
    queueEntry('background', now - 10),
  ];
  const inFlight = [];

  const first = selectDispatchIndex(queue, inFlight, now);
  assert.equal(classOf(queue[first]), 'critical');
  inFlight.push(queue.splice(first, 1)[0]);

  // critical 占用心跳通道时，业务流量继续按 farm → friend 放行；
  // background 必须等所有在途请求结束才允许发送。
  const second = selectDispatchIndex(queue, inFlight, now);
  assert.equal(classOf(queue[second]), 'farm');
  inFlight.push(queue.splice(second, 1)[0]);

  const third = selectDispatchIndex(queue, inFlight, now);
  assert.equal(classOf(queue[third]), 'friend');
  inFlight.push(queue.splice(third, 1)[0]);

  assert.equal(selectDispatchIndex(queue, inFlight, now), -1);
  inFlight.length = 0;

  const last = selectDispatchIndex(queue, inFlight, now);
  assert.equal(classOf(queue[last]), 'background');
});

test('same-class queue entries dispatch FIFO while per-class slots last', () => {
  const now = 10000;
  const queue = [
    queueEntry('farm', now - 50),
    queueEntry('farm', now - 40),
    queueEntry('farm', now - 30),
  ];
  const inFlight = [];

  const first = selectDispatchIndex(queue, inFlight, now);
  assert.equal(queue[first].enqueuedAt, now - 50);
  inFlight.push(queue.splice(first, 1)[0]);

  const second = selectDispatchIndex(queue, inFlight, now);
  assert.equal(queue[second].enqueuedAt, now - 40);
  inFlight.push(queue.splice(second, 1)[0]);

  // farm 在途达到每班次上限（2）后停止放行，避免挤占前台和好友班次。
  assert.equal(selectDispatchIndex(queue, inFlight, now), -1);
});

test('starved low-priority work is promoted ahead of newer equal-class work', () => {
  const now = 10000;
  const queue = [
    queueEntry('friend', now - 5000),
    queueEntry('friend', now - 10),
  ];
  const first = selectDispatchIndex(queue, [], now);
  // 等待超过 CLASS_STARVATION_MS 的请求被提升到队首；同类内仍是 FIFO。
  assert.equal(queue[first].enqueuedAt, now - 5000);
});

test('request priority context is inherited across async work', async () => {
  const observed = await runWithRequestPriority('background', async () => {
    await Promise.resolve();
    return getRequestPriority();
  });
  assert.equal(observed, 'background');
  assert.equal(getRequestPriority(), 'foreground');
});
